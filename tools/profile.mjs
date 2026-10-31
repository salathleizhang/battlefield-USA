// Gameplay profiler: frame-time distribution and what caused each hitch.
//
//   node tools/profile.mjs --mission=miami-beach --w=1512 --h=982 --dpr=2
//
// A median frame time hides the stalls that make a game feel broken, so this
// reports p50/p95/p99 and lists every hitch with the WebGL program, geometry and
// texture deltas on that frame. A jump in programs on a hitch frame means a
// shader compiled mid-play — the classic Three.js freeze.
//
// Runs against the normal (non-capture) page so it exercises the real frame
// loop, and drives input so the sample is gameplay, not a static camera.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const URL_ = args.url || 'http://localhost:5173/';
const MISSION = args.mission || 'miami-beach';
const W = Number(args.w || 1512);
const H = Number(args.h || 982);
const DPR = Number(args.dpr || 2);
const FRAMES = Number(args.frames ?? 600);
const WARMUP = Number(args.warmup ?? 90);
const CHROME = args.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-prof-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  // `--gpu` for real frame times; the default software raster still yields a
  // valid draw-call / program-count profile, just useless milliseconds.
  ...(args.gpu
    ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
    : ['--no-sandbox', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  '--disable-frame-rate-limit', '--disable-gpu-vsync', '--mute-audio',
  '--enable-precise-memory-info',
  '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars',
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

const target = new URL(URL_);
target.searchParams.set('mission', MISSION);
const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(target.toString())}`, { method: 'PUT' })).json();
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
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    logs.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
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
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, userGesture: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });

const t0 = Date.now();

let ready = false;
for (let i = 0; i < 180; i++) {
  if (await ev('!!(window.__game && window.__game.started)')) { ready = true; break; }
  await sleep(1000);
}
if (!ready) {
  const state = await ev('({ game: !!window.__game, started: !!window.__game?.started, loading: !!document.getElementById("loading"), href: location.href })').catch(() => null);
  console.error(JSON.stringify({ error: 'page never reached gameplay', state, logs: logs.slice(-6) }, null, 2));
  process.exit(1);
}
const bootMs = Date.now() - t0;

const boot = await ev(`(() => {
  const r = window.__game.renderer;
  const gl = r.renderer.getContext();
  return {
    pixelRatio: r.renderer.getPixelRatio(),
    renderScale: r.renderScale ?? 1,
    drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    megapixels: +((gl.drawingBufferWidth * gl.drawingBufferHeight) / 1e6).toFixed(2),
    quality: r.settings?.quality,
    programs: r.renderer.info.programs.length,
    contextLost: gl.isContextLost(),
  };
})()`);

// Let the level settle: the first frames after a build are one-time costs.
await sleep(3000);

// Measure from inside the game's own loop. A second rAF chain samples the same
// frames but can drift out of phase with the game's, doubling the intervals it
// reports — which is exactly how a 60 fps build gets read as 30.
await ev(`(() => {
  const g = window.__game;
  // Headless cannot acquire pointer lock, so the game parks itself paused and
  // stops ticking gameplay. Force it live so the sample is real play.
  g.paused = false;
  window.__FT = [];
  window.__CALLS = [];
  const orig = g.update.bind(g);
  let last = performance.now();
  g.update = (dt) => {
    const now = performance.now();
    window.__FT.push(+((now - last) / 1).toFixed(2));
    last = now;
    orig(dt);
    const info = g.renderer?.renderer?.info;
    window.__CALLS.push({
      progs: info?.programs?.length ?? 0,
      calls: info?.render?.calls ?? 0,
      tris: info?.render?.triangles ?? 0,
      geos: info?.memory?.geometries ?? 0,
      texs: info?.memory?.textures ?? 0,
      pr: +(g.renderer?.renderer?.getPixelRatio?.() ?? 1).toFixed(3),
      rs: +(g.renderer?.renderScale ?? 1).toFixed(3),
      avg: +(g.renderer?._ftAvg ?? 0).toFixed(1),
      ao: g.renderer?._aoMode ?? null,
      heap: performance.memory ? performance.memory.usedJSHeapSize >> 20 : 0,
    });
  };
  return true;
})()`);

// Drive input while the game's own loop runs, then stop and collect.
await ev(`(() => {
  const g = window.__game;
  window.__DRIVE = setInterval(() => {
    g.input.keys?.add?.('KeyW');
    const t = window.__CALLS.length;
    if (t % 90 < 30) g.input.keys?.add?.('Mouse0'); else g.input.keys?.delete?.('Mouse0');
  }, 16);
  return true;
})()`);
await sleep(Math.round((FRAMES / 55) * 1000) + 1500);
const raw = await ev(`(() => { clearInterval(window.__DRIVE); const g = window.__game; return { ft: window.__FT, meta: window.__CALLS }; })()`);

const samples = raw.ft.map((dt, i) => ({ i, dt, ...(raw.meta[i] || {}) }));
const warm = samples.slice(WARMUP);
const dts = warm.map((s) => s.dt).sort((a, b) => a - b);
const q = (p) => +(dts[Math.min(dts.length - 1, Math.floor(dts.length * p))] ?? 0).toFixed(2);
const med = q(0.5);
const hitches = warm.filter((s) => s.dt > Math.max(2 * med, med + 8));
const worst = hitches
  .map((s) => {
    const prev = warm[warm.indexOf(s) - 1];
    return {
      frame: s.i, ms: s.dt,
      progDelta: prev ? s.progs - prev.progs : 0,
      geoDelta: prev ? s.geos - prev.geos : 0,
      texDelta: prev ? s.texs - prev.texs : 0,
      heapDrop: prev ? Math.max(0, prev.heap - s.heap) : 0,
    };
  })
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 12);

const out = {
  bootMs,
  boot,
  frames: warm.length,
  frameTimeMs: { p50: med, p90: q(0.9), p95: q(0.95), p99: q(0.99), max: q(1) },
  fps: { p50: +(1000 / med).toFixed(0), p95: +(1000 / q(0.95)).toFixed(0), p99: +(1000 / q(0.99)).toFixed(0) },
  hitchCount: hitches.length,
  hitchPct: +((hitches.length / warm.length) * 100).toFixed(2),
  worstHitches: worst,
  programs: { start: warm[0]?.progs, end: warm[warm.length - 1]?.progs, compiledDuringPlay: (warm[warm.length - 1]?.progs ?? 0) - (warm[0]?.progs ?? 0) },
  pixelRatio: { start: warm[0]?.pr, min: Math.min(...warm.map((s) => s.pr)), end: warm[warm.length - 1]?.pr },
  renderScale: { start: warm[0]?.rs, min: Math.min(...warm.map((s) => s.rs)), end: warm[warm.length - 1]?.rs },
  ctrlAvg: { start: warm[0]?.avg, end: warm[warm.length - 1]?.avg },
  aoMode: warm[warm.length - 1]?.ao,
  heapMb: { start: warm[0]?.heap, max: Math.max(...warm.map((s) => s.heap)), end: warm[warm.length - 1]?.heap,
            gcDrop: Math.max(0, ...warm.map((s, n) => (n ? Math.max(0, warm[n - 1].heap - s.heap) : 0))) },
  drawCalls: { min: Math.min(...warm.map((s) => s.calls)), max: Math.max(...warm.map((s) => s.calls)) },
  triangles: { min: Math.min(...warm.map((s) => s.tris)), max: Math.max(...warm.map((s) => s.tris)) },
  errors: logs.slice(0, 5),
};
console.log(JSON.stringify(out, null, 2));

ws.close();
chrome.kill('SIGKILL');
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
process.exit(0);
