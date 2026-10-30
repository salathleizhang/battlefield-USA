import * as THREE from 'three';
import { Renderer } from '../render/Renderer.js';
import { Effects } from '../render/Effects.js';
import { Physics, G } from '../core/Physics.js';
import { Input } from '../core/Input.js';
import { Audio } from '../core/Audio.js';
import { Materials } from '../world/Materials.js';
import { Props } from '../world/Props.js';
import { Level } from '../world/Level.js';
import { Player } from './Player.js';
import { Weapon } from './weapons/Weapon.js';
import { ViewModel } from './weapons/ViewModel.js';
import { Bot } from './bots/Bot.js';
import { CharacterLibrary } from './bots/CharacterLibrary.js';
import { Match } from './Match.js';
import { HUD } from '../ui/HUD.js';
import { Atmosphere } from '../render/Atmosphere.js';
import { CAMPAIGN_BY_ID } from './campaigns.js';
import { rand, clamp } from '../core/MathUtil.js';

const WEAPON_NAMES = {
  type38: '三八大盖',
  m1: 'M1 加兰德',
  bayonet: '刺刀',
  grenade: '手榴弹',
  explosion: '爆炸',
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.started = false;
    this.paused = true;
    this.time = 0;
    this.stats = { kills: 0, deaths: 0 };
    this.projectiles = [];
    this.grenadeList = [];
    this.grenades = 2;
    this.respawnT = 0;
    this.lastKiller = null;
    this.campaign = null;
    this.bots = [];
    this.player = null;
    this.weapon = null;
    this.match = null;
    this.hud = null;
    this.settings = { sens: 1, volume: 0.7, recoil: 1 };
    this.worldGroup = new THREE.Group();
    this.assignT = 0;
  }

  async init(onProgress) {
    this.renderer = new Renderer(this.canvas);
    this.renderer.scene.add(this.worldGroup);
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.physics = await Physics.create();
    this.materials = new Materials(this.renderer);
    await this.materials.load(onProgress);
    this.characters = new CharacterLibrary(this);
    await this.characters.load(onProgress);
    this.props = new Props();
    await this.props.load((p, label) => onProgress?.(0.9 + p * 0.08, label));
    onProgress?.(1, '准备就绪');
  }

  /* ------------------------------------------------------------- missions */
  startMission(id) {
    const campaign = CAMPAIGN_BY_ID[id];
    if (!campaign) return;
    const q = new URLSearchParams(location.search);
    this.teardown();
    this.campaign = campaign;
    this.stats = { kills: 0, deaths: 0 };
    this.respawnT = 0;
    this.lastKiller = null;
    this.grenades = 2;
    this.projectiles.length = 0;
    this.grenadeList.length = 0;

    this.worldGroup = new THREE.Group();
    this.renderer.scene.add(this.worldGroup);
    this.physics = new Physics();

    this.level = new Level(this, campaign);
    this.level.build();
    this.renderer.setEnvironment(campaign.env);
    this.renderer.setHDRI(this.materials.pbr.hdri(campaign.env.hdri), {
      intensity: campaign.env.envIntensity ?? 0.95,
      rotation: campaign.env.hdriRotation ?? 0,
    });
    this.renderer.fog.density = campaign.env.fogDensity ?? 0.0035;

    this.effects = new Effects(this);
    this.atmosphere = new Atmosphere(this);
    this.player = new Player(this);
    this.player.recoilScale = this.settings.recoil ?? 1;
    const spawn = this.level.playerSpawn || { position: new THREE.Vector3(0, 2, 0), yaw: 0 };
    this.player.spawn(spawn.position, spawn.yaw);

    this.weapon = new Weapon(this, this.player);
    this.viewmodel = new ViewModel(this);
    this.match = new Match(this);
    this.hud = new HUD(this);
    this.hud.show(true);
    this.hud.setObjective(`${campaign.objectives[0]}`);
    this.hud.banner(campaign.name, `${campaign.date} · ${campaign.location}`, 4.2);
    this.hud.subtitle(campaign.briefing.split('。')[0] + '。', 6);

    this.spawnBots();
    this.assignObjectives();
    this.match.start();
    if (q.has('tickets')) {
      const t = Number(q.get('tickets')) || 20;
      this.match.tickets = [t, t];
      this.match.maxTickets = t;
    }

    this.debug = {
      freeze: q.has('freeze'),
      god: q.has('god'),
      aim: q.has('aim'),
      cam: q.has('cam') ? q.get('cam').split(',').map(Number).slice(0, 6) : null,
    };
    if (q.has('look')) {
      const [ly, lp] = q.get('look').split(',').map(Number);
      this.player.yaw = ly || 0;
      this.player.pitch = lp || 0;
    }
    if (q.has('pos')) {
      const [px, pz] = q.get('pos').split(',').map(Number);
      const py = q.has('y') ? Number(q.get('y')) : this.level.groundHeight(px, pz) + 0.2;
      this.player.spawn(new THREE.Vector3(px, py, pz), this.player.yaw);
    }
    if (q.has('nohud')) this.hud.show(false);
    if (q.has('test')) { this.input.locked = true; }
    if (q.has('nowater') && this.level.water) this.level.water.visible = false;
    if (q.has('nobots')) {
      for (const b of this.bots) { b.dispose(); }
      this.bots.length = 0;
    }
    if (q.has('debug')) {
      const d = document.createElement('div');
      d.id = 'debug-overlay';
      d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;color:#0f0;background:rgba(0,0,0,.75);font:11px monospace;padding:6px;white-space:pre;pointer-events:none';
      document.body.appendChild(d);
      this.debugEl = d;
      this._debugHandler = (e) => {
        const d = e.detail || {};
        if (d.cmd === 'fire' && this.weapon?.canFire) this.weapon.fire();
        if (d.cmd === 'reload') this.weapon?.startReload();
        if (d.cmd === 'look' && this.player) {
          this.player.yaw = d.yaw ?? this.player.yaw;
          this.player.pitch = d.pitch ?? this.player.pitch;
        }
        if (d.cmd === 'teleport' && this.player) {
          const y = this.level.groundHeight(d.x, d.z) + 0.2;
          this.player.spawn(new THREE.Vector3(d.x, y, d.z), d.yaw ?? this.player.yaw);
        }
        if (d.cmd === 'weaken') {
          for (const b of this.bots) if (b.team === 1) b.damage(95, this.player, { weapon: 'type38' });
        }
      };
      addEventListener('bf:debug', this._debugHandler);
    }
    if (q.has('nofx')) {
      for (const f of this.level.fires) { f.sprite.visible = false; f.light.visible = false; }
      for (const s of this.level.smokes) s.sprite.visible = false;
    }

    this.started = true;
    this.paused = false;
    this.matchEnded = false;
    this.time = 0;
    this.audio.ensure();
    this.audio.setVolume(this.settings.volume);
    this.input.lock();
    this.canvas.focus?.();
    this.onMissionStart?.(campaign);
  }

  spawnBots() {
    const cfg = { 0: 12, 1: 14 };
    for (const team of [0, 1]) {
      const spawns = this.level.spawns[team];
      if (!spawns.length) continue;
      const n = cfg[team];
      for (let i = 0; i < n; i++) {
        const s = spawns[i % spawns.length];
        const offX = ((i % 5) - 2) * 1.9;
        const offZ = Math.floor(i / 5) * 2.1;
        const pos = s.position.clone().add(new THREE.Vector3(offX, 0, offZ));
        const bot = new Bot(this, team, pos, s.yaw, null, i);
        this.bots.push(bot);
      }
    }
  }

  assignObjectives() {
    if (!this.match) return;
    const pts = this.level.capturePoints;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const enemies = pts.filter((p) => p.owner !== bot.team);
      const pool = enemies.length ? enemies : pts;
      // Spread bots across the front line.
      const idx = (this.bots.indexOf(bot) + Math.floor(this.time / 20)) % pool.length;
      bot.setObjective(pool[idx]);
    }
  }

  combatants() { return this.player ? [this.player, ...this.bots] : this.bots; }

  /* ------------------------------------------------------------- gunplay */
  spawnProjectile({ origin, dir, speed, damage, owner, team, kind, headshot = 2.2 }) {
    this.projectiles.push({
      pos: origin.clone(), dir: dir.clone().normalize(), speed, damage,
      owner, team, kind, headshot, life: 2.4, whizzed: false,
    });
    this.effects.tracer(origin, origin.clone().addScaledVector(dir, 16), team === 0 ? 0xffd28a : 0xffb070);
    if (Math.random() < 0.7) this.effects.casing(
      origin.clone().add(new THREE.Vector3(0.15, -0.1, 0)),
      new THREE.Vector3(rand(0.5, 1.5), rand(0.8, 1.6), rand(-0.4, 0.4)),
    );
  }

  updateProjectiles(dt) {
    const mask = G.WORLD | G.PLAYER | G.BOT;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const step = p.speed * dt;
      const hit = this.physics.raycast(p.pos, p.dir, step, mask, p.owner?.collider);
      let dead = false;
      if (hit) {
        const actor = hit.data?.actor;
        if (actor && actor.alive && actor.team !== p.team) {
          const headY = actor.position.y + (actor.isPlayer ? actor.eyeHeight - 0.06 : 1.62);
          const head = hit.point.y > headY;
          const falloff = hit.distance > 80 ? 0.78 : 1;
          this.damageActor(actor, p.damage * falloff * (head ? p.headshot : 1), p.owner, {
            weapon: p.kind, headshot: head, point: hit.point,
          });
          this.effects.blood(hit.point, p.dir);
        } else if (actor) {
          // Friendly: bullet is absorbed.
          this.effects.impact(hit.point, hit.normal, 'flesh');
        } else {
          this.effects.impact(hit.point, hit.normal, hit.data?.surface || 'dirt');
        }
        dead = true;
      } else {
        p.pos.addScaledVector(p.dir, step);
        p.life -= dt;
        if (p.life <= 0) dead = true;
      }
      // Near-miss whizz for enemy fire.
      if (!p.whizzed && p.team === 1 && this.player?.alive) {
        const eye = this.player.eye;
        if (eye.distanceTo(p.pos) < 3.2) {
          p.whizzed = true;
          this.audio.whiz(rand(-0.6, 0.6));
          this.player.addTrauma(0.12);
        }
      }
      if (dead) this.projectiles.splice(i, 1);
    }
  }

  damageActor(actor, amount, attacker, info = {}) {
    if (!actor || !actor.alive) return;
    const wasAlive = actor.alive;
    actor.damage(amount, attacker, info);
    if (attacker === this.player && actor.alive && wasAlive) this.hud?.hitmarker(false);
    if (actor.isPlayer) {
      this.hud?.el?.hitflash?.classList.add('show');
      setTimeout(() => this.hud?.el?.hitflash?.classList.remove('show'), 250);
    }
  }

  onActorKilled(victim, killer, info = {}) {
    if (this.match) this.match.onKill(victim, killer);
    const wname = WEAPON_NAMES[info.weapon] || '战斗';
    if (this.hud) {
      this.hud.killfeed(killer, victim, wname, info.headshot);
      if (killer === this.player) this.hud.hitmarker(true);
    }
    if (killer === this.player) this.stats.kills++;
    if (victim === this.player) return;
    victim.respawnT = rand(7, 11);
    victim.deadAt = this.time;
    if (this.match?.state === 'live') this.assignObjectives();
  }

  onPlayerKilled(attacker, weapon) {
    this.lastKiller = attacker;
    this.stats.deaths++;
    this.respawnT = 5;
    this.viewmodel?.setEnabled(false);
    if (this.hud) this.hud.killfeed(attacker, this.player, WEAPON_NAMES[weapon] || '战斗');
    if (this.match) this.match.onKill(this.player, attacker);
    this.audio.hurt();
  }

  respawnPlayer() {
    const spawn = this.match ? this.match.getSpawn(0) : this.level.playerSpawn;
    this.player.spawn(spawn.position, spawn.yaw);
    this.hud?.banner('重新部署', this.hud.game.campaign.name, 1.8);
    this.weapon.ammo = this.weapon.def.magazine;
    this.weapon.reserve = this.weapon.def.reserve;
    this.weapon.reloading = false;
    this.weapon.cycleT = 0;
    this.weapon.reloadT = 0;
    this.hud?.setReloading(false);
    this.viewmodel?.setEnabled(true);
    this.grenades = Math.max(this.grenades, 2);
  }

  throwGrenade(owner) {
    if (this.grenades <= 0) {
      this.hud?.toast('手榴弹已用尽');
      return;
    }
    this.grenades--;
    const cam = this.renderer.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const pos = owner.eye.clone().addScaledVector(dir, 0.5);
    const vel = dir.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.4, 0)).add(
      new THREE.Vector3(owner.velocity.x * 0.4, 0, owner.velocity.z * 0.4),
    );
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x3b3f37, roughness: 0.6, metalness: 0.3 }),
    );
    mesh.position.copy(pos);
    this.worldGroup.add(mesh);
    this.grenadeList.push({ pos, vel, mesh, t: 2.6, owner });
    this.hud?.toast(`手榴弹 · 剩余 ${this.grenades}`);
    this.audio.impact('metal', 0, 0);
  }

  updateGrenades(dt) {
    for (let i = this.grenadeList.length - 1; i >= 0; i--) {
      const g = this.grenadeList[i];
      g.t -= dt;
      g.vel.y -= 20 * dt;
      const step = g.vel.clone().multiplyScalar(dt);
      const hit = this.physics.raycast(g.pos, step.clone().normalize(), step.length(),
        G.WORLD | G.PLAYER | G.BOT, g.owner?.collider);
      if (hit) {
        g.pos.copy(hit.point).addScaledVector(hit.normal, 0.08);
        const n = hit.normal;
        const vn = g.vel.dot(n);
        g.vel.addScaledVector(n, -1.5 * vn).multiplyScalar(0.55);
        if (Math.abs(vn) < 1) g.vel.multiplyScalar(0.7);
        this.audio.impact(hit.data?.surface || 'dirt', 0, 0);
      } else {
        g.pos.add(step);
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 8;
      if (g.t <= 0) {
        this.explode(g.pos.clone(), g.owner);
        this.worldGroup.remove(g.mesh);
        g.mesh.geometry.dispose();
        g.mesh.material.dispose();
        this.grenadeList.splice(i, 1);
      }
    }
  }

  explode(pos, owner) {
    this.effects.explosion(pos, 1.15);
    const radius = 9;
    for (const a of this.combatants()) {
      if (!a.alive) continue;
      const d = a.position.distanceTo(pos);
      if (d > radius) continue;
      const dmg = 120 * (1 - d / radius) ** 1.4;
      const src = a.isPlayer ? { x: a.position.x, y: a.position.y + 1.2, z: a.position.z } : a.eye;
      if (!this.physics.lineOfSight(pos, new THREE.Vector3(src.x, src.y, src.z))) continue;
      this.damageActor(a, dmg, owner, { weapon: 'grenade' });
    }
  }

  /* ---------------------------------------------------------------- loop */
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.audio.update(dt);
    if (this.renderer) {
      this.renderer.update(dt, this.player?.position || new THREE.Vector3());
      if (this.debug?.cam) {
        const c = this.debug.cam;
        this.renderer.camera.position.set(c[0], c[1], c[2]);
        this.renderer.camera.lookAt(c[3], c[4], c[5]);
        this.viewmodel?.setEnabled(false);
      }
      this.renderer.render(dt);
    }
    if (!this.started || this.paused || !this.player) return;
    if (this.match?.state === 'ended') return;

    this.physics.step(dt);
    const cmd = this.input.cmd();
    if (this.debug?.aim) cmd.aim = true;
    const look = this.input.takeMouseDelta();

    if (this.player.alive) {
      this.player.look(look.x, look.y, this.settings.sens);
      this.player.update(dt, cmd, this.weapon);
      this.weapon.update(dt, cmd);
      this.viewmodel.update(dt, this.player, this.weapon, look);
      if (this.player.sprinting) this.viewmodel.setEnabled(true);
    } else {
      this.player.update(dt, cmd, this.weapon);
      this.player.syncCamera(dt);
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawnPlayer();
    }

    const frozen = this.debug?.freeze;
    for (const bot of this.bots) {
      if (frozen) break;
      if (!bot.alive) {
        bot.model.update(dt, 0, false, false);
        if (bot.respawnT > 0) {
          bot.respawnT -= dt;
          if (bot.respawnT <= 0 && this.match?.state === 'live') {
            const s = this.match.getSpawn(bot.team);
            bot.respawn(s.position, s.yaw);
            bot.setObjective(this.level.capturePoints[(Math.random() * this.level.capturePoints.length) | 0]);
          }
        }
        continue;
      }
      bot.update(dt);
    }

    this.updateProjectiles(dt);
    this.updateGrenades(dt);
    this.level.update(dt, this.time);
    this.atmosphere.update(dt);
    this.effects.update(dt);
    if (!frozen) {
      this.match.update(dt);
      this.assignT -= dt;
      if (this.assignT <= 0) { this.assignT = 8; this.assignObjectives(); }
    }
    this.hud.update(dt);

    if (this.debugEl) {
      const p = this.player;
      const gh = this.level.groundHeight(p.position.x, p.position.z);
      const ray = this.physics.raycast({ x: p.position.x, y: p.position.y + 2, z: p.position.z }, { x: 0, y: -1, z: 0 }, 8, G.WORLD);
      this.debugEl.textContent = [
        `pos ${p.position.x.toFixed(1)} ${p.position.y.toFixed(2)} ${p.position.z.toFixed(1)}`,
        `ground ${gh.toFixed(2)} ray ${ray ? ray.point.y.toFixed(2) : 'MISS'} grounded ${p.grounded}`,
        `alive ${p.alive} hp ${p.health.toFixed(0)} bots ${this.bots.length}`,
        `ammo ${this.weapon?.ammo}/${this.weapon?.reserve} cycle ${this.weapon?.cycleT.toFixed(2)} reload ${this.weapon?.reloading}`,
        `colliders ${this.physics.world.colliders.len()} bodies ${this.physics.world.bodies.len()}`,
        `terrain ${this.level.terrainMesh ? this.level.terrainMesh.visible : 'none'}`,
        `points ${this.level.capturePoints.map((c) => c.id + ':' + (c.owner === -1 ? 'N' : c.owner) + ':' + c.captureT.toFixed(0)).join(' ')}`,
        this.viewmodel ? `gun ads ${this.viewmodel.ads.toFixed(2)} rot ${this.viewmodel.gun.rotation.x.toFixed(2)} ${this.viewmodel.gun.rotation.y.toFixed(2)} ${this.viewmodel.gun.rotation.z.toFixed(2)} pos ${this.viewmodel.gun.position.x.toFixed(2)} ${this.viewmodel.gun.position.y.toFixed(2)} ${this.viewmodel.gun.position.z.toFixed(2)}` : '',
      ].join('\n');
    }
    this.audio.setVolume(this.settings.volume);
    this.input.endFrame();
  }

  onMatchEnd(winner) {
    this.matchEnded = true;
    this.paused = true;
    this.input.unlock();
    this.hud?.show(false);
    if (this.debugEl) this.debugEl.style.display = 'none';
    this.onEnd?.(winner);
    this.menu?.showEnd(winner);
  }

  exitToMenu() {
    this.teardown();
    this.started = false;
    this.paused = true;
    this.campaign = null;
    this.hud = null;
  }

  teardown() {
    if (this._debugHandler) { removeEventListener('bf:debug', this._debugHandler); this._debugHandler = null; }
    if (this.debugEl) { this.debugEl.remove(); this.debugEl = null; }
    this.input?.unlock();
    for (const b of this.bots) b.dispose?.();
    this.bots = [];
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
    if (this.viewmodel) {
      this.viewmodel.rig.removeFromParent();
      this.viewmodel = null;
    }
    if (this.atmosphere) { this.atmosphere.dispose(); this.atmosphere = null; }
    if (this.effects) { this.effects.clear(); this.effects = null; }
    if (this.hud) {
      this.hud.el.hud.remove();
      this.hud = null;
    }
    if (this.worldGroup) {
      this.worldGroup.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
      this.renderer.scene.remove(this.worldGroup);
      this.worldGroup = new THREE.Group();
    }
    this.projectiles.length = 0;
    for (const g of this.grenadeList) {
      this.worldGroup?.remove(g.mesh);
    }
    this.grenadeList.length = 0;
    this.weapon = null;
    this.match = null;
    this.level = null;
    this.started = false;
  }
}
