import * as THREE from 'three';
import { buildType38 } from './Type38.js';
import { FpHands, loadFpHands } from './FpHands.js';
import { FP_IDS, loadFpRig, fpPoses, loadOptics, OPTICS } from './FpRig.js';
import { ATTACHMENTS } from './WeaponDefs.js';
import { RIFLE_TAC, rifleEmptyKeys, PISTOL_TAC, PISTOL_EMPTY, INSPECT_RIFLE, INSPECT_PISTOL, sampleKeys, phase } from './ReloadChoreo.js';
import { clamp, damp, rand, smoothstep } from '../../core/MathUtil.js';

/**
 * First-person presentation of the player's weapons.
 *
 * Two rig families:
 *  - the period Type 38, built locally from the Poly Haven scan (bolt-cycle and charger choreography);
 *  - the reference project's authored FP rigs (`models/fp/*.glb`): gun + gloved arms posed around it,
 *    mounted at their authored K-scale and solved from hip to ADS through the iron-sight line.
 *
 * Rigs from the reference family bring their own arms, so the legacy skinned-arm pair is hidden there.
 */

const RIFLE_POSE = {
  hipPos: new THREE.Vector3(0.160, -0.130, -0.470),
  hipRot: new THREE.Euler(0.020, 0.300, -0.060),
  adsPos: new THREE.Vector3(0, 0, -0.130),
  adsRot: new THREE.Euler(0, 0, 0),
  sprintPos: new THREE.Vector3(0.150, -0.255, -0.130),
  sprintRot: new THREE.Euler(0.46, 0.62, 0.42),
  reloadPos: new THREE.Vector3(0.060, -0.245, -0.185),
  reloadRot: new THREE.Euler(-0.16, 0.36, 0.50),
  flashLight: new THREE.Vector3(0.02, -0.10, -0.55),
};

const CLASS_FEEL = {
  rifle: { kickZ: 0.032, kickRot: 0.060 },
  long: { kickZ: 0.045, kickRot: 0.085 },
  pistol: { kickZ: 0.020, kickRot: 0.075 },
  compact: { kickZ: 0.026, kickRot: 0.055 },
};

