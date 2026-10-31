import * as THREE from 'three';
import { clamp, lerp } from '../core/MathUtil.js';

const TEAM_HEX = ['#e2321c', '#5f9ad2'];
const TEAM_CN = ['中国远征军', '美军'];

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.visible = false;
    this.bannerT = 0;
    this.hitT = 0;
    this.damageT = 0;
    this.damagePeak = 0;
    this._fwd = new THREE.Vector3();
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
        <canvas class="dmg-canvas" data-dmg-canvas></canvas>
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
      weaponName: q('.weapon-name'),
      banner: q('[data-banner]'), bannerTitle: q('[data-banner] h2'), bannerSub: q('[data-banner] p'),
      subtitle: q('[data-subtitle]'),
      death: q('[data-death]'), deathBy: q('[data-death-by]'), respawn: q('[data-respawn]'), deathTip: q('[data-death-tip]'),
      damage: q('[data-damage]'), hitflash: q('[data-hitflash]'),
      toast: q('[data-toast]'), lowhp: q('[data-lowhp]'), lock: q('[data-lock]'),
      mmTitle: q('[data-mm-title]'),
    };
    this.dmgMarks = Array.from({ length: 6 }, () => ({ t: 0, life: 1, deg: 0, power: 1 }));
    this.dmgCtx = q('[data-dmg-canvas]').getContext('2d');
    this._dmgActive = false;
    this._resizeDmg();
    addEventListener('resize', () => this._resizeDmg());
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
    else {
      for (const m of this.dmgMarks) m.t = 0;
      this.dmgCtx.clearRect(0, 0, this.dmgW, this.dmgH);
      this._dmgActive = false;
    }
  }

  setObjective(text) { this.el.objective.textContent = text; }

  /** Weapon slot changed: swap the name and force the ammo widget to rebuild. */
  setWeapon(def) {
    if (!def || this.weaponId === def.id) return;
    this.weaponId = def.id;
    if (this.el.weaponName) {
      this.el.weaponName.innerHTML = `${def.name} <span>${def.caliber || ''}</span>`;
    }
    this.lastAmmo = -1;
    this.lastPips = -1;
  }

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
    this.game.audio.hitmark(kill);
  }

  /**
   * A hit from a known point draws a red bearing arc on the side it came from.
   * `amount` only sets how loud the feedback is; the direction has to be exact,
   * so it is projected onto the camera's own forward/right vectors instead of
   * `player.yaw`, which ignores lean, recoil and camera shake.
   */
  damage(attacker, info = {}, amount = 0) {
    const power = clamp(amount / 55, 0.25, 1);
    this.damageT = 0.42 + power * 0.28;
    this.damagePeak = 0.55 + power * 0.4;
    this.el.damage.style.opacity = this.damagePeak.toFixed(3);
    this.el.hitflash.classList.remove('show');
    void this.el.hitflash.offsetWidth;
    this.el.hitflash.classList.add('show');

    const src = info.from || attacker?.position;
    if (!src) return;
    const p = this.game.player;
    const dx = src.x - p.position.x;
    const dz = src.z - p.position.z;
    if (dx * dx + dz * dz < 0.36) return;

    const cam = this.game.renderer.camera;
    cam.getWorldDirection(this._fwd);
    const len = Math.hypot(this._fwd.x, this._fwd.z) || 1;
    const fx = this._fwd.x / len, fz = this._fwd.z / len;
    const rx = -fz, rz = fx;                 // camera right, flattened to the ground
    const f = dx * fx + dz * fz;
    const r = dx * rx + dz * rz;
    let deg = Math.atan2(r, f) * 180 / Math.PI;
    if (deg < 0) deg += 360;

    let slot = this.dmgMarks.find((a) => a.t <= 0);
    if (!slot) slot = this.dmgMarks.reduce((a, b) => (a.t < b.t ? a : b));
    slot.deg = deg;
    slot.life = 0.95 + power * 0.55;
    slot.t = slot.life;
    slot.power = 0.72 + power * 0.28;
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
      if (this.lastPips !== w.ammo || this.lastPipsMag !== (w.def?.magazine ?? 5)) {
        this.lastPips = w.ammo;
        const mag = w.def?.magazine ?? 5;
        this.lastPipsMag = mag;
        // Large magazines would overflow the panel: at most ten pips, each worth mag/10.
        const count = Math.min(10, mag);
        const per = mag / count;
        this.el.pips.innerHTML = Array.from({ length: count }, (_, i) => `<i class="${i < Math.round(w.ammo / per) ? 'on' : ''}"></i>`).join('');
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
      this.damageT = Math.max(0, this.damageT - dt);
      const k = Math.min(1, this.damageT / 0.18);
      this.el.damage.style.opacity = (this.damagePeak * k).toFixed(3);
    }
    for (const m of this.dmgMarks) if (m.t > 0) m.t = Math.max(0, m.t - dt);
    this._drawDamage();
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

  _resizeDmg() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.dmgW = innerWidth;
    this.dmgH = innerHeight;
    const c = this.dmgCtx.canvas;
    c.width = Math.round(this.dmgW * dpr);
    c.height = Math.round(this.dmgH * dpr);
    this.dmgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Draw every live bearing arc. Canvas rather than a masked conic-gradient:
   * Chrome drops the mask on a conic gradient here, leaving a full wedge, and
   * the canvas also lets the core glow fade outward instead of sitting as a
   * flat ring.
   */
  _drawDamage() {
    const ctx = this.dmgCtx;
    if (!ctx) return;
    const w = this.dmgW, h = this.dmgH;
    const live = this.dmgMarks.some((m) => m.t > 0);
    if (!live) {
      if (this._dmgActive) {
        ctx.clearRect(0, 0, w, h);
        this._dmgActive = false;
      }
      return;
    }
    this._dmgActive = true;
    ctx.clearRect(0, 0, w, h);
    const cx = w * 0.5, cy = h * 0.5;
    const r0 = Math.min(w, h) * 0.34;
    const DEG = Math.PI / 180;
    for (const m of this.dmgMarks) {
      if (m.t <= 0) continue;
      const age = m.life - m.t;
      const k = Math.min(1, age / 0.05) * Math.min(1, m.t / 0.5) * m.power;
      if (k <= 0) continue;
      const R = r0 * (0.97 + (1 - m.t / m.life) * 0.06);
      const mid = -Math.PI / 2 + m.deg * DEG;
      const a0 = mid - 13 * DEG, a1 = mid + 13 * DEG;

      // Soft wedge of light reaching in from the source.
      const g = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.3);
      g.addColorStop(0, 'rgba(255, 58, 26, 0)');
      g.addColorStop(0.55, `rgba(255, 58, 26, ${(0.06 * k).toFixed(3)})`);
      g.addColorStop(0.86, `rgba(255, 74, 34, ${(0.2 * k).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 42, 18, 0)');
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R * 1.3, a0, a1);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();

      ctx.save();
      ctx.lineCap = 'round';
      const bands = [
        [R * 0.13, `rgba(255, 46, 18, ${(0.24 * k).toFixed(3)})`, 18],
        [R * 0.052, `rgba(255, 78, 36, ${(0.9 * k).toFixed(3)})`, 12],
        [R * 0.016, `rgba(255, 232, 190, ${(0.98 * k).toFixed(3)})`, 7],
      ];
      for (const [width, color, blur] of bands) {
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0, a1);
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.shadowColor = 'rgba(255, 60, 20, 0.9)';
        ctx.shadowBlur = blur;
        ctx.stroke();
      }
      // A one-pixel bearing needle through the middle of the arc.
      const nx = Math.cos(mid), ny = Math.sin(mid);
      ctx.beginPath();
      ctx.moveTo(cx + nx * (R - R * 0.06), cy + ny * (R - R * 0.06));
      ctx.lineTo(cx + nx * (R + R * 0.05), cy + ny * (R + R * 0.05));
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(255, 245, 226, ${(0.85 * k).toFixed(3)})`;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();
    }
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
      ctx.strokeStyle = isCard ? 'rgba(255,236,196,0.9)' : major ? 'rgba(255,222,160,0.5)' : 'rgba(255,214,150,0.2)';
      ctx.lineWidth = isCard ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x, h - 4);
      ctx.lineTo(x, h - (isCard ? 13 : major ? 9 : 6));
      ctx.stroke();
      if (isCard) {
        const label = bearing < 22.5 || bearing > 337.5 ? '北' : bearing < 67.5 ? '东北' : bearing < 112.5 ? '东' : bearing < 157.5 ? '东南' : bearing < 202.5 ? '南' : bearing < 247.5 ? '西南' : bearing < 292.5 ? '西' : '西北';
        ctx.fillStyle = label === '北' ? '#ff3a1f' : 'rgba(255,236,196,0.92)';
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
      ctx.fillStyle = '#1a0704';
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
    ctx.fillStyle = 'rgba(24,8,4,0.78)';
    ctx.fillRect(0, 0, size, size);
    // Grid.
    ctx.strokeStyle = 'rgba(255,193,46,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const t = pad + (size - pad * 2) * (i / 4);
      ctx.beginPath(); ctx.moveTo(t, pad); ctx.lineTo(t, size - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, t); ctx.lineTo(size - pad, t); ctx.stroke();
    }
    // Map border.
    ctx.strokeStyle = 'rgba(255,193,46,0.4)';
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
