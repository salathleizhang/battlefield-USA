import * as THREE from 'three';

/**
 * 三八大盖 (Type 38) first-person rig.
 *
 * The gun itself is a CC0 scan-grade bolt-action rifle (Poly Haven, see CREDITS): the
 * scene graph is normalised to metres, muzzle down -Z, and the origin is placed on the
 * rear sight notch so ADS is a literal alignment. Two gloved hands ride on the gun and
 * the arms solve onto them (FpHands); the bolt is re-parented to its bore
 * pivot so it can lift and travel.
 *
 * When the template has not loaded yet, a procedural stand-in with identical anchors is
 * used, so the viewmodel always has something to animate.
 */
const SIGHT_LINE_LOCAL = 0.130;   // rear sight notch height, model space
const REAR_SIGHT_X = 0.500;       // rear notch along the barrel, model space
const LENGTH_MODEL = 1.231;       // butt to muzzle, model space
const LENGTH_M = 1.275;           // real Type 38 length

export function buildType38(mats, template) {
  return template ? buildFromTemplate(mats, template) : buildProcedural(mats);
}

function buildFromTemplate(mats, template) {
  const g = new THREE.Group();
  g.name = 'type38';

  const model = template.clone(true);
  for (const n of ['bolt_action_rifle_7_62_scope', 'bolt_action_rifle_7_62_wrap', 'bolt_action_rifle_7_62_bullet_54mm']) {
    model.getObjectByName(n)?.removeFromParent();
  }
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!m) continue;
      m.envMapIntensity = 1.0;
      if (m.map) m.map.anisotropy = 4;
    }
  });

  // Normalise: the source is authored +X toward the muzzle. Rotate the bore onto -Z,
  // scale to the real rifle length, then shift the whole rifle until the rear sight
  // notch sits exactly on the origin.
  model.rotation.y = Math.PI / 2;
  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  let size = box.getSize(new THREE.Vector3());
  const s = LENGTH_M / size.z;
  model.scale.setScalar(s);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  size = box.getSize(new THREE.Vector3());
  const height = size.y;

  // Measured fractions on the source asset: the notch is 98.3% up the profile and
  // 46.4% of the way from the butt toward the muzzle.
  const sightY = box.min.y + height * 0.9835;
  const rearZ = box.max.z - size.z * 0.4636;
  model.position.x -= (box.min.x + box.max.x) * 0.5;
  model.position.y -= sightY + 0.028; // sight line sits 28 mm above the scanned tangent leaf
  model.position.z -= rearZ;
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  g.add(model);

  const boreY = -0.0176 - 0.028;
  const muzzleZ = box.min.z;

  // Bolt: lift + travel around the bore axis.
  const bolt = new THREE.Group();
  bolt.position.set(0, boreY, 0.285);
  g.add(bolt);
  for (const name of ['bolt_action_rifle_7_62_bolt_a', 'bolt_action_rifle_7_62_bolt_b']) {
    const o = model.getObjectByName(name);
    if (o) bolt.attach(o);
  }
  const boltKnob = new THREE.Object3D();
  boltKnob.position.set(0.035, -0.006, 0.030);
  bolt.add(boltKnob);

  // Muzzle marker + bayonet.
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, boreY, muzzleZ);
  g.add(muzzle);

  const bayonet = new THREE.Group();
  const bright = new THREE.MeshStandardMaterial({ color: 0xb9bec0, roughness: 0.26, metalness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4d4e, roughness: 0.5, metalness: 0.85 });
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.024, 0.070), steel);
  hilt.position.set(0, muzzle.position.y - 0.018, muzzle.position.z + 0.024);
  bayonet.add(hilt);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0.010);
  bladeShape.lineTo(0.40, 0.002);
  bladeShape.lineTo(0.40, -0.002);
  bladeShape.lineTo(0, -0.012);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0018, bevelSegments: 1 });
  bladeGeo.rotateY(Math.PI / 2);
  bladeGeo.translate(0.004, 0, 0);
  const blade = new THREE.Mesh(bladeGeo, bright);
  blade.position.set(0, muzzle.position.y - 0.020, muzzle.position.z);
  bayonet.add(blade);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0024, 4, 10), steel);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(0, muzzle.position.y, muzzle.position.z + 0.012);
  bayonet.add(ring);
  g.add(bayonet);

  // Iron sights: a receiver aperture and a matching front post. The scanned rifle's
  // own tangent leaf folds flat on the barrel, which leaves no usable notch, so the rig
  // carries a clean diopter on the bore line at the origin.
  const iron = new THREE.Group();
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1b1d1e, roughness: 0.45, metalness: 0.85 });
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.012, 0.034), ironMat);
  mount.position.set(0, -0.050, 0.010);
  iron.add(mount);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.040, 0.006), ironMat);
  stem.position.set(0, -0.030, 0.003);
  iron.add(stem);
  const aperture = new THREE.Mesh(new THREE.TorusGeometry(0.0095, 0.0018, 6, 24), ironMat);
  aperture.position.set(0, 0, 0);
  iron.add(aperture);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.005), ironMat);
    leg.position.set(side * 0.010, -0.010, 0.0);
    iron.add(leg);
  }
  // Front post with protective ears.
  const frontBase = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.030), ironMat);
  frontBase.position.set(0, -0.072, -0.600);
  iron.add(frontBase);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.0032, 0.042, 0.004), ironMat);
  post.position.set(0, -0.021, -0.600);
  iron.add(post);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.0030, 0.038, 0.016), ironMat);
    ear.position.set(side * 0.0095, -0.033, -0.600);
    ear.rotation.z = side * 0.10;
    iron.add(ear);
  }
  g.add(iron);

  // Hands.
  const glove = new THREE.MeshStandardMaterial({ color: 0x6b4c32, roughness: 0.78, metalness: 0.0 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x4f5546, roughness: 0.97, metalness: 0.0 });
  const gloveCuffMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.94 });
  const handR = buildHand({ side: 1, glove, cuff: sleeve, cuffDark: gloveCuffMat });
  handR.position.set(0.030, -0.080, 0.285);
  handR.rotation.set(0.02, 0, -Math.PI / 2);
  g.add(handR);
  const handL = buildHand({ side: -1, glove, cuff: sleeve, cuffDark: gloveCuffMat });
  handL.position.set(0.044, -0.128, -0.255);
  handL.scale.setScalar(1.12);
  handL.rotation.set(0.10, 0.55, Math.PI);
  g.add(handL);

  const clipAnchor = new THREE.Object3D();
  clipAnchor.position.set(0, 0.020, 0.120);
  g.add(clipAnchor);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeFlashTexture(), color: 0xffe0b0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  flash.position.copy(muzzle.position);
  flash.scale.setScalar(0.32);
  flash.visible = false;
  g.add(flash);

  g.userData = {
    bolt, boltKnob, handR, handL, clipAnchor, muzzle, flash, bayonet,
    sightRear: new THREE.Object3D(), sightFront: new THREE.Object3D(),
    boltRest: bolt.position.clone(),
  };
  return g;
}

