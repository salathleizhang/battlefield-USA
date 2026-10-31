import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Renderer } from '../render/Renderer.js';
import { Effects } from '../render/Effects.js';
import { Physics, G } from '../core/Physics.js';
import { Input } from '../core/Input.js';
import { Audio } from '../core/Audio.js';
import { Materials } from '../world/Materials.js';
import { Props } from '../world/Props.js';
import { Level } from '../world/Level.js';
import { Player } from './Player.js';
import { PlayerBody } from './PlayerBody.js';
import { Weapon } from './weapons/Weapon.js';
import { DEFAULT_LOADOUT, WEAPONS, weaponDef } from './weapons/WeaponDefs.js';
import { ViewModel } from './weapons/ViewModel.js';
import { loadRifle } from './weapons/RifleModel.js';
import { Bot } from './bots/Bot.js';
import { CharacterLibrary } from './bots/CharacterLibrary.js';
import { IronlineLibrary } from './bots/IronlineLibrary.js';
import { Match } from './Match.js';
import { NavGrid } from './bots/NavGrid.js';
import { HUD } from '../ui/HUD.js';
import { Atmosphere } from '../render/Atmosphere.js';
import { Ambience } from '../render/Ambience.js';
import { Weather } from '../render/Weather.js';
import { CAMPAIGN_BY_ID } from './campaigns.js';
import { DestructibleWorld } from '../world/Destruction.js';
import { Vehicles } from '../vehicles/Vehicles.js';
import { rand, clamp } from '../core/MathUtil.js';

