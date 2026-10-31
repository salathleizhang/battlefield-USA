import * as THREE from 'three';
import { buildType38 } from './Type38.js';

/**
 * ZB-26 (捷克式轻机枪) first-person rig.
 *
 * Built on the scanned Type 38 receiver — same sight line, same hand anchors, so the
 * arms, the ADS alignment and the muzzle all reuse the rifle pipeline. The parts that
 * make it read as a light machine gun are added on top: the top-mounted 20-round
 * magazine, a heavier barrel jacket and a folded bipod.
 */
export function buildLmg(mats, template) {
  const g = buildType38(mats, template);
  g.name = 'zb26';

  const steel = mats.get('gunMetal');
  const dark = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.48, metalness: 0.82 });

  // Top-mounted curved magazine: box body tilted forward, with a catch at the rear.
  // Offset to the left of the sight line so it never blocks the iron sights at ADS.
  const mag = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.046, 0.130), dark);
  body.position.set(0, 0, -0.010);
  mag.add(body);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.010, 0.028), steel);
  lip.position.set(0, -0.024, 0.048);
  mag.add(lip);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.050, 0.120), steel);
  spine.position.set(0, 0.002, -0.040);
  mag.add(spine);
  mag.position.set(-0.046, -0.012, -0.060);
  mag.rotation.set(0.08, 0, -0.06);
  g.add(mag);

  // Heavier barrel jacket ring ahead of the receiver.
  const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.075, 14), dark);
  jacket.rotation.x = Math.PI / 2;
  jacket.position.set(0, -0.045, -0.330);
  g.add(jacket);
  const jacketRing = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.010, 14), steel);
  jacketRing.rotation.x = Math.PI / 2;
  jacketRing.position.set(0, -0.045, -0.368);
  g.add(jacketRing);

  // Folded bipod under the muzzle end.
  const bipod = new THREE.Group();
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.150, 8), dark);
    leg.position.set(side * 0.020, -0.055, -0.020);
    leg.rotation.set(0.55, 0, side * 0.45);
    bipod.add(leg);
  }
  bipod.position.set(0, -0.058, -0.395);
  bipod.rotation.x = 0.18;
  g.add(bipod);

  // Mount neck tying the magazine down onto the barrel jacket.
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.030, 0.050), steel);
  mount.position.set(-0.030, -0.030, -0.060);
  g.add(mount);

  g.userData.isLmg = true;
  return g;
}
