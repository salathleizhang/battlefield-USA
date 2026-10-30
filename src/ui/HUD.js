import * as THREE from 'three';
import { clamp, lerp } from '../core/MathUtil.js';

const TEAM_HEX = ['#d1483a', '#5b86b8'];
const TEAM_CN = ['中国远征军', '美军'];

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.visible = false;
    this.bannerT = 0;
    this.hitT = 0;
    this.damageT = 0;
    this.killfeedItems = [];
    this.spread = 0;
    this.reloading = false;
    this.lastAmmo = -1;
    this.time = 0;
    this._build();
    this._lastPts = [];
  }

  _build() {
    this.root.innerHTML = `
      <div class="hud" id="hud">
        <div class="hud-grade"></div>

        <div class="top">
          <div class="compass-wrap"><canvas class="compass" width="460" height="34"></canvas>
            <div class="compass-center"></div>
          </div>
          <div class="score-row">
            <div class="team-block cn">
              <div class="team-row"><span class="team-name">中国远征军</span><span class="team-score" data-cn>320</span></div>
              <div class="ticket-bar"><i data-cn-bar></i></div>
            </div>
            <div class="flags" data-flags></div>
            <div class="team-block us">
              <div class="team-row"><span class="team-score" data-us>320</span><span class="team-name">美军</span></div>
              <div class="ticket-bar us"><i data-us-bar></i></div>
            </div>
          </div>
        </div>

        <div class="minimap-wrap">
          <canvas class="minimap" width="210" height="210"></canvas>
          <div class="mm-ring"></div>
          <div class="mm-north">北</div>
          <div class="mm-scan"></div>
          <div class="mm-title" data-mm-title>迈阿密海滩</div>
        </div>

        <div class="objective-strip"><span class="obj-k">作战目标</span><span class="obj-v" data-objective>夺取据点</span></div>

        <div class="killfeed" data-killfeed></div>

        <div class="crosshair" data-crosshair>
          <i class="ch t"></i><i class="ch b"></i><i class="ch l"></i><i class="ch r"></i>
          <i class="ch-dot"></i>
        </div>
        <div class="hitmarker" data-hitmarker><i></i><i></i><i></i><i></i></div>

        <div class="vitals">
          <div class="hp-wrap"><div class="hp-bar"><i data-hp></i></div><span class="hp-num" data-hpnum>100</span></div>
          <div class="vitals-row"><span class="stance" data-stance>站立</span><span class="wound" data-wound></span></div>
        </div>

        <div class="ammo">
          <div class="ammo-row"><span class="ammo-num" data-ammo>5</span><span class="ammo-res" data-reserve>60</span></div>
          <div class="weapon-name">三八式步枪 <span>6.5mm</span></div>
          <div class="ammo-pips" data-pips><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i></div>
          <div class="reload-hint" data-reload>R 装填 · V 刺刀 · G 手榴弹</div>
        </div>

        <div class="banner" data-banner><h2></h2><p></p><div class="banner-line"></div></div>
        <div class="subtitle" data-subtitle></div>

        <div class="death-screen" data-death>
          <div class="death-inner">
            <div class="death-k">KILLED IN ACTION</div>
            <h2>阵 亡</h2>
            <div class="death-info"><span data-death-by></span></div>
            <div class="death-count"><b data-respawn>5</b> 秒后在最近的据点重生</div>
            <div class="death-tip" data-death-tip></div>
          </div>
        </div>

        <div class="damage-overlay" data-damage></div>
        <div class="hit-flash" data-hitflash></div>
        <div class="capture-toast" data-toast></div>
        <div class="lowhp" data-lowhp></div>
        <div class="lock-hint" data-lock>点击画面 · 锁定鼠标</div>
      </div>`;

    const q = (s) => this.root.querySelector(s);
    this.el = {
      hud: q('#hud'),
      cn: q('[data-cn]'), us: q('[data-us]'),
      cnBar: q('[data-cn-bar]'), usBar: q('[data-us-bar]'),
      flags: q('[data-flags]'),
      compass: q('.compass'),
      minimap: q('.minimap'),
      objective: q('[data-objective]'),
      killfeed: q('[data-killfeed]'),
      crosshair: q('[data-crosshair]'),
      hitmarker: q('[data-hitmarker]'),
      hp: q('[data-hp]'), hpNum: q('[data-hpnum]'),
      stance: q('[data-stance]'), wound: q('[data-wound]'),
      ammo: q('[data-ammo]'), reserve: q('[data-reserve]'), reload: q('[data-reload]'), pips: q('[data-pips]'),
      banner: q('[data-banner]'), bannerTitle: q('[data-banner] h2'), bannerSub: q('[data-banner] p'),
      subtitle: q('[data-subtitle]'),
      death: q('[data-death]'), deathBy: q('[data-death-by]'), respawn: q('[data-respawn]'), deathTip: q('[data-death-tip]'),
      damage: q('[data-damage]'), hitflash: q('[data-hitflash]'),
      toast: q('[data-toast]'), lowhp: q('[data-lowhp]'), lock: q('[data-lock]'),
      mmTitle: q('[data-mm-title]'),
    };
    this.ctx = this.el.compass.getContext('2d');
    this.mmCtx = this.el.minimap.getContext('2d');
    this.el.mmTitle.textContent = this.game.campaign?.location?.split('·').pop()?.trim() || '战场';
    this._buildFlags();
    this.el.hud.style.display = 'none';
  }

  _buildFlags() {
    const pts = this.game.level.capturePoints;
    this.el.flags.innerHTML = pts.map((p) => `
      <div class="flag" data-flag="${p.id}">
        <div class="flag-letter">${p.id}</div>
        <div class="flag-body">
          <div class="flag-name">${p.name}</div>
          <div class="flag-bar"><i></i></div>
        </div>
      </div>`).join('');
    this.flagEls = {};
    for (const p of pts) {
      const el = this.el.flags.querySelector(`[data-flag="${p.id}"]`);
      this.flagEls[p.id] = { root: el, bar: el.querySelector('.flag-bar i') };
    }
  }

  show(v) {
    this.visible = v;
    this.el.hud.style.display = v ? 'block' : 'none';
    if (v) this._buildFlags();
  }

  setObjective(text) { this.el.objective.textContent = text; }

  banner(title, sub = '', dur = 3) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    this.bannerT = dur;
  }

  subtitle(text, dur = 4) {
    this.el.subtitle.textContent = text;
    this.el.subtitle.classList.add('show');
    this.subT = dur;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = 1.8;
  }

  shot() { this.spread = Math.min(1, this.spread + 0.5); }
  footstepPulse() {}

  setReloading(v) {
    this.reloading = v;
    this.el.reload.textContent = v ? '装填中…' : 'R 装填 · V 刺刀 · G 手榴弹';
    this.el.reload.classList.toggle('active', v);
  }

  hitmarker(kill = false) {
    this.el.hitmarker.classList.remove('show', 'kill');
    void this.el.hitmarker.offsetWidth;
    this.el.hitmarker.classList.add('show');
    if (kill) this.el.hitmarker.classList.add('kill');
    this.hitT = 0.16;
    this.game.audio.hitmark();
  }

  damage(attacker) {
    this.damageT = 0.55;
    this.el.damage.classList.add('show');
    if (attacker) {
      const bearing = Math.atan2(attacker.position.x - this.game.player.position.x,
        -(attacker.position.z - this.game.player.position.z));
      const rel = ((bearing + this.game.player.yaw) * 180 / Math.PI + 360) % 360;
      this.el.damage.style.setProperty('--dir', `${rel}deg`);
    }
  }

  killfeed(killer, victim, weapon, headshot = false) {
    const div = document.createElement('div');
    div.className = 'kf';
    const k = killer ? `<b class="t${killer.team}">${killer.name}</b>` : '<b>战场</b>';
    const v = `<b class="t${victim.team}">${victim.name}</b>`;
    div.innerHTML = `<span class="kf-k">${k}</span><span class="kf-w">${weapon}${headshot ? ' ✦' : ''}</span><span class="kf-v">${v}</span>`;
    this.el.killfeed.prepend(div);
    this.killfeedItems.push({ el: div, t: 6 });
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastElementChild.remove();
  }

  update(dt) {
    if (!this.visible) return;
    this.time += dt;
    const g = this.game;
    const p = g.player;
    const m = g.match;
    if (!p || !m) return;

    // Tickets.
    this.el.cn.textContent = Math.ceil(m.tickets[0]);
    this.el.us.textContent = Math.ceil(m.tickets[1]);
    this.el.cnBar.style.width = `${(m.tickets[0] / m.maxTickets) * 100}%`;
    this.el.usBar.style.width = `${(m.tickets[1] / m.maxTickets) * 100}%`;

    // Flags.
    for (const cp of m.points) {
      const el = this.flagEls[cp.id];
      if (!el) continue;
      el.root.className = `flag ${cp.owner === 0 ? 'own-cn' : cp.owner === 1 ? 'own-us' : 'neutral'}${cp.contested ? ' contested' : ''}`;
      const cap = cp.captureT / 100;
      el.bar.style.width = `${cap * 100}%`;
      el.bar.style.background = cp.capturingTeam === 0 ? TEAM_HEX[0] : cp.capturingTeam === 1 ? TEAM_HEX[1] : 'rgba(228,220,200,0.5)';
      el.root.classList.toggle('capturing', cp.captureT > 1 && cp.owner !== cp.capturingTeam);
    }

    // Health.
    const hp = Math.max(0, Math.round(p.health));
    this.el.hp.style.width = `${hp}%`;
    this.el.hp.style.background = hp > 55 ? 'linear-gradient(90deg,#8d9a6a,#c3c994)' : hp > 25 ? 'linear-gradient(90deg,#b08b3a,#d8b45c)' : 'linear-gradient(90deg,#8e2419,#d1483a)';
    this.el.hpNum.textContent = String(hp);
    this.el.lowhp.classList.toggle('show', hp < 30 && p.alive);
    this.el.stance.textContent = p.crouching ? '匍匐' : p.sprinting ? '冲刺' : p.aiming ? '瞄准' : '站立';
    this.el.wound.textContent = p.spawnProtect > 0 ? '刚刚部署' : '';

    // Ammo.
    const w = g.weapon;
    if (w) {
      if (this.lastAmmo !== w.ammo) {
        this.lastAmmo = w.ammo;
        this.el.ammo.textContent = String(w.ammo);
        this.el.ammo.classList.remove('pulse');
        void this.el.ammo.offsetWidth;
        this.el.ammo.classList.add('pulse');
      }
      this.el.reserve.textContent = String(w.reserve);
      this.el.ammo.classList.toggle('low', w.ammo <= 1 && w.ammo > 0);
      this.el.ammo.classList.toggle('empty', w.ammo === 0);
      if (this.lastPips !== w.ammo) {
        this.lastPips = w.ammo;
        const mag = w.def?.magazine ?? 5;
        this.el.pips.innerHTML = Array.from({ length: mag }, (_, i) => `<i class="${i < w.ammo ? 'on' : ''}"></i>`).join('');
      }
    }

    // Crosshair spread.
    this.spread = Math.max(0, this.spread - dt * 3.4);
    const moveSpread = p.grounded ? Math.min(1, Math.hypot(p.velocity.x, p.velocity.z) / 7) : 1.2;
    const gap = 7 + this.spread * 13 + moveSpread * 5 + (p.aiming ? -4 : 0);
    this.el.crosshair.style.setProperty('--gap', `${Math.max(3, gap)}px`);
    this.el.crosshair.classList.toggle('ads', p.aiming);
    this.el.crosshair.style.opacity = p.aiming ? '0.25' : '0.9';

    // Timers.
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.remove('show');
    }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.subtitle.classList.remove('show'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show'); }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.el.hitmarker.classList.remove('show'); }
    if (this.damageT > 0) {
      this.damageT -= dt;
      if (this.damageT <= 0) this.el.damage.classList.remove('show');
    }
    for (let i = this.killfeedItems.length - 1; i >= 0; i--) {
      const k = this.killfeedItems[i];
      k.t -= dt;
      if (k.t < 0.6) k.el.style.opacity = String(Math.max(0, k.t / 0.6));
      if (k.t <= 0) { k.el.remove(); this.killfeedItems.splice(i, 1); }
    }

    // Death screen.
    const dead = !p.alive;
    this.el.death.classList.toggle('show', dead);
    if (dead) {
      this.el.respawn.textContent = String(Math.max(0, Math.ceil(g.respawnT)));
      this.el.deathBy.textContent = g.lastKiller
        ? `被 ${g.lastKiller.name} 击倒 · ${g.lastKiller.team === 1 ? '美军' : '友军'}`
        : '阵亡于战场';
      const tips = [
        '拉大栓需要节奏：射击后等枪机复位，再推下一发。',
        '按住右键使准星贴上照门，百米内几乎无散布。',
        '据点内人数越多，占领越快；双方同时在场则争夺僵持。',
        '冲锋时按 C 降低身形，能减少被命中的概率。',
        '刺刀（V）在堑壕与室内战斗中比子弹更快。',
      ];
      this.el.deathTip.textContent = tips[Math.floor((this.time * 0.25) % tips.length)];
    }

    if (this.el.lock) this.el.lock.classList.toggle('show', !g.input.locked && !g.paused && g.match.state === 'live');

    this._drawCompass();
    this._drawMinimap();
  }

  _drawCompass() {
    const ctx = this.ctx;
    const w = this.el.compass.width, h = this.el.compass.height;
    const p = this.game.player;
    const heading = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    const cx = w / 2;
    const pxPerDeg = w / 120;
    // Background ticks.
    ctx.font = '400 15px "Ma Shan Zheng", "Kaiti SC", serif';
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 5) {
      const bearing = (heading + d + 360) % 360;
      const x = cx + d * pxPerDeg;
      const isCard = Math.abs(bearing % 45) < 2.5;
      const major = Math.abs(bearing % 15) < 2;
      ctx.strokeStyle = isCard ? 'rgba(239,228,201,0.85)' : major ? 'rgba(239,228,201,0.45)' : 'rgba(239,228,201,0.18)';
      ctx.lineWidth = isCard ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x, h - 4);
      ctx.lineTo(x, h - (isCard ? 13 : major ? 9 : 6));
      ctx.stroke();
      if (isCard) {
        const label = bearing < 22.5 || bearing > 337.5 ? '北' : bearing < 67.5 ? '东北' : bearing < 112.5 ? '东' : bearing < 157.5 ? '东南' : bearing < 202.5 ? '南' : bearing < 247.5 ? '西南' : bearing < 292.5 ? '西' : '西北';
        ctx.fillStyle = label === '北' ? '#e2452d' : 'rgba(239,228,201,0.92)';
        ctx.fillText(label, x, h - 16);
      }
    }
    // Objective markers.
    for (const cp of this.game.match.points) {
      const dx = cp.position.x - p.position.x;
      const dz = cp.position.z - p.position.z;
      const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
      let diff = bearing - heading;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      if (Math.abs(diff) > 60) continue;
      const x = cx + diff * pxPerDeg;
      ctx.fillStyle = cp.owner === 0 ? TEAM_HEX[0] : cp.owner === 1 ? TEAM_HEX[1] : '#e4dcc8';
      ctx.beginPath();
      ctx.moveTo(x, 4); ctx.lineTo(x + 6, 12); ctx.lineTo(x - 6, 12); ctx.closePath(); ctx.fill();
      ctx.font = '400 11px "Ma Shan Zheng", "Kaiti SC", serif';
      ctx.fillStyle = '#0c0e0b';
      ctx.fillText(cp.id, x, 11);
    }
    ctx.restore();
  }

  _drawMinimap() {
    const ctx = this.mmCtx;
    const size = this.el.minimap.width;
    const p = this.game.player;
    const b = this.game.level.bounds;
    const pad = 10;
    const sx = (size - pad * 2) / (b.maxX - b.minX);
    const sz = (size - pad * 2) / (b.maxZ - b.minZ);
    const s = Math.min(sx, sz);
    const ox = pad + (size - pad * 2 - (b.maxX - b.minX) * s) / 2;
    const oz = pad + (size - pad * 2 - (b.maxZ - b.minZ) * s) / 2;
    const X = (x) => ox + (x - b.minX) * s;
    const Z = (z) => oz + (z - b.minZ) * s;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(14,9,6,0.76)';
    ctx.fillRect(0, 0, size, size);
    // Grid.
    ctx.strokeStyle = 'rgba(201,161,90,0.13)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const t = pad + (size - pad * 2) * (i / 4);
      ctx.beginPath(); ctx.moveTo(t, pad); ctx.lineTo(t, size - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, t); ctx.lineTo(size - pad, t); ctx.stroke();
    }
    // Map border.
    ctx.strokeStyle = 'rgba(201,161,90,0.35)';
    ctx.strokeRect(ox, oz, (b.maxX - b.minX) * s, (b.maxZ - b.minZ) * s);

    // Capture points.
    for (const cp of this.game.match.points) {
      const x = X(cp.position.x), z = Z(cp.position.z);
      ctx.beginPath();
      ctx.arc(x, z, 9, 0, Math.PI * 2);
      ctx.fillStyle = cp.owner === 0 ? 'rgba(209,72,58,0.28)' : cp.owner === 1 ? 'rgba(91,134,184,0.28)' : 'rgba(228,220,200,0.15)';
      ctx.fill();
      ctx.strokeStyle = cp.owner === 0 ? TEAM_HEX[0] : cp.owner === 1 ? TEAM_HEX[1] : 'rgba(228,220,200,0.6)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#efe4c9';
      ctx.font = '400 14px "Ma Shan Zheng", "Kaiti SC", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cp.id, x, z + 0.5);
    }
    // Combatants.
    const seen = new Set();
    for (const a of this.game.combatants()) {
      if (!a.alive) continue;
      if (a.isPlayer) continue;
      const d = a.position.distanceTo(p.position);
      if (d > 110) continue;
      const x = X(a.position.x), z = Z(a.position.z);
      ctx.beginPath();
      ctx.arc(x, z, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = a.team === 0 ? 'rgba(230,90,70,0.95)' : 'rgba(110,160,220,0.95)';
      ctx.fill();
    }
    // Player arrow.
    const px = X(p.position.x), pz = Z(p.position.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-p.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fillStyle = '#f4ecd6';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fill();
    ctx.restore();
  }
}
