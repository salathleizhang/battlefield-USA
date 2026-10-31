// Reproducible screenshot baseline: one fresh page per shot, a fixed number of
// pumped frames, no wall-clock wait. Diff the output with tools/imagediff.mjs.
//
//   node tools/baseline.mjs --out=shots/base --shots=miami-beach,golden-gate
//
// Why a fresh page per shot: reusing one page carries particle ages, decal ring
// buffers and exposure state forward, so two runs of the same code differ on
// every shot but the first. Why a pumped frame budget instead of a sleep: the
// moment the shutter opens then depends on how fast the machine rendered, not on
// how far the simulation got.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const URL_ = args.url || 'http://localhost:5173/';
const OUT = path.resolve(args.out || 'shots/base');
const W = Number(args.w || 960);
const H = Number(args.h || 540);
const FRAMES = Number(args.frames || 30);
// Level textures and props finish uploading asynchronously, so pumping frames
// the instant the mission exists can catch some maps half-loaded — and which
// ones differ between runs. Waiting here costs 2.5 s and is simulation-neutral:
// nothing advances except wall time, which no capture state depends on.
const WAIT = Number(args.wait ?? 2500);
const SHOTS = String(args.shots || 'miami-beach,golden-gate,mississippi,washington').split(',').map((s) => s.trim());
const CHROME = args.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-base-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  // Software raster: slow, but bit-identical across runs and machines, which is
  // what a pixel gate needs. Use the real GPU for profiling, not for this.
  '--no-sandbox', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars',
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

/** Open one page, run an expression, screenshot, close. */
async function withPage(url, fn) {
  const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  const pending = new Map();
  const logs = [];
  let nextId = 1;
  ws.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error') logs.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('pageerror: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, userGesture: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  };
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    return await fn({ send, evaluate, logs });
  } finally {
    ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`).catch(() => {});
  }
}

const report = { url: URL_, size: `${W}x${H}`, frames: FRAMES, shots: [], errors: [] };

for (const shot of SHOTS) {
  const t0 = Date.now();
  try {
    const target = new URL(URL_);
    target.searchParams.set('capture', '1');
    target.searchParams.set('seed', '7');
    const res = await withPage(target.toString(), async ({ evaluate, logs, send }) => {
      let ready = false;
      for (let i = 0; i < 180; i++) {
        if (await evaluate('window.__READY__ === true')) { ready = true; break; }
        await sleep(1000);
      }
      if (!ready) throw new Error('boot timeout');

      const started = await evaluate(`window.__START__(${JSON.stringify(shot)})`);
      if (!started) throw new Error('mission failed to start');

      await sleep(WAIT);
      // Two frames to settle the level build, then the counted budget.
      await evaluate('window.__PUMP__(2)');
      const info = await evaluate(`window.__PUMP__(${FRAMES})`);
      await sleep(250);
      const png = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `${shot}.png`), Buffer.from(png.data, 'base64'));
      return { info, logs };
    });
    report.shots.push({ shot, ok: true, ms: Date.now() - t0, ...res.info, errors: res.logs.slice(0, 4) });
  } catch (e) {
    report.shots.push({ shot, ok: false, ms: Date.now() - t0, error: String(e.message || e) });
    report.errors.push(`${shot}: ${e.message || e}`);
  }
  console.log(`${shot}: ${report.shots[report.shots.length - 1].ok ? 'ok' : 'FAILED'} (${Date.now() - t0} ms)`);
}

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
chrome.kill('SIGKILL');
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
process.exit(report.errors.length ? 1 : 0);
