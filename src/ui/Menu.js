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
      <header class="menu-head">
        <div class="brand">
          <b>战地 · 解放<em>美利坚</em></b>
          <span>BATTLEFIELD · LIBERATE AMERICA</span>
        </div>
        <div class="meta">
          <span>太平洋远征军 · 第九兵团</span>
          <span>作战室 / WAR ROOM</span>
          <span id="menu-clock">1947</span>
        </div>
      </header>
      <div class="menu-body">
        <div class="menu-left">
          <div class="menu-eyebrow">战役档案 / CAMPAIGN ARCHIVE</div>
          <h1 class="menu-title">解放<br/>美利坚</h1>
          <div class="menu-sub">1947 · 西海岸反攻 · 四场战役</div>
          <div class="mission-list" id="mission-list"></div>
        </div>
        <div class="menu-right">
          <div class="brief-card">
            <div class="brief-year" id="brief-year"></div>
            <h2 class="brief-title" id="brief-title"></h2>
            <div class="brief-loc" id="brief-loc"></div>
            <p class="brief-text" id="brief-text"></p>
            <div class="brief-objs" id="brief-objs"></div>
            <div class="menu-actions">
              <button class="btn primary" id="btn-start">开始战役</button>
              <button class="btn ghost" id="btn-settings">设置</button>
            </div>
          </div>
        </div>
      </div>
      <footer class="menu-foot">
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
        <div>v0.1 · 原型构建中</div>
      </footer>

      <div class="settings-panel" id="settings-panel">
        <h2>作战设置</h2>
        <div class="setting-row"><label>鼠标灵敏度</label><input type="range" id="set-sens" min="0.2" max="2" step="0.05"><span class="val" id="val-sens">1.00</span></div>
        <div class="setting-row"><label>主音量</label><input type="range" id="set-vol" min="0" max="1" step="0.05"><span class="val" id="val-vol">70%</span></div>
        <div class="setting-row"><label>后坐力强度</label><input type="range" id="set-rec" min="0" max="1.5" step="0.05"><span class="val" id="val-rec">100%</span></div>
        <button class="btn settings-close" id="btn-settings-close">返回</button>
      </div>

      <div class="deploy" id="deploy">
        <div class="deploy-inner">
          <div class="deploy-k">DEPLOYING · 1947</div>
          <h2 id="deploy-title">圣塔芭芭拉登陆战</h2>
          <div class="deploy-sub" id="deploy-sub">正在部署部队…</div>
          <div class="deploy-bar"><i></i></div>
        </div>
      </div>
    `;
    this.root.appendChild(section);
    this.el = section;
    this.art = section.querySelector('#menu-art');
    this.list = section.querySelector('#mission-list');
    this.deploy = section.querySelector('#deploy');

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
        <p id="end-sub"></p>
        <div class="end-stats" id="end-stats"></div>
        <div class="end-actions">
          <button class="btn primary" id="btn-again">再战一次</button>
          <button class="btn" id="btn-end-menu">返回战役选择</button>
        </div>
      </div>`;
    this.root.appendChild(end);
    this.endEl = end;
    this._wire();
  }

  _buildList() {
    this.list.innerHTML = CAMPAIGNS.map((c) => `
      <button class="mission" data-id="${c.id}">
        <span class="idx">${c.index}</span>
        <span>
          <div class="m-name">${c.name}</div>
          <div class="m-meta">${c.date} · ${c.location.split('·').pop().trim()}</div>
        </span>
        <span class="m-tag">可部署</span>
      </button>`).join('');
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
    this.el.querySelector('#btn-settings-close').addEventListener('click', () => this.toggleSettings(false));
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
      const input = this.el.querySelector(id);
      input.value = this.settings[key];
      const out = this.el.querySelector(id.replace('set-', 'val-'));
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
    this.el.querySelector('#settings-panel').classList.toggle('open', open);
  }

  select(id) {
    this.selected = id;
    const c = CAMPAIGN_BY_ID[id];
    this.list.querySelectorAll('.mission').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    this.el.querySelector('#brief-year').textContent = `${c.date} · ${c.weather}`;
    this.el.querySelector('#brief-title').textContent = c.name;
    this.el.querySelector('#brief-loc').textContent = c.location;
    this.el.querySelector('#brief-text').textContent = c.briefing;
    this.el.querySelector('#brief-objs').innerHTML = c.objectives.map((o) => `<div>${o}</div>`).join('');
    this.art.style.backgroundImage = `linear-gradient(90deg, rgba(8,10,7,0.97) 0%, rgba(8,10,7,0.62) 44%, rgba(8,10,7,0.12) 72%, rgba(8,10,7,0.55) 100%), url("${c.art}")`;
    this.art.style.backgroundPosition = 'center';
    this.art.style.backgroundSize = 'cover';
    this.el.style.setProperty('--accent', c.accent);
  }

  open() {
    this.isOpen = true;
    this.el.classList.add('open');
    this.el.querySelector('#settings-panel').classList.remove('open');
    this.select(this.selected);
  }

  close() {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  start(id = this.selected) {
    const c = CAMPAIGN_BY_ID[id];
    if (!c) return;
    this.game.audio.ensure();
    this.game.audio.ui('click');
    this.deploy.querySelector('#deploy-title').textContent = c.name;
    this.deploy.querySelector('#deploy-sub').textContent = c.location;
    this.deploy.classList.add('open');
    this.close();
    this.pauseEl.classList.remove('open');
    this.game.input.lock();
    this.endEl.classList.remove('open');
    setTimeout(() => {
      this.game.startMission(id);
      this.deploy.classList.remove('open');
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
