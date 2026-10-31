/**
 * Acceptance check for the third-person bot weapon rig (BotGun.js).
 *
 * Measures, on a real page, the six criteria from the port brief:
 *   1. right wrist -> pistol grip          <= 0.03 m
 *   2. left wrist  -> handguard (GripL)    <= 0.05 m
 *   3. bore vs (aimPoint - eye)            dot >= 0.98
 *   4. low ready 25-35 deg down, sprint carry, ~0.25 s blends
 *   5. recoil recovered inside 0.15 s, arms still on the gun
 *   6. +26 bots on screen                    <= 1 ms/frame of simulation
 *
 * Usage: node tools/botgun-check.mjs [url] [out.png]
 * Defaults to the dev server, capture mode, no HUD.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = process.argv[2] || 'http://localhost:5173/?capture=1&seed=7&nofx&nohud';
const outPng = process.argv[3] || 'shots/botgun-aim.png';
const evalFile = new URL('./botgun-check.eval.js', import.meta.url).pathname;
const W = Number(process.env.W || 1280);
const H = Number(process.env.H || 720);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-botgun-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
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

const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
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
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 90; i++) {
  if (await ev('window.__READY__ === true')) break;
  await sleep(500);
}
await sleep(500);

const result = await ev(fs.readFileSync(evalFile, 'utf8'));
if (result?.__error) throw new Error(JSON.stringify(result));
if (!result) throw new Error('eval returned nothing: ' + logs.slice(-6).join('\n'));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync(path.dirname(outPng), { recursive: true });
fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));

ws.close();
chrome.kill('SIGKILL');
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }

// ------------------------------------------------------------------ report
const c = result.criteria;
const rows = [
  ['1 right wrist → grip', `${c.aim.maxErrR.toFixed(4)} m`, c.aim.maxErrR <= 0.03],
  ['2 left wrist → handguard', `${c.aim.maxErrL.toFixed(4)} m`, c.aim.maxErrL <= 0.05],
  ['3 bore · aim dir', `${c.aim.minDot.toFixed(4)}`, c.aim.minDot >= 0.98],
  ['4a low-ready muzzle', `${c.lowReady.meanDeg.toFixed(1)}° down`, c.lowReady.meanDeg >= 25 && c.lowReady.meanDeg <= 35],
  ['4b sprint carry', `${c.carry.downDeg.toFixed(1)}° down, ${c.carry.acrossDeg.toFixed(0)}° across`, c.carry.downDeg >= 25 && c.carry.acrossDeg >= 15],
  ['4c blend to aim (90%)', `${c.transition.toAim90s}s`, c.transition.toAim90s <= 0.35],
  ['4d blend to low (90%)', `${c.transition.toLowReady90s}s`, c.transition.toLowReady90s <= 0.35],
  ['5a recoil back (95%)', `${c.recoil.back95s}s`, c.recoil.back95s != null && c.recoil.back95s <= 0.15],
  ['5b recoil pitch (95%)', `${c.recoil.pitch95s}s`, c.recoil.pitch95s != null && c.recoil.pitch95s <= 0.15],
  ['5c wrist error under recoil', `${c.recoil.maxWristErrDuringRecoil.toFixed(4)} m`, c.recoil.maxWristErrDuringRecoil <= 0.03],
  ['6 sim cost, 26 bots', `+${c.perf.rigMs.toFixed(3)} ms/frame (${c.perf.rigUsPerBot} µs/bot)`, c.perf.rigMs <= 1],
];
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nbot gun rig — ${result.meta.gunLength[0]} m, ${result.meta.bots ?? 3} bots, characters=${result.meta.characters}`);
console.log('─'.repeat(72));
for (const [name, value, pass] of rows) console.log(`${pass ? 'PASS' : 'FAIL'}  ${pad(name, 30)} ${value}`);
console.log('─'.repeat(72));
console.log(`sim A/B: ${c.perf.onMs.join('/')} ms with gun vs ${c.perf.offMs.join('/')} without → median ${c.perf.abDeltaMs} ms (noise floor ~0.2 ms)`);
console.log(`recoil trace (m): ${c.recoil.traceBack.join(', ')}`);
console.log(`shot: ${outPng}`);
fs.writeFileSync(path.join(path.dirname(outPng), 'botgun-check.json'), JSON.stringify(result, null, 2));
if (logs.some((l) => l.startsWith('[pageerror]'))) console.log(logs.filter((l) => l.startsWith('[pageerror]')).join('\n'));
process.exit(rows.every((r) => r[2]) ? 0 : 1);
