import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const BACK = new THREE.Vector3(0, 0, 1);

/**
 * Two-bone first-person arms.
 *
 * The wrists ride on the gun (the hands are children of the Type 38), so the arms are
 * solved backwards from those animated anchors to fixed shoulders behind the camera.
 * Nothing is skinned: each limb is a tapered capsule re-posed per frame, with capsule
 * joints at the elbow and wrist so the silhouette stays continuous.
 */
export class FpArms {
  constructor(mats) {
    this.group = new THREE.Group();
    this.group.name = 'fp-arms';

    const cloth = mats.get('uniformGrey');
    this.sleeve = cloth
      ? cloth.clone()
      : new THREE.MeshStandardMaterial({ color: 0x5c6253, roughness: 0.96 });
    if (this.sleeve.map) this.sleeve.map.repeat.set(3, 3);
    this.sleeve.color.setHex(0x474d3e);
    this.sleeve.roughness = 0.97;
    this.sleeve.metalness = 0;
    this.sleeve.envMapIntensity = 0.7;

    this.cuffMat = new THREE.MeshStandardMaterial({ color: 0x3a3f34, roughness: 0.95 });
    this.wrapMat = new THREE.MeshStandardMaterial({ color: 0x6a6148, roughness: 0.9 });

    this.arms = {
      R: this._buildArm(1),
      L: this._buildArm(-1),
    };
    // Shoulders sit below and slightly behind the camera: the arms rise into frame.
    this.shoulders = {
      R: new THREE.Vector3(0.160, -0.340, -0.050),
      L: new THREE.Vector3(-0.160, -0.340, -0.050),
    };
    this.lengths = { upper: 0.315, fore: 0.300 };
    this.poles = {
      R: new THREE.Vector3(0.75, -0.62, 0.22),
      L: new THREE.Vector3(-0.75, -0.62, 0.22),
    };
  }

  _buildArm(side) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 1, 10, 1), this.sleeve);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.028, 1, 10, 1), this.sleeve);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), this.sleeve);
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.027, 10, 8), this.cuffMat);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.050, 10, 8), this.sleeve);

    // Cuff: a cloth band at the wrist end of the forearm.
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.033, 0.05, 12), this.wrapMat);
    cuff.rotation.x = Math.PI / 2;

    for (const m of [upper, fore, elbow, wrist, shoulder, cuff]) {
      m.castShadow = false;
      m.receiveShadow = false;
      this.group.add(m);
    }
    // Geometry is unit-length along +Y, shifted so the base sits at the origin.
    upper.geometry.translate(0, 0.5, 0);
    fore.geometry.translate(0, 0.5, 0);
    return { side, upper, fore, elbow, wrist, shoulder, cuff };
  }

  /** hands: Object3D children of the gun (handR, handL). */
  update(handR, handL, gun) {
    this._solve(this.arms.R, 1, handR, gun);
    this._solve(this.arms.L, -1, handL, gun);
  }

  /**
   * The forearm is anchored to the wrist and hangs down/out/back into the lower corner
   * of the frame; the upper arm continues off-screen. This is deliberately not a
   * shoulder IK: at first-person range the shoulder is off-camera, and a free elbow
   * keeps the sleeve connected to the hand through every reload pose.
   */
  _solve(arm, side, hand, gun) {
    hand.updateWorldMatrix(true, false);
    gun.updateWorldMatrix(true, false);

    // Wrist: just behind and below the palm, in the gun's frame.
    const W = _a.setFromMatrixPosition(hand.matrixWorld);
    _b.setFromMatrixColumn(gun.matrixWorld, 2).normalize().multiplyScalar(0.055);
    W.add(_b);
    _b.setFromMatrixColumn(gun.matrixWorld, 1).normalize().multiplyScalar(-0.020);
    W.add(_b);

    // Elbow: down, out and toward the camera so the sleeve crosses the lower frame.
    const E = _b.copy(W).addScaledVector(RIGHT, side * 0.040).addScaledVector(DOWN, 0.030).addScaledVector(BACK, 0.100);
    const S = _c.copy(E).addScaledVector(RIGHT, side * 0.065).addScaledVector(DOWN, 0.105).addScaledVector(BACK, 0.100);

    arm.fore.position.copy(E);
    arm.fore.quaternion.setFromUnitVectors(UP, _dir.subVectors(W, E).normalize());
    arm.fore.scale.set(1, E.distanceTo(W), 1);

    arm.upper.position.copy(S);
    arm.upper.quaternion.setFromUnitVectors(UP, _dir.subVectors(E, S).normalize());
    arm.upper.scale.set(1, S.distanceTo(E), 1);

    arm.elbow.position.copy(E);
    arm.wrist.position.copy(W);
    arm.shoulder.position.copy(S);

    arm.cuff.position.copy(W).addScaledVector(_dir.subVectors(W, E).normalize(), -0.035);
    arm.cuff.quaternion.copy(arm.fore.quaternion);
  }
}
