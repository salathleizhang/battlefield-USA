import * as THREE from 'three';
import { G, groups } from '../core/Physics.js';
import { buildTank, TANK_DEFS } from './TankModel.js';
import { VehicleAudio } from './VehicleAudio.js';
import { clamp, damp, rand } from '../core/MathUtil.js';

const DEG = Math.PI / 180;
const DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * One tank: hull motion, turret aiming, gun, armour and module damage, AI.
 *
 * The hull is a kinematic Rapier body (characters, shells and the terrain probe
 * see it) driven by a ray-sampled four-point "suspension": no wheel colliders,
 * no raycast vehicle constraint, and no jitter on the trimesh terrain. Tracks
 * and wheels are pure animation.
 */
export class Tank {
  constructor(game, kind, {
    team = 1, position = new THREE.Vector3(), yaw = 0, playerTank = false, name = null,
  } = {}) {
    this.game = game;
    this.def = typeof kind === 'string' ? TANK_DEFS[kind] : kind;
    this.kind = this.def.id;
    this.name = name || this.def.name;
    this.team = team;
    this.playerTank = playerTank;
    this.isPlayer = false;
    this.driver = null;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.throttle = 0;
    this.steer = 0;
    this.yaw = yaw;
    this.turretYaw = yaw;
    this.gunPitch = 0;
    this.pitch = 0;
    this.roll = 0;
    this.groundY = position.y;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.destroyed = false;
    this.crew = this.def.crew;
    this.reload = this.def.gun.reload * 0.5;
    this.reloadTotal = this.def.gun.reload;
    this.recoil = 0;
    this.recoilV = 0;
    this.mgTimer = 0;
    this.mgAmmo = this.def.mg.ammo;
    this.modules = { engine: 1, tracks: 1, turret: 1 };
    this.aiTarget = null;
    this.aiScanT = 0;
    this.aiReactT = 0;
    this.aiFireDelay = 1.6 + Math.random() * 1.2;
    this.scanPhase = Math.random() * 6;
    this.crushT = 0;
    this.wreckT = 0;
    this.playerControlled = false;
    this.timers = { smoke: 0, fire: 0, idle: 0 };

    this.model = buildTank(this.def, game);
    this.model.setTeamStar(team);
    this.model.root.position.copy(position);
    this.model.root.rotation.order = 'YXZ';
    this.model.root.rotation.y = yaw;
    game.worldGroup.add(this.model.root);

    const R = game.physics.R;
    this.bodyCenterY = this.def.height * 0.4;
    this.half = {
      x: this.def.width / 2,
      y: this.def.height * 0.34,
      z: this.def.length / 2,
    };
    _q.setFromEuler(new THREE.Euler(0, yaw, 0));
    this.body = game.physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(position.x, position.y + this.bodyCenterY, position.z)
        .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }),
    );
    this.collider = game.physics.world.createCollider(
      R.ColliderDesc.cuboid(this.half.x, this.half.y, this.half.z)
        .setCollisionGroups(groups(G.VEHICLE, 0xffff)),
      this.body,
    );
    game.physics.tag(this.collider, { vehicle: this, team, surface: 'metal' });

    this.audio = new VehicleAudio(game, this);
    this._settle(0, true);
    this.syncBody();
  }

  /* --------------------------------------------------------------- helpers */

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /** World point → hull frame (x right, y up from ground, z rear-positive). */
  toLocal(point, out = new THREE.Vector3()) {
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set(dx * c - dz * s, point.y - this.position.y, dx * s + dz * c);
  }

  /** Camera / crew vantage point (turret roof). */
  crewEye(out = new THREE.Vector3()) {
    const back = this.def.turret.z * Math.cos(this.turretYaw - this.yaw);
    out.set(
      this.position.x + Math.sin(this.yaw) * -back,
      this.position.y + this.def.turret.y + 0.55,
      this.position.z + Math.cos(this.yaw) * -back,
    );
    return out;
  }

  syncBody() {
    _q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    this.body.setNextKinematicTranslation({
      x: this.position.x,
      y: this.position.y + this.bodyCenterY,
      z: this.position.z,
    });
    this.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
    this.model.root.position.copy(this.position);
    this.model.root.rotation.set(this.pitch, this.yaw, this.roll);
  }

  /* ------------------------------------------------------------- suspension */

  /** Four-point terrain probe; also decides whether the ground ahead is water. */
  _settle(dt, snap = false) {
    const hl = this.def.length * 0.38;
    const hw = this.def.width * 0.42;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const probes = [
      [0, 0], [-hw, 0], [hw, 0], [0, -hl], [0, hl],
    ];
    let centerY = null;
    const h = {};
    for (let i = 0; i < probes.length; i++) {
      const [lx, lz] = probes[i];
      const wx = this.position.x + lx * c + lz * s;
      const wz = this.position.z - lx * s + lz * c;
      const hit = this.game.physics.raycast(
        { x: wx, y: this.position.y + 4.5, z: wz }, DOWN, 9,
        G.WORLD,
      );
      h[i] = hit ? hit.point.y : null;
      if (i === 0 && hit) centerY = hit.point.y;
    }
    const alt = [h[1], h[2], h[3], h[4]].filter((v) => v != null);
    const avg = alt.length ? alt.reduce((a, b) => a + b, 0) / alt.length : null;

    if (centerY != null || avg != null) {
      this.vy = 0;
      const gy = centerY ?? avg;
      this.groundY = gy;
      this.position.y = snap ? gy : damp(this.position.y, gy, 14, dt);
      const front = h[3] ?? gy, rear = h[4] ?? gy;
      const left = h[1] ?? gy, right = h[2] ?? gy;
      const tp = Math.atan2(front - rear, this.def.length * 0.76);
      const tr = Math.atan2(right - left, this.def.width * 0.84);
      this.pitch = snap ? tp : damp(this.pitch, tp, 7, dt);
      this.roll = snap ? tr : damp(this.roll, tr, 7, dt);
    } else {
      // Airborne over a hole (bridge edge): fall, do not snap to the seabed.
      this.vy = (this.vy || 0) - 9.81 * dt;
      this.position.y = Math.max(-30, this.position.y + this.vy * dt);
    }
    this.waterAhead = this.game.level ? this.groundY < this.game.level.waterY - 1.1 : false;
  }

  /* ---------------------------------------------------------------- driving */

  drive(dt, throttle, steer) {
    if (!this.alive) return;
    this.throttle = clamp(throttle, -1, 1);
    this.steer = clamp(steer, -1, 1);
    const def = this.def;
    const trackFactor = 0.45 + 0.55 * this.modules.tracks;
    const engineFactor = 0.55 + 0.45 * this.modules.engine;
    const maxF = def.maxSpeed * trackFactor * engineFactor;
    const maxR = def.reverseSpeed * trackFactor * engineFactor;
    const target = this.throttle >= 0 ? this.throttle * maxF : this.throttle * maxR;
    const rate = this.throttle === 0 ? def.brake : def.accel * engineFactor;
    const delta = clamp(target - this.speed, -rate * dt, rate * dt);
    this.speed += delta;
    if (Math.abs(this.speed) < 0.02) this.speed = 0;

    // Hull steering: tanks pivot in place, so the rate does not vanish at rest.
    const speedFactor = 0.4 + 0.6 * Math.min(1, Math.abs(this.speed) / 2.4);
    const yawRate = def.turnRate * this.modules.tracks * speedFactor;
    this.yaw = wrapAngle(this.yaw - this.steer * yawRate * dt);
    this.turretYaw = wrapAngle(this.turretYaw - this.steer * yawRate * dt);

    if (Math.abs(this.speed) < 1e-4) return;

    const fwd = this.forward(_w);
    const step = this.speed * dt;
    const dirSign = Math.sign(step);
    // Probe the hull nose: a wall stops the tank, a destructible panel gives.
    const hit = this.game.physics.raycast(
      { x: this.position.x, y: this.position.y + 0.9, z: this.position.z },
      { x: fwd.x * dirSign, y: 0, z: fwd.z * dirSign },
      this.def.length * 0.5 + 1.0, G.WORLD, this.collider,
    );
    let blocked = false;
    if (hit) {
      const need = this.def.length * 0.5 + 0.55;
      if (hit.distance < need) {
        const data = hit.data || {};
        if (data.panel || data.prop) {
          this.game.destructibles?.ram(data, Math.abs(this.speed), this.def.mass);
          this.speed *= 0.82;
          this.game.effects?.impact(hit.point, hit.normal, data.panel ? 'rubble' : 'wood');
        } else {
          blocked = true;
        }
      }
    }
    if (blocked) {
      this.speed = -this.speed * 0.12;
      if (Math.abs(this.speed) > 2.5) {
        this.game.effects?.impact(
          _v.copy(this.position).addScaledVector(fwd, dirSign * this.def.length * 0.5),
          new THREE.Vector3(-fwd.x * dirSign, 0, -fwd.z * dirSign), 'metal',
        );
      }
    }

    const nx = this.position.x + fwd.x * step;
    const nz = this.position.z + fwd.z * step;
    // Deep water is a wall; the bridge deck above it is not.
    const gh = this.game.level ? this.game.level.groundHeight(nx, nz) : 0;
    if (this.game.level?.waterY != null && gh < this.game.level.waterY - 1.1 && this.groundY < this.game.level.waterY + 0.4) {
      this.speed *= 0.2;
    } else {
      this.position.x = nx;
      this.position.z = nz;
    }
    this._settle(dt);
    this._crushTick(dt);
  }

  /* ----------------------------------------------------------------- turret */

  aimTurret(dt, desiredYaw, desiredPitch, scale = 1) {
    if (!this.alive) return 0;
    const diff = wrapAngle(desiredYaw - this.turretYaw);
    const step = this.def.turretSpeed * this.modules.turret * scale * dt;
    const applied = clamp(diff, -step, step);
    this.turretYaw = wrapAngle(this.turretYaw + applied);
    this.gunPitch = damp(this.gunPitch, clamp(desiredPitch, -9 * DEG, 19 * DEG), 6, dt);
    this.model.turretPivot.rotation.y = this.turretYaw - this.yaw;
    this.model.gunPivot.rotation.x = this.gunPitch;
    // Recoil spring: the barrel slides back, then returns.
    this.recoil = damp(this.recoil, 0, 9, dt);
    this.model.gunPivot.position.z = -this.def.turret.d / 2 - 0.12 + this.recoil;
    return Math.abs(applied / Math.max(dt, 1e-4));
  }

  reloadProgress() {
    return 1 - clamp(this.reload / this.reloadTotal, 0, 1);
  }

  /* ------------------------------------------------------------------- fire */

  fire(owner = null) {
    if (!this.alive || this.reload > 0) return false;
    const def = this.def;
    this.reload = def.gun.reload;
    const muzzle = new THREE.Vector3();
    this.model.muzzle.getWorldPosition(muzzle);
    const yaw = this.turretYaw + rand(-1, 1) * def.gun.spread * 0.5;
    const pitch = this.gunPitch + rand(-1, 1) * def.gun.spread * 0.5;
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).normalize();
    this.game.spawnShell({
      origin: muzzle,
      dir,
      speed: def.gun.velocity,
      pen: def.gun.pen,
      damage: def.gun.damage,
      blast: def.gun.blast,
      caliber: parseFloat(def.gun.caliber) || 75,
      owner: this,
      team: this.team,
    });
    this.game.effects?.muzzleSmoke(muzzle, dir);
    this.game.effects?.smokeScreen(muzzle, 0.35);
    const dist = this.game.player ? this.game.player.position.distanceTo(this.position) : 0;
    const pan = this._panToPlayer();
    this.game.audio?.cannon(dist, pan, parseFloat(def.gun.caliber) || 75);
    this.recoil = 0.26;
    this.speed -= Math.sign(this.speed || 1) * 0.25;
    if (this.game.playerVehicle === this && this.game.player) this.game.player.addTrauma(0.45);
    // Turret roof dust kicked loose by the blast.
    return true;
  }

  _panToPlayer() {
    const p = this.game.player;
    if (!p) return 0;
    _v.copy(this.position).sub(p.position);
    const d = _v.length();
    if (d < 0.01) return 0;
    const right = p.right ? p.right(_w) : _w.set(1, 0, 0);
    return clamp((_v.x * right.x + _v.z * right.z) / d, -1, 1);
  }

  /* ---------------------------------------------------------------- damage */

  /**
   * Resolve one shell hit. Returns the armour report used by the HUD and FX.
   */
  hitShell({ point, dir, pen, damage, caliber = 75, range = 0 }, attacker = null) {
    if (!this.alive) return { hit: false };
    const local = this.toLocal(point, new THREE.Vector3());
    const def = this.def;
    let zone = 'side';
    let normal = new THREE.Vector3();
    if (Math.abs(local.x) > def.width * 0.36 && Math.abs(local.y) < def.hullTop) {
      zone = 'track';
      normal.set(Math.sign(local.x), 0, 0);
    } else if (local.y > def.turret.y - 0.32 && Math.abs(local.z - def.turret.z) < def.turret.d * 0.62) {
      zone = 'turret';
      normal.set(local.x / Math.max(0.4, def.turret.w), 0.25, local.z / Math.max(0.4, def.turret.d)).normalize();
    } else if (local.z < -def.length * 0.16) {
      zone = 'front';
      normal.set(0, 0.18, -1).normalize();
    } else if (local.z > def.length * 0.2) {
      zone = 'rear';
      normal.set(0, 0, 1);
    } else {
      zone = 'side';
      normal.set(Math.sign(local.x) || 1, 0, 0);
    }
    // Incoming direction is `dir`; the impact angle is measured against the plate.
    const cosA = clamp(-dir.dot(normal), 0, 1);
    const angle = Math.acos(cosA);
    const armor = def.armor[zone] || def.armor.side;
    // Very steep impacts reject even big shells; 3x calibre overmatch still bites.
    if (angle > 72 * DEG && pen < armor * 3 + caliber * 0.5) {
      this._spark(point, attacker);
      this._report({ zone, angle, effective: 999, penetrated: false, ricochet: true, damage: 0 }, attacker);
      return { zone, penetrated: false, ricochet: true };
    }
    const effective = armor / Math.max(0.25, cosA);
    const penFalloff = 1 - clamp(range / 900, 0, 0.35);
    const penEff = pen * penFalloff;
    if (penEff < effective) {
      // Non-penetration still rings the crew and can break a track.
      const stun = clamp(penEff / Math.max(1, effective), 0, 1) * damage * 0.12;
      this.hp -= stun;
      this._spark(point, attacker);
      this.game.audio?.impact('metal', 0, 0);
      this._report({ zone, angle, effective, penetrated: false, ricochet: false, damage: stun }, attacker);
      return { zone, penetrated: false, effective };
    }
    let dmg = damage * (1 + clamp((penEff - effective) / Math.max(20, effective), 0, 0.8) * 0.5);
    if (zone === 'rear') {
      dmg *= 1.45;
      this.modules.engine = Math.max(0.25, this.modules.engine - 0.6);
    }
    if (zone === 'side') dmg *= 1.08;
    if (zone === 'track') {
      dmg *= 0.55;
      this.modules.tracks = Math.max(0.35, this.modules.tracks - 0.5);
      this._trackFx(point);
    }
    if (zone === 'turret' && Math.random() < 0.35) {
      this.modules.turret = Math.max(0.35, this.modules.turret - 0.5);
    }
    this.hp -= dmg;
    this._internalFx(point, dmg);
    this.game.audio?.impact('metal', 0, 0);
    this._report({ zone, angle, effective, penetrated: true, ricochet: false, damage: dmg }, attacker);
    if (this.hp <= 0) this.destroy(attacker);
    return { zone, penetrated: true, effective, damage: dmg };
  }

  /** Machine-gun / rifle fire: armour shrugs it off, tracks and optics do not. */
  hitBullet({ point, dir, damage }, attacker = null) {
    if (!this.alive) return;
    this._spark(point, attacker);
    const local = this.toLocal(point, new THREE.Vector3());
    if (Math.abs(local.x) > this.def.width * 0.4 && Math.abs(local.y) < 1.1) {
      this.modules.tracks = Math.max(0.5, this.modules.tracks - 0.02);
    }
  }

  _spark(point, attacker) {
    this.game.effects?.impact(point, new THREE.Vector3(0, 1, 0), 'metal');
    this.game.renderer?.addLight?.(point, 0xffb060, 2.2, 0.08);
    if (attacker === this.game.player) {
      this.game.hud?.armorResult?.('未击穿', false);
    }
  }

  _trackFx(point) {
    this.game.effects?.smokeScreen(point, 0.4);
    if (this.game.playerVehicle === this) this.game.hud?.toast('履带受损 · 机动下降');
  }

  _internalFx(point, dmg) {
    this.game.effects?.explosion(point, 0.45 + Math.min(0.6, dmg / 400));
    if (dmg > 120 && Math.random() < 0.4) {
      this.game.effects?.smokeScreen(point, 0.7);
    }
  }

  _report(info, attacker) {
    const iAmPlayer = this.game.playerVehicle === this;
    const byPlayer = attacker === this.game.player;
    if (!iAmPlayer && !byPlayer) return;
    const verb = info.ricochet ? '跳弹' : info.penetrated ? (iAmPlayer ? '被击穿' : '击穿') : '未击穿';
    this.game.hud?.armorResult?.(`${verb} · ${zoneName(info.zone)}`, !iAmPlayer && info.penetrated);
    if (iAmPlayer && info.penetrated) {
      this.game.renderer?.setDamage?.(clamp(info.damage / 400, 0.1, 0.35));
      this.game.player?.addTrauma(0.3);
    }
  }

  damage(amount, attacker = null, info = {}) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) this.destroy(attacker);
  }

  destroy(killer = null) {
    if (this.destroyed) return;
    this.destroyed = true;
    this.alive = false;
    this.hp = 0;
    this.speed = 0;
    this.throttle = 0;
    this.model.setWreck();
    this.audio.stop();
    const pos = this.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.game.effects?.explosion(pos, 2.4);
    this.game.effects?.smokeScreen(pos, 2.5);
    this.game.audio?.explosion(this.game.player ? this.game.player.position.distanceTo(pos) : 0);
    this.game.level?.fire(this.position.x, this.position.y + 1.2, this.position.z, 1.5);
    this.game.level?.smokeColumn(this.position.x, this.position.y + 1.4, this.position.z, 2.0);
    this.game.onVehicleKilled?.(this, killer);
    if (this.game.playerVehicle === this) {
      this.game.leaveVehicle?.(true);
      this.game.player?.die(killer || this, 'cannon');
    }
    // A wreck still blocks the road; keep its kinematic collider.
  }

  /* ------------------------------------------------------------------- AI */

  _pickTarget() {
    const g = this.game;
    let best = null;
    let bestD = Infinity;
    const consider = (a) => {
      if (!a?.alive || a.team === this.team) return;
      const d = a.position.distanceTo(this.position);
      if (d > 175) return;
      const eye = a.eye || a.position;
      if (!g.physics.lineOfSight(this.crewEye(_v), eye)) return;
      if (d < bestD) { bestD = d; best = a; }
    };
    if (g.player) consider(g.player);
    for (const b of g.bots) consider(b);
    return best;
  }

  updateAI(dt) {
    if (!this.alive) return;
    this.aiScanT -= dt;
    if (!this.aiTarget || !this.aiTarget.alive || this.aiScanT <= 0) {
      this.aiScanT = 1.2 + Math.random() * 0.8;
      const next = this._pickTarget();
      if (next && next !== this.aiTarget) this.aiReactT = 0.9 + Math.random() * 1.4;
      this.aiTarget = next;
    }
    const target = this.aiTarget;
    if (!target) {
      // Scan the sector like a crew looking for targets through the optics.
      this.scanPhase += dt * 0.35;
      const base = this.yaw + Math.sin(this.scanPhase) * 0.55;
      this.aimTurret(dt, base, 0.02, 0.6);
      this._wreckFx(dt);
      return;
    }
    this.aiReactT -= dt;
    const eye = target.eye || target.position;
    const dist = eye.distanceTo(this.crewEye(_v));
    const tof = dist / Math.max(200, this.def.gun.velocity);
    // Lead a walking target and lift the barrel for the drop.
    const aimPoint = _w.copy(eye);
    if (target.velocity) aimPoint.addScaledVector(target.velocity, tof * 0.65);
    aimPoint.y += 0.5 * 9.81 * tof * tof;
    const dx = aimPoint.x - this.position.x;
    const dz = aimPoint.z - this.position.z;
    const desiredYaw = Math.atan2(-dx, -dz);
    const horiz = Math.hypot(dx, dz);
    const desiredPitch = Math.atan2(aimPoint.y - (this.position.y + this.def.turret.y + 0.4), horiz);
    const rate = this.aimTurret(dt, desiredYaw, desiredPitch, 1);
    const aimed = Math.abs(wrapAngle(desiredYaw - this.turretYaw)) < 2.5 * DEG
      && Math.abs(desiredPitch - this.gunPitch) < 2.2 * DEG;
    if (this.reload <= 0) {
      this.aiFireDelay -= dt;
      if (aimed && this.aiReactT <= 0 && this.aiFireDelay <= 0 && rate < 2.5) {
        this.fire();
        this.aiFireDelay = 1.4 + Math.random() * 2.2;
      }
    }
    this._wreckFx(dt);
  }

  updatePlayerControl(dt, player, cmd) {
    if (!this.alive || !cmd) return;
    this.playerControlled = true;
    const throttle = clamp(cmd.moveY, -1, 1);
    const steer = clamp(cmd.moveX, -1, 1);
    this.drive(dt, throttle, steer);
    this.aimTurret(dt, player.yaw, player.pitch, 1);
    this.mgTimer -= dt;
    if (cmd.firePressed && this.reload <= 0) this.fire(player);
    if (cmd.sprint && this.mgTimer <= 0 && this.mgAmmo > 0) {
      this.mgTimer = this.def.mg.interval;
      this.mgAmmo--;
      this._fireMG(player);
    }
    if (cmd.jumpPressed) this.game.leaveVehicle?.(false);
    this._wreckFx(dt);
  }

  _fireMG(player) {
    const muzzle = new THREE.Vector3();
    this.model.muzzle.getWorldPosition(muzzle);
    const cp = Math.cos(this.gunPitch);
    const dir = new THREE.Vector3(
      -Math.sin(this.turretYaw) * cp, Math.sin(this.gunPitch), -Math.cos(this.turretYaw) * cp,
    ).normalize();
    dir.x += rand(-1, 1) * 0.012;
    dir.y += rand(-1, 1) * 0.012;
    dir.normalize();
    const origin = muzzle.clone().addScaledVector(dir, -this.def.barrel.length * 0.4);
    this.game.spawnProjectile({
      origin, dir, speed: 800, damage: this.def.mg.damage, owner: player,
      team: this.team, kind: 'mg', headshot: 1.6,
    });
    this.game.effects?.muzzleSmoke(muzzle, dir);
    this.game.audio?.shot?.(this.team === 0 ? 'type38' : 'm1', {
      dist: this.game.player.position.distanceTo(this.position), pan: this._panToPlayer(), volume: 0.4,
    });
  }

  /* -------------------------------------------------------------- per-frame */

  update(dt) {
    if (!this.alive) {
      this._wreckFx(dt);
      return;
    }
    this.reload = Math.max(0, this.reload - dt);
    if (this.game.playerVehicle === this && this.game.player && this.game.frameCmd) {
      this.updatePlayerControl(dt, this.game.player, this.game.frameCmd);
    } else {
      this.playerControlled = false;
      this.updateAI(dt);
    }
    this._settle(dt);
    this.model.animate(dt, this.speed);
    const inside = this.game.playerVehicle === this;
    this.audio.update(dt, {
      speed: this.speed,
      throttle: this.throttle,
      turretRate: this.modules.turret,
      inside,
      alive: this.alive,
    });
    this.timers.idle -= dt;
    if (this.timers.idle <= 0) {
      this.timers.idle = 5 + Math.random() * 6;
      if (!inside) this.audio.idleTick();
    }
    if (this.game.playerVehicle === this && this.game.player) {
      this.game.player.position.copy(this.position);
      this.game.player.velocity.set(0, 0, 0);
    }
  }

  _crushTick(dt) {
    this.crushT -= dt;
    if (this.crushT > 0 || Math.abs(this.speed) < 1.2) return;
    this.crushT = 0.12;
    this.game.destructibles?.crush(this);
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    for (const a of this.game.combatants()) {
      if (!a.alive || a.team === this.team) continue;
      const dx = a.position.x - this.position.x;
      const dz = a.position.z - this.position.z;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) > this.def.width * 0.58) continue;
      if (Math.abs(lz) > this.def.length * 0.52) continue;
      if (a.position.y - this.position.y > 2.4) continue;
      this.game.damageActor(a, 999, this.driver || this, {
        weapon: 'tank_crush', point: a.position.clone(),
      });
      this.game.effects?.blood(a.position.clone().add(new THREE.Vector3(0, 1, 0)), this.forward(_v));
    }
  }

  _wreckFx(dt) {
    if (!this.destroyed) return;
    this.wreckT -= dt;
    if (this.wreckT > 0) return;
    this.wreckT = 0.45 + Math.random() * 0.5;
    const d = this.game.player ? this.game.player.position.distanceTo(this.position) : 400;
    if (d > 90) return;
    _v.set(
      this.position.x + rand(-0.5, 0.5),
      this.position.y + this.def.height * 0.55,
      this.position.z + rand(-0.5, 0.5),
    );
    this.game.effects?._sprite?.(
      this.game.effects.tex.smoke, _v, new THREE.Vector3(rand(-0.2, 0.2), 1.4 + Math.random(), rand(-0.2, 0.2)),
      1.4 + Math.random() * 1.2, 3.4, 0x2a2824, false, 0.2,
    );
    if (Math.random() < 0.3) {
      this.game.effects?.impact(_v, new THREE.Vector3(0, 1, 0), 'metal');
    }
  }

  dispose() {
    this.audio.dispose();
    if (this.collider) {
      this.game.physics.colliderData.delete(this.collider.handle);
      this.game.physics.world.removeCollider(this.collider);
    }
    if (this.body?.isValid?.()) this.game.physics.world.removeRigidBody(this.body);
    this.model.dispose();
  }
}

function zoneName(zone) {
  return { front: '车体正面', side: '侧面', rear: '发动机', turret: '炮塔', track: '履带', top: '顶甲' }[zone] || '装甲';
}