export class ViewModel {
  constructor(game, defs = []) {
    this.game = game;
    this.scene = game.renderer.viewScene;
    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    this.rigs = {};
    this.fp = {};
    this._buildRifle();
    this.active = 'rifle';
    this._bindRifle();

    // Reference FP rigs load on demand (one GLB per weapon, cached across missions).
    for (const def of defs) {
      const m = def?.model;
      if (!FP_IDS.includes(m) || this.fp[m]) continue;
      loadFpRig(m).then((rig) => {
        if (!rig) return;
        this._buildFp(m, rig);
        if (this.pendingModel === m) this.setWeapon(this.pendingDef || { model: m });
      });
    }

    // Scope picture: a camera-facing overlay drawn in the weapon layer (no post-process changes).
    this.scopeMat = new THREE.MeshBasicMaterial({
      map: scopeTexture(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.scopePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.078, 0.078), this.scopeMat);
    this.scopePlane.position.set(0, 0, -0.07);
    this.scopePlane.visible = false;
    this.scopePlane.renderOrder = 10;
    this.rig.add(this.scopePlane);

    this.opticsScene = null;
    loadOptics().then((scene) => {
      this.opticsScene = scene;
      if (this.fpActive) this._applyOptic(this.fp[this.fpActive], this.weaponDef);
    });

    const viewFill = new THREE.PointLight(0xffe2c4, 2.2, 3.5, 2);
    viewFill.position.set(0.25, 0.10, 0.15);
    this.rig.add(viewFill);

    // Legacy skinned arms (rifle only) — stream in after the level.
    this.legacyHands = null;
    loadFpHands().then((scene) => {
      const hands = new FpHands(scene).attach(this.rig);
      hands.root.visible = false;
      this.legacyHands = hands;
      if (!this.fpActive) {
        hands.root.visible = true;
        this.hands = hands;
        this.rifleRig.handR.visible = false;
        this.rifleRig.handL.visible = false;
      }
    }).catch((e) => {
      console.warn('first-person arms failed to load', e);
    });

    const flashMap = flashTexture();
    // Real muzzle-flash sprite instead of a flat coloured quad.
    if (this.rifleRig.flash) {
      this.rifleRig.flash.material.map = flashMap;
      this.rifleRig.flash.material.color.setHex(0xffffff);
      this.rifleRig.flash.material.needsUpdate = true;
    }

    this.clip = buildCharger(game.materials);
    this.clip.visible = false;
    this.rifleRig.handR.add(this.clip);
    this.clip.position.set(0, -0.020, 0.055);
    this.clip.rotation.set(-1.15, 0, 0);

    this.flashLight = new THREE.PointLight(0xffb060, 0, 7, 2);
    this.flashLight.position.copy(RIFLE_POSE.flashLight);
    this.scene.add(this.flashLight);

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
    this.pose = RIFLE_POSE;
    this.gun.position.copy(this.pose.hipPos);
    this.gun.rotation.copy(this.pose.hipRot);
    this.enabled = true;
  }

  /* ------------------------------------------------------------ rig build */
  _buildRifle() {
    const gun = buildType38(this.game.materials, this.game.weaponTemplate);
    const holder = new THREE.Group();
    holder.add(gun);
    this.rig.add(holder);
    const u = gun.userData;
    this.rifleRig = {
      gun, holder, pose: RIFLE_POSE,
      bolt: u.bolt, boltKnob: u.boltKnob, handR: u.handR, handL: u.handL,
      clipAnchor: u.clipAnchor, muzzle: u.muzzle, bayonet: u.bayonet, flash: u.flash,
      gripR: u.handR.position.clone(), gripL: u.handL.position.clone(),
      boltRest: u.boltRest || u.bolt.position.clone(),
    };
  }

  _buildFp(id, rig) {
    const holder = new THREE.Group();
    holder.add(rig.root);
    holder.visible = false;
    this.rig.add(holder);
    const poses = fpPoses(rig);
    rig.root.scale.setScalar(poses.scale);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTexture(), color: 0xffffff, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    if (poses.muzzle) {
      flash.position.copy(poses.muzzle).multiplyScalar(poses.scale);
      flash.scale.setScalar(0.22);
    }
    flash.visible = false;
    holder.add(flash);
    this.fp[id] = { id, rig, holder, poses, posesIrons: poses, flash, kind: rig.meta.cls || 'rifle' };
  }

  _bindRifle() {
    const w = this.rifleRig;
    this.gun = w.gun;
    this.holder = w.holder;
    this.pose = w.pose;
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
    this.fpActive = null;
    this.hands = this.legacyHands || null;
    if (this.legacyHands) this.legacyHands.root.visible = true;
  }

  /** Muzzle device / foregrip: simple procedural geometry on the authored sockets. */
  _mountAttachments(fp, def) {
    if (fp.attachNodes) {
      for (const n of fp.attachNodes) n.removeFromParent();
      fp.attachNodes = [];
    }
    const ids = def?.attachments || [];
    if (!ids.length) return;
    const root = fp.rig.root;
    const dark = (this._darkMat ||= new THREE.MeshStandardMaterial({ color: 0x1d2023, roughness: 0.45, metalness: 0.8 }));
    for (const id of ids) {
      const a = ATTACHMENTS[id];
      if (!a) continue;
      if (a.slot === 'muzzle') {
        const socket = root.getObjectByName('MuzzleSocket');
        if (!socket) continue;
        const len = id === 'suppressor' ? 0.34 : 0.15;
        const r = id === 'suppressor' ? 0.034 : 0.021;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, len, 12), dark);
        body.rotation.x = Math.PI / 2;
        body.position.set(0, 0, -len / 2);
        socket.add(body);
        (fp.attachNodes ||= []).push(body);
      } else if (a.slot === 'underbarrel') {
        const mount = root.getObjectByName('VGripMount');
        if (!mount) continue;
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.030, 0.20, 10), dark);
        grip.position.set(0, -0.085, 0);
        grip.rotation.x = 0.12;
        mount.add(grip);
        (fp.attachNodes ||= []).push(grip);
      }
    }
  }

  /** Mount (or remove) the optic on a rig and hide the folded iron sights when one is on. */
  _applyOptic(fp, def) {
    const face = OPTICS[def?.optic] || OPTICS.irons;
    fp.opticId = face.id;
    if (fp.opticNode) { fp.opticNode.removeFromParent(); fp.opticNode = null; }
    const wantOptic = face.id !== 'irons';
    // Iron sights: hide the authored rear/front housings when an optic is mounted.
    fp.rig.root.traverse((o) => {
      if (!/IronSight/i.test(o.name)) return;
      if (o.userData.__ironWas === undefined) o.userData.__ironWas = o.visible;
      o.visible = !wantOptic && o.userData.__ironWas !== false;
    });
    fp.poses = this._posesFor(fp, def);
    if (!wantOptic || !this.opticsScene) return;
    const src = this.opticsScene.getObjectByName(face.node);
    if (!src) return;
    const node = src.clone(true);
    // The source glass is opaque in our pipeline; the reticle sprite replaces it.
    node.traverse((o) => { if (o.isMesh && /glass|lens/i.test(o.name)) o.visible = false; });
    node.position.set(0, 0, 0);
    const rail = fp.rig.tune.rail || [0, 0.18, 0];
    node.position.set(rail[0], rail[1], rail[2]);
    node.scale.multiplyScalar(face.scale ?? 0.82);
    node.visible = true;
    // Reticle: a small emissive dot on the optic's reticle anchor.
    const anchorNode = node.getObjectByName(face.reticle);
    if (anchorNode) {
      const dot = new THREE.Sprite(new THREE.SpriteMaterial({
        map: reticleTexture(), transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.AdditiveBlending, color: face.id === 'holo' ? 0xff5533 : 0xff2b1a,
      }));
      dot.position.copy(anchorNode.position);
      dot.scale.setScalar(face.id === 'acog' ? 0.02 : 0.012);
      node.add(dot);
    }
    fp.rig.root.add(node);
    fp.opticNode = node;
    fp.poses = this._posesFor(fp, def);
  }

  /** ADS transform for the current optic: align its reticle anchor with the view axis. */
  _posesFor(fp, def) {
    const face = OPTICS[def?.optic] || OPTICS.irons;
    const base = fp.posesIrons;
    if (face.id === 'irons' || !fp.opticNode) return base;
    const anchor = fp.rig.root.getObjectByName(face.reticle) || fp.opticNode;
    fp.rig.root.updateMatrixWorld(true);
    const p = anchor.getWorldPosition(new THREE.Vector3());
    fp.rig.root.worldToLocal(p);
    const scale = base.scale;
    const relief = face.relief ?? 0.3;
    return {
      ...base,
      adsRot: new THREE.Euler(),
      adsPos: p.multiplyScalar(scale).negate().add(new THREE.Vector3(0, 0, -relief)),
    };
  }

  /** Point the viewmodel at a weapon def (by its `model` id). */
  setWeapon(def) {
    this.weaponDef = def;
    const model = def?.model || 'rifle';
    const fp = this.fp[model];
    if (model !== 'rifle' && !fp) {
      // Asset still streaming in: hide the old rig and switch when it lands.
      this.pendingModel = model;
      this.pendingDef = def;
      this.rifleRig.holder.visible = false;
      if (this.fpActive) this.fp[this.fpActive].holder.visible = false;
      return;
    }
    this.pendingModel = null;
    this.weaponDef = def;
    if (this.fpActive) this.fp[this.fpActive].holder.visible = false;
    this.rifleRig.holder.visible = false;
    if (model === 'rifle') {
      this.rifleRig.holder.visible = true;
      this._bindRifle();
    } else {
      fp.holder.visible = true;
      this.fpActive = model;
      this.gun = fp.holder;
      this.holder = fp.holder;
      this.flash = fp.flash;
      this.pose = null;
      this.hands = null;
      if (this.legacyHands) this.legacyHands.root.visible = false;
      this._applyOptic(fp, def);
      this._mountAttachments(fp, def);
    }
    this.ads = 0;
    this.sprint = 0;
    this.reloadW = 0;
    this.kickZ = 0;
    this.kickRot = 0;
    this.lastCycle = 0;
    this.lastReload = 0;
    this.flashT = 0;
    this.flashLight.intensity = 0;
    if (this.fpActive) {
      const w = this.fp[this.fpActive];
      w.holder.position.copy(w.poses.hipPos);
      w.holder.rotation.copy(w.poses.hipRot);
    } else {
      this.gun.position.copy(this.pose.hipPos);
      this.gun.rotation.copy(this.pose.hipRot);
    }
  }

  onFire(weapon) {
    const suppressed = !!weapon?.def?.suppressed;
    const isFp = !!this.fpActive;
    const kind = isFp ? this.fp[this.fpActive].kind : 'rifle';
    const feel = CLASS_FEEL[kind] || CLASS_FEEL.rifle;
    this.kickZ = feel.kickZ;
    this.kickRot = feel.kickRot;
    this.flashT = 0.05;
    if (this.flash) {
      this.flash.visible = true;
      this.flash.material.rotation = rand(0, 6.28);
      this.flash.scale.setScalar(rand(0.7, 1.2) * (isFp ? 0.25 : 0.32));
    }
    this.flashLight.intensity = suppressed ? 2 : 7;
    if (this.flash) this.flash.material.opacity = suppressed ? 0.35 : 0.95;
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

    const vmFov = 58 - this.ads * 8;
    const vc = this.game.renderer.viewCamera;
    if (Math.abs(vc.fov - vmFov) > 0.01) {
      vc.fov = vmFov;
      vc.updateProjectionMatrix();
    }

    this.sprint = damp(this.sprint, player.sprinting ? 1 : 0, 9, dt);
    this.reloadW = damp(this.reloadW, weapon.reloading ? 1 : 0, 10, dt);

    const swayScale = 1 - this.ads * 0.85;
    this.swayX = damp(this.swayX, clamp(-look.x * 0.00035, -0.030, 0.030) * swayScale, 10, dt);
    this.swayY = damp(this.swayY, clamp(look.y * 0.00030, -0.026, 0.026) * swayScale, 10, dt);

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

    // Scope overlay only for magnified optics at the sights.
    const scopeOn = !!this.fpActive && this.ads > 0.55 && this.weaponDef?.optic === 'acog';
    this.scopePlane.visible = scopeOn;
    // At the sights the gun/optic would sit inside the tube: replace all of it with the overlay.
    if (this.fpActive) {
      const fpLive = this.fp[this.fpActive];
      fpLive.holder.visible = !scopeOn;
    }
    if (scopeOn) {
      const s = 1 + (1 - this.ads) * 1.6; // blooms open as the eye comes up
      this.scopePlane.scale.set(s, s, 1);
    }

    if (this.fpActive) this._updateFp(dt, player, weapon, bobX, bobY);
    else this._updateRifle(dt, player, weapon, bobX, bobY);

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

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { if (this.flash) this.flash.visible = false; this.flashLight.intensity = 0; }
      else this.flashLight.intensity = 7 * (this.flashT / 0.055);
    }
  }

  /* ------------------------------------------------------------- rifle rig */
  _updateRifle(dt, player, weapon, bobX, bobY) {
    const P = this.pose;
    const reloadP = weapon.reloading ? clamp(1 - weapon.reloadT / (weapon.def?.reloadTime || 2.55), 0, 1) : 0;
    const carry = new THREE.Vector3().copy(P.hipPos)
      .lerp(P.sprintPos, this.sprint)
      .lerp(P.reloadPos, this.reloadW * 0.9);
    const carryRot = new THREE.Euler(
      P.hipRot.x + (P.sprintRot.x - P.hipRot.x) * this.sprint + (P.reloadRot.x - P.hipRot.x) * this.reloadW * 0.9,
      P.hipRot.y + (P.sprintRot.y - P.hipRot.y) * this.sprint + (P.reloadRot.y - P.hipRot.y) * this.reloadW * 0.9,
      P.hipRot.z + (P.sprintRot.z - P.hipRot.z) * this.sprint + (P.reloadRot.z - P.hipRot.z) * this.reloadW * 0.9,
    );
    const adsW = this.ads;
    const pos = carry.lerp(P.adsPos, adsW);
    const rot = new THREE.Euler(
      carryRot.x + (P.adsRot.x - carryRot.x) * adsW,
      carryRot.y + (P.adsRot.y - carryRot.y) * adsW,
      carryRot.z + (P.adsRot.z - carryRot.z) * adsW,
    );
    const breath = Math.sin(this.time * 1.6) * 0.0045;
    pos.y += breath * (1 - adsW * 0.8);
    pos.x += this.swayX + bobX;
    pos.y += this.swayY + bobY;
    pos.z += this.kickZ + this.lunge * 0.16;
    pos.x += this.lunge * 0.05;
    rot.x += this.kickRot - this.lunge * 0.22 + this.swayY * 0.8;
    rot.y += this.swayX * 0.9;
    rot.z += -this.lunge * 0.10 - player.lean * 0.05;
    if (weapon.inspectT > 0) {
      const ip = 1 - weapon.inspectT / (weapon.inspectDur || 2.6);
      const k = sampleKeys(INSPECT_RIFLE, ip, this._ik || (this._ik = new Array(6)));
      pos.x += k[0] * 0.01; pos.y += k[1] * 0.01; pos.z += k[2] * 0.01;
      rot.x += k[3] * Math.PI / 180; rot.y += k[4] * Math.PI / 180; rot.z += k[5] * Math.PI / 180;
    }

    this.gun.position.lerp(pos, 1 - Math.exp(-26 * dt));
    this.gun.rotation.x = damp(this.gun.rotation.x, rot.x, 18, dt);
    this.gun.rotation.y = damp(this.gun.rotation.y, rot.y, 18, dt);
    this.gun.rotation.z = damp(this.gun.rotation.z, rot.z, 18, dt);

    const cycleDur = weapon.def?.cycleTime || 0.78;
    const boltP = weapon.cycleT > 0 && !weapon.reloading ? clamp(1 - weapon.cycleT / cycleDur, 0, 1) : 0;
    let lift = 0, pull = 0;
    if (boltP > 0) {
      if (boltP < 0.20) lift = smoothstep(0, 0.20, boltP);
      else if (boltP < 0.40) { lift = 1; pull = smoothstep(0.20, 0.40, boltP); }
      else if (boltP < 0.60) { lift = 1; pull = 1 - smoothstep(0.40, 0.60, boltP); }
      else if (boltP < 0.76) { lift = 1 - smoothstep(0.60, 0.76, boltP); pull = 0; }
    }
    this.bolt.rotation.z = damp(this.bolt.rotation.z, -1.30 * lift, 30, dt);
    this.bolt.position.z = damp(this.bolt.position.z, this.rifleRig.boltRest.z + pull * 0.085, 30, dt);

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
        rotZ = -1.15 + 1.15 * k;
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
        rotZ = -Math.PI / 2 * k;
      }
      targetR.copy(target);
      handRotZ = rotZ;
    }
    handR.position.lerp(targetR, 1 - Math.exp(-22 * dt));
    handR.rotation.z = damp(handR.rotation.z, handRotZ, 16, dt);

    const targetL = this.gripL.clone();
    if (weapon.reloading) targetL.z += 0.03 * smoothstep(0.1, 0.4, reloadP);
    this.handL.position.lerp(targetL, 1 - Math.exp(-14 * dt));
    this.clip.visible = weapon.reloading && reloadP > 0.34 && reloadP < 0.70;

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

    this.gun.updateMatrixWorld(true);
    if (!this.hands) this.handL.visible = this.ads < 0.55;
    this.hands?.update(this.gun, this.handR, this.handL);
  }

  /* ---------------------------------------------------------------- FP rig */
  _updateFp(dt, player, weapon, bobX, bobY) {
    const fp = this.fp[this.fpActive];
    const P = fp.poses;
    const adsW = this.ads;
    const pos = P.hipPos.clone().lerp(P.adsPos, adsW);
    const rot = new THREE.Euler(
      P.hipRot.x + (P.adsRot.x - P.hipRot.x) * adsW,
      P.hipRot.y + (P.adsRot.y - P.hipRot.y) * adsW,
      P.hipRot.z + (P.adsRot.z - P.hipRot.z) * adsW,
    );
    // Sprint carry sits lower and canted.
    pos.x += 0.05 * this.sprint;
    pos.y -= 0.08 * this.sprint;
    rot.x -= 0.30 * this.sprint;
    rot.y += 0.35 * this.sprint;
    rot.z += 0.25 * this.sprint;
    // Reload: the reference project's keyed choreography (tilt in, strip, seat, release).
    const reloadDur = weapon.def?.reloadTime || 2;
    const rp = weapon.reloading ? clamp(1 - weapon.reloadT / reloadDur, 0, 1) : -1;
    if (rp >= 0) {
      const pistol = fp.kind === 'pistol' || fp.kind === 'sidearm';
      const keys = pistol
        ? (weapon.emptyAtReload ? PISTOL_EMPTY : PISTOL_TAC)
        : (weapon.emptyAtReload ? rifleEmptyKeys('release') : RIFLE_TAC);
      const k = sampleKeys(keys, rp, this._rk || (this._rk = new Array(6)));
      pos.x += k[0] * 0.01;
      pos.y += k[1] * 0.01;
      pos.z += k[2] * 0.01;
      rot.x += k[3] * Math.PI / 180;
      rot.y += k[4] * Math.PI / 180;
      rot.z += k[5] * Math.PI / 180;
    }
    // Inspect uses the same key layout, blended over the whole timeline.
    if (weapon.inspectT > 0) {
      const ip = 1 - weapon.inspectT / (weapon.inspectDur || 2.6);
      const pistolInspect = fp.kind === 'pistol' || fp.kind === 'sidearm';
      const k = sampleKeys(pistolInspect ? INSPECT_PISTOL : INSPECT_RIFLE, ip, this._ik || (this._ik = new Array(6)));
      pos.x += k[0] * 0.01;
      pos.y += k[1] * 0.01;
      pos.z += k[2] * 0.01;
      rot.x += k[3] * Math.PI / 180;
      rot.y += k[4] * Math.PI / 180;
      rot.z += k[5] * Math.PI / 180;
    }

    pos.x += this.swayX + bobX;
    pos.y += this.swayY + bobY;
    pos.z += this.kickZ + this.lunge * 0.14;
    pos.x += this.lunge * 0.04;
    rot.x += this.kickRot - this.lunge * 0.20 + this.swayY * 0.8;
    rot.y += this.swayX * 0.9;
    rot.z += -this.lunge * 0.10 - player.lean * 0.05;

    fp.holder.position.lerp(pos, 1 - Math.exp(-26 * dt));
    fp.holder.rotation.x = damp(fp.holder.rotation.x, rot.x, 18, dt);
    fp.holder.rotation.y = damp(fp.holder.rotation.y, rot.y, 18, dt);
    fp.holder.rotation.z = damp(fp.holder.rotation.z, rot.z, 18, dt);
    fp.holder.updateMatrixWorld(true);

    if (P.muzzle) {
      this.flashLight.position.copy(P.muzzle).multiplyScalar(P.scale).applyMatrix4(fp.holder.matrixWorld);
    }

    // Magazine out / in and the empty-reload bolt release, driven from the same timeline.
    const rig = fp.rig;
    if (rig.magazine && rig.magHome) {
      let out = 0;
      if (rp >= 0) {
        if (rp < 0.30) out = phase(rp, [0.09, 0.30]);
        else if (rp < 0.46) out = 1;
        else out = 1 - phase(rp, [0.46, 0.62]);
      }
      rig.magazine.position.y = rig.magHome.y - out * 0.16;
      rig.magazine.position.z = rig.magHome.z + out * 0.04;
      rig.magazine.visible = out < 0.985;
    }
    if (rig.charging && rig.chargeHome) {
      let pull = 0;
      if (rp >= 0 && weapon.emptyAtReload) {
        if (rp < 0.66) pull = 0;
        else if (rp < 0.72) pull = phase(rp, [0.66, 0.72]);
        else if (rp < 0.76) pull = 1 - phase(rp, [0.72, 0.76]);
        else pull = 0;
      }
      rig.charging.position.z = rig.chargeHome.z + pull * 0.12;
    }

    if (weapon.cycleT > 0 && this.lastCycle <= 0) this._ejectCasing();
    this.lastCycle = weapon.cycleT > 0 ? 1 : 0;
    if (weapon.reloading && this.lastReload < 0.5 && rp >= 0.5) this.game.audio?.reload('clip');
    this.lastReload = weapon.reloading ? 1 : 0;
  }

  setEnabled(v) { this.rig.visible = v; }
}