const Y_BORE = -0.045;

function buildProcedural(mats) {
  const g = new THREE.Group();
  g.name = 'type38';

  const wood = mats.get('gunWood');
  const steel = mats.get('gunMetal');
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2e2f, roughness: 0.44, metalness: 0.86 });
  const bright = new THREE.MeshStandardMaterial({ color: 0xb9bec0, roughness: 0.26, metalness: 0.95 });
  const brass = mats.get('brass');
  const glove = new THREE.MeshStandardMaterial({ color: 0x6b4c32, roughness: 0.78, metalness: 0.0 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x4f5546, roughness: 0.97, metalness: 0.0 });
  const gloveCuffMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.94 });

  const add = (parent, geo, mat, pos, rot) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(m);
    return m;
  };

  /* ------------------------------------------------------------------ stock */

  // Profile in (z, y), extruded across the gun and centred on X.
  const profile = (points, width, bevel = 0.004) => {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel,
      bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 8,
    });
    geo.rotateY(-Math.PI / 2);
    geo.translate(width / 2, 0, 0);
    return geo;
  };

  const buttGeo = profile([
    [0.015, -0.078], [0.180, -0.080], [0.330, -0.086], [0.470, -0.095],
    [0.528, -0.107], [0.545, -0.140], [0.545, -0.212], [0.512, -0.226],
    [0.400, -0.212], [0.270, -0.190], [0.150, -0.168], [0.070, -0.152],
    [0.015, -0.142],
  ], 0.043, 0.005);
  add(g, buttGeo, wood);

  const forendGeo = profile([
    [-0.600, -0.098], [-0.560, -0.110], [-0.250, -0.118], [0.020, -0.120],
    [0.020, -0.062], [-0.250, -0.060], [-0.560, -0.066], [-0.600, -0.074],
  ], 0.041, 0.004);
  add(g, forendGeo, wood);

  // Upper handguard over the barrel.
  const guardGeo = profile([
    [-0.560, -0.058], [-0.530, -0.026], [-0.230, -0.022], [-0.155, -0.028],
    [-0.155, -0.060], [-0.530, -0.058],
  ], 0.033, 0.003);
  add(g, guardGeo, wood);

  /* ------------------------------------------------------------------ metal */

  // Receiver + flat top.
  add(g, new THREE.BoxGeometry(0.045, 0.060, 0.230), steel, [0, -0.040, -0.005]);
  add(g, new THREE.BoxGeometry(0.040, 0.010, 0.230), dark, [0, -0.007, -0.005]);
  // Receiver ring where the barrel screws in, and the tang behind the bolt.
  add(g, new THREE.CylinderGeometry(0.019, 0.019, 0.032, 16), dark, [0, Y_BORE, -0.126], [Math.PI / 2, 0, 0]);
  add(g, new THREE.CylinderGeometry(0.016, 0.016, 0.045, 12), steel, [0, -0.042, 0.098], [Math.PI / 2, 0, 0]);

  // Barrel: tapered, with a shoulder at the receiver.
  const barrelLen = 0.565;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0070, 0.0102, barrelLen, 16), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, Y_BORE, -0.140 - barrelLen / 2);
  g.add(barrel);
  add(g, new THREE.CylinderGeometry(0.0125, 0.0125, 0.040, 14), steel, [0, Y_BORE, -0.160], [Math.PI / 2, 0, 0]);
  add(g, new THREE.CylinderGeometry(0.0090, 0.0090, 0.012, 12), steel, [0, Y_BORE, -0.600], [Math.PI / 2, 0, 0]);

  // Muzzle + crown.
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, Y_BORE, -0.726);
  g.add(muzzle);
  add(g, new THREE.CylinderGeometry(0.0082, 0.0066, 0.016, 12), bright, [0, Y_BORE, -0.722], [Math.PI / 2, 0, 0]);

  // Bolt: rotates about the bore axis and travels rearward.
  const bolt = new THREE.Group();
  bolt.position.set(0, Y_BORE, 0.052);
  g.add(bolt);
  add(bolt, new THREE.CylinderGeometry(0.0122, 0.0122, 0.185, 12), bright, [0, 0, -0.055], [Math.PI / 2, 0, 0]);
  add(bolt, new THREE.CylinderGeometry(0.0165, 0.0165, 0.020, 12), steel, [0, 0, 0.030], [Math.PI / 2, 0, 0]);
  const stem = add(bolt, new THREE.CylinderGeometry(0.0060, 0.0060, 0.066, 8), bright);
  stem.position.set(0.031, -0.026, 0.028);
  stem.rotation.set(0, 0.35, Math.PI / 2);
  const knob = add(bolt, new THREE.SphereGeometry(0.0140, 12, 10), bright, [0.060, -0.050, 0.030]);
  const boltKnob = new THREE.Object3D();
  boltKnob.position.copy(knob.position);
  bolt.add(boltKnob);

  // Magazine box + floorplate.
  add(g, new THREE.BoxGeometry(0.041, 0.050, 0.100), dark, [0, -0.088, -0.030]);
  add(g, new THREE.BoxGeometry(0.043, 0.007, 0.094), steel, [0, -0.114, -0.030]);
  // Trigger guard: three bars, so it reads as a guard rather than a floating ring.
  add(g, new THREE.BoxGeometry(0.010, 0.038, 0.009), dark, [0, -0.150, 0.104]);
  add(g, new THREE.BoxGeometry(0.010, 0.008, 0.070), dark, [0, -0.169, 0.072]);
  add(g, new THREE.BoxGeometry(0.010, 0.030, 0.009), dark, [0, -0.152, 0.040]);
  add(g, new THREE.BoxGeometry(0.007, 0.026, 0.009), bright, [0, -0.133, 0.060], [0.22, 0, 0]);

  // Barrel bands.
  for (const z of [-0.300, -0.520]) {
    add(g, new THREE.CylinderGeometry(0.028, 0.028, 0.012, 16), steel, [0, -0.086, z], [Math.PI / 2, 0, 0]);
  }
  // Nose cap under the muzzle.
  add(g, new THREE.BoxGeometry(0.033, 0.026, 0.040), steel, [0, -0.094, -0.612]);
  // Sling swivels.
  for (const z of [0.330, -0.300]) {
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0028, 4, 8), brass);
    sw.rotation.y = Math.PI / 2;
    sw.position.set(0, -0.196, z);
    g.add(sw);
  }

  /* ------------------------------------------------------------------ sights */

  // Rear tangent sight. The notch floor is the origin (0, 0, 0).
  add(g, new THREE.BoxGeometry(0.042, 0.012, 0.062), dark, [0, -0.001, 0.004]);
  add(g, new THREE.BoxGeometry(0.038, 0.026, 0.009), steel, [0, 0.012, 0.030], [-0.10, 0, 0]);
  for (const side of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.005, 0.014, 0.013), dark, [side * 0.0115, 0.007, -0.003]);
  }
  add(g, new THREE.BoxGeometry(0.016, 0.003, 0.013), dark, [0, -0.0005, -0.003]);
  const sightRear = new THREE.Object3D();
  sightRear.position.set(0, 0, -0.003);
  g.add(sightRear);

  // Front sight: post between two protective wings, tip on the sight line.
  add(g, new THREE.BoxGeometry(0.028, 0.016, 0.034), steel, [0, -0.040, -0.598]);
  add(g, new THREE.BoxGeometry(0.0042, 0.040, 0.011), dark, [0, -0.020, -0.602]);
  for (const side of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.0045, 0.052, 0.027), steel, [side * 0.015, -0.026, -0.600], [0, 0, side * 0.09]);
  }
  const sightFront = new THREE.Object3D();
  sightFront.position.set(0, 0, -0.602);
  g.add(sightFront);

  /* ------------------------------------------------------------------ bayonet */

  const bayonet = new THREE.Group();
  add(bayonet, new THREE.BoxGeometry(0.015, 0.024, 0.060), steel, [0, -0.100, -0.700]);
  add(bayonet, new THREE.BoxGeometry(0.019, 0.009, 0.026), steel, [0, -0.082, -0.690]);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0.011);
  bladeShape.lineTo(0.36, 0.003);
  bladeShape.lineTo(0.36, -0.001);
  bladeShape.lineTo(0, -0.013);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0018, bevelSegments: 1 });
  bladeGeo.rotateY(Math.PI / 2);
  bladeGeo.translate(0.004, 0, 0);
  const blade = new THREE.Mesh(bladeGeo, bright);
  blade.position.set(0, -0.102, -0.726);
  bayonet.add(blade);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0165, 0.0026, 4, 10), steel);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(0, -0.055, -0.710);
  bayonet.add(ring);
  g.add(bayonet);

  /* ------------------------------------------------------------------ hands */

  const handR = buildHand({ side: 1, glove, cuff: sleeve, cuffDark: gloveCuffMat });
  handR.position.set(0.040, -0.140, 0.075);
  handR.rotation.set(0.02, 0, -Math.PI / 2);
  g.add(handR);

  const handL = buildHand({ side: -1, glove, cuff: sleeve, cuffDark: gloveCuffMat });
  handL.position.set(-0.004, -0.150, -0.360);
  handL.rotation.set(0.02, 0, Math.PI);
  g.add(handL);

  const clipAnchor = new THREE.Object3D();
  clipAnchor.position.set(0, 0.045, 0.000);
  g.add(clipAnchor);

  /* ------------------------------------------------------------------ fx */

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeFlashTexture(), color: 0xffe0b0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  flash.position.set(0, Y_BORE, -0.76);
  flash.scale.setScalar(0.30);
  flash.visible = false;
  g.add(flash);

  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  g.userData = {
    bolt, boltKnob, handR, handL, clipAnchor, muzzle, flash, bayonet,
    sightRear, sightFront, boltRest: bolt.position.clone(),
  };
  return g;
}

