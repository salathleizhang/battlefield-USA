import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

/**
 * First-person arms, migrated from the reference first-person rig.
 *
 * The asset is a pair of gloved forearms skinned to a 68-bone FPRig, authored in a gun frame at
 * 2x real scale. Only the arms are kept: the rifle stays the scanned Type 38, so the wrists are
 * re-solved every frame onto the rifle's own hand anchors (handR / handL), which already carry the
 * bolt-cycle and charger-reload motion.
 *
 * Three things keep the sleeve from shearing:
 *   1. reach — the support grip is pulled back onto the receiver and the elbows ride forward, so the
 *      wrist never leaves the arm's reach envelope;
 *   2. roll — the forearm (and the two twist bones under it) counter-rotate about the bone axis so
 *      the wrist frame arrives at the hand's orientation instead of being candy-wrapped onto it;
 *   3. frame — the palm is oriented from the forearm direction plus the rifle's forward axis, not
 *      copied from the anchor's object rotation.
 */

const URL = '/assets/models/weapons/fp_arms.glb';
// Authored at FP_K = 2; FP_TUNE.scale tunes the arms against the rifle's scale.
const ROOT = new THREE.Vector3(0.020, -0.260, -0.160);
const REACH = 1.04;
const SHIFT_MAX = 0.24; // how far the elbows may ride forward toward the hands

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);

/** Runtime tuning: palm inset per side (m) and a roll correction about the forearm axis (deg). */
export const FP_TUNE = {
  scale: 0.44,
  palm: 0.05,
  roll: { R: 0, L: 0 },
  // Extra rotation applied to the grip anchor's own frame (deg), per side.
  grip: { R: [0, 0, 0], L: [0, 0, 0] },
};

export class FpHands {
  constructor(scene) {
    this.root = scene.getObjectByName('FP_m4a1') || scene;
    this.root.scale.setScalar(FP_TUNE.scale);
    this.root.position.copy(ROOT);
    this.root.updateMatrixWorld(true);
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });
    this.ik = { R: new ArmIK(this.root, 'R'), L: new ArmIK(this.root, 'L') };
    this.ready = this.ik.R.ok && this.ik.L.ok;
    for (const side of ['R', 'L']) {
      const ik = this.ik[side];
      if (!ik.ok) continue;
      ik.restLen = ik.fo.getWorldPosition(new THREE.Vector3()).distanceTo(ik.end.getWorldPosition(new THREE.Vector3()));
    }
    this.visible = true;
    // Calibrate each side against the authored rest hold so the runtime frames keep the glove's
    // finger direction instead of guessing an axis convention.
    for (const side of ['R', 'L']) {
      const ik = this.ik[side];
      if (!ik.ok) continue;
      // Authored wrist bend, carried from the rest hold: the forearm's roll is solved against this,
      // so the twist never lands on the wrist as a candy-wrapper.
      const restHand = ik.hand.getWorldQuaternion(new THREE.Quaternion());
      ik.relRest = ik.fo.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(restHand);
    }
  }

  attach(parent) {
    parent.add(this.root);
    this.root.updateMatrixWorld(true);
    return this;
  }

  /** handR / handL: the rifle's animated hand anchors (children of the gun). */
  update(gun, handR, handL) {
    if (!this.ready || !this.visible) return;
    gun.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
    this.ik.R.solve(handR, gun, 'R');
    this.ik.L.solve(handL, gun, 'L');
  }
}

/** Two-bone solve with shoulder drift, forearm roll and the grip's own hand frame. */
class ArmIK {
  constructor(root, side) {
    const g = (n) => root.getObjectByName(n);
    this.up = g(`UpArm_${side}`);
    this.fo = g(`Forearm_${side}`);
    this.end = g(`BoneTwist_01${side}_end`) || g(`BoneTwist_01.${side}_end`);
    this.ctrl = g(`IK_Hand_Cntrl_${side}`);
    this.hand = g(`Hand_${side}`);
    this.twists = ['BoneTwist_03', 'BoneTwist_02', 'BoneTwist_01']
      .map((n) => g(n + side) || g(n + '.' + side))
      .filter(Boolean);
    this.ok = !!(this.up && this.fo && this.end && this.ctrl && this.hand);
    this.restLen = 0;
    this.relRest = new THREE.Quaternion();
  }

