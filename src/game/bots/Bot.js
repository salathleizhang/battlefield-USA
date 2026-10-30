import * as THREE from 'three';
import { G, groups } from '../../core/Physics.js';
import { SoldierModel } from './SoldierModel.js';
import { clamp, damp, rand, randInt, pick } from '../../core/MathUtil.js';

const US_NAMES = ['米勒', '卡特', '沃克', '布朗', '戴维斯', '汤普森', '里德', '霍华德', '肖', '格雷'];
const CN_NAMES = ['铁柱', '二牛', '长胜', '德福', '青山', '大勇', '红军', '志远', '海生', '建国'];

/**
 * Rifleman AI: perception → engage / advance / capture, with cover-ish steering.
 * Bots are capsule colliders tagged as actors so bullets can hit them.
 */
export class Bot {
  constructor(game, team, position, yaw = 0, name = null, variant = 0) {
    this.game = game;
    this.team = team;
    this.name = name || (team === 0 ? `八路军·${pick(CN_NAMES)}` : `美军·${pick(US_NAMES)}`);
    this.maxHealth = 100;
    this.health = 100;
    this.alive = true;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = yaw;
    this.target = null;
    this.targetSeenAt = -99;
    this.lastSeenPos = new THREE.Vector3();
    this.state = 'advance';
    this.objective = null;
    this.route = null;
    this.routeIndex = 0;
    this.fireTimer = rand(0.6, 2.2);
    this.perceptT = rand(0, 0.25);
    this.aimTime = 0;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeT = rand(1, 3);
    this.stuckT = 0;
    this.deadT = 0;
    this.spawnPos = position.clone();
    this.spawnYaw = yaw;
    this.accuracy = team === 1 ? 0.75 : 0.68;
    this.reaction = rand(0.25, 0.7);
    this.lastDamageTime = -99;
    this.time = 0;
    this.aiming = false;
    this.desired = new THREE.Vector3();

    this.model = (game.characters && game.characters.ready)
      ? game.characters.create(team, variant)
      : new SoldierModel(team, game.materials);
    if (!this.model) this.model = new SoldierModel(team, game.materials);
    this.model.setPosition(position.x, position.y, position.z, yaw);
    game.worldGroup.add(this.model.group);

    const R = game.physics.R;
    this.collider = game.physics.world.createCollider(
      R.ColliderDesc.capsule(0.5, 0.35)
        .setTranslation(position.x, position.y + 0.9, position.z)
        .setCollisionGroups(groups(G.BOT, G.WORLD | G.PLAYER | G.BOT)),
    );
    game.physics.tag(this.collider, { actor: this, team, surface: 'flesh' });
  }

  get eye() {
    return new THREE.Vector3(this.position.x, this.position.y + 1.55, this.position.z);
  }

  setObjective(point) {
    this.objective = point;
    if (point) this.route = null;
  }

  setRoute(points) {
    this.route = points;
    this.routeIndex = 0;
  }

  canSee(other) {
    if (!other || !other.alive) return false;
    const eye = this.eye;
    const target = other.isPlayer ? other.eye : new THREE.Vector3(other.position.x, other.position.y + 1.4, other.position.z);
    const dist = eye.distanceTo(target);
    if (dist > 140) return false;
    const dir = target.clone().sub(eye).normalize();
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    if (fwd.dot(flat) < 0.25 && dist > 12) return false;
    return this.game.physics.lineOfSight(eye, target);
  }

