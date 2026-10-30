// Minimal Chrome DevTools Protocol driver (no deps): system Chrome headless + built-in WebSocket.
// Usage: node tools/cdp.mjs <url> <shot.png> [waitMs] [evalFile]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'screenshots/cdp.png';
const waitMs = Number(process.argv[4] || 12000);
const evalFile = process.argv[5];
const W = Number(process.env.W || 1440);
const H = Number(process.env.H || 810);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cdp-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('chrome devtools timeout: ' + buf.slice(-400))), 20000);
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(t); resolve(m[1]); }
  });
});
const port = new URL(wsUrl).port;

async function newPage(targetUrl) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
  return res.json();
}

const pageInfo = await newPage('about:blank');
const ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });

let nextId = 1;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  let msg;
  try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString()); }
  catch { return; }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.method + ': ' + msg.error.message)) : resolve(msg.result);
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('[pageerror] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(waitMs);

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
console.log(JSON.stringify({ shot: out, extra, logs: logs.slice(-30) }, null, 2));

ws.close();
chrome.kill('SIGKILL');
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
process.exit(0);
