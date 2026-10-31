// 截图：headless Chrome + CDP，连的是**页面级** target。
// 浏览器级 WebSocket 从 Chrome 136 起不再直接接受 Page 域命令（老脚本会卡在 Page.enable）。
// Usage: node tools/shot.mjs <url> <shot.png> [waitMs] [evalFile]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'screenshots/shot.png';
const waitMs = Number(process.argv[4] || 12000);
const evalFile = process.argv[5];
const W = Number(process.env.W || 1440);
const H = Number(process.env.H || 810);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-shot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  // 这个环境里 Chrome 的 GPU 进程起不来（会被直接杀掉），走 SwiftShader 软件渲染。
  '--no-sandbox', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-breakpad', '--disable-crash-reporter', '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const port = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('chrome devtools timeout: ' + buf.slice(-400))), 20000);
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on ws:\/\/[^\s]*:(\d+)\//);
    if (m) { clearTimeout(t); resolve(Number(m[1])); }
  });
});

// 打开目标页，拿页面级 target 的 ws 地址
const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
const pageWs = created.webSocketDebuggerUrl;
if (!pageWs) throw new Error('拿不到页面 ws 地址: ' + JSON.stringify(created).slice(0, 300));

const ws = new WebSocket(pageWs);
const pending = new Map();
let nextId = 1;
const logs = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push('[' + msg.params.type + '] ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('[pageerror] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
});
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await sleep(Math.max(500, waitMs));

const evalExpr = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text, detail: r.exceptionDetails.exception?.description };
  return r.result?.value;
};

let extra = null;
if (evalFile) extra = await evalExpr(fs.readFileSync(evalFile, 'utf8'));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ shot: out, extra, logs: logs.slice(-25) }, null, 2));

ws.close();
chrome.kill('SIGKILL');
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
process.exit(0);
