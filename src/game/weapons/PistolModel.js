import * as THREE from 'three';

/**
 * Mauser C96 (驳壳枪) first-person rig, built from primitives.
 *
 * Same contract as the Type 38 rig: origin on the sight line at the rear notch,
 * bore down -Z, and `handR` / `handL` anchors the skinned arms solve onto.
 * The pistol is short, so the support hand sits under the magazine well — the
 * pose is a two-hand hold rather than a forend grip.
 */
export function buildC96(mats) {
  const g = new THREE.Group();
  g.name = 'c96';

  const steel = mats.get('gunMetal');
  const wood = mats.get('gunWood');
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.55, metalness: 0.75 });

  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = false;
    m.receiveShadow = false;
    g.add(m);
    return m;
  };

  // Sight line sits 0.030 m above the bore axis, like the real gun.
  const BORE_Y = -0.030;

  // Receiver / barrel extension.
  mesh(new THREE.BoxGeometry(0.026, 0.034, 0.120), steel, 0, BORE_Y, -0.010);
  // Barrel.
  const barrel = mesh(new THREE.CylinderGeometry(0.0085, 0.0095, 0.135, 12), steel, 0, BORE_Y, -0.120);
  barrel.rotation.x = Math.PI / 2;
  // Barrel jacket front ring.
  const ring = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.016, 12), dark, 0, BORE_Y, -0.150);
  ring.rotation.x = Math.PI / 2;

  // Broomhandle grip, raked back.
  const grip = new THREE.Group();
  grip.position.set(0, BORE_Y - 0.070, 0.035);
  grip.rotation.x = 0.30;
  g.add(grip);
  const gripBody = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.105, 0.034), wood);
  gripBody.position.set(0, -0.030, 0);
  grip.add(gripBody);
  const gripCap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.012, 0.036), steel);
  gripCap.position.set(0, -0.082, 0);
  grip.add(gripCap);

  // Trigger guard + trigger.
  mesh(new THREE.TorusGeometry(0.017, 0.0025, 6, 12, Math.PI), steel, 0, BORE_Y - 0.028, 0.002)
    .rotation.set(Math.PI, 0, 0);
  mesh(new THREE.BoxGeometry(0.004, 0.014, 0.004), dark, 0, BORE_Y - 0.030, 0.002);

  // Fixed 10-round magazine ahead of the trigger.
  mesh(new THREE.BoxGeometry(0.024, 0.030, 0.072), steel, 0, BORE_Y - 0.026, -0.070);
  mesh(new THREE.BoxGeometry(0.026, 0.006, 0.076), dark, 0, BORE_Y - 0.042, -0.070);

  // Hammer + rear sight.
  mesh(new THREE.BoxGeometry(0.010, 0.020, 0.008), dark, 0, BORE_Y + 0.020, 0.056);
  mesh(new THREE.BoxGeometry(0.016, 0.006, 0.010), dark, 0, BORE_Y + 0.020, 0.045);
  // Front sight blade.
  mesh(new THREE.BoxGeometry(0.003, 0.010, 0.004), dark, 0, BORE_Y + 0.014, -0.176);

  // Bolt that cycles back on each shot (the visible "slide").
  const slide = new THREE.Group();
  slide.position.set(0, BORE_Y + 0.019, 0.020);
  g.add(slide);
  const slideBody = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.012, 0.048), steel);
  slideBody.position.z = -0.004;
  slide.add(slideBody);
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.014), dark);
  hammer.position.set(0, 0.006, 0.020);
  slide.add(hammer);

  // Muzzle + flash.
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, BORE_Y, -0.190);
  g.add(muzzle);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  flash.position.copy(muzzle.position);
  flash.scale.setScalar(0.12);
  flash.visible = false;
  g.add(flash);

  // Hand anchors: right on the grip, left cupping the magazine well.
  const handR = new THREE.Object3D();
  handR.position.set(0.004, BORE_Y - 0.115, 0.058);
  handR.rotation.set(-0.35, 0, 0);
  g.add(handR);

  const handL = new THREE.Object3D();
  handL.position.set(-0.012, BORE_Y - 0.080, -0.046);
  handL.rotation.set(0.2, 0.25, 0);
  g.add(handL);

  g.userData = {
    bolt: slide,
    boltKnob: hammer,
    handR,
    handL,
    clipAnchor: grip,
    muzzle,
    flash,
    bayonet: null,
    sightRear: new THREE.Object3D(),
    sightFront: new THREE.Object3D(),
    boltRest: slide.position.clone(),
  };
  return g;
}
