// Showcase screenshots: one menu shot (live loop, so the key-art video plays)
// plus one in-game shot per campaign (capture mode: seeded RNG + pumped frames).
//
//   node tools/showcase.mjs --out=shots/showcase
//
// Menu shots reuse a normal page load and wait for the menu; campaign shots go
// through ?capture=1 so the exact frame after N pumped ticks is deterministic.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const URL_ = args.url || 'http://localhost:5173/';
const OUT = path.resolve(args.out || 'shots/showcase');
const W = Number(args.w || 1600);
const H = Number(args.h || 900);
const FRAMES = Number(args.frames || 150);
const WAIT = Number(args.wait ?? 3000);
const MENU_WAIT = Number(args.menuWait ?? 16000);
const CHROME = args.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-show-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
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

async function shootPage(send, name) {
  const png = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(png.data, 'base64'));
}

const report = { url: URL_, size: `${W}x${H}`, shots: [], errors: [] };

// ---------------------------------------------------------------- menu
{
  const t0 = Date.now();
  try {
    await withPage(URL_, async ({ evaluate, send, logs }) => {
      let ready = false;
      for (let i = 0; i < 180; i++) {
        if (await evaluate('window.__READY__ === true')) { ready = true; break; }
        await sleep(1000);
      }
      // Wait for the key-art video: it fades in a beat after the menu opens.
      await sleep(MENU_WAIT);
      await shootPage(send, 'menu');
      return { logs };
    });
    report.shots.push({ shot: 'menu', ok: true, ms: Date.now() - t0 });
  } catch (e) {
    report.shots.push({ shot: 'menu', ok: false, ms: Date.now() - t0, error: String(e.message || e) });
    report.errors.push(`menu: ${e.message || e}`);
  }
  console.log(`menu: ${report.shots[report.shots.length - 1].ok ? 'ok' : 'FAILED'} (${Date.now() - t0} ms)`);
}

// ---------------------------------------------------------------- campaigns
for (const shot of String(args.shots || 'miami-beach,golden-gate,mississippi,washington').split(',').map((s) => s.trim())) {
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
      await evaluate('window.__PUMP__(2)');
      const info = await evaluate(`window.__PUMP__(${FRAMES})`);
      await sleep(300);
      await shootPage(send, shot);
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
