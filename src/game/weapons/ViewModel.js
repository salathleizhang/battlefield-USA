import * as THREE from 'three';
import { buildType38 } from './Type38.js';
import { buildC96 } from './PistolModel.js';
import { buildLmg } from './LmgModel.js';
import { FpHands, loadFpHands } from './FpHands.js';
import { clamp, damp, rand, smoothstep } from '../../core/MathUtil.js';

/**
 * First-person presentation of the player's weapons.
 *
 * Every gun is modelled 1:1 with its origin on the rear sight notch, so ADS is a literal
 * alignment: translate the gun until the notch sits on the camera axis. Both hands are
 * mounted on the gun and the skinned arms solve onto them (FpHands).
 *
 * The Type 38 keeps its bolt-cycle / charger-loading choreography; the C96 is a simple
 * two-hand pistol pose with a reciprocating bolt and a magazine-style reload.
 */

const POSES = {
  rifle: {
    hipPos: new THREE.Vector3(0.160, -0.130, -0.470),
    hipRot: new THREE.Euler(0.020, 0.300, -0.060),
    adsPos: new THREE.Vector3(0, 0, -0.130),
    adsRot: new THREE.Euler(0, 0, 0),
    sprintPos: new THREE.Vector3(0.150, -0.255, -0.130),
    sprintRot: new THREE.Euler(0.46, 0.62, 0.42),
    reloadPos: new THREE.Vector3(0.060, -0.245, -0.185),
    reloadRot: new THREE.Euler(-0.16, 0.36, 0.50),
    flashLight: new THREE.Vector3(0.02, -0.10, -0.55),
    kickZ: 0.040,
    kickRot: 0.075,
    flashSize: 0.32,
  },
  lmg: {
    hipPos: new THREE.Vector3(0.170, -0.150, -0.520),
    hipRot: new THREE.Euler(0.020, 0.290, -0.070),
    adsPos: new THREE.Vector3(0, 0, -0.150),
    adsRot: new THREE.Euler(0, 0, 0),
    sprintPos: new THREE.Vector3(0.170, -0.270, -0.160),
    sprintRot: new THREE.Euler(0.52, 0.62, 0.44),
    reloadPos: new THREE.Vector3(0.070, -0.260, -0.200),
    reloadRot: new THREE.Euler(-0.18, 0.36, 0.52),
    flashLight: new THREE.Vector3(0.02, -0.10, -0.60),
    kickZ: 0.034,
    kickRot: 0.070,
    flashSize: 0.34,
  },
  pistol: {
    hipPos: new THREE.Vector3(0.100, -0.080, -0.400),
    hipRot: new THREE.Euler(0.020, 0.100, -0.020),
    adsPos: new THREE.Vector3(0.012, -0.006, -0.440),
    adsRot: new THREE.Euler(0.01, -0.05, 0.015),
    adsRot: new THREE.Euler(0, 0, 0),
    sprintPos: new THREE.Vector3(0.130, -0.190, -0.150),
    sprintRot: new THREE.Euler(0.50, 0.75, 0.45),
    reloadPos: new THREE.Vector3(0.050, -0.215, -0.170),
    reloadRot: new THREE.Euler(-0.25, 0.35, 0.45),
    flashLight: new THREE.Vector3(0.01, -0.05, -0.42),
    kickZ: 0.026,
    kickRot: 0.070,
    flashSize: 0.16,
  },
};

export class ViewModel {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.viewScene;
    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    this.rigs = {};
    this._build('rifle', buildType38(game.materials, game.weaponTemplate));
    this._build('lmg', buildLmg(game.materials, game.weaponTemplate));
    this._build('pistol', buildC96(game.materials));
    this.active = 'rifle';
    this._bind('rifle');

    // Dedicated fill so the scanned wood and steel read against the bright sky.
    const viewFill = new THREE.PointLight(0xffe2c4, 2.2, 3.5, 2);
    viewFill.position.set(0.25, 0.10, 0.15);
    this.rig.add(viewFill);

    // Skinned first-person arms stream in after the level: until they land the gun's own hand
    // stubs carry the read, then they are swapped out for the real rig. One pair per weapon.
    this.hands = null;
    loadFpHands().then((scene) => {
      for (const key of Object.keys(this.rigs)) {
        const hands = new FpHands(scene).attach(this.rig);
        hands.root.visible = key === this.active;
        this.rigs[key].hands = hands;
      }
      this.hands = this.rigs[this.active].hands;
      this.handR.visible = false;
      this.handL.visible = false;
    }).catch((e) => {
      console.warn('first-person arms failed to load', e);
    });

