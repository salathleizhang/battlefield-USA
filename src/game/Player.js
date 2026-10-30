import * as THREE from 'three';
import { G } from '../core/Physics.js';
import { clamp, damp, DEG, Spring, rand } from '../core/MathUtil.js';

export const MOVE = {
  walk: 4.7,
  sprint: 7.3,
  crouch: 2.3,
  accel: 11,
  friction: 7.5,
  airAccel: 2.2,
  gravity: 22,
  jumpSpeed: 6.4,
  radius: 0.35,
  standHeight: 1.8,
  crouchHeight: 1.2,
  eyeStand: 1.62,
  eyeCrouch: 1.04,
};

const _v = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.physics = game.physics;
    this.team = 0;
    this.name = '战士';
    this.isPlayer = true;
    this.maxHealth = 100;
    this.health = 100;
    this.alive = true;
    this.position = new THREE.Vector3(); // feet
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.crouching = false;
    this.sprinting = false;
    this.aiming = false;
    this.grounded = false;
    this.height = MOVE.standHeight;
    this.eyeHeight = MOVE.eyeStand;
    this.stepDist = 0;
    this.bob = 0;
    this.bobAmount = 0;
    this.lastDamage = -99;
    this.spawnProtect = 0;
    this.deathTime = 0;
    this.trauma = 0;
    this.time = 0;
    this.lean = 0;
    this.recoilPitch = new Spring(150, 0.85, 0);
    this.recoilYaw = new Spring(120, 0.9, 0);
    this.stanceBlend = 0;
    this.surface = 'dirt';
    this.footPhase = 0;
    this._moved = 0;

    const hh = (MOVE.standHeight - 2 * MOVE.radius) / 2;
    const { collider, kcc } = this.physics.makeCharacter(MOVE.radius, hh, 5);
    this.collider = collider;
    this.kcc = kcc;
    this.physics.tag(collider, { actor: this, team: 0, surface: 'flesh' });
  }

  get eye() {
    return _v.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  spawn(pos, yaw = 0) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.alive = true;
    this.crouching = false;
    this.sprinting = false;
    this.aiming = false;
    this.height = MOVE.standHeight;
    this.eyeHeight = MOVE.eyeStand;
    this.collider.setHalfHeight((MOVE.standHeight - 2 * MOVE.radius) / 2);
    this._syncBody();
    this.spawnProtect = 1.5;
    this.lastDamage = -99;
    this.recoilPitch.snap(0);
    this.recoilYaw.snap(0);
    this.trauma = 0;
    this.syncCamera(0, true);
  }

  _syncBody() {
    this.collider.setTranslation({
      x: this.position.x,
      y: this.position.y + this.height / 2,
      z: this.position.z,
    });
  }

  canStand() {
    const hh = (MOVE.standHeight - 2 * MOVE.radius) / 2;
    let blocked = false;
    this.physics.world.intersectionsWithShape(
      { x: this.position.x, y: this.position.y + MOVE.standHeight / 2 + 0.02, z: this.position.z },
      { x: 0, y: 0, z: 0, w: 1 },
      new this.physics.R.Capsule(hh, MOVE.radius),
      () => { blocked = true; return false; },
      undefined, (0xffff << 16) | G.WORLD, this.collider,
    );
    return !blocked;
  }

  look(dx, dy, sens = 1) {
    this.yaw -= dx * 0.0022 * sens;
    this.pitch -= dy * 0.0022 * sens;
    this.pitch = clamp(this.pitch, -88 * DEG, 88 * DEG);
  }

  addRecoil(pitchKick, yawKick) {
    this.recoilPitch.impulse(pitchKick);
    this.recoilYaw.impulse(yawKick);
    this.trauma = Math.min(0.6, this.trauma + 0.12);
  }

  addTrauma(t) { this.trauma = Math.min(1, this.trauma + t); }

  update(dt, cmd, weapon) {
    this.time += dt;
    if (!this.alive) { this.deathTime += dt; return; }
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.aiming = !!cmd.aim && !this.sprinting;

    // Sprint / crouch.
    const wantSprint = cmd.sprint && cmd.moveY > 0.4 && !cmd.aim && !this.crouching;
    this.sprinting = wantSprint;
    if (cmd.crouchPressed) {
      if (this.crouching) { if (this.canStand()) this.crouching = false; }
      else this.crouching = true;
    }
    if (cmd.sprint && this.crouching && cmd.moveY > 0.4 && this.canStand()) this.crouching = false;

    // Look direction basis.
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, cmd.moveY).addScaledVector(right, cmd.moveX);
    if (wish.lengthSq() > 1) wish.normalize();

    let maxSpeed = this.crouching ? MOVE.crouch : this.sprinting ? MOVE.sprint : MOVE.walk;
    if (this.aiming) maxSpeed *= 0.55;
    if (cmd.moveY < -0.1) maxSpeed *= 0.86;
    if (weapon?.mobility) maxSpeed *= weapon.mobility();

    const vh = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    if (this.grounded) {
      // Friction.
      const speed = vh.length();
      if (speed > 0) {
        const drop = Math.max(speed, 2.5) * MOVE.friction * dt;
        const k = Math.max(0, speed - drop) / speed;
        vh.multiplyScalar(k);
      }
      // Accelerate.
      const cur = vh.dot(wish);
      const add = maxSpeed - cur;
      if (add > 0) {
        const accel = Math.min(MOVE.accel * maxSpeed * dt, add);
        vh.addScaledVector(wish, accel);
      }
    } else {
      const cur = vh.dot(wish);
      const add = Math.min(maxSpeed, 1.2) - cur;
      if (add > 0) vh.addScaledVector(wish, Math.min(MOVE.airAccel * dt * 8, add));
    }
    this.velocity.x = vh.x;
    this.velocity.z = vh.z;

    if (this.grounded && cmd.jumpPressed) {
      this.velocity.y = MOVE.jumpSpeed;
      this.grounded = false;
      this.game.audio.step('dirt');
    }
    this.velocity.y -= MOVE.gravity * dt;

    // Character controller move.
    const desired = {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    };
    this.kcc.computeColliderMovement(this.collider, desired);
    const m = this.kcc.computedMovement();
    this.position.x += m.x;
    this.position.y += m.y;
    this.position.z += m.z;
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.velocity.y < 0) this.velocity.y = -1.0;
    this._syncBody();

    // Crouch height.
    const targetH = this.crouching ? MOVE.crouchHeight : MOVE.standHeight;
    if (Math.abs(targetH - this.height) > 1e-3) {
      this.height = damp(this.height, targetH, 14, dt);
      this.collider.setHalfHeight(Math.max(0.05, (this.height - 2 * MOVE.radius) / 2));
      this._syncBody();
    }
    this.stanceBlend = damp(this.stanceBlend, this.crouching ? 1 : 0, 10, dt);
    const targetEye = this.crouching ? MOVE.eyeCrouch : MOVE.eyeStand;
    this.eyeHeight = damp(this.eyeHeight, targetEye, 12, dt);

    // Footsteps & bob.
    const hspeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.bobAmount = damp(this.bobAmount, this.grounded ? Math.min(1, hspeed / MOVE.walk) : 0, 8, dt);
    this.footPhase += dt * (2.2 + hspeed * 1.35);
    if (this.grounded && hspeed > 0.7) {
      this._moved += hspeed * dt;
      if (this._moved > (this.sprinting ? 2.6 : 2.0)) {
        this._moved = 0;
        const hit = this.physics.raycast(
          { x: this.position.x, y: this.position.y + 0.9, z: this.position.z },
          { x: 0, y: -1, z: 0 }, 1.6, G.WORLD,
        );
        this.surface = hit?.data?.surface || 'dirt';
        this.game.audio.step(this.surface);
        this.game.hud?.footstepPulse?.();
      }
    }

    // Water / void death.
    if (this.position.y < -6) this.die(null, 'fall');

    // Slow regeneration out of combat.
    if (this.time - this.lastDamage > 7 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 9 * dt);
    }

    this.recoilPitch.update(dt);
    this.recoilYaw.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.syncCamera(dt);
  }

  syncCamera(dt, snap = false) {
    const cam = this.game.renderer.camera;
    cam.rotation.order = 'YXZ';
    if (!this.alive) {
      // Death cam: sink and roll.
      const t = Math.min(1, this.deathTime / 1.4);
      cam.position.set(this.position.x, this.position.y + 0.55, this.position.z);
      cam.rotation.set(-0.18 * t, this.yaw, 0.34 * t);
      cam.fov = 76;
      cam.updateProjectionMatrix();
      return;
    }
    const bobAmt = this.bobAmount * (this.sprinting ? 1.5 : 1);
    const bobY = Math.sin(this.footPhase * 2) * 0.028 * bobAmt;
    const bobX = Math.cos(this.footPhase) * 0.035 * bobAmt;
    const shake = this.trauma * this.trauma;
    const sx = (Math.sin(this.time * 47.3) + Math.sin(this.time * 91.7) * 0.5) * shake * 0.035;
    const sy = (Math.sin(this.time * 53.1) + Math.sin(this.time * 83.3) * 0.5) * shake * 0.035;
    const roll = Math.cos(this.footPhase) * 0.006 * bobAmt + sx * 0.5;

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const eye = new THREE.Vector3(
      this.position.x + right.x * bobX,
      this.position.y + this.eyeHeight + bobY,
      this.position.z + right.z * bobX,
    );
    if (snap) cam.position.copy(eye); else cam.position.lerp(eye, 1 - Math.exp(-28 * dt));

    const targetFov = this.aiming ? 54 : this.sprinting ? 82 : 76;
    cam.fov = snap ? targetFov : damp(cam.fov, targetFov, 10, dt);
    cam.rotation.set(
      this.pitch + this.recoilPitch.x + sy,
      this.yaw + this.recoilYaw.x + sx,
      roll,
    );
    cam.updateProjectionMatrix();
    this.game.renderer.sun.target.position.copy(this.position);
  }

  damage(amount, attacker = null, info = {}) {
    if (!this.alive || this.spawnProtect > 0 || this.game.debug?.god) return;
    this.health -= amount;
    this.lastDamage = this.time;
    this.addTrauma(0.35);
    this.game.audio.hurt();
    this.game.hud?.damage(attacker, info);
    if (this.health <= 0) this.die(attacker, info.weapon || 'rifle');
  }

  die(attacker, weapon) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.deathTime = 0;
    this.velocity.set(0, 0, 0);
    this.game.onPlayerKilled(attacker, weapon);
  }

  dispose() {
    if (this.collider) this.physics.world.removeCollider(this.collider);
  }
}
