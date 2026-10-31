import './ui/style.css';
import { Game } from './game/Game.js';
import { Menu, loadSettings, saveSettings } from './ui/Menu.js';

const canvas = document.getElementById('game');
const loading = document.getElementById('loading');

/**
 * Capture mode — `?capture=1`.
 *
 * Screenshots are only a regression gate if the same code produces the same
 * pixels twice. Two things break that by default:
 *
 *  - `Math.random()` is called ~120 times during build (texture noise, prop
 *    placement, bot behaviour), so every load differs.
 *  - the frame loop derives dt from `performance.now()`, so how far the
 *    simulation has advanced when the shutter opens depends on the machine.
 *
 * In capture mode the RNG is a seeded sfc32 and the loop is replaced by an
 * explicit `window.__PUMP__(n)` that advances exactly n frames of 1/60 s.
 * Nothing else changes, so a capture still goes through the real render path.
 */
const params = new URLSearchParams(location.search);
const CAPTURE = params.get('capture') === '1';
const CAPTURE_DT = 1 / 60;

if (CAPTURE) {
  let a = 0x9e3779b9 ^ Number(params.get('seed') || 1);
  let b = 0x243f6a88, c = 0xb7e15162, d = 1;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  Math.random = next;
}
const bar = loading.querySelector('.load-bar i');
const msg = loading.querySelector('.load-msg');

const tips = [
  '提示：三八式步枪射速慢，但一枪足以让敌人失去战斗能力。',
  '提示：占领据点时人数越多，进度越快。',
  '提示：按 C 蹲下可以降低被命中的概率。',
  '提示：刺刀在堑壕里比子弹更安静。',
  '提示：金门大桥上风很大，注意脚下。',
];
loading.querySelector('.load-tip').textContent = tips[(Math.random() * tips.length) | 0];

const settings = loadSettings();
const game = new Game(canvas);
window.__game = game;

async function boot() {
  try {
    await game.init((p, label) => {
      bar.style.width = `${Math.round(p * 100)}%`;
      if (label) msg.textContent = label;
    });
  } catch (e) {
    console.error(e);
    msg.textContent = '加载失败：' + (e?.message || e);
    return;
  }
  loading.classList.add('hide');
  setTimeout(() => loading.remove(), 1000);

  game.audio.ensure();
  const menu = new Menu(game, settings);
  game.menu = menu;
  menu.open();

  let hadLock = false;
  game.input.onLockChange = (locked) => {
    if (locked) hadLock = true;
    if (!locked && hadLock && game.started && !game.paused && game.match?.state === 'live') {
      game.paused = true;
      menu.openPause();
    }
  };

  canvas.addEventListener('click', () => {
    if (game.started && !game.paused && !game.input.locked) game.input.lock();
  });

  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && game.started && game.match?.state === 'live') {
      // Pointer lock exit already pauses; this also covers browsers that keep lock.
      if (!game.input.locked && !game.paused) {
        game.paused = true;
        menu.openPause();
      }
    }
    if (e.code === 'KeyM' && game.started) {
      settings.volume = settings.volume > 0.1 ? 0 : 0.7;
      game.audio.setVolume(settings.volume);
      saveSettings(settings);
    }
  });

  addEventListener('beforeunload', () => saveSettings(settings));

  if (CAPTURE) {
    // No realtime loop: the harness decides exactly when the clock advances.
    menu.close();
    // CSS keyframes and transitions run on wall-clock time, so a HUD element
    // caught mid-fade differs between two runs of identical code. Freeze them,
    // and drop the two pieces that only exist to narrate a live session.
    const style = document.createElement('style');
    style.textContent = `*, *::before, *::after { animation: none !important; transition: none !important; }
      .banner, .subtitle, .lock-hint { display: none !important; }`;
    document.head.appendChild(style);
    window.__game = game;
    window.__CAPTURE__ = { dt: CAPTURE_DT, seed: Number(params.get('seed') || 1) };
    window.__START__ = (id) => { game.startMission(id); return !!game.level; };
    window.__PUMP__ = (n = 30, dt = CAPTURE_DT) => {
      for (let i = 0; i < n; i++) game.update(dt);
      return { frames: n, time: game.time, programs: game.renderer?.renderer?.info?.programs?.length ?? 0 };
    };
    window.__SHOT__ = (cam) => { game.debug = cam ? { cam } : null; return !!cam; };
    window.__READY__ = true;
    return;
  }

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Debug/playtest shortcuts.
  const auto = params.get('mission');
  if (auto) {
    setTimeout(() => menu.start(auto), 300);
  }
}
boot();
