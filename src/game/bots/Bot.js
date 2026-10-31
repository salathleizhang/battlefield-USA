import * as THREE from 'three';
import { G, groups } from '../../core/Physics.js';
import { SoldierModel } from './SoldierModel.js';
import { equipBotGun, updateBotGun, botGunFire } from './BotGun.js';
import { clamp, damp, rand, randInt, pick } from '../../core/MathUtil.js';

const US_NAMES = ['米勒', '卡特', '沃克', '布朗', '戴维斯', '汤普森', '里德', '霍华德', '肖', '格雷'];
const CN_NAMES = ['铁柱', '二牛', '长胜', '德福', '青山', '大勇', '红军', '志远', '海生', '建国'];

/**
 * Difficulty presets (reference DIFFICULTY table, retuned for our aim model):
 * reaction range before the first shot, spread multiplier, and pause between shots.
 */
export const DIFFICULTY = {
  recruit: { label: '新兵', react: [0.55, 0.95], spread: 1.5, fireGap: 1.3 },
  regular: { label: '常规', react: [0.3, 0.62], spread: 1.0, fireGap: 1.0 },
  hardened: { label: '老兵', react: [0.22, 0.42], spread: 0.8, fireGap: 0.85 },
  veteran: { label: '精锐', react: [0.15, 0.3], spread: 0.65, fireGap: 0.72 },
};

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
    this.grenades = 1;
    this.grenadeCd = rand(8, 16);
    this.jumpY = 0;
    this.jumpV = 0;
    this.jumpCd = 0;
    // A* route (see NavGrid): waypoints to follow when the target is behind geometry.
    this.path = null;
    this.pathIndex = 0;
    this.pathGoal = null;
    this.repathT = 0;
    this.clip = team === 1 ? 8 : 5;
    this.perceptT = rand(0, 0.25);
    this.aimTime = 0;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeT = rand(1, 3);
    this.stuckT = 0;
    this.deadT = 0;
    this.spawnPos = position.clone();
    this.spawnYaw = yaw;
    this.difficulty = DIFFICULTY[game.difficulty] || DIFFICULTY.regular;
    this.accuracy = this.difficulty.spread;
    this.reaction = rand(...this.difficulty.react);
    // Fog is a real visibility limit, not just a filter: a campaign can cap how
    // far a rifleman picks a target out of the murk.
    this.sightRange = Math.min(140, game.campaign?.env?.visibility ?? 140);
    this.lastDamageTime = -99;
    this.time = 0;
    this.aiming = false;
    this.desired = new THREE.Vector3();
    // Hearing and suppression: a rifleman reacts to noise and to rounds cracking past.
    this.suppression = 0;
    this.heardPos = null;
    this.heardAt = -99;
    this.lastSuppressedBy = null;
    this.coverPos = null;
    this.coverHoldUntil = 0;
    this.coverNextAt = 0;

    this.model = (game.characters && game.characters.ready)
      ? game.characters.create(team, variant)
      : new SoldierModel(team, game.materials);
    if (!this.model) this.model = new SoldierModel(team, game.materials);
    this.model.setPosition(position.x, position.y, position.z, yaw);
    game.worldGroup.add(this.model.group);
    // Reference-project gun models instead of the character pack's low-poly rifle.
    equipBotGun(this.model, team === 0 ? 'ak47' : 'm4a1');

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
    if (dist > this.sightRange) return false;
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

  /** Footsteps / gunfire give away a position even through cover. */
  hear(actor, pos) {
    if (!this.alive || !actor || actor === this || actor.team === this.team) return;
    if (!pos) return;
    this.heardPos = pos.clone();
    this.heardAt = this.time;
  }

  /** Rounds cracking past: flinch, then tighten up or keep their heads down. */
  onSuppressed(by, amount = 0.5) {
    if (!this.alive) return;
    this.suppression = Math.min(1, this.suppression + amount * 0.25);
    if (by) {
      this.lastSuppressedBy = by;
      this.hear(by, by.position);
      // A near miss re-acquires the shooter's direction but still needs a look.
      if (!this.target && this.suppression > 0.45) { this.target = by; this.aimTime = 0; }
    }
  }

  /** A spot nearby where enemy fire can't reach the chest, but a standing peek can shoot back. */
  findCover() {
    const threat = this.target?.position;
    if (!threat) return null;
    const threatEye = new THREE.Vector3(threat.x, threat.y + 1.5, threat.z);
    let best = null, bestS = -Infinity;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand(-0.2, 0.2);
      const r = rand(3, 11);
      const x = this.position.x + Math.cos(a) * r;
      const z = this.position.z + Math.sin(a) * r;
      const gh = this.game.physics.raycast({ x, y: this.position.y + 2, z }, { x: 0, y: -1, z: 0 }, 7, G.WORLD);
      if (!gh) continue;
      const y = gh.point.y;
      if (y > this.position.y + 1.5 || y < this.position.y - 3) continue;
      const chest = new THREE.Vector3(x, y + 1.0, z);
      if (this.game.physics.lineOfSight(threatEye, chest)) continue; // still exposed
      const peek = this.game.physics.lineOfSight(threatEye, new THREE.Vector3(x, y + 1.6, z));
      const dt = chest.distanceTo(threatEye);
      const s = (peek ? 3 : 0) - r * 0.2 - Math.abs(dt - 18) * 0.1;
      if (s > bestS) { bestS = s; best = new THREE.Vector3(x, y, z); }
    }
    return best;
  }

  update(dt) {
    this.time += dt;
    if (!this.alive) { this.deadT += dt; this.model.update(dt, 0, false, false); return; }
    this.suppression = Math.max(0, this.suppression - dt * 0.4);

    this.perceptT -= dt;
    if (this.perceptT <= 0) {
      this.perceptT = 0.22 + Math.random() * 0.16;
      const seen = this.findTarget();
      if (seen) {
        if (this.target !== seen) { this.aimTime = 0; this.reaction = rand(...this.difficulty.react); }
        this.target = seen;
        this.targetSeenAt = this.time;
        this.lastSeenPos.copy(seen.position);
      } else if (this.time - this.targetSeenAt > 4) {
        this.target = null;
      }
      // Hearing: the player's noise radius reaches this bot.
      const pl = this.game.player;
      if (pl?.alive && pl.team !== this.team && pl.noise > 0
        && this.position.distanceTo(pl.position) < pl.noise) {
        this.hear(pl, pl.position);
      }
    }

    this.fireTimer -= dt;
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);
    this.jumpCd = Math.max(0, this.jumpCd - dt);
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
      // Keep distance / strafe — unless pinned down or hurt, then break line of sight.
      const hp = this.health / this.maxHealth;
      const pinned = this.suppression > 0.55 || hp < 0.45 || (this.clip <= 1 && this.team === 1);
      if (pinned && !this.coverPos && this.time > this.coverNextAt) {
        this.coverPos = this.findCover();
        // Failed searches wait a moment too: 14 probe rays are not a per-frame cost.
        this.coverNextAt = this.time + (this.coverPos ? 2 : 3);
        this.coverHoldUntil = this.time + 2.5;
      }
      if (this.coverPos) {
        const toCover = this.coverPos.distanceTo(this.position);
        if (toCover > 1.3) { moveTarget = this.coverPos; speed = 3.2; }
        else if (!pinned && this.time > this.coverHoldUntil) {
          this.coverPos = null;
          this.coverNextAt = this.time + 5;
        }
      } else {
        const flat = new THREE.Vector3(toTarget.x, 0, toTarget.z).normalize();
        const right = new THREE.Vector3(-flat.z, 0, flat.x);
        if (dist > 55) moveTarget = this.position.clone().addScaledVector(flat, 4);
        else if (dist < 16) moveTarget = this.position.clone().addScaledVector(flat, -3);
        else moveTarget = this.position.clone().addScaledVector(right, this.strafeDir * 3);
        speed = 1.9;
      }
      // Reaction time gates the first shot, and incoming fire makes the aim wobble.
      if (this.fireTimer <= 0 && dist < 120 && this.aimTime >= this.reaction && this.suppression < 0.75) {
        this.fireTimer = rand(1.15, 2.3) / (this.team === 1 ? 1.12 : 1);
        this.fireTimer *= this.difficulty.fireGap * (1 + this.suppression);
        this.shoot();
      }
    } else {
      this.state = this.objective ? 'advance' : 'patrol';
      this.aiming = false;
      // Something was heard: sweep toward it before going back to the objective.
      const heard = this.heardPos && this.time - this.heardAt < 6;
      if (heard) {
        this.state = 'search';
        const d = Math.hypot(this.heardPos.x - this.position.x, this.heardPos.z - this.position.z);
        if (d > 2.5) { moveTarget = this.heardPos; speed = 2.9; }
        else {
          const yaw = Math.atan2(-(this.heardPos.x - this.position.x), -(this.heardPos.z - this.position.z));
          this.yaw = this._turn(this.yaw, yaw, dt, 2.5);
        }
      }
      if (this.objective && !heard) {
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
      // Lob a grenade at where an enemy just disappeared.
      const sinceSeen = this.time - this.targetSeenAt;
      const dSeen = this.lastSeenPos.distanceTo(this.position);
      if (this.grenades > 0 && this.grenadeCd <= 0
        && sinceSeen < 3.5 && dSeen > 8 && dSeen < 28) {
        this.grenades--;
        this.grenadeCd = 25;
        this.game.throwBotGrenade(this, this.eye, this.lastSeenPos.clone());
      }
    }

    // Movement + simple obstacle avoidance.
    let moved = 0;
    if (moveTarget) {
      const navTarget = this._navTarget(moveTarget, dt);
      const dir = navTarget.clone().sub(this.position);
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
        // Hop low obstacles (sandbag rows, crates) instead of grinding against them.
        if (this.jumpY <= 0 && this.jumpCd <= 0) {
          const knee = this.game.physics.raycast(
            { x: this.position.x, y: this.position.y + 0.35, z: this.position.z }, dir, 0.9, G.WORLD,
          );
          const chest = this.game.physics.raycast(
            { x: this.position.x, y: this.position.y + 1.25, z: this.position.z }, dir, 0.9, G.WORLD,
          );
          if (knee && (!chest || chest.distance > knee.distance + 0.25)) {
            this.jumpV = 4.4;
            this.jumpY = 0.02;
            this.jumpCd = 1.4;
          }
        }
        this.stuckT += dt;
        if (this.stuckT > 2.5) { this.strafeDir *= -1; this.stuckT = 0; }
      }
    }

    // Jump arc, then ground clamp via raycast.
    if (this.jumpY > 0 || this.jumpV > 0) {
      this.jumpV -= 16 * dt;
      this.jumpY += this.jumpV * dt;
      if (this.jumpY <= 0) { this.jumpY = 0; this.jumpV = 0; }
    }
    const ground = this.game.physics.raycast(
      { x: this.position.x, y: this.position.y + 2.2, z: this.position.z },
      { x: 0, y: -1, z: 0 }, 8, G.WORLD,
    );
    if (ground) {
      if (this.jumpY > 0) this.position.y = ground.point.y + this.jumpY;
      else this.position.y = damp(this.position.y, ground.point.y, 16, dt);
    } else this.position.y -= 9 * dt;

    // Keep inside map bounds.
    const b = this.game.level.bounds;
    this.position.x = clamp(this.position.x, b.minX + 4, b.maxX - 4);
    this.position.z = clamp(this.position.z, b.minZ + 4, b.maxZ - 4);

    this.collider.setTranslation({ x: this.position.x, y: this.position.y + 0.9, z: this.position.z });
    this.model.setPosition(this.position.x, this.position.y, this.position.z, this.yaw);
    this.model.update(dt, moved, this.aiming, true);
    updateBotGun(this, dt);

    if (this.position.y < -8) this.die(null);
  }

  /**
   * Steering point for this frame: the goal itself when a straight walk works,
   * otherwise the next waypoint of an A* route (recomputed about once a second).
   */
  _navTarget(goal, dt) {
    const nav = this.game.nav;
    this.repathT -= dt;
    if (!nav || this.position.distanceTo(goal) < 10) {
      this.path = null;
      this.pathGoal = null;
      return goal;
    }
    if (this.pathGoal && this.pathGoal.distanceTo(goal) > 5) this.path = null;
    if ((!this.path || !this.path.length) && this.repathT <= 0) {
      this.path = nav.findPath(this.position, goal);
      this.pathIndex = 0;
      this.pathGoal = goal.clone();
      this.repathT = 1 + Math.random() * 0.7;
    }
    if (!this.path || !this.path.length) return goal;
    while (this.pathIndex < this.path.length
      && this.position.distanceTo(this.path[this.pathIndex]) < 1.0) this.pathIndex++;
    return this.path[this.pathIndex] || goal;
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

  /** Chest-height point on the current target the rifle is lined up with (and shoots at). */
  aimPoint(out = new THREE.Vector3()) {
    const t = this.target;
    if (!t?.position) return out.copy(this.eye);
    return out.set(t.position.x, t.position.y + (t.isPlayer ? 1.35 : 1.25), t.position.z);
  }

  shoot() {
    const target = this.target;
    if (!target || !target.alive) return;
    const from = this.eye;
    const to = this.aimPoint(new THREE.Vector3());
    const dir = to.sub(from).normalize();
    // Accuracy falls with range; bots intentionally imperfect.
    const dist = from.distanceTo(target.position);
    const spread = (0.008 + dist * 0.00016 + (this.aimTime < this.reaction ? 0.02 : 0)
      + this.suppression * 0.022) * this.accuracy;
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
    botGunFire(this);
    // The Garand's en-bloc clip pings when the eighth round leaves the rifle.
    let empty = false;
    if (this.team === 1) {
      this.clip -= 1;
      empty = this.clip <= 0;
      if (empty) this.clip = 8;
    }
    this.game.audio.shot(this.team === 1 ? 'm1' : 'type38', { dist, pan, empty });
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
    this.suppression = Math.min(1, this.suppression + 0.4);
    if (attacker && attacker.alive) {
      this.target = attacker;
      this.targetSeenAt = this.time;
      this.lastSeenPos.copy(attacker.position);
      this.aimTime = 0;
    }
    this.game.effects.blood(this.eye, new THREE.Vector3(rand(-0.4, 0.4), 0.2, rand(-0.4, 0.4)));
    if (this.health > 0) this.model.hit?.(!!info.headshot);
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
    this.grenades = 1;
    this.grenadeCd = rand(8, 16);
    this.jumpY = 0;
    this.jumpV = 0;
    this.jumpCd = 0;
    this.path = null;
    this.pathIndex = 0;
    this.pathGoal = null;
    this.repathT = 0;
    this.suppression = 0;
    this.heardPos = null;
    this.heardAt = -99;
    this.coverPos = null;
    this.coverHoldUntil = 0;
    this.coverNextAt = 0;
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