  findTarget() {
    let best = null, bestD = 1e9;
    const all = this.game.combatants();
    for (const a of all) {
      if (a === this || !a.alive || a.team === this.team) continue;
      if (!this.canSee(a)) continue;
      const d = this.position.distanceTo(a.position);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  update(dt) {
    this.time += dt;
    if (!this.alive) { this.deadT += dt; this.model.update(dt, 0, false, false); return; }

    this.perceptT -= dt;
    if (this.perceptT <= 0) {
      this.perceptT = 0.22 + Math.random() * 0.16;
      const seen = this.findTarget();
      if (seen) {
        if (this.target !== seen) this.aimTime = 0;
        this.target = seen;
        this.targetSeenAt = this.time;
        this.lastSeenPos.copy(seen.position);
      } else if (this.time - this.targetSeenAt > 4) {
        this.target = null;
      }
    }

    this.fireTimer -= dt;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeT = rand(1.2, 3.0); this.strafeDir *= -1; }

    const hasTarget = this.target && this.target.alive && this.time - this.targetSeenAt < 2.5;
    let moveTarget = null;
    let speed = 2.3;

    if (hasTarget) {
      this.state = 'engage';
      this.aiming = true;
      this.aimTime += dt;
      const toTarget = this.target.position.clone().sub(this.position);
      const dist = toTarget.length();
      // Face target.
      const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
      this.yaw = this._turn(this.yaw, desiredYaw, dt, 4.5);
      // Keep distance / strafe.
      const flat = new THREE.Vector3(toTarget.x, 0, toTarget.z).normalize();
      const right = new THREE.Vector3(-flat.z, 0, flat.x);
      if (dist > 55) moveTarget = this.position.clone().addScaledVector(flat, 4);
      else if (dist < 16) moveTarget = this.position.clone().addScaledVector(flat, -3);
      else moveTarget = this.position.clone().addScaledVector(right, this.strafeDir * 3);
      speed = 1.9;
      if (this.fireTimer <= 0 && dist < 120) {
        this.fireTimer = rand(1.15, 2.3) / (this.team === 1 ? 1.12 : 1);
        this.shoot();
      }
    } else {
      this.state = this.objective ? 'advance' : 'patrol';
      this.aiming = false;
      if (this.objective) {
        const p = this.objective.position;
        const dist = Math.hypot(p.x - this.position.x, p.z - this.position.z);
        if (dist > 3.5) moveTarget = p;
        else {
          // Garrison around the flag.
          this.yaw = this._turn(this.yaw, Math.atan2(-(p.x - this.position.x), -(p.z - this.position.z)) + Math.PI, dt, 2);
        }
        speed = dist > 30 ? 3.4 : 2.2;
      }
      // React to hits: turn toward attacker and advance.
      if (this.time - this.lastDamageTime < 3 && this.lastAttacker?.alive) {
        const p = this.lastAttacker.position;
        moveTarget = p;
        speed = 3.5;
        const desiredYaw = Math.atan2(-(p.x - this.position.x), -(p.z - this.position.z));
        this.yaw = this._turn(this.yaw, desiredYaw, dt, 3);
      }
    }

    // Movement + simple obstacle avoidance.
    let moved = 0;
    if (moveTarget) {
      const dir = moveTarget.clone().sub(this.position);
      dir.y = 0;
      if (dir.lengthSq() > 0.01) {
        dir.normalize();
        const avoid = this._avoid(dir);
        if (avoid) dir.addScaledVector(avoid, 1.1).normalize();
        const step = speed * dt;
        const nx = this.position.x + dir.x * step;
        const nz = this.position.z + dir.z * step;
        const waterY = this.game.level?.waterY ?? -999;
        const probe = this.game.physics.raycast({ x: nx, y: this.position.y + 2.0, z: nz }, { x: 0, y: -1, z: 0 }, 9, G.WORLD);
        const nearWater = probe && probe.point.y < waterY + 0.25;
        if (!nearWater) {
          this.position.x = nx;
          this.position.z = nz;
          moved = step / Math.max(dt, 0.001);
        } else {
          this.strafeDir *= -1;
        }
        if (this.state !== 'engage') {
          const desiredYaw = Math.atan2(-dir.x, -dir.z);
          this.yaw = this._turn(this.yaw, desiredYaw, dt, 6);
        }
        this.stuckT += dt;
        if (this.stuckT > 2.5) { this.strafeDir *= -1; this.stuckT = 0; }
      }
    }

    // Ground clamp via raycast.
    const ground = this.game.physics.raycast(
      { x: this.position.x, y: this.position.y + 2.2, z: this.position.z },
      { x: 0, y: -1, z: 0 }, 8, G.WORLD,
    );
    if (ground) this.position.y = damp(this.position.y, ground.point.y, 16, dt);
    else this.position.y -= 9 * dt;

    // Keep inside map bounds.
    const b = this.game.level.bounds;
    this.position.x = clamp(this.position.x, b.minX + 4, b.maxX - 4);
    this.position.z = clamp(this.position.z, b.minZ + 4, b.maxZ - 4);

    this.collider.setTranslation({ x: this.position.x, y: this.position.y + 0.9, z: this.position.z });
    this.model.setPosition(this.position.x, this.position.y, this.position.z, this.yaw);
    this.model.update(dt, moved, this.aiming, true);

    if (this.position.y < -8) this.die(null);
  }

  _turn(a, b, dt, speed) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + clamp(d, -speed * dt, speed * dt);
  }