/**
 * A gloved hand: palm, four two-segment fingers and a thumb. Fingers point +Z, curl
 * toward -Y, thumb toward +X (mirrored for the left hand).
 */
function buildHand({ side = 1, glove, cuff, cuffDark }) {
  const group = new THREE.Group();

  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.029, 0.048, 4, 10), glove);
  palm.rotation.x = Math.PI / 2;
  palm.scale.set(1.0, 1.0, 0.66);
  palm.position.set(0, 0, 0.020);
  group.add(palm);
  const knuckles = new THREE.Mesh(new THREE.SphereGeometry(0.030, 10, 8), glove);
  knuckles.scale.set(1.02, 0.82, 0.55);
  knuckles.position.set(0, 0.002, 0.052);
  group.add(knuckles);

  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.0150;
    const len = i === 0 || i === 3 ? 0.046 : 0.054;
    const base = new THREE.Group();
    base.position.set(x, 0.000, 0.066);
    base.rotation.x = 0.62 + i * 0.02;
    const p1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0070, len * 0.55, 3, 6), glove);
    p1.rotation.x = Math.PI / 2;
    p1.position.z = len * 0.28;
    base.add(p1);
    const mid = new THREE.Group();
    mid.position.z = len * 0.55;
    mid.rotation.x = 1.30;
    const p2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0062, len * 0.42, 3, 6), glove);
    p2.rotation.x = Math.PI / 2;
    p2.position.z = len * 0.21;
    mid.add(p2);
    base.add(mid);
    group.add(base);
  }
  // Thumb opposes the fingers.
  const thumb = new THREE.Group();
  thumb.position.set(side * 0.028, -0.002, 0.034);
  thumb.rotation.set(1.05, 0, side * 0.95);
  const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0084, 0.034, 3, 6), glove);
  t1.rotation.x = Math.PI / 2;
  t1.position.z = 0.017;
  thumb.add(t1);
  const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0074, 0.028, 3, 6), glove);
  t2.rotation.set(Math.PI / 2, 0, 0);
  t2.position.set(0, -0.005, 0.047);
  thumb.add(t2);
  group.add(thumb);

  // Glove cuff only: a sleeve stub would read as a pipe in first person.
  const gloveCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.031, 0.024, 12), cuffDark);
  gloveCuff.rotation.x = Math.PI / 2;
  gloveCuff.position.set(0, 0, -0.010);
  group.add(gloveCuff);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return group;
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(128, 128, 0, 128, 128, 124);
  grd.addColorStop(0, 'rgba(255,255,244,1)');
  grd.addColorStop(0.18, 'rgba(255,226,150,0.98)');
  grd.addColorStop(0.42, 'rgba(255,150,45,0.62)');
  grd.addColorStop(0.72, 'rgba(220,80,10,0.18)');
  grd.addColorStop(1, 'rgba(120,30,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 ? 30 : 118;
    ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    const r = 96;
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + Math.cos(a - 0.06) * r, 128 + Math.sin(a - 0.06) * r);
    ctx.lineTo(128 + Math.cos(a + 0.06) * r, 128 + Math.sin(a + 0.06) * r);
    ctx.closePath();
  }
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