  solve(anchor, gun, side) {
    const Wt = anchor.getWorldPosition(new THREE.Vector3());
    const S0 = this.up.getWorldPosition(new THREE.Vector3());

    // 1. Reach: if the grip is beyond the chain, walk the elbow toward it (the sleeve follows, so the
    //    cut end stays off-screen) instead of letting the wrist tear away from the forearm.
    const span0 = S0.distanceTo(Wt);
    const chain = this.fo.getWorldPosition(_v).distanceTo(S0)
      + this.end.getWorldPosition(_v2).distanceTo(this.fo.getWorldPosition(new THREE.Vector3()));
    const over = span0 - chain * REACH;
    if (over > 0) {
      const shift = Math.min(over, SHIFT_MAX);
      _v.copy(Wt).sub(S0).normalize().multiplyScalar(shift);
      this._translateWorld(this.up, _v);
    }

    // The anchors mark the palm, not the wrist: pull the wrist back along the arm so the glove's
    // palm centre lands on the grip instead of the fingers overshooting it.
    Wt.addScaledVector(_v.copy(Wt).sub(S0).normalize(), -FP_TUNE.palm);

    // 2. Swing the two bones onto the wrist.
    const S = this.up.getWorldPosition(new THREE.Vector3());
    const E0 = this.fo.getWorldPosition(new THREE.Vector3());
    const W0 = this.end.getWorldPosition(new THREE.Vector3());
    const W = this.hand.getWorldPosition(new THREE.Vector3());

    const a = E0.distanceTo(S) * REACH;
    const b = W0.distanceTo(E0) * REACH;
    const SW = W.clone().sub(S);
    const d = THREE.MathUtils.clamp(SW.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
    const x = SW.normalize();

    const u0 = E0.clone().sub(S);
    const x0 = W0.clone().sub(S).normalize();
    u0.addScaledVector(x0, -u0.dot(x0));
    const rot = new THREE.Quaternion().setFromUnitVectors(x0, x);
    const u = u0.applyQuaternion(rot);
    u.addScaledVector(x, -u.dot(x)).normalize();

    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const E = S.clone().addScaledVector(x, a * cosA).addScaledVector(u, a * sinA);

    const dq1 = new THREE.Quaternion().setFromUnitVectors(E0.clone().sub(S).normalize(), E.clone().sub(S).normalize());
    this._setWorldQuat(this.up, dq1.multiply(this.up.getWorldQuaternion(new THREE.Quaternion())));

    const E1 = this.fo.getWorldPosition(new THREE.Vector3());
    const W1 = this.end.getWorldPosition(new THREE.Vector3());
    const dq2 = new THREE.Quaternion().setFromUnitVectors(W1.sub(E1).normalize(), W.clone().sub(E1).normalize());
    this._setWorldQuat(this.fo, dq2.multiply(this.fo.getWorldQuaternion(new THREE.Quaternion())));

    // 3. The palm follows the rifle's own hand stub; a small per-side offset corrects the axis
    //    convention between that stub and the glove's bones.
    const g = side === 'R' ? FP_TUNE.grip.R : FP_TUNE.grip.L;
    const gripQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(g[0] * Math.PI / 180, g[1] * Math.PI / 180, g[2] * Math.PI / 180));
    const handQ = anchor.getWorldQuaternion(new THREE.Quaternion()).multiply(gripQ);
    const rollFix = (side === 'R' ? FP_TUNE.roll.R : FP_TUNE.roll.L) * Math.PI / 180;
    if (rollFix) handQ.multiply(_q.setFromAxisAngle(Y, rollFix));

    // 4. Roll the forearm so the wrist end arrives at that frame; split the twist over the forearm and
    //    the twist-bone chain so no single joint is candy-wrapped.
    const expected = this.fo.getWorldQuaternion(new THREE.Quaternion()).multiply(this.relRest);
    _q2.copy(expected).invert().multiply(handQ);
    let angle = 2 * Math.atan2(_q2.y, _q2.w);
    if (angle > Math.PI) angle -= Math.PI * 2;
    if (angle < -Math.PI) angle += Math.PI * 2;
    const share = angle / 3;
    for (const bone of [this.fo, ...this.twists.slice(0, 2)]) {
      bone.quaternion.multiply(_q.setFromAxisAngle(Y, share));
      bone.updateMatrixWorld(true);
    }

    // 4b. Long rifles put the support hand further out than this forearm was modelled for. Stretch the
    // forearm along its own axis instead of leaving a gap: the sleeve stays round, only longer.
    const elbow = this.fo.getWorldPosition(new THREE.Vector3());
    const need = elbow.distanceTo(Wt);
    const stretch = THREE.MathUtils.clamp(need / Math.max(1e-4, this.restLen), 1, 2.2);
    this.fo.scale.set(1, stretch, 1);

    // 5. Put the hand control on the anchor with that frame.
    _v.copy(Wt).applyMatrix4(_m.copy(this.ctrl.parent.matrixWorld).invert());
    this.ctrl.position.copy(_v);
    this.ctrl.parent.getWorldQuaternion(_q).invert();
    this.ctrl.quaternion.copy(_q.multiply(handQ));
    this.ctrl.updateMatrixWorld(true);
  }

  _translateWorld(bone, delta) {
    bone.parent.updateMatrixWorld(true);
    _v2.copy(bone.getWorldPosition(new THREE.Vector3())).add(delta);
    bone.parent.worldToLocal(_v2);
    bone.position.copy(_v2);
    bone.updateMatrixWorld(true);
  }

  _setWorldQuat(bone, qWorld) {
    bone.parent.getWorldQuaternion(_q).invert();
    bone.quaternion.copy(_q.multiply(qWorld));
    bone.updateMatrixWorld(true);
  }
}

let _template = null;

/** Load once, share across view models (each call hands back an independent skeleton clone). */
export async function loadFpHands() {
  if (!_template) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    _template = await loader.loadAsync(URL);
  }
  return cloneSkeleton(_template.scene);
}