const WEAPON_NAMES = {
  type38: '三八大盖',
  m4: 'M4A1',
  ak: 'AK-47',
  mp5: 'MP5A5',
  p226: 'P226',
  m1911: 'M1911A1',
  m1: 'M1 加兰德',
  bayonet: '刺刀',
  grenade: '手榴弹',
  explosion: '爆炸',
  cannon: '坦克炮',
  mg: '车载机枪',
  tank_crush: '履带',
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
    this.weapons = null;
    this.match = null;
    this.hud = null;
    this.settings = { sens: 1, volume: 0.7, recoil: 1 };
    this.worldGroup = new THREE.Group();
    this.assignT = 0;
    this.miamiCar = null;
    this._voiceIntro = null;
    this._voiceCd = 0;
    this._wasSprinting = false;
    this.playerVehicle = null;
    this.frameCmd = null;
    this.destructibles = null;
    this.vehicles = null;
  }

  async init(onProgress) {
    this.renderer = new Renderer(this.canvas);
    this.renderer.scene.add(this.worldGroup);
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.physics = await Physics.create();
    this.materials = new Materials(this.renderer);
    await this.materials.load(onProgress);
    this.characters = await this._loadCharacters(onProgress);
    this.props = new Props();
    await this.props.load((p, label) => onProgress?.(0.9 + p * 0.08, label));
    await this._loadMiamiCar();
    await this._loadVehicleAssets();
    await this._loadRifle();
    onProgress?.(1, '准备就绪');
  }

  /**
   * Bots wear the Ironline Bamen soldier by default: one Mixamo rig, fifty clips, sockets.
   * `?chars=legacy` keeps the previous Quaternius soldiers; a hard load failure falls back to
   * them on its own so a bad asset never leaves the battlefield empty.
   */
  async _loadCharacters(onProgress) {
    const legacy = new URLSearchParams(location.search).get('chars') === 'legacy';
    if (!legacy) {
      const ironline = new IronlineLibrary(this);
      if (await ironline.load(onProgress)) return ironline;
      console.warn('Ironline soldier unavailable, falling back to the Quaternius set');
    }
    const lib = new CharacterLibrary(this);
    await lib.load(onProgress);
    return lib;
  }

  /**
   * First-person weapons: a Poly Haven CC0 bolt-action rifle plus a CC0 stick grenade.
   * The rifle is handed to Type38 as the raw authored scene, which owns metric
   * normalisation, the sight-line origin and the bolt re-parenting.
   */
  async _loadRifle() {
    try {
      this.weaponTemplate = await loadRifle();
    } catch (e) {
      console.warn('[weapon] rifle asset unavailable', e?.message || e);
      this.weaponTemplate = null;
    }
    try {
      const gltf = await new GLTFLoader().loadAsync('/assets/models/weapons/stick_grenade/model.gltf');
      this.grenadeTemplate = gltf.scene;
      this.grenadeTemplate.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) o.material.envMapIntensity = 0.9;
      });
    } catch (e) {
      console.warn('[weapon] stick grenade unavailable', e?.message || e);
      this.grenadeTemplate = null;
    }
  }

  /** Ocean Drive's hero convertible, ported from StarKnightt/ocean-drive (MIT). */
  async _loadMiamiCar() {
    try {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync('/assets/models/miami/convertible.glb');
      const root = gltf.scene;
      root.getObjectByName('convertible_L1')?.removeFromParent();
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material?.envMapIntensity !== undefined) o.material.envMapIntensity = 0.85;
      });
      this.miamiCar = root;
    } catch (e) {
      console.warn('[miami] convertible asset unavailable', e?.message || e);
    }
  }

  /* ------------------------------------------------------------- missions */
  startMission(id) {
    const campaign = CAMPAIGN_BY_ID[id];
    if (!campaign) return;
    const q = new URLSearchParams(location.search);
    this.teardown();
    this.campaign = campaign;
    // ?difficulty=recruit|regular|hardened|veteran (bots fall back to regular on anything else).
    this.difficulty = (q.get('difficulty') || 'regular').toLowerCase();
    this.stats = { kills: 0, deaths: 0 };
    this.respawnT = 0;
    this.lastKiller = null;
    this.grenades = 2;
    this.projectiles.length = 0;
    this.grenadeList.length = 0;

    this.worldGroup = new THREE.Group();
    this.renderer.scene.add(this.worldGroup);
    this.physics = new Physics();
    this.playerVehicle = null;

    // Destruction and vehicle registries must exist before the map builds: the
    // map queues tank spawns and places destructible cover as it goes.
    this.destructibles = new DestructibleWorld(this);
    this.vehicles = new Vehicles(this);

    this.level = new Level(this, campaign);
    this.level.build();
    // Every world material goes through the shared weathering / wetness / puddle pass.
    this.level.applyUnify();
    // Walkable grid for bot pathfinding, baked from the level colliders just built.
    try {
      this.nav = new NavGrid(this.level, this.physics).build();
    } catch (e) {
      console.warn('[nav] grid build failed; bots fall back to steering', e);
      this.nav = null;
    }
    this.renderer.setEnvironment(campaign.env);
    this.renderer.setHDRI(this.materials.pbr.hdri(campaign.env.hdri), {
      intensity: campaign.env.envIntensity ?? 0.95,
      rotation: campaign.env.hdriRotation ?? 0,
    });
    this.renderer.fog.density = campaign.env.fogDensity ?? 0.0035;
    this.renderer.applySettings(this.settings);
    // Weather owns the fog banks/sea layer and the density tide; campaigns
    // without an `env.weather` simply get nothing back from it.
    this.weather = new Weather(this, campaign.env);

    this.effects = new Effects(this);
    this.atmosphere = new Atmosphere(this);
    this.ambience = new Ambience(this);
    this.player = new Player(this);
    // First-person body + its (unclipped) shadow, driven by the same rig as the bots.
    this.playerBody = new PlayerBody(this);
    this.player.recoilScale = this.settings.recoil ?? 1;
    const spawn = this.level.playerSpawn || { position: new THREE.Vector3(0, 2, 0), yaw: 0 };
    this.player.spawn(spawn.position, spawn.yaw);
    // Tanks spawn after the level and the player exist: the AI needs targets and
    // the props/structures are already registered.
    this.vehicles.spawnAll();

    // ?loadout=m4,p226 — comma-separated ids; unknown ids fall back to the default kit.
    const pick = (q.get('loadout') || '').split(',').map((v) => v.trim()).filter((id) => WEAPONS[id]);
    const loadout = pick.length ? pick : DEFAULT_LOADOUT;
    this.weapons = loadout.map((id) => new Weapon(this, this.player, weaponDef(id)));
    this.weaponIndex = 0;
    this.weapon = this.weapons[0];
    this.viewmodel = new ViewModel(this, this.weapons.map((w) => w.def));
    this.viewmodel.setWeapon(this.weapon.def);
    this.match = new Match(this);
    this.hud = new HUD(this);
    this.hud.setWeapon?.(this.weapon.def);
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
    if (q.has('notanks')) {
      this.vehicles?.dispose();
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
    if (q.has('nofx')) this.ambience?.setEnabled(false);

    this.started = true;
    this.paused = false;
    this.matchEnded = false;
    this.time = 0;
    this.audio.ensure();
    this.audio.setVolume(this.settings.volume);
    this._voiceIntro = { stage: 0, t: 0 };
    this._voiceCd = 5;
    this._wasSprinting = false;
    this.input.lock();
    this.canvas.focus?.();
    this.onMissionStart?.(campaign);
  }

  /** Switch weapon slots (1/2 or mouse wheel). Cancels a reload and costs a short draw time. */
  switchWeapon(i) {
    if (!this.weapons || this.weapons.length < 2) return;
    const n = this.weapons.length;
    const idx = ((i % n) + n) % n;
    if (idx === this.weaponIndex) return;
    this.weapon?.cancelReload();
    this.weaponIndex = idx;
    this.weapon = this.weapons[idx];
    this.weapon.equipT = 0.42;
    this.weapon.adsT = 0;
    this.viewmodel?.setWeapon(this.weapon.def);
    this.hud?.setWeapon?.(this.weapon.def);
    this.audio?.ui?.('click');
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

  /** Gunfire is loud: nearby enemies turn toward the shot even when they can't see it. */
  alertBots(pos, radius = 70) {
    for (const bot of this.bots) {
      if (!bot.alive || bot.team === 0) continue;
      if (bot.position.distanceTo(pos) > radius) continue;
      bot.hear?.(this.player, pos);
    }
  }

  /* ------------------------------------------------------------- gunplay */
  spawnProjectile({ origin, dir, speed, damage, owner, team, kind, headshot = 2.2 }) {
    this.projectiles.push({
      pos: origin.clone(),
      vel: dir.clone().normalize().multiplyScalar(speed),
      damage, owner, team, kind, headshot,
      life: 2.4, whizzed: false, travelled: 0,
    });
    this.effects.tracer(origin, origin.clone().addScaledVector(dir, 16), team === 0 ? 0xffd28a : 0xffb070);
    if (Math.random() < 0.7) this.effects.casing(
      origin.clone().add(new THREE.Vector3(0.15, -0.1, 0)),
      new THREE.Vector3(rand(0.5, 1.5), rand(0.8, 1.6), rand(-0.4, 0.4)),
    );
  }

  /** Tank main gun: a heavy, visible projectile with penetration and blast. */
  spawnShell({ origin, dir, speed, pen, damage, blast, caliber, owner, team }) {
    this.projectiles.push({
      pos: origin.clone(),
      vel: dir.clone().normalize().multiplyScalar(speed),
      damage, pen, blast, caliber, owner, team,
      kind: 'cannon', shell: true, headshot: 1.4,
      life: 6.5, whizzed: true, travelled: 0, trailT: 0,
    });
    this.effects.tracer(origin, origin.clone().addScaledVector(dir, 30), 0xffe3b0);
  }

  updateProjectiles(dt) {
    const mask = G.WORLD | G.PLAYER | G.BOT | G.VEHICLE;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      // Gravity acts on the bullet: drop grows with time of flight.
      p.vel.y -= 9.81 * dt;
      const stepVec = p.vel.clone().multiplyScalar(dt);
      const stepLen = stepVec.length();
      const dir = stepVec.divideScalar(Math.max(stepLen, 1e-6));
      const from = p.pos.clone();
      const hit = this.physics.raycast(p.pos, dir, stepLen, mask, p.owner?.collider);
      let dead = false;
      if (hit) {
        const vehicle = hit.data?.vehicle;
        const actor = hit.data?.actor;
        if (vehicle && vehicle.alive) {
          // Armour resolution lives on the tank: it knows its own plates.
          const report = p.shell
            ? vehicle.hitShell({
              point: hit.point, dir: dir.clone(), pen: p.pen, damage: p.damage,
              caliber: p.caliber, range: p.travelled,
            }, p.owner)
            : (vehicle.hitBullet({ point: hit.point, dir, damage: p.damage }, p.owner), null);
          if (p.shell) {
            this.explode(hit.point, p.owner, {
              radius: 2.2 + (p.blast || 2) * 1.4,
              damage: 40 + (p.blast || 2) * 18,
              scale: 1.0,
              ignore: vehicle,
            });
          }
          this.effects.impact(hit.point, hit.normal, 'metal');
          p.pos.copy(hit.point);
          dead = true;
        } else if (actor && actor.alive && actor.team !== p.team) {
          const headY = actor.position.y + (actor.isPlayer ? actor.eyeHeight - 0.06 : 1.62);
          const head = hit.point.y > headY;
          const dist = p.travelled + hit.distance;
          // Damage falls off with range instead of a hard cliff at 80 m.
          const falloff = dist <= 60 ? 1 : dist >= 220 ? 0.82 : 1 - 0.18 * ((dist - 60) / 160);
          this.damageActor(actor, p.damage * falloff * (head ? p.headshot : 1), p.owner, {
            weapon: p.kind, headshot: head, point: hit.point, distance: dist,
          });
          this.effects.blood(hit.point, dir);
          this.audio.impact(head ? 'flesh_heavy' : 'flesh', 0, 0);
        } else if (actor) {
          // Friendly: bullet is absorbed.
          this.effects.impact(hit.point, hit.normal, 'flesh');
        } else {
          const data = hit.data || {};
          if (data.prop || data.structure) {
            this.destructibles.bulletHit(data, hit.point, hit.normal, p.damage, dir, p.owner);
            if (p.shell && data.structure) {
              this.destructibles.damageStructure(data.structure, p.damage * 1.8, hit.point, {
                dir, radius: 2.4 + (p.blast || 2), cause: 'shell',
              });
            }
          }
          this.effects.impact(hit.point, hit.normal, data.surface || 'dirt');
          if (p.shell) {
            this.level?.crater(hit.point.x, hit.point.z, 1.2 + (p.blast || 2) * 0.5, hit.point.y);
            this.explode(hit.point, p.owner, {
              radius: 3 + (p.blast || 2) * 1.7,
              damage: 45 + (p.blast || 2) * 22,
              scale: 0.9 + (p.blast || 2) * 0.16,
            });
          }
        }
        p.pos.copy(hit.point);
        dead = true;
      } else {
        p.pos.addScaledVector(dir, stepLen);
        p.travelled += stepLen;
        p.life -= dt;
        if (p.shell) {
          p.trailT -= dt;
          if (p.trailT <= 0) {
            p.trailT = 0.022;
            this.effects._sprite(this.effects.tex.smoke, p.pos.clone(),
              new THREE.Vector3(rand(-0.2, 0.2), rand(0, 0.5), rand(-0.2, 0.2)),
              0.22, 0.7, 0x8f8a7d, false);
          }
        }
        if (p.life <= 0) dead = true;
      }
      // Near-miss whizz for the local player (segment distance, so fast rounds still register).
      if (!p.whizzed && p.team === 1 && this.player?.alive) {
        if (segmentPointDistance(from, p.pos, this.player.eye) < 3.2) {
          p.whizzed = true;
          this.audio.whiz(rand(-0.6, 0.6));
          this.player.addTrauma(0.12);
        }
      }
      // ... and suppression for bots the round cracks past.
      if (!p.suppressed && p.team !== 1) {
        for (const bot of this.bots) {
          if (!bot.alive || bot === p.owner || bot.team === p.team) continue;
          const d = segmentPointDistance(from, p.pos, bot.eye);
          if (d < 2.5) { p.suppressed = true; bot.onSuppressed?.(p.owner, 1 - d / 2.5); break; }
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
    this.renderer?.splatter?.(0.85);
    this.viewmodel?.setEnabled(false);
    if (this.hud) this.hud.killfeed(attacker, this.player, WEAPON_NAMES[weapon] || '战斗');
    if (this.match) this.match.onKill(this.player, attacker);
    this.audio.hurt();
  }

  respawnPlayer() {
    // New body, clean goggles. The player's tank is only rebuilt if it was lost.
    this.vehicles?.onPlayerRespawn();
    this.renderer?.clearSplatter?.();
    const spawn = this.match ? this.match.getSpawn(0) : this.level.playerSpawn;
    this.player.spawn(spawn.position, spawn.yaw);
    this.hud?.banner('重新部署', this.hud.game.campaign.name, 1.8);
    for (const w of this.weapons || []) w.refill();
    this.weaponIndex = 0;
    this.weapon = this.weapons ? this.weapons[0] : this.weapon;
    this.viewmodel?.setWeapon(this.weapon.def);
    this.hud?.setWeapon?.(this.weapon.def);
    this.hud?.setReloading(false);
    this.viewmodel?.setEnabled(true);
    this.grenades = Math.max(this.grenades, 2);
  }

  /**
   * Opening charge and squad barks.
   *
   * The first seconds of a mission play the commander's order, then the bugle,
   * then the roar of the squad. Later, every fresh forward sprint (Shift + W)
   * pulls one more shout, with a long cooldown so it never turns into a loop.
   */
  updateBattleVoices(dt) {
    const a = this.audio;
    if (!a?.ready) return;
    const intro = this._voiceIntro;
    if (intro) {
      intro.t += dt;
      if (intro.stage === 0 && intro.t >= 0.7 && a.has('order-kill-americans')) {
        a.voice('order-kill-americans', { volume: 0.95, reverb: 0.3 });
        intro.stage = 1; intro.t = 0;
      } else if (intro.stage === 1 && intro.t >= 1.2 && a.has('bugle-charge')) {
        a.voice('bugle-charge', { volume: 0.62, reverb: 0.55 });
        intro.stage = 2; intro.t = 0;
      } else if (intro.stage === 2 && intro.t >= 2.8 && a.has('charge-crowd')) {
        a.voice('charge-crowd', { volume: 0.8, reverb: 0.5, spread: 0.45 });
        intro.stage = 3; intro.t = 0;
      } else if (intro.stage === 3 && intro.t >= 9.5 && a.has('curse-american')) {
        a.voice('curse-american', { volume: 0.8, reverb: 0.4, pan: -0.15 });
        intro.stage = 4; intro.t = 0;
      } else if (intro.stage === 4) {
        this._voiceIntro = null;
      }
    }

    if (this._voiceCd > 0) this._voiceCd -= dt;
    const p = this.player;
    const charging = !!(p?.alive && p.sprinting && !p.aiming);
    if (charging && !this._wasSprinting && this._voiceCd <= 0) {
      this._voiceCd = 12 + Math.random() * 7;
      if (Math.random() < 0.32 && a.has('curse-american')) {
        a.voice('curse-american', {
          volume: 0.85, reverb: 0.35, pan: (Math.random() * 2 - 1) * 0.2,
        });
      } else if (a.has('charge-crowd')) {
        a.voice('charge-crowd', { volume: 0.72, reverb: 0.45, spread: 0.5 });
      }
    }
    this._wasSprinting = charging;
  }

  throwGrenade(owner) {
    if (this.grenades <= 0) {
      this.hud?.toast('手榴弹已用尽');
      return;
    }
    this.grenades--;
    const cp = Math.cos(owner.pitch || 0);
    const dir = new THREE.Vector3(
      -Math.sin(owner.yaw || 0) * cp,
      Math.sin(owner.pitch || 0),
      -Math.cos(owner.yaw || 0) * cp,
    );
    const pos = owner.eye.clone().addScaledVector(dir, 0.5);
    const vel = dir.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.4, 0)).add(
      new THREE.Vector3(owner.velocity.x * 0.4, 0, owner.velocity.z * 0.4),
    );
    this._spawnGrenade(owner, pos, vel);
    this.hud?.toast(`手榴弹 · 剩余 ${this.grenades}`);
    this.audio.impact('metal', 0, 0);
  }

  /** A bot lobbing a grenade at a remembered position (the AI's version of throwGrenade). */
  throwBotGrenade(owner, from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1) return;
    // Pick a flight time, then solve the arc for the 20 m/s² gravity used by updateGrenades.
    const T = clamp(dist / 14, 0.7, 2.2);
    const vel = new THREE.Vector3(dx / T, 0, dz / T);
    vel.y = (to.y - from.y) / T + 0.5 * 20 * T;
    vel.x += rand(-0.6, 0.6);
    vel.z += rand(-0.6, 0.6);
    const pos = from.clone();
    this._spawnGrenade(owner, pos, vel);
  }

  _spawnGrenade(owner, pos, vel) {
    // Poly Haven CC0 Stielhandgranate 24; fall back to a sphere if the asset is missing.
    const mesh = this.grenadeTemplate
      ? this.grenadeTemplate.clone(true)
      : new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x3b3f37, roughness: 0.6, metalness: 0.3 }),
      );
    mesh.position.copy(pos);
    mesh.rotation.set(0.4, 0, 0.25);
    this.worldGroup.add(mesh);
    this.grenadeList.push({ pos: pos.clone(), vel, mesh, t: 2.6, owner });
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
        // The mesh is a clone of the shared grenade template: share its geometry/materials.
        this.worldGroup.remove(g.mesh);
        this.grenadeList.splice(i, 1);
      }
    }
  }

  /**
   * Explosion: infantry, tanks, structures and props all take it in one place.
   * `opts` lets a tank shell carry its own radius and weight; grenades keep the
   * original 9 m / 120 damage feel.
   */
  explode(pos, owner, opts = {}) {
    const radius = opts.radius ?? 9;
    const damage = opts.damage ?? 120;
    const scale = opts.scale ?? 1.15;
    this.effects.explosion(pos, scale);
    for (const a of this.combatants()) {
      if (!a.alive) continue;
      // No friendly fire: the thrower's squad is spared, everyone else (including the thrower) is not.
      if (owner && a !== owner && a.team === owner.team) continue;
      const d = a.position.distanceTo(pos);
      if (d > radius) continue;
      const dmg = damage * (1 - d / radius) ** 1.4;
      const src = a.isPlayer ? { x: a.position.x, y: a.position.y + 1.2, z: a.position.z } : a.eye;
      if (!this.physics.lineOfSight(pos, new THREE.Vector3(src.x, src.y, src.z))) continue;
      this.damageActor(a, dmg, owner, { weapon: opts.kind || 'grenade', from: pos });
    }
    this.vehicles?.blast(pos, radius, damage, owner, opts.ignore);
    this.destructibles?.blast(pos, radius * 1.12, damage * 1.9, { attacker: owner });
  }

  /** Vehicle destruction: kill feed, score, and a ticket cost heavier than a man. */
  onVehicleKilled(vehicle, killer) {
    const victim = { name: vehicle.def.name, team: vehicle.team };
    const by = killer === this.player
      ? { name: this.player.name, team: 0 }
      : killer?.def
        ? { name: killer.def.name, team: killer.team }
        : { name: '反坦克火力', team: 0 };
    if (this.hud) {
      this.hud.killfeed(by, victim, WEAPON_NAMES.cannon);
      if (killer === this.player) {
        this.hud.hitmarker(true);
        this.hud.banner('击毁装甲目标', `${vehicle.def.name} · ${vehicle.team === 1 ? '美军' : '中国远征军'}`, 2.2);
      } else if (vehicle.team === 0) {
        this.hud.toast(`我方 ${vehicle.def.name} 被击毁`);
      }
    }
    if (killer === this.player) this.stats.kills++;
    if (this.match) {
      const t = vehicle.team;
      this.match.tickets[t] = Math.max(0, this.match.tickets[t] - 6);
    }
  }

  /** Called by Tank when the player's hull is lost, and by the F key. */
  leaveVehicle(force = false) {
    return this.vehicles?.leave(force, this.player) ?? false;
  }

  /* ---------------------------------------------------------------- loop */
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.audio.update(dt);
    this.audio.updateListener(this.renderer.camera);
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
    this.frameCmd = cmd;
    if (this.debug?.aim) cmd.aim = true;
    if (this.started && !this.paused) {
      if (cmd.slot1) this.switchWeapon(0);
      else if (cmd.slot2) this.switchWeapon(1);
      else if (cmd.wheel) this.switchWeapon(this.weaponIndex + (cmd.wheel > 0 ? 1 : -1));
    }
    const look = this.input.takeMouseDelta();

    // F boards the nearest friendly hull, or climbs out of the one being driven.
    if (cmd.interact && this.player.alive) this.vehicles.tryToggle(this.player);

    if (this.playerVehicle) {
      this.player.aiming = !!cmd.aim;
      this.player.crouching = false;
      this.player.look(look.x, look.y, this.settings.sens * 0.92);
      this.player.syncCamera(dt);
      if (this.playerBody?.group) this.playerBody.group.visible = false;
    } else if (this.player.alive) {
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
    // Runs in both branches so the body hides itself on death.
    if (!this.playerVehicle) this.playerBody?.update(dt);

    this.vehicles.update(dt);
    this.destructibles.update(dt);

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

    this.updateBattleVoices(dt);
    this.updateProjectiles(dt);
    this.updateGrenades(dt);
    this.materials.update(dt);
    this.level.update(dt, this.time);
    this.weather?.update(dt, this.time);
    this.atmosphere.update(dt);
    this.ambience?.update(dt);
    this.effects.update(dt);
    if (!frozen) {
      this.match.update(dt);
      this.assignT -= dt;
      if (this.assignT <= 0) { this.assignT = 8; this.assignObjectives(); }
    }
    this.hud.update(dt);
    if (this.hud) {
      const tank = this.playerVehicle;
      if (tank) {
        this.hud.setVehicleState?.({
          name: tank.def.name,
          speed: Math.abs(tank.speed) * 3.6,
          hp: Math.max(0, tank.hp / tank.maxHp),
          loaded: tank.reload <= 0,
          reload: tank.reloadProgress?.(),
          gun: tank.def.gun.name,
          turret: tank.modules.turret,
          tracks: tank.modules.tracks,
          engine: tank.modules.engine,
          zoom: this.player.aiming,
          ammo: tank.mgAmmo,
        });
      } else {
        const near = this.player.alive ? this.vehicles.nearestEnterable(0, this.player.position) : null;
        this.hud.setVehiclePrompt?.(near ? `按 F 登上 ${near.def.name}` : '');
      }
    }

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
    if (this.playerVehicle) this.playerVehicle = null;
    if (this.vehicles) { this.vehicles.dispose(); this.vehicles = null; }
    if (this.destructibles) { this.destructibles.dispose(); this.destructibles = null; }
    this.frameCmd = null;
    if (this.playerBody) {
      this.playerBody.dispose();
      this.playerBody = null;
    }
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
    if (this.viewmodel) {
      this.viewmodel.rig.removeFromParent();
      this.viewmodel = null;
    }
    if (this.atmosphere) { this.atmosphere.dispose(); this.atmosphere = null; }
    if (this.ambience) { this.ambience.dispose(); this.ambience = null; }
    if (this.weather) { this.weather.dispose(); this.weather = null; }
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
    this.weapons = null;
    this.match = null;
    this.level = null;
    this.nav = null;
    this.started = false;
  }
}

/** Shortest distance from point p to segment a→b (near-miss tests for fast bullets). */
function segmentPointDistance(a, b, p) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 > 1e-8 ? clamp((apx * abx + apy * aby + apz * abz) / len2, 0, 1) : 0;
  return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
}
