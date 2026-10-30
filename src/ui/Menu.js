import { CAMPAIGNS, CAMPAIGN_BY_ID } from '../game/campaigns.js';

const SETTINGS_KEY = 'bf-la-settings-v1';

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { sens: 1, volume: 0.7, master: 0.7, ...s };
  } catch {
    return { sens: 1, volume: 0.7, master: 0.7 };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export class Menu {
  constructor(game, settings) {
    this.game = game;
    this.settings = settings;
    this.selected = CAMPAIGNS[0].id;
    this.isOpen = false;
    this.root = document.body;
    this._build();
    this._applySettings();
  }

  _build() {
    const section = document.createElement('div');
    section.className = 'menu';
    section.id = 'menu';
    section.innerHTML = `
      <div class="menu-art" id="menu-art"></div>
      <video class="menu-art-video" id="menu-art-video" muted loop playsinline preload="auto" aria-hidden="true"></video>
      <div class="menu-bgfx" aria-hidden="true"></div>
      <aside class="menu-side">
        <div class="brand-lockup">
          <div class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></div>
          <div class="brand-word">解放美利坚<small>BATTLEFIELD · LIBERATE AMERICA</small></div>
        </div>
        <div class="side-sub">战役档案 <em>CAMPAIGN ARCHIVE</em></div>
        <nav class="mission-list" id="mission-list"></nav>
        <div class="side-foot">
          <div class="keys">
            <span><b>WASD</b> 移动</span>
            <span><b>左键</b> 射击</span>
            <span><b>右键</b> 瞄准</span>
            <span><b>R</b> 装填</span>
            <span><b>V</b> 刺刀</span>
            <span><b>G</b> 手榴弹</span>
            <span><b>Shift</b> 冲刺</span>
            <span><b>C</b> 蹲下</span>
          </div>
          <div class="side-ver">v0.1 · 原型构建中</div>
        </div>
      </aside>
      <main class="menu-main">
        <section class="card card-brief">
          <div class="brief-seal seal" aria-hidden="true">绝密</div>
          <h3>作战简报 <span>OPERATION BRIEF</span></h3>
          <div class="brief-year" id="brief-year"></div>
          <h2 class="brief-title" id="brief-title"></h2>
          <div class="brief-loc" id="brief-loc"></div>
          <p class="brief-text" id="brief-text"></p>
        </section>
        <section class="card card-objectives">
          <h3>战役目标 <span>OBJECTIVES</span></h3>
          <div class="brief-objs" id="brief-objs"></div>
        </section>
        <section class="card card-situation">
          <h3>战场态势 <span>SITUATION</span></h3>
          <div class="situation">
            <div><b>天气</b><span id="situation-weather"></span></div>
            <div><b>地点</b><span id="situation-loc"></span></div>
            <div><b>日期</b><span id="situation-date"></span></div>
          </div>
        </section>
        <div class="menu-actions">
          <button class="btn primary" id="btn-start">开始战役</button>
          <button class="btn ghost" id="btn-settings">设置</button>
        </div>
      </main>
    `;
    this.root.appendChild(section);
    this.el = section;
    this.art = section.querySelector('#menu-art');
    this.videoEl = section.querySelector('#menu-art-video');
    this.list = section.querySelector('#mission-list');

    // Settings live outside the menu so they can also open over the pause screen.
    const settingsPanel = document.createElement('div');
    settingsPanel.className = 'settings-panel';
    settingsPanel.id = 'settings-panel';
    settingsPanel.innerHTML = `
      <div class="settings-card">
        <div class="seal settings-seal" aria-hidden="true">军令</div>
        <h2>作战设置</h2>
        <div class="setting-row"><label>鼠标灵敏度</label><input type="range" id="set-sens" min="0.2" max="2" step="0.05"><span class="val" id="val-sens">1.00</span></div>
        <div class="setting-row"><label>主音量</label><input type="range" id="set-vol" min="0" max="1" step="0.05"><span class="val" id="val-vol">70%</span></div>
        <div class="setting-row"><label>后坐力强度</label><input type="range" id="set-rec" min="0" max="1.5" step="0.05"><span class="val" id="val-rec">100%</span></div>
        <button class="btn settings-close" id="btn-settings-close">返回</button>
      </div>`;
    this.root.appendChild(settingsPanel);
    this.settingsEl = settingsPanel;

    this._buildList();

    // Pause overlay.
    const pause = document.createElement('div');
    pause.className = 'pause';
    pause.id = 'pause';
    pause.innerHTML = `
      <div class="pause-card">
        <h2>战斗暂停</h2>
        <div class="sub" id="pause-sub">P A U S E D</div>
        <button class="btn primary" id="btn-resume">继续战斗</button>
        <button class="btn" id="btn-restart">重新部署</button>
        <button class="btn" id="btn-pause-settings">设置</button>
        <button class="btn" id="btn-exit">返回战役选择</button>
      </div>`;
    this.root.appendChild(pause);
    this.pauseEl = pause;

    const end = document.createElement('div');
    end.className = 'end-screen';
    end.innerHTML = `
      <div class="end-inner">
        <div class="end-k" id="end-k">MISSION COMPLETE</div>
        <h2 id="end-title">胜 利</h2>
        <div class="seal end-seal" id="end-seal" aria-hidden="true">凯旋</div>
        <p id="end-sub"></p>
        <div class="end-stats" id="end-stats"></div>
        <div class="end-actions">
          <button class="btn primary" id="btn-again">再战一次</button>
          <button class="btn" id="btn-end-menu">返回战役选择</button>
        </div>
      </div>`;
    this.root.appendChild(end);
    this.endEl = end;

    const deploy = document.createElement('div');
    deploy.className = 'deploy';
    deploy.id = 'deploy';
    deploy.innerHTML = `
      <div class="deploy-inner">
        <div class="deploy-k">DEPLOYING · 1947</div>
        <h2 id="deploy-title">迈阿密海滩登陆战</h2>
        <div class="deploy-sub" id="deploy-sub">正在部署部队…</div>
        <div class="deploy-bar"><i></i></div>
      </div>`;
    this.root.appendChild(deploy);
    this.deployEl = deploy;

    this._wire();
  }

  _buildList() {
    this.list.innerHTML = CAMPAIGNS.map((c) => {
      const date = c.date.replace(/[年月]/g, '.').replace('日', '').replace(/\s+/g, '');
      return `
      <button class="mission" data-id="${c.id}">
        <span class="idx">${c.index}</span>
        <span class="m-name">${c.name}</span>
        <span class="m-meta">${date} · ${c.location.split('·').pop().trim()}</span>
        <span class="m-tag">可出击</span>
      </button>`;
    }).join('');
    this.list.querySelectorAll('.mission').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.audio.ui('click');
        this.select(btn.dataset.id);
      });
    });
  }

  _wire() {
    this.el.querySelector('#btn-start').addEventListener('click', () => this.start());
    this.el.querySelector('#btn-settings').addEventListener('click', () => this.toggleSettings(true));
    this.settingsEl.querySelector('#btn-settings-close').addEventListener('click', () => this.toggleSettings(false));
    this.pauseEl.querySelector('#btn-resume').addEventListener('click', () => this.resume());
    this.pauseEl.querySelector('#btn-restart').addEventListener('click', () => {
      const id = this.game.campaign?.id;
      this.resume();
      if (id) this.start(id);
    });
    this.pauseEl.querySelector('#btn-pause-settings').addEventListener('click', () => this.toggleSettings(true));
    this.pauseEl.querySelector('#btn-exit').addEventListener('click', () => this.exit());
    this.endEl.querySelector('#btn-again').addEventListener('click', () => {
      const id = this.game.campaign?.id;
      this.endEl.classList.remove('open');
      if (id) this.start(id);
    });
    this.endEl.querySelector('#btn-end-menu').addEventListener('click', () => this.exit());

    const bind = (id, key, fmt) => {
      const input = this.settingsEl.querySelector(id);
      input.value = this.settings[key];
      const out = this.settingsEl.querySelector(id.replace('set-', 'val-'));
      out.textContent = fmt(this.settings[key]);
      input.addEventListener('input', () => {
        this.settings[key] = parseFloat(input.value);
        out.textContent = fmt(this.settings[key]);
        this._applySettings();
        saveSettings(this.settings);
      });
    };
    bind('#set-sens', 'sens', (v) => v.toFixed(2));
    bind('#set-vol', 'volume', (v) => `${Math.round(v * 100)}%`);
    bind('#set-rec', 'recoil', (v) => `${Math.round(v * 100)}%`);
  }

  _applySettings() {
    this.game.settings = this.settings;
    this.game.audio.setVolume(this.settings.volume);
    this.game.audio.ensure();
    if (this.game.input) this.game.input.sensitivity = this.settings.sens;
    if (this.game.player) this.game.player.recoilScale = this.settings.recoil ?? 1;
  }

  toggleSettings(open) {
    this.settingsEl.classList.toggle('open', open);
  }

  select(id) {
    this.selected = id;
    const c = CAMPAIGN_BY_ID[id];
    this.list.querySelectorAll('.mission').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    this.el.querySelector('#brief-year').textContent = `${c.date} · ${c.weather}`;
    this.el.querySelector('#brief-title').textContent = c.name;
    this.el.querySelector('#brief-loc').textContent = c.location;
    this.el.querySelector('#brief-text').textContent = c.briefing;
    this.el.querySelector('#brief-objs').innerHTML = c.objectives
      .map((o, i) => `<div><b>0${i + 1}</b><span>${o}</span></div>`)
      .join('');
    this.el.querySelector('#situation-weather').textContent = c.weather;
    this.el.querySelector('#situation-loc').textContent = c.location;
    this.el.querySelector('#situation-date').textContent = c.date;
    this.art.style.backgroundImage = `url("${c.art}")`;
    this.art.style.backgroundPosition = 'center';
    this.art.style.backgroundSize = 'cover';
    this.el.style.setProperty('--accent', c.accent);
    this._applyVideo(c);
  }

  /**
   * Campaign key art is a still; a few campaigns ship a looping cinematic.
   * The video sits above the still (which stays as poster / fallback) and is
   * skipped entirely when the user asks for reduced motion.
   */
  _applyVideo(c) {
    const v = this.videoEl;
    if (!v) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const useVideo = Boolean(c.video) && !reduce;
    this.el.classList.toggle('has-video', useVideo);
    if (!useVideo) {
      v.pause();
      return;
    }
    if (v.dataset.src !== c.video) {
      v.dataset.src = c.video;
      v.poster = c.art;
      v.src = c.video;
    }
    this._playVideo();
  }

  _playVideo() {
    const v = this.videoEl;
    const played = v.play();
    if (!played?.catch) return;
    played.catch(() => {
      if (this._retryBound) return;
      this._retryBound = true;
      const retry = () => {
        this._retryBound = false;
        window.removeEventListener('pointerdown', retry, true);
        window.removeEventListener('keydown', retry, true);
        const c = CAMPAIGN_BY_ID[this.selected];
        if (this.isOpen && c?.video) this._playVideo();
      };
      window.addEventListener('pointerdown', retry, true);
      window.addEventListener('keydown', retry, true);
    });
  }

  open() {
    this.isOpen = true;
    this.el.classList.add('open');
    this.settingsEl.classList.remove('open');
    this.select(this.selected);
  }

  close() {
    this.isOpen = false;
    this.el.classList.remove('open');
    this.videoEl?.pause();
  }

  start(id = this.selected) {
    const c = CAMPAIGN_BY_ID[id];
    if (!c) return;
    this.game.audio.ensure();
    this.game.audio.ui('click');
    this.deployEl.querySelector('#deploy-title').textContent = c.name;
    this.deployEl.querySelector('#deploy-sub').textContent = c.location;
    this.deployEl.classList.add('open');
    this.close();
    this.pauseEl.classList.remove('open');
    this.game.input.lock();
    this.endEl.classList.remove('open');
    setTimeout(() => {
      this.game.startMission(id);
      this.deployEl.classList.remove('open');
    }, 120);
  }

  openPause() {
    if (!this.game.started) return;
    this.pauseEl.classList.add('open');
    this.isPaused = true;
  }

  closePause() {
    this.pauseEl.classList.remove('open');
    this.isPaused = false;
  }

  resume() {
    this.closePause();
    this.toggleSettings(false);
    this.game.paused = false;
    this.game.input.lock();
  }

  exit() {
    this.closePause();
    this.endEl.classList.remove('open');
    this.game.exitToMenu();
    this.open();
  }

  showEnd(winner) {
    this.game.paused = true;
    this.game.input.unlock();
    const win = winner === 0;
    this.endEl.querySelector('#end-k').textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
    this.endEl.querySelector('#end-title').textContent = win ? '胜 利' : '战 败';
    this.endEl.querySelector('#end-title').classList.toggle('lost', !win);
    this.endEl.querySelector('#end-seal').textContent = win ? '凯旋' : '再战';
    this.endEl.querySelector('#end-sub').textContent = win
      ? '远征军的旗帜已经插上阵地。太平洋舰队正在驶入港口。'
      : '美军重新夺回了阵地。集结部队，再次进攻。';
    const st = this.game.stats || { kills: 0, deaths: 0 };
    const m = this.game.match;
    this.endEl.querySelector('#end-stats').innerHTML = `
      <div><span>击杀</span><b>${st.kills}</b></div>
      <div><span>阵亡</span><b>${st.deaths}</b></div>
      <div><span>剩余兵力</span><b>${Math.ceil(m?.tickets[0] ?? 0)}</b></div>
      <div><span>战斗时长</span><b>${Math.floor((m?.time ?? 0) / 60)}:${String(Math.floor((m?.time ?? 0) % 60)).padStart(2, '0')}</b></div>`;
    this.endEl.classList.add('open');
  }
}
