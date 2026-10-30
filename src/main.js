import './ui/style.css';
import { Game } from './game/Game.js';
import { Menu, loadSettings, saveSettings } from './ui/Menu.js';

const canvas = document.getElementById('game');
const loading = document.getElementById('loading');
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

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Debug/playtest shortcuts.
  const params = new URLSearchParams(location.search);
  const auto = params.get('mission');
  if (auto) {
    setTimeout(() => menu.start(auto), 300);
  }
}
boot();