    // Five-round charger the firing hand carries during a Type 38 reload.
    this.clip = buildCharger(game.materials);
    this.clip.visible = false;
    this.rifleHand.add(this.clip);
    this.clip.position.set(0, -0.020, 0.055);
    this.clip.rotation.set(-1.15, 0, 0);

    this.flashLight = new THREE.PointLight(0xffb060, 0, 7, 2);
    this.flashLight.position.copy(POSES.rifle.flashLight);
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
    this.gun.position.copy(this.pose.hipPos);
    this.gun.rotation.copy(this.pose.hipRot);
    this._poseTarget = new THREE.Vector3();
    this._rotTarget = new THREE.Euler();
    this.enabled = true;
  }

  _build(key, gun) {
    const holder = new THREE.Group();
    holder.add(gun);
    holder.visible = key === 'rifle';
    this.rig.add(holder);
    const u = gun.userData;
    this.rigs[key] = {
      key,
      gun,
      holder,
      pose: POSES[key],
      bolt: u.bolt,
      boltKnob: u.boltKnob,
      handR: u.handR,
      handL: u.handL,
      clipAnchor: u.clipAnchor,
      muzzle: u.muzzle,
      bayonet: u.bayonet,
      flash: u.flash,
      gripR: u.handR.position.clone(),
      gripL: u.handL.position.clone(),
      boltRest: u.boltRest || u.bolt.position.clone(),
      hands: null,
    };
  }

  /** Point the viewmodel at a weapon rig ('rifle' | 'pistol'). */
  setWeapon(def) {
    const key = def?.model === 'pistol' ? 'pistol' : def?.model === 'lmg' ? 'lmg' : 'rifle';
    if (key === this.active && this.gun) return;
    const prev = this.rigs[this.active];
    if (prev) prev.holder.visible = false;
    const w = this.rigs[key];
    if (!w) return;
    w.holder.visible = true;
    this.active = key;
    this._bind(key);
    // Snap to the ready pose so the swap doesn't fly across the frame.
    this.gun.position.copy(this.pose.hipPos);
    this.gun.rotation.copy(this.pose.hipRot);
    this.ads = 0;
    this.sprint = 0;
    this.reloadW = 0;
    this.kickZ = 0;
    this.kickRot = 0;
    this.lastCycle = 0;
    this.lastReload = 0;
    this.flashT = 0;
    if (this.flash) this.flash.visible = false;
    this.flashLight.position.copy(this.pose.flashLight);
    this.flashLight.intensity = 0;
  }

  _bind(key) {
    const w = this.rigs[key];
    this.w = w;
    this.pose = w.pose;
    this.gun = w.gun;
    this.holder = w.holder;
    this.bolt = w.bolt;
    this.boltKnob = w.boltKnob;
    this.handR = w.handR;
    this.handL = w.handL;
    this.clipAnchor = w.clipAnchor;
    this.muzzle = w.muzzle;
    this.bayonet = w.bayonet;
    this.flash = w.flash;
    this.gripR = w.gripR;
    this.gripL = w.gripL;
    this.hands = w.hands;
    if (key === 'rifle') this.rifleHand = w.handR;
  }

  onFire(weapon) {
    const pistol = this.active === 'pistol';
    this.kickZ = this.pose.kickZ;
    this.kickRot = this.pose.kickRot;
    this.flashT = pistol ? 0.045 : 0.055;
    this.flash.visible = true;
    this.flash.material.rotation = rand(0, 6.28);
    this.flash.scale.setScalar(rand(0.7, 1.15) * this.pose.flashSize * 1.6);
    this.flashLight.intensity = pistol ? 4.5 : 7;
    if (pistol) this.slideT = 1;
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

    // The weapon camera has its own FOV: it narrows slightly at the sights so the
    // receiver and rear sight grow with the zoom instead of staying flat.
    const vmFov = 58 - this.ads * 8;
    const vc = this.game.renderer.viewCamera;
    if (Math.abs(vc.fov - vmFov) > 0.01) {
      vc.fov = vmFov;
      vc.updateProjectionMatrix();
    }

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
    const P = this.pose;

    const carry = new THREE.Vector3().copy(P.hipPos)
      .lerp(P.sprintPos, this.sprint)
      .lerp(P.reloadPos, this.reloadW * 0.9);
    const carryRot = new THREE.Euler(
      P.hipRot.x + (P.sprintRot.x - P.hipRot.x) * this.sprint + (P.reloadRot.x - P.hipRot.x) * this.reloadW * 0.9,
      P.hipRot.y + (P.sprintRot.y - P.hipRot.y) * this.sprint + (P.reloadRot.y - P.hipRot.y) * this.reloadW * 0.9,
      P.hipRot.z + (P.sprintRot.z - P.hipRot.z) * this.sprint + (P.reloadRot.z - P.hipRot.z) * this.reloadW * 0.9,
    );

    // ADS wins over sprint; a reload pulls the gun out of the sight line.
    const adsW = this.ads;
    const pos = carry.lerp(P.adsPos, adsW);
    const rot = new THREE.Euler(
      carryRot.x + (P.adsRot.x - carryRot.x) * adsW,
      carryRot.y + (P.adsRot.y - carryRot.y) * adsW,
      carryRot.z + (P.adsRot.z - carryRot.z) * adsW,
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
    // Lean tilts the rifle with the head, so the sight picture stays level.
    rot.z += -player.lean * 0.05;

    this.gun.position.lerp(pos, 1 - Math.exp(-26 * dt));
    this.gun.rotation.x = damp(this.gun.rotation.x, rot.x, 18, dt);
    this.gun.rotation.y = damp(this.gun.rotation.y, rot.y, 18, dt);
    this.gun.rotation.z = damp(this.gun.rotation.z, rot.z, 18, dt);

    if (this.active === 'rifle') this._updateRifle(dt, weapon, reloadP);
    else if (this.active === 'lmg') this._updateAuto(dt, weapon, reloadP);
    else this._updatePistol(dt, weapon, reloadP);

    // ---------------------------------------------------------------- arms
    this.gun.updateMatrixWorld(true);
    if (!this.hands) {
      // Without skinned arms, keep the gun's own stubs: the support hand would sit
      // right under the receiver at ADS and cover the sight picture.
      if (this.active === 'rifle') this.handL.visible = this.ads < 0.55;
    }
    this.hands?.update(this.gun, this.handR, this.handL);

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
      else this.flashLight.intensity = (this.active === 'pistol' ? 4.5 : 7) * (this.flashT / 0.055);
    }
  }

  /** Bolt-action choreography: lift/travel the bolt, run the firing hand, charger reload. */
  _updateRifle(dt, weapon, reloadP) {
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
    this.bolt.position.z = damp(this.bolt.position.z, this.w.boltRest.z + pull * 0.085, 30, dt);

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

    // Sounds are cued from the animation timeline.
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
  }

  /** Automatic weapons: no bolt choreography — hands stay on the grips, brass keeps flying. */
  _updateAuto(dt, weapon, reloadP) {
    this.bolt.rotation.z = damp(this.bolt.rotation.z, 0, 30, dt);
    this.bolt.position.z = damp(this.bolt.position.z, this.w.boltRest.z, 30, dt);
    this.handR.position.lerp(this.gripR, 1 - Math.exp(-24 * dt));
    this.handL.position.lerp(this.gripL, 1 - Math.exp(-24 * dt));
    this.handR.rotation.z = damp(this.handR.rotation.z, -Math.PI / 2, 20, dt);

    if (weapon.cycleT > 0 && this.lastCycle <= 0) this._ejectCasing();
    this.lastCycle = weapon.cycleT > 0 ? 1 : 0;
    if (weapon.reloading && this.lastReload < 0.62 && reloadP >= 0.62) this.game.audio?.reload('clip');
    this.lastReload = weapon.reloading ? reloadP : 0;
  }

  /** C96: bolt slams back on the shot, hands stay put, reload just pulls the gun in. */
  _updatePistol(dt, weapon, reloadP) {
    this.slideT = Math.max(0, (this.slideT || 0) - dt * 8);
    const travel = Math.min(1, this.slideT) * 0.020;
    this.bolt.position.z = damp(this.bolt.position.z, this.w.boltRest.z + travel, 34, dt);

    // Hands ride the gun: right on the grip, left cupping the magazine well.
    this.handR.position.lerp(this.gripR, 1 - Math.exp(-24 * dt));
    this.handL.position.lerp(this.gripL, 1 - Math.exp(-24 * dt));
    this.handR.rotation.z = damp(this.handR.rotation.z, -Math.PI / 2, 18, dt);

    if (weapon.cycleT > 0 && this.lastCycle <= 0) this._ejectCasing();
    this.lastCycle = weapon.cycleT > 0 ? 1 : 0;
    if (weapon.reloading) {
      if (this.lastReload < 0.45 && reloadP >= 0.45) this.game.audio?.reload('clip');
    }
    this.lastReload = weapon.reloading ? reloadP : 0;
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
