import * as THREE from 'three';
import { buildType38 } from './Type38.js';
import { FpArms } from './FpArms.js';
import { clamp, damp, rand, smoothstep } from '../../core/MathUtil.js';

/**
 * First-person presentation of the Type 38.
 *
 * The gun is modelled 1:1 with its origin on the rear sight notch, so ADS is a literal
 * alignment: translate the gun until the notch sits on the camera axis. Both hands are
 * mounted on the gun; the arms solve back to fixed shoulders (FpArms). Bolt cycling and
 * charger loading animate the firing hand off the grip and back, with the left hand
 * staying on the forend the whole time.
 */

const HIP_POS = new THREE.Vector3(0.180, -0.150, -0.620);
const HIP_ROT = new THREE.Euler(0.035, 0.160, -0.040);
const ADS_POS = new THREE.Vector3(0, 0, -0.130);
const ADS_ROT = new THREE.Euler(0, 0, 0);
const SPRINT_POS = new THREE.Vector3(0.150, -0.255, -0.130);
const SPRINT_ROT = new THREE.Euler(0.46, 0.62, 0.42);
const RELOAD_POS = new THREE.Vector3(0.060, -0.245, -0.185);
const RELOAD_ROT = new THREE.Euler(-0.16, 0.36, 0.50);


export class ViewModel {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.viewScene;
    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    this.gun = buildType38(game.materials, game.weaponTemplate);
    this.rig.add(this.gun);
    const u = this.gun.userData;
    this.bolt = u.bolt;
    this.boltKnob = u.boltKnob;
    this.handR = u.handR;
    this.handL = u.handL;
    this.clipAnchor = u.clipAnchor;
    this.muzzle = u.muzzle;
    this.bayonet = u.bayonet;
    this.flash = u.flash;

    this.gripR = u.handR.position.clone();
    this.gripL = u.handL.position.clone();

    // Dedicated fill so the scanned wood and steel read against the bright sky.
    const viewFill = new THREE.PointLight(0xffe2c4, 2.2, 3.5, 2);
    viewFill.position.set(0.25, 0.10, 0.15);
    this.rig.add(viewFill);

    this.arms = new FpArms(game.materials);
    this.rig.add(this.arms.group);

    // Five-round charger the firing hand carries during a reload.
    this.clip = buildCharger(game.materials);
    this.clip.visible = false;
    this.handR.add(this.clip);
    this.clip.position.set(0, -0.020, 0.055);
    this.clip.rotation.set(-1.15, 0, 0);

    this.flashLight = new THREE.PointLight(0xffb060, 0, 7, 2);
    this.flashLight.position.set(0.02, -0.10, -0.55);
    this.scene.add(this.flashLight);