  _avoid(dir) {
    const origin = { x: this.position.x, y: this.position.y + 1.0, z: this.position.z };
    const hit = this.game.physics.raycast(origin, dir, 1.5, G.WORLD);
    if (!hit) return null;
    // Slide toward the more open side.
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const hR = this.game.physics.raycast(origin, right, 1.4, G.WORLD);
    const hL = this.game.physics.raycast(origin, right.clone().negate(), 1.4, G.WORLD);
    if (!hR) return right;
    if (!hL) return right.negate();
    return right.multiplyScalar(this.strafeDir);
  }

  shoot() {
    const target = this.target;
    if (!target || !target.alive) return;
    const from = this.eye;
    const to = target.isPlayer
      ? new THREE.Vector3(target.position.x, target.position.y + 1.35, target.position.z)
      : new THREE.Vector3(target.position.x, target.position.y + 1.25, target.position.z);
    const dir = to.sub(from).normalize();
    // Accuracy falls with range; bots intentionally imperfect.
    const dist = from.distanceTo(target.position);
    const spread = 0.008 + dist * 0.00016 + (this.aimTime < this.reaction ? 0.02 : 0);
    dir.x += rand(-spread, spread);
    dir.y += rand(-spread * 0.7, spread * 0.8);
    dir.z += rand(-spread, spread);
    dir.normalize();
    const muzzle = from.clone().addScaledVector(dir, 0.6);
    this.game.spawnProjectile({
      origin: muzzle, dir, speed: 760, damage: this.team === 1 ? 16 : 13,
      owner: this, team: this.team, kind: this.team === 1 ? 'm1' : 'type38',
    });
    const cam = this.game.renderer.camera;
    const pan = this._panTo(cam);
    this.model.shoot?.();
    this.game.audio.shot(this.team === 1 ? 'm1' : 'type38', { dist, pan });
    this.game.effects.botMuzzle(this.model.muzzle, dir);
    this.aiming = true;
  }

  _panTo(cam) {
    const v = this.position.clone().sub(cam.position).normalize();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    return clamp(v.dot(right), -1, 1);
  }

  damage(amount, attacker, info = {}) {
    if (!this.alive) return;
    this.health -= amount;
    this.lastDamageTime = this.time;
    this.lastAttacker = attacker;
    if (attacker && attacker.alive) {
      this.target = attacker;
      this.targetSeenAt = this.time;
    }
    this.game.effects.blood(this.eye, new THREE.Vector3(rand(-0.4, 0.4), 0.2, rand(-0.4, 0.4)));
    if (this.health <= 0) this.die(attacker, info);
  }

  die(attacker, info = {}) {
    if (!this.alive) return;
    this.alive = false;
    this.deadT = 0;
    this.health = 0;
    this.model.setDead();
    this.game.physics.world.removeCollider(this.collider);
    this.collider = null;
    this.game.onActorKilled(this, attacker, info);
  }

  respawn(position, yaw) {
    this.alive = true;
    this.deadT = 0;
    this.health = this.maxHealth;
    this.position.copy(position);
    this.yaw = yaw;
    this.target = null;
    this.aiming = false;
    this.fireTimer = rand(0.8, 2);
    if (this.model.reset) {
      this.model.reset();
    } else {
      this.model.dead = false;
      this.model.deadT = 0;
      this.model.group.rotation.z = 0;
      this.model.group.visible = true;
    }
    this.model.setPosition(position.x, position.y, position.z, yaw);
    const R = this.game.physics.R;
    if (!this.collider) {
      this.collider = this.game.physics.world.createCollider(
        R.ColliderDesc.capsule(0.5, 0.35)
          .setTranslation(position.x, position.y + 0.9, position.z)
          .setCollisionGroups(groups(G.BOT, G.WORLD | G.PLAYER | G.BOT)),
      );
      this.game.physics.tag(this.collider, { actor: this, team: this.team, surface: 'flesh' });
    } else {
      this.collider.setTranslation({ x: position.x, y: position.y + 0.9, z: position.z });
    }
  }

  dispose() {
    if (this.model.dispose) this.model.dispose();
    else this.game.worldGroup.remove(this.model.group);
    if (this.collider) {
      this.game.physics.world.removeCollider(this.collider);
      this.collider = null;
    }
  }
}