let _flash = null;
function flashTexture() {
  if (_flash) return _flash;
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,240,1)');
  grd.addColorStop(0.18, 'rgba(255,224,150,0.95)');
  grd.addColorStop(0.45, 'rgba(255,150,60,0.55)');
  grd.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  // Star spikes.
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,230,170,0.85)';
  g.lineWidth = 5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    g.beginPath();
    g.moveTo(s / 2 + Math.cos(a) * 8, s / 2 + Math.sin(a) * 8);
    g.lineTo(s / 2 + Math.cos(a) * s * 0.46, s / 2 + Math.sin(a) * s * 0.46);
    g.stroke();
  }
  _flash = new THREE.CanvasTexture(c);
  return _flash;
}

let _scope = null;
function scopeTexture() {
  if (_scope) return _scope;
  const s = 512, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, s, s);
  // Punched-out sight picture.
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.43, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  // Inner vignette so the glass edge reads.
  const grd = g.createRadialGradient(s / 2, s / 2, s * 0.30, s / 2, s / 2, s * 0.43);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.92)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.43, 0, Math.PI * 2);
  g.fill();
  // Reticle: chevron + stadia marks.
  g.strokeStyle = 'rgba(10,10,10,0.95)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(s / 2, s * 0.18); g.lineTo(s / 2, s * 0.36);
  g.moveTo(s / 2, s * 0.64); g.lineTo(s / 2, s * 0.82);
  g.moveTo(s * 0.18, s / 2); g.lineTo(s * 0.36, s / 2);
  g.moveTo(s * 0.64, s / 2); g.lineTo(s * 0.82, s / 2);
  g.stroke();
  g.lineWidth = 2;
  for (let i = 1; i <= 4; i++) {
    const d = i * s * 0.045;
    g.beginPath();
    g.moveTo(s / 2 - 7, s / 2 + d); g.lineTo(s / 2 + 7, s / 2 + d);
    g.moveTo(s / 2 - 5, s / 2 - d); g.lineTo(s / 2 + 5, s / 2 - d);
    g.stroke();
  }
  // Centre chevron.
  g.fillStyle = 'rgba(200,30,20,0.95)';
  g.beginPath();
  g.moveTo(s / 2, s / 2 - 6);
  g.lineTo(s / 2 - 7, s / 2 + 10);
  g.lineTo(s / 2 + 7, s / 2 + 10);
  g.closePath();
  g.fill();
  _scope = new THREE.CanvasTexture(c);
  return _scope;
}

let _reticle = null;
function reticleTexture() {
  if (_reticle) return _reticle;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,80,40,0.95)');
  grd.addColorStop(0.55, 'rgba(255,30,10,0.35)');
  grd.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _reticle = new THREE.CanvasTexture(c);
  return _reticle;
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
