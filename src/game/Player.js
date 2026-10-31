import * as THREE from 'three';
import { G } from '../core/Physics.js';
import {
  clamp, damp, DEG, Spring, rand, smoothstep, easeOutCubic,
} from '../core/MathUtil.js';
import { AimRecoil } from './AimRecoil.js';
import { sampleCurve, CAM_CURVES } from './CamCurves.js';

export const MOVE = {
  walk: 4.7,
  slowWalk: 2.4,
  sprint: 7.3,
  tacSprint: 8.7,
  crouch: 2.3,
  accel: 11,
  friction: 7.5,
  airAccel: 2.2,
  airWishCap: 1.2,
  gravity: 22,
  jumpHeight: 1.05,
  radius: 0.35,
  standHeight: 1.8,
  crouchHeight: 1.2,
  slideHeight: 1.0,
  eyeStand: 1.62,
  eyeCrouch: 1.04,
  eyeSlide: 0.9,
  // Q/E lean: how far the head slides sideways and how far the camera rolls.
  leanAngle: 12 * DEG,
  leanOffset: 0.35,
  stepHeight: 0.45,
  vaultMax: 1.28,
  tacSprintDuration: 4.5,
  tacSprintRecharge: 12,
  slideBoost: 8.2,
  slideFriction: 1.6,
  slideMinSpeed: 3.2,
  slideCooldown: 0.7,
  slideDuration: 1.4,
  stopSpeed: 2.5,
};

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

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
    this.sliding = false;
    this.sprinting = false;
    this.tacSprint = false;
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
    this.leanSmoothed = 0;
    // True recoil lives in the aim angles; these springs only punch the camera.
    this.aimRecoil = new AimRecoil();
    this.kickPitch = new Spring(150, 0.85, 0);
    this.kickYaw = new Spring(120, 0.9, 0);
    this.stanceBlend = 0;
    this.surface = 'dirt';
    this.footPhase = 0;
    this._moved = 0;

    // Movement extras: tactical sprint, slide, mantle, step/landing smoothing.
    this.events = {};
    this.tacSprintTime = MOVE.tacSprintDuration;
    this.lastSprintTap = -1;
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.slideSide = 1;
    this.jumpChain = 0;
    this.lastJumpTime = -99;
    this.lastGroundedTime = 0;
    this.airTime = 0;
    this.stepOffset = 0;
    this.landDip = 0;
    this.noise = 0;
    this.mantle = null;
    this.moveIntent = new THREE.Vector2();
    // Baked head-motion layers (landing, slide, mantle) added on top of the true view.
    this.landCurve = null;
    this.slideT = -1;
    this.slideExitT = -1;
    this.curve = [0, 0, 0, 0, 0, 0];

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
    this.sliding = false;
    this.sprinting = false;
    this.tacSprint = false;
    this.tacSprintTime = MOVE.tacSprintDuration;
    this.aiming = false;
    this.lean = 0;
    this.mantle = null;
    this.slideCooldown = 0;
    this.stepOffset = 0;
    this.landDip = 0;
    this.landCurve = null;
    this.slideT = -1;
    this.slideExitT = -1;
    this.curve.fill(0);
    this.height = MOVE.standHeight;
    this.eyeHeight = MOVE.eyeStand;
    this.collider.setHalfHeight((MOVE.standHeight - 2 * MOVE.radius) / 2);
    this._syncBody();
    this.spawnProtect = 1.5;
    this.lastDamage = -99;
    this.kickPitch.snap(0);
    this.kickYaw.snap(0);
    this.aimRecoil.reset();
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

  /** Crouch / slide capsule height, clamped to something Rapier can digest. */
  _setHeight(h) {
    h = clamp(h, 2 * MOVE.radius + 0.1, 4);
    if (Math.abs(h - this.height) < 1e-3) return;
    this.height = h;
    this.collider.setHalfHeight(Math.max(0.05, (h - 2 * MOVE.radius) / 2));
    this._syncBody();
  }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(out = new THREE.Vector3()) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

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
    const p0 = this.pitch, y0 = this.yaw;
    this.yaw -= dx * 0.0022 * sens;
    this.pitch -= dy * 0.0022 * sens;
    // In a tank the view is the commander's/gunner's: you cannot crane your
    // neck through the roof, and the gun's own limits are tighter still.
    const driving = !!this.game.playerVehicle;
    this.pitch = clamp(this.pitch, (driving ? -22 : -88) * DEG, (driving ? 34 : 88) * DEG);
    // Pulling down against the climb uses up the part that would settle back.
    this.aimRecoil.look(this.pitch - p0, this.yaw - y0);
  }

  addRecoil(pitchKick, yawKick) {
    this.aimRecoil.add(pitchKick, yawKick);
    this.kickPitch.impulse(pitchKick * 0.35);
    this.kickYaw.impulse(yawKick * 0.35);
    this.trauma = Math.min(0.6, this.trauma + 0.12);
  }

  addTrauma(t) { this.trauma = Math.min(1, this.trauma + t); }

  update(dt, cmd, weapon) {
    this.time += dt;
    if (!this.alive) { this.deathTime += dt; return; }
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.stepOffset = damp(this.stepOffset, 0, 16, dt);
    this.landDip = damp(this.landDip, 0, 9, dt);

    // True recoil eases into the aim angles; the camera kick springs are separate.
    if (!this.mantle) {
      const rc = this.aimRecoil.update(dt, {
        time: this.time,
        lastShot: weapon?.lastShot ?? -9,
        recoveryMul: weapon?.def?.recoveryMul ?? 1,
      });
      this.pitch = clamp(this.pitch + rc.dp, -88 * DEG, 88 * DEG);
      this.yaw += rc.dy;
    }

    if (this.mantle) { this._updateMantle(dt); this._finish(dt); return; }

    const fwd = this.forward(new THREE.Vector3());
    const right = this.right(new THREE.Vector3());
    const wish = new THREE.Vector3().addScaledVector(fwd, cmd.moveY).addScaledVector(right, cmd.moveX);
    if (wish.lengthSq() > 1) wish.normalize();
    this.moveIntent.set(cmd.moveX, cmd.moveY);

    // -------------------------------------------------- sprint / tactical sprint
    const movingForward = cmd.moveY > 0.5;
    if (cmd.sprintPressed) {
      if (this.time - this.lastSprintTap < 0.3 && this.tacSprintTime > 0.5) this.tacSprint = true;
      this.lastSprintTap = this.time;
    }
    const wantSprint = cmd.sprint && movingForward && !cmd.aim && !this.crouching;
    if (!wantSprint) this.tacSprint = false;
    this.sprinting = wantSprint && (this.grounded || this.sprinting);
    this.aiming = !!cmd.aim && !this.sprinting;
    if (this.tacSprint && this.sprinting) {
      this.tacSprintTime -= dt;
      if (this.tacSprintTime <= 0) this.tacSprint = false;
    } else {
      this.tacSprintTime = Math.min(MOVE.tacSprintDuration,
        this.tacSprintTime + dt * (MOVE.tacSprintDuration / MOVE.tacSprintRecharge));
    }

    // -------------------------------------------------- crouch / slide
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const slideReady = (this.sprinting || (cmd.sprint && movingForward && !this.crouching))
      && (this.grounded || this.time - this.lastGroundedTime < 0.12)
      && horizSpeed > MOVE.sprint * 0.75 * (weapon?.mobility?.() ?? 1)
      && this.slideCooldown <= 0;
    if (cmd.crouchPressed && slideReady) {
      this._startSlide(fwd);
    } else if (cmd.crouchPressed && !this.sliding) {
      if (this.crouching) { if (this.canStand()) this.crouching = false; }
      else this.crouching = true;
    }
    if (cmd.sprint && this.crouching && movingForward && !this.sliding && this.canStand()) this.crouching = false;

    // -------------------------------------------------- jump / vault / mantle
    const coyote = this.time - this.lastGroundedTime < 0.15;
    if (cmd.jumpPressed) {
      if (this.tryMantle(true)) { this._finish(dt); return; }
      if (this.sliding) {
        this._endSlide();
        this._jump(1.0);
      } else if (this.grounded || coyote) {
        if (this.crouching) { if (this.canStand()) this.crouching = false; }
        else this._jump();
      }
    } else if (!this.grounded && cmd.jumpHeld && movingForward && this.velocity.y < 2) {
      // Auto-mantle while airborne and pushing forward against a ledge.
      if (this.tryMantle(false)) { this._finish(dt); return; }
    }

    // -------------------------------------------------- velocity
    let maxSpeed;
    if (this.sliding) maxSpeed = 0;
    else if (this.crouching) maxSpeed = MOVE.crouch;
    else if (this.sprinting) maxSpeed = this.tacSprint ? MOVE.tacSprint : MOVE.sprint;
    else if (cmd.walk) maxSpeed = MOVE.slowWalk;
    else maxSpeed = MOVE.walk;
    if (this.aiming) maxSpeed *= 0.55;
    if (cmd.moveY < -0.1) maxSpeed *= 0.86;
    if (weapon?.mobility) maxSpeed *= weapon.mobility();

    const vh = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    if (this.grounded) {
      if (this.sliding) {
        this._updateSlide(dt, vh);
      } else {
        this._friction(vh, MOVE.friction, dt);
        this._accelerate(vh, wish, maxSpeed, MOVE.accel, dt);
      }
    } else {
      // Air control: limited wish speed, but enough accel to nudge the arc.
      const wishSpeed = Math.min(maxSpeed, MOVE.airWishCap);
      this._accelerate(vh, wish, wishSpeed, MOVE.airAccel * 8, dt, maxSpeed);
    }
    this.velocity.x = vh.x;
    this.velocity.z = vh.z;
    this.velocity.y -= MOVE.gravity * dt * 0.5;

    // -------------------------------------------------- capsule height / eye
    const targetH = this.sliding ? MOVE.slideHeight : this.crouching ? MOVE.crouchHeight : MOVE.standHeight;
    if (Math.abs(targetH - this.height) > 1e-3) this._setHeight(damp(this.height, targetH, 14, dt));
    this.stanceBlend = damp(this.stanceBlend, this.crouching ? 1 : 0, 10, dt);
    const targetEye = this.sliding ? MOVE.eyeSlide : this.crouching ? MOVE.eyeCrouch : MOVE.eyeStand;
    this.eyeHeight = damp(this.eyeHeight, targetEye, 12, dt);

    // -------------------------------------------------- lean (Q/E) with wall check
    let leanT = (cmd.leanRight ? 1 : 0) - (cmd.leanLeft ? 1 : 0);
    if (this.sprinting || this.sliding) leanT = 0;
    if (leanT !== 0) {
      const dir = this.right(new THREE.Vector3()).multiplyScalar(Math.sign(leanT));
      const eye = new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
      const hit = this.physics.raycast(eye, dir, MOVE.leanOffset + 0.25, G.WORLD, this.collider);
      if (hit) leanT *= clamp((hit.distance - 0.25) / MOVE.leanOffset, 0, 1);
    }
    this.lean = damp(this.lean, leanT, 10, dt);

    // -------------------------------------------------- move & react
    this._move(dt);
    if (!this.grounded) this.velocity.y -= MOVE.gravity * dt * 0.5;
    this._footsteps(dt);

    // How loud we are to AI ears (metres).
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    this.noise = !this.grounded ? 4 : this.sprinting ? 20 : (cmd.walk || this.crouching) ? 0 : sp > 1 ? 8 : 0;

    // Water / void death.
    if (this.position.y < -6) this.die(null, 'fall');

    // Slow regeneration out of combat.
    if (this.time - this.lastDamage > 7 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 9 * dt);
    }

    this._finish(dt);
  }

  _finish(dt) {
    this.kickPitch.update(dt);
    this.kickYaw.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this._updateCurves(dt);
    this.syncCamera(dt);
  }

  /**
   * Baked head curves for the moves that carry weight (landing, slide, mantle).
   * Scaled well below the source amplitude so they read as momentum, not nausea.
   */
  _updateCurves(dt) {
    const c = this.curve.fill(0);
    const k = this.game.settings?.reduceMotion ? 0.35 : 1;
    const add = (v, pos, rot, w = 1) => {
      c[0] += v[0] * pos * w; c[1] += v[1] * pos * w; c[2] += v[2] * pos * w;
      c[3] += v[3] * rot * w; c[4] += v[4] * rot * 0.5 * w; c[5] += v[5] * rot * w;
    };
    // Mantle / vault: pull-up arc that looks at the ledge.
    if (this.mantle) add(sampleCurve('ClimbUp_1m', Math.min(1, this.mantle.t)), 0.3 * k, 0.17 * k);

    // Slide: Start → Loop, then Exit as the player stands back up.
    if (this.sliding) {
      if (this.slideT < 0) {
        this.slideT = 0;
        this.slideSide = this.moveIntent.x >= 0 ? 1 : -1;
      }
      this.slideT += dt;
      this.slideExitT = -1;
    } else if (this.slideT >= 0) {
      this.slideT = -1;
      this.slideExitT = 0;
    }
    const ss = CAM_CURVES.Slide_Start;
    const slidePose = (w) => {
      const st = sampleCurve('Slide_Start', Math.min(1, Math.max(this.slideT, 0) / ss.dur), { detrend: false });
      const v = [st[0], 0, st[2], st[3], st[4] * this.slideSide, st[5] * this.slideSide];
      if (this.slideT > ss.dur) {
        const lp = sampleCurve('Slide_Loop', (this.slideT - ss.dur) / CAM_CURVES.Slide_Loop.dur, { detrend: false, loop: true });
        for (let j = 0; j < 6; j++) v[j] += lp[j];
      }
      add(v, 0.1 * k, 0.14 * k, w);
    };
    if (this.slideT >= 0) slidePose(1);
    if (this.slideExitT >= 0) {
      this.slideExitT += dt;
      const ue = this.slideExitT / CAM_CURVES.Slide_Exit.dur;
      if (ue >= 1) this.slideExitT = -1;
      else {
        // Ease the held pose out while the exit curve plays (detrended, so it ends neutral).
        const hold = 1 - ue * ue * (3 - 2 * ue);
        const save = this.slideT;
        this.slideT = 99; slidePose(hold); this.slideT = save;
        const ex = sampleCurve('Slide_Exit', ue);
        add([ex[0], 0, ex[2], ex[3], ex[4] * this.slideSide, ex[5] * this.slideSide], 0.08 * k, 0.1 * k);
      }
    }

    // Landing absorb: knees take it, the head dips and nods, then recovers.
    if (this.landCurve) {
      const L = this.landCurve;
      L.t += dt;
      const u = L.t / CAM_CURVES.NinjaJump_Land.dur;
      if (u >= 1 || this.mantle || this.sliding) this.landCurve = null;
      else add(sampleCurve('NinjaJump_Land', u), 0.22 * L.amp * k, 0.28 * L.amp * k);
    }
  }

  _accelerate(vh, wishDir, wishSpeed, accel, dt, capSpeed = wishSpeed) {
    if (wishDir.lengthSq() < 1e-6) return;
    const dir = _w.copy(wishDir).normalize();
    const cur = vh.dot(dir);
    const add = wishSpeed - cur;
    if (add <= 0) return;
    const accelSpeed = Math.min(accel * Math.max(capSpeed, wishSpeed) * dt, add);
    vh.addScaledVector(dir, accelSpeed);
  }

  _friction(vh, friction, dt) {
    const speed = vh.length();
    if (speed < 0.01) { vh.set(0, 0, 0); return; }
    const drop = Math.max(speed, MOVE.stopSpeed) * friction * dt;
    vh.multiplyScalar(Math.max(speed - drop, 0) / speed);
  }

  _jump(mult = 1) {
    // Anti bunny-hop: repeated jumps lose height.
    if (this.time - this.lastJumpTime < 1) this.jumpChain = Math.min(this.jumpChain + 1, 3);
    else this.jumpChain = 0;
    const h = MOVE.jumpHeight * Math.max(0.6, Math.pow(0.85, this.jumpChain)) * mult;
    this.velocity.y = Math.sqrt(2 * MOVE.gravity * h);
    this.grounded = false;
    this.lastJumpTime = this.time;
    this.lastGroundedTime = -99;
    this.game.audio?.step(this.surface);
    this.events.onJump?.();
  }

  _startSlide(fwd) {
    this.sliding = true;
    this.crouching = true;
    this.slideTimer = 0;
    this.slideSide = this.moveIntent.x >= 0 ? 1 : -1;
    const vh = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    const dir = vh.lengthSq() > 0.1 ? vh.clone().normalize() : fwd.clone();
    const speed = Math.max(vh.length(), MOVE.slideBoost);
    this.velocity.x = dir.x * speed;
    this.velocity.z = dir.z * speed;
    this.game.audio?.step(this.surface);
    this.addTrauma(0.08);
    this.events.onSlide?.();
  }

  _updateSlide(dt, vh) {
    this.slideTimer += dt;
    // Slope gravity: the ground normal pushes the slide downhill.
    const hit = this.physics.raycast(
      { x: this.position.x, y: this.position.y + 0.3, z: this.position.z },
      DOWN, 0.8, G.WORLD,
    );
    if (hit) {
      const slope = new THREE.Vector3(0, -MOVE.gravity, 0).projectOnPlane(hit.normal);
      slope.y = 0;
      vh.addScaledVector(slope, dt);
    }
    const speed = vh.length();
    const fr = this.slideTimer > 0.6 ? MOVE.slideFriction * 2.5 : MOVE.slideFriction;
    if (speed > 0) vh.multiplyScalar(Math.max(speed - fr * Math.max(speed, 2) * dt * 0.5, 0) / speed);
    if (vh.length() < MOVE.slideMinSpeed || this.slideTimer > MOVE.slideDuration) this._endSlide();
  }

  _endSlide() {
    this.sliding = false;
    this.slideCooldown = MOVE.slideCooldown;
  }

  _move(dt) {
    const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
    this.kcc.computeColliderMovement(this.collider, desired);
    const mv = this.kcc.computedMovement();
    const m = { x: mv.x, y: mv.y, z: mv.z };
    this.wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded();

    // Manual step-up: Rapier's autostep is unreliable with capsules on box stairs.
    const wantH = Math.hypot(desired.x, desired.z);
    if ((this.grounded || this.wasGrounded) && this.velocity.y <= 0.5 && wantH > 1e-4
      && Math.hypot(m.x, m.z) < wantH * 0.8) {
      const st = this._tryStep(desired, m);
      if (st) { m.x = st.x; m.y = st.y; m.z = st.z; this.grounded = true; }
    }

    this.position.x += m.x;
    this.position.y += m.y;
    this.position.z += m.z;
    this._syncBody();

    // Velocity correction from collisions: absorb what the move was denied.
    if (dt > 0) {
      const ax = m.x / dt, az = m.z / dt;
      if (Math.abs(ax) < Math.abs(this.velocity.x) - 0.01) this.velocity.x = ax;
      if (Math.abs(az) < Math.abs(this.velocity.z) - 0.01) this.velocity.z = az;
      if (this.velocity.y > 0 && m.y < desired.y * 0.5) this.velocity.y = 0;
    }

    if (this.grounded) {
      if (!this.wasGrounded) {
        const fall = -this.velocity.y;
        this.landDip = Math.min(this.landDip, -Math.min(fall * 0.02, 0.12));
        // Baked landing absorb; a hop is quiet, a two-storey drop is not.
        if (fall > 2.5) this.landCurve = { t: 0, amp: clamp((fall - 2.5) / 7, 0.18, 1) };
        this.addTrauma(Math.min(0.35, fall * 0.02));
        if (fall > 3) this.game.audio?.step(this.surface);
        if (fall > 11) this.damage(Math.round((fall - 11) * 9), null, { weapon: 'fall' });
        this.events.onLand?.(fall, this.airTime);
      }
      this.velocity.y = Math.max(this.velocity.y, -2);
      this.lastGroundedTime = this.time;
      this.airTime = 0;
    } else {
      this.airTime += dt;
    }
  }

  /** Up / across / down step probe; returns the displacement or null if it doesn't help. */
  _tryStep(desired, base) {
    const k = this.kcc, c = this.collider;
    const p0 = this.position, cy = p0.y + this.height / 2;
    k.computeColliderMovement(c, { x: 0, y: MOVE.stepHeight, z: 0 });
    const up = k.computedMovement().y;
    if (up < 0.05) { this._syncBody(); return null; }
    const wantH = Math.hypot(desired.x, desired.z);
    const sc = Math.max(1, 0.04 / wantH);
    c.setTranslation({ x: p0.x, y: cy + up, z: p0.z });
    k.computeColliderMovement(c, { x: desired.x * sc, y: 0, z: desired.z * sc });
    const a = k.computedMovement();
    const ax = a.x / sc, az = a.z / sc;
    if (!Number.isFinite(ax) || !Number.isFinite(az)) { this._syncBody(); return null; }
    if (Math.hypot(ax, az) <= Math.hypot(base.x, base.z) + 1e-3) { this._syncBody(); return null; }
    c.setTranslation({ x: p0.x + ax, y: cy + up, z: p0.z + az });
    k.computeColliderMovement(c, { x: 0, y: -(up + 0.1), z: 0 });
    const d = k.computedMovement().y;
    const grounded = k.computedGrounded();
    this._syncBody();
    const rise = up + d;
    if (!grounded || rise < 0.02 || rise > MOVE.stepHeight + 0.01) return null;
    // Must land on a walkable tread.
    const gh = this.physics.raycast(
      { x: p0.x + ax, y: p0.y + rise + 0.1, z: p0.z + az }, DOWN, 0.4, G.WORLD,
    );
    if (gh && gh.normal.y < 0.7) return null;
    this.velocity.y = Math.min(this.velocity.y, 0);
    this.stepOffset -= rise;
    return { x: ax, y: rise, z: az };
  }

  _footsteps(dt) {
    if (!this.grounded || this.sliding) return;
    const hspeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.bobAmount = damp(this.bobAmount, this.grounded ? Math.min(1, hspeed / MOVE.walk) : 0, 8, dt);
    this.footPhase += dt * (2.2 + hspeed * 1.35);
    if (hspeed < 0.5) { this._moved = Math.min(this._moved, 0.6); return; }
    this._moved += hspeed * dt;
    if (this._moved > (this.sprinting ? 2.6 : 2.0)) {
      this._moved = 0;
      const hit = this.physics.raycast(
        { x: this.position.x, y: this.position.y + 0.9, z: this.position.z },
        DOWN, 1.6, G.WORLD,
      );
      this.surface = hit?.data?.surface || 'dirt';
      this.game.audio.step(this.surface);
      this.game.hud?.footstepPulse?.();
    }
  }

  /* ---------------------------------------------------------- mantle / vault */
  /**
   * Probes ahead: wall at knee/chest/head, ledge top past it, room to stand on top,
   * then either vaults a thin obstacle or mantles onto it.
   */
  tryMantle(fromJumpPress) {
    const fwd = this.forward(new THREE.Vector3());
    const R = 0.7;
    let wallDist = Infinity;
    for (const h of [0.55, 0.95, 1.4]) {
      const o = this.position.clone().setY(this.position.y + h);
      const hit = this.physics.raycast(o, fwd, R + MOVE.radius, G.WORLD, this.collider);
      if (hit && Math.abs(hit.normal.y) < 0.4) wallDist = Math.min(wallDist, hit.distance);
    }
    if (wallDist === Infinity) return false;

    const probeFwd = wallDist + 0.3;
    const top = this.position.clone().addScaledVector(fwd, probeFwd).setY(this.position.y + 2.5);
    const topHit = this.physics.raycast(top, DOWN, 2.5, G.WORLD, this.collider);
    if (!topHit || topHit.normal.y < 0.7) return false;
    const ledge = topHit.point.y - this.position.y;
    if (ledge < 0.45 || ledge > 2.25) return false;
    if (!fromJumpPress && ledge < 0.9) return false;

    const clear = (p, h) => {
      const hh = Math.max(0.05, (h - 2 * MOVE.radius) / 2);
      const shape = new this.physics.R.Capsule(hh, MOVE.radius - 0.02);
      let blocked = false;
      this.physics.world.intersectionsWithShape(
        { x: p.x, y: p.y + h / 2 + 0.05, z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, shape,
        () => { blocked = true; return false; }, undefined, (0xffff << 16) | G.WORLD, this.collider,
      );
      return !blocked;
    };
    const ledgePos = topHit.point.clone().addScaledVector(fwd, 0.25);
    if (!clear(ledgePos, MOVE.crouchHeight)) return false;

    let type = ledge > MOVE.vaultMax ? 'mantle' : 'climb';
    let endPos = ledgePos.clone();
    if (ledge <= MOVE.vaultMax) {
      const far = this.position.clone().addScaledVector(fwd, wallDist + 1.15).setY(topHit.point.y + 0.2);
      const farHit = this.physics.raycast(far, DOWN, ledge + 1.5, G.WORLD, this.collider);
      if (farHit && farHit.point.y < topHit.point.y - 0.3) {
        const land = this.position.clone().addScaledVector(fwd, wallDist + 1.25);
        land.y = farHit.point.y;
        if (clear(land, MOVE.standHeight)) { type = 'vault'; endPos = land; }
      }
    }
    const standRoom = clear(endPos, MOVE.standHeight);
    const hv = Math.hypot(this.velocity.x, this.velocity.z);
    const travel = Math.hypot(endPos.x - this.position.x, endPos.z - this.position.z);
    const duration = type === 'vault' ? clamp(travel / Math.max(hv * 0.95, 4.2), 0.34, 0.52)
      : type === 'climb' ? 0.36 + ledge * 0.06 : 0.5 + (ledge - 1.15) * 0.18;
    this.mantle = {
      type, t: 0, duration,
      start: this.position.clone(),
      peak: new THREE.Vector3(
        this.position.x + (endPos.x - this.position.x) * 0.5,
        topHit.point.y + 0.08,
        this.position.z + (endPos.z - this.position.z) * 0.5,
      ),
      ledgeY: topHit.point.y,
      end: endPos,
      exitSpeed: type === 'vault' ? Math.max(hv * 0.92, 3.6) : Math.min(hv * 0.6, 3),
      fwd,
      crouchAfter: !standRoom,
    };
    this.sliding = false;
    this.velocity.set(0, 0, 0);
    this.game.audio?.step(this.surface);
    this.events.onMantle?.(type, ledge);
    return true;
  }

  _updateMantle(dt) {
    const m = this.mantle;
    m.t += dt / m.duration;
    const t = Math.min(m.t, 1);
    if (m.type === 'vault') {
      const hor = smoothstep(0, 1, t);
      const p = m.start.clone().lerp(m.end, hor);
      const arc = Math.sin(Math.PI * Math.min(t * 1.15, 1));
      const base = THREE.MathUtils.lerp(m.start.y, m.end.y, hor);
      p.y = Math.max(base, base + arc * (m.ledgeY + 0.15 - Math.min(m.start.y, m.end.y)));
      if (t < 0.55) p.y = Math.max(p.y, THREE.MathUtils.lerp(m.start.y, m.ledgeY + 0.12, easeOutCubic(t / 0.55)));
      this.position.copy(p);
    } else {
      const rise = easeOutCubic(Math.min(t / 0.65, 1));
      const fwdT = smoothstep(0, 1, clamp((t - 0.4) / 0.6, 0, 1));
      this.position.set(
        THREE.MathUtils.lerp(m.start.x, m.end.x, fwdT),
        THREE.MathUtils.lerp(m.start.y, m.end.y, rise),
        THREE.MathUtils.lerp(m.start.z, m.end.z, fwdT),
      );
    }
    this.eyeHeight = damp(this.eyeHeight, m.type === 'mantle' ? MOVE.eyeCrouch : MOVE.eyeStand - 0.2, 12, dt);
    if (m.crouchAfter || m.type === 'mantle') this._setHeight(MOVE.crouchHeight);
    this._syncBody();
    if (m.t >= 1) {
      this.mantle = null;
      this.crouching = m.crouchAfter;
      if (!this.crouching) this._setHeight(MOVE.standHeight);
      this.velocity.copy(m.fwd).multiplyScalar(m.exitSpeed);
      this.velocity.y = -1;
      this.grounded = true;
      this.lastGroundedTime = this.time;
      this.landDip = Math.min(this.landDip, -0.06);
      this.events.onLand?.(2.5, 0.2);
    }
  }

  syncCamera(dt, snap = false) {
    if (this.game.playerVehicle) {
      this._syncVehicleCamera(dt, snap, this.game.playerVehicle);
      return;
    }
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

    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    // Lean + strafe tilt: rolling into the movement reads as weight.
    const lateral = this.velocity.x * right.x + this.velocity.z * right.z;
    const strafeRoll = -clamp(lateral / 6, -1, 1) * 0.6 * DEG;
    const slideRoll = this.sliding ? 4 * DEG * this.slideSide : 0;
    const roll = Math.cos(this.footPhase) * 0.006 * bobAmt + sx * 0.5
      + strafeRoll + slideRoll - this.lean * MOVE.leanAngle;

    // Lean moves the eye sideways and drops it a little so the tilt reads as weight.
    const leanShift = this.lean * MOVE.leanOffset;
    // Baked head curves ride on top in view space (yaw only, so a nod never swings the eye sideways).
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const cv = this.curve;
    const eye = new THREE.Vector3(
      this.position.x + right.x * (bobX + leanShift + cv[0]) - fwd.x * cv[2],
      this.position.y + this.eyeHeight + bobY - Math.abs(this.lean) * 0.08
        + this.stepOffset + this.landDip + cv[1],
      this.position.z + right.z * (bobX + leanShift + cv[0]) - fwd.z * cv[2],
    );
    if (snap) cam.position.copy(eye); else cam.position.lerp(eye, 1 - Math.exp(-28 * dt));

    const zoom = this.aiming ? Math.max(1, this.adsZoom || 1) : 1;
    let targetFov = this.aiming ? clamp(54 / zoom, 9, 60) : this.sprinting ? 82 : 76;
    if (this.tacSprint) targetFov += 4;
    cam.fov = snap ? targetFov : damp(cam.fov, targetFov, 10, dt);
    cam.rotation.set(
      this.pitch + this.kickPitch.x + sy + cv[3],
      this.yaw + this.kickYaw.x + sx + cv[4],
      roll + cv[5],
    );
    cam.updateProjectionMatrix();
    this.game.renderer.sun.target.position.copy(this.position);
  }

  /**
   * Chase camera on foot? No — on tracks: a third-person rig behind the turret,
   * and the gunner's sight when aiming. The camera collides with the world so a
   * wall behind the tank does not put the view inside it.
   */
  _syncVehicleCamera(dt, snap, tank) {
    const cam = this.game.renderer.camera;
    cam.rotation.order = 'YXZ';
    const aiming = this.aiming;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    const head = new THREE.Vector3(tank.position.x, tank.position.y + 2.15, tank.position.z);

    let eye;
    let fov;
    if (aiming) {
      // Gunner's optic: on the turret roof, not at the commander's seat height —
      // otherwise the camera sits inside the cast turret and the sight is black.
      eye = new THREE.Vector3(
        tank.position.x, tank.position.y + tank.def.height * 0.93, tank.position.z,
      ).addScaledVector(dir, 0.45);
      fov = tank.def.gun.sightFov;
    } else {
      const dist = 11.5;
      const back = dir.clone().multiplyScalar(-dist);
      const wall = this.game.physics.raycast(
        head, back.clone().normalize(), dist + 0.8, G.WORLD,
      );
      const reach = wall ? Math.max(2.2, wall.distance - 0.5) : dist;
      eye = head.clone().addScaledVector(back.normalize(), reach);
      const ground = this.game.level ? this.game.level.groundHeight(eye.x, eye.z) : 0;
      if (eye.y < ground + 0.7) eye.y = ground + 0.7;
      fov = 66;
    }

    if (snap) cam.position.copy(eye);
    else cam.position.lerp(eye, 1 - Math.exp(-18 * dt));
    const speedRumble = Math.min(1, Math.abs(tank.speed) / 8);
    const t = this.time;
    const rumble = (0.0016 + speedRumble * 0.0035) * (aiming ? 0.4 : 1);
    const shake = this.trauma * this.trauma;
    cam.rotation.set(
      this.pitch + Math.sin(t * 43) * rumble + Math.sin(t * 71) * shake * 0.025,
      this.yaw + Math.sin(t * 37) * rumble * 0.6 + Math.sin(t * 59) * shake * 0.025,
      Math.sin(t * 29) * rumble * 0.5,
    );
    cam.fov = snap ? fov : damp(cam.fov, fov, 9, dt);
    cam.updateProjectionMatrix();
    this.game.renderer.sun.target.position.copy(tank.position);
  }

  damage(amount, attacker = null, info = {}) {
    if (!this.alive || this.spawnProtect > 0 || this.game.debug?.god) return;
    this.health -= amount;
    this.lastDamage = this.time;
    this.addTrauma(0.35);
    this.game.audio.hurt();
    // The post stack already knew how to bruise the screen (chromatic split,
    // vignette, desaturation); nothing fed it until now.
    this.game.renderer?.setDamage(clamp(amount / 90, 0.12, 0.45));
    // Bullets, shrapnel and bayonets throw blood onto the glass; a long fall
    // only speckles it. The amount is what the hit felt like, not the wound.
    const splat = info.weapon === 'fall'
      ? clamp(amount / 260, 0.08, 0.2)
      : clamp(amount / 48, 0.24, 0.9);
    this.game.renderer?.splatter?.(splat);
    this.game.hud?.damage(attacker, info, amount);
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