    // Ejected brass.
    this.casings = [];
    this._casingGeo = new THREE.CylinderGeometry(0.0042, 0.0048, 0.030, 8);
    this._casingMat = new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 0.95, roughness: 0.28 });

    this.ads = 0;
    this.sprint = 0;
    this.reloadW = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.kickZ = 0;
    this.kickRot = 0;
    this.bobT = 0;
    this.flashT = 0;
    this.lunge = 0;
    this.time = 0;
    this.lastCycle = 0;
    this.lastReload = 0;
    this.gun.position.copy(HIP_POS);
    this.gun.rotation.copy(HIP_ROT);
    this._poseTarget = new THREE.Vector3();
    this._rotTarget = new THREE.Euler();
    this.enabled = true;
  }

  onFire() {
    this.kickZ = 0.040;
    this.kickRot = 0.075;
    this.flashT = 0.055;
    this.flash.visible = true;
    this.flash.material.rotation = rand(0, 6.28);
    this.flash.scale.setScalar(rand(0.24, 0.38));
    this.flashLight.intensity = 7;
  }

  onMelee() { this.lunge = 1; }

  _ejectCasing() {
    const mesh = new THREE.Mesh(this._casingGeo, this._casingMat);
    this.rig.add(mesh);
    mesh.position.copy(this.gun.position).add(new THREE.Vector3(0.03, 0.03, -0.10));
    this.casings.push({
      mesh,
      vel: new THREE.Vector3(rand(0.5, 0.9), rand(0.5, 0.9), rand(-0.15, 0.05)),
      spin: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)),
      life: 1.1,
    });
    if (this.casings.length > 10) {
      const old = this.casings.shift();
      old.mesh.removeFromParent();
    }
  }

  update(dt, player, weapon, look) {
    this.time += dt;
    const adsTarget = (player.aiming && !weapon.reloading && !player.sprinting) ? 1 : 0;
    this.ads = damp(this.ads, adsTarget, 14, dt);

    const sprintTarget = player.sprinting ? 1 : 0;
    this.sprint = damp(this.sprint, sprintTarget, 9, dt);
    this.reloadW = damp(this.reloadW, weapon.reloading ? 1 : 0, 10, dt);

    // Look sway: tiny at the sights, pronounced at the hip.
    const swayScale = 1 - this.ads * 0.85;
    const sx = clamp(-look.x * 0.00035, -0.030, 0.030) * swayScale;
    const sy = clamp(look.y * 0.00030, -0.026, 0.026) * swayScale;
    this.swayX = damp(this.swayX, sx, 10, dt);
    this.swayY = damp(this.swayY, sy, 10, dt);

    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = player.grounded ? Math.min(1, speed / 5) : 0;
    this.bobT += dt * (4 + speed * 1.5);
    const bobScale = (1 - this.ads * 0.9) * (1 - this.sprint * 0.25);
    const bobX = Math.cos(this.bobT) * 0.014 * moving * bobScale;
    const bobY = Math.sin(this.bobT * 2) * 0.010 * moving * bobScale
      + Math.sin(this.bobT) * 0.006 * moving * bobScale;

    this.kickZ = damp(this.kickZ, 0, 12, dt);
    this.kickRot = damp(this.kickRot, 0, 11, dt);
    this.lunge = damp(this.lunge, 0, 7, dt);

    // ---------------------------------------------------------------- pose
    const reloadP = weapon.reloading
      ? clamp(1 - weapon.reloadT / (weapon.def?.reloadTime || 2.55), 0, 1)
      : 0;

    const carry = new THREE.Vector3().copy(HIP_POS)
      .lerp(SPRINT_POS, this.sprint)
      .lerp(RELOAD_POS, this.reloadW * 0.9);
    const carryRot = new THREE.Euler(
      HIP_ROT.x + (SPRINT_ROT.x - HIP_ROT.x) * this.sprint + (RELOAD_ROT.x - HIP_ROT.x) * this.reloadW * 0.9,
      HIP_ROT.y + (SPRINT_ROT.y - HIP_ROT.y) * this.sprint + (RELOAD_ROT.y - HIP_ROT.y) * this.reloadW * 0.9,
      HIP_ROT.z + (SPRINT_ROT.z - HIP_ROT.z) * this.sprint + (RELOAD_ROT.z - HIP_ROT.z) * this.reloadW * 0.9,
    );

    // ADS wins over sprint; a reload pulls the gun out of the sight line.
    const adsW = this.ads;
    const pos = carry.lerp(ADS_POS, adsW);
    const rot = new THREE.Euler(
      carryRot.x + (ADS_ROT.x - carryRot.x) * adsW,
      carryRot.y + (ADS_ROT.y - carryRot.y) * adsW,
      carryRot.z + (ADS_ROT.z - carryRot.z) * adsW,
    );

    // Breathing: vertical only, ~1.5 cm at the hip and 2 mm at the sights.
    const breath = Math.sin(this.time * 1.6) * (0.0045 + 0.0015 * moving);
    pos.y += breath * (1 - adsW * 0.8);
    pos.x += this.swayX + bobX;
    pos.y += this.swayY + bobY;
    pos.z += this.kickZ + this.lunge * 0.16;
    pos.x += this.lunge * 0.05;
    rot.x += this.kickRot - this.lunge * 0.22 + this.swayY * 0.8;
    rot.y += this.swayX * 0.9;
    rot.z += -this.lunge * 0.10;

    this.gun.position.lerp(pos, 1 - Math.exp(-26 * dt));
    this.gun.rotation.x = damp(this.gun.rotation.x, rot.x, 18, dt);
    this.gun.rotation.y = damp(this.gun.rotation.y, rot.y, 18, dt);
    this.gun.rotation.z = damp(this.gun.rotation.z, rot.z, 18, dt);

    // ---------------------------------------------------------------- bolt
    const cycleDur = weapon.cycleDuration || weapon.def?.cycleTime || 0.78;
    const boltP = weapon.cycleT > 0 && !weapon.reloading
      ? clamp(1 - weapon.cycleT / cycleDur, 0, 1)
      : 0;
    let lift = 0, pull = 0;
    if (boltP > 0) {
      if (boltP < 0.20) lift = smoothstep(0, 0.20, boltP);
      else if (boltP < 0.40) { lift = 1; pull = smoothstep(0.20, 0.40, boltP); }
      else if (boltP < 0.60) { lift = 1; pull = 1 - smoothstep(0.40, 0.60, boltP); }
      else if (boltP < 0.76) { lift = 1 - smoothstep(0.60, 0.76, boltP); pull = 0; }
    }
    this.bolt.rotation.z = damp(this.bolt.rotation.z, -1.30 * lift, 30, dt);
    this.bolt.position.z = damp(this.bolt.position.z, pull * 0.085, 30, dt);

    // The firing hand grabs the knob, works it, then returns to the wrist.
    this.gun.updateMatrixWorld(true);
    const handR = this.handR;
    const targetR = new THREE.Vector3().copy(this.gripR);
    let handRotZ = -Math.PI / 2;
    if (boltP > 0 && boltP < 0.88) {
      const grab = smoothstep(0, 0.14, boltP) * (1 - smoothstep(0.80, 0.88, boltP));
      const knobLocal = this.boltKnob.getWorldPosition(new THREE.Vector3());
      this.gun.worldToLocal(knobLocal);
      knobLocal.add(new THREE.Vector3(0.012, -0.030, 0.010));
      targetR.lerp(knobLocal, grab);
      handRotZ = -Math.PI / 2 + grab * 0.55;
    } else if (weapon.reloading) {
      // Charger loading: strip a clip, push it into the receiver, close the bolt.
      targetR.copy(this.gripR);
      let target = this.gripR;
      let rotZ = -Math.PI / 2;
      if (reloadP < 0.16) {
        target = new THREE.Vector3(0.055, -0.420, 0.120);
        rotZ = -1.15;
      } else if (reloadP < 0.30) {
        const k = smoothstep(0.16, 0.30, reloadP);
        target = new THREE.Vector3().lerpVectors(new THREE.Vector3(0.055, -0.420, 0.120), this.clipAnchor.position.clone().add(new THREE.Vector3(0, 0.075, 0.045)), k);
        rotZ = -1.15 + (0 - -1.15) * k;
      } else if (reloadP < 0.52) {
        target = this.clipAnchor.position.clone().add(new THREE.Vector3(0, 0.075, 0.045));
        rotZ = 0;
      } else if (reloadP < 0.70) {
        const k = smoothstep(0.52, 0.70, reloadP);
        target = this.clipAnchor.position.clone().add(new THREE.Vector3(0, 0.075 - 0.055 * k, 0.045));
        rotZ = 0;
      } else {
        const k = smoothstep(0.70, 0.92, reloadP);
        target = new THREE.Vector3().lerpVectors(this.clipAnchor.position.clone().add(new THREE.Vector3(0, 0.020, 0.045)), this.gripR, k);
        rotZ = 0 + (-Math.PI / 2) * k;
      }
      targetR.copy(target);
      handRotZ = rotZ;
    }
    handR.position.lerp(targetR, 1 - Math.exp(-22 * dt));
    handR.rotation.z = damp(handR.rotation.z, handRotZ, 16, dt);

    // Left hand: forend normally, pulls in slightly for a reload.
    const targetL = this.gripL.clone();
    if (weapon.reloading) targetL.z += 0.03 * smoothstep(0.1, 0.4, reloadP);
    this.handL.position.lerp(targetL, 1 - Math.exp(-14 * dt));

    this.clip.visible = weapon.reloading && reloadP > 0.34 && reloadP < 0.70;

    // ---------------------------------------------------------------- sounds
    if (boltP > 0 && this.lastCycle <= 0) {
      this.game.audio?.bolt();
      this._ejectCasing();
    }
    this.lastCycle = boltP;
    if (weapon.reloading) {
      if (this.lastReload < 0.56 && reloadP >= 0.56) this.game.audio?.reload('clip');
      if (this.lastReload < 0.86 && reloadP >= 0.86) this.game.audio?.bolt();
    }
    this.lastReload = weapon.reloading ? reloadP : 0;

    // ---------------------------------------------------------------- arms
    this.gun.updateMatrixWorld(true);
    this.arms.update(this.handR, this.handL, this.gun);

    // ---------------------------------------------------------------- casing
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      c.vel.y -= 5.2 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.life <= 0) { c.mesh.removeFromParent(); this.casings.splice(i, 1); }
    }


    // Muzzle flash.
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
      else this.flashLight.intensity = 7 * (this.flashT / 0.055);
    }
  }

  setEnabled(v) { this.rig.visible = v; }
}

function buildCharger(mats) {
  const g = new THREE.Group();
  const brass = mats.get('brass');
  const clip = new THREE.MeshStandardMaterial({ color: 0x8d8f86, metalness: 0.85, roughness: 0.4 });
  for (let i = 0; i < 5; i++) {
    const caseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0048, 0.056, 8), brass);
    caseMesh.position.set((i - 2) * 0.0105, 0.03, 0);
    caseMesh.rotation.z = 0.04 * (i - 2);
    g.add(caseMesh);
    const bullet = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.022, 8), new THREE.MeshStandardMaterial({ color: 0xb08a5a, metalness: 0.9, roughness: 0.3 }));
    bullet.position.set((i - 2) * 0.0105, 0.068, 0);
    bullet.rotation.z = 0.04 * (i - 2);
    g.add(bullet);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.010, 0.014), clip);
  rail.position.set(0, 0.004, 0);
  g.add(rail);
  return g;
}
