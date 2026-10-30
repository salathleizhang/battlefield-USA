import * as THREE from 'three';

/** Procedural 三八大盖 (Type 38 Arisaka) + Type 30 bayonet, first-person presentation. */
export function buildType38(mats) {
  const g = new THREE.Group();
  const butt = new THREE.Group();
  g.add(butt);
  const leftArm = new THREE.Group();
  g.add(leftArm);
  const wood = mats.get('gunWood');
  const metal = mats.get('gunMetal');
  const brass = mats.get('brass');

  // Butt stock.
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.135, 0.44), wood);
  stock.position.set(0, -0.035, 0.30);
  stock.rotation.x = -0.06;
  butt.add(stock);
  // Wrist.
  const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.095, 0.22), wood);
  wrist.position.set(0, -0.02, 0.06);
  butt.add(wrist);
  // Receiver.
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.07, 0.30), metal);
  receiver.position.set(0, 0.015, -0.10);
  g.add(receiver);
  // Barrel.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.80, 10), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.63);
  g.add(barrel);
  // Upper handguard.
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.042, 0.56), wood);
  guard.position.set(0, 0.018, -0.42);
  g.add(guard);
  // Magazine.
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.09), metal);
  mag.position.set(0, -0.045, -0.10);
  g.add(mag);
  // Trigger guard.
  const tg = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 12, Math.PI), metal);
  tg.rotation.x = Math.PI / 2;
  tg.position.set(0, -0.06, 0.02);
  g.add(tg);

  // Rear sight (notch).
  const rear = new THREE.Group();
  const rearBase = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.016, 0.05), metal);
  rearBase.position.y = 0.052;
  rear.add(rearBase);
  for (const side of [-1, 1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.028, 0.018), metal);
    blade.position.set(side * 0.015, 0.072, 0);
    rear.add(blade);
  }
  rear.position.set(0, 0, -0.12);
  g.add(rear);

  // Front sight + protective wings.
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.038, 0.012), metal);
  front.position.set(0, 0.066, -1.00);
  g.add(front);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.045, 0.05), metal);
    wing.position.set(side * 0.018, 0.062, -1.00);
    g.add(wing);
  }

  // Bolt assembly (animated during cycling).
  const bolt = new THREE.Group();
  const boltBody = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.18, 8), metal);
  boltBody.rotation.z = Math.PI / 2;
  boltBody.position.set(-0.03, 0.035, 0.02);
  bolt.add(boltBody);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.10, 6), metal);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.045, 0.015, 0.02);
  bolt.add(handle);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), metal);
  knob.position.set(0.082, 0.015, 0.02);
  bolt.add(knob);
  g.add(bolt);

  // Sling swivels.
  for (const z of [0.36, -0.55]) {
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 4, 8), brass);
    sw.rotation.y = Math.PI / 2;
    sw.position.set(0, -0.075, z);
    g.add(sw);
  }

  // Type 30 bayonet.
  const bayonet = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.028, 0.42), new THREE.MeshStandardMaterial({
    color: 0xb9bcc0, roughness: 0.25, metalness: 0.95,
  }));
  blade.position.set(0, 0.03, -1.34);
  // Taper the tip.
  blade.scale.set(1, 1, 1);
  bayonet.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.09, 4), blade.material);
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(0, 0.03, -1.55);
  bayonet.add(tip);
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), metal);
  hilt.position.set(0, 0.03, -1.08);
  bayonet.add(hilt);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 4, 8), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.03, -1.12);
  bayonet.add(ring);
  g.add(bayonet);

  // Hands + forearms (slim tapered limbs read better than blocks).
  const skin = new THREE.MeshStandardMaterial({ color: 0xa9835f, roughness: 0.9 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x6a6f62, roughness: 0.95 });
  const limb = (a, b, r0, r1, mat) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(r1, r0, len, 7);
    geo.translate(0, len / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(va);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  };

  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.062, 0.10), skin);
  rightHand.position.set(0.012, -0.052, 0.105);
  butt.add(rightHand);
  butt.add(limb([0.12, -0.28, 0.12], [0.035, -0.09, 0.12], 0.05, 0.038, sleeve));
  const rightFingers = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.022, 0.075), skin);
  rightFingers.position.set(0.012, -0.075, 0.10);
  butt.add(rightFingers);

  const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.05, 0.095), skin);
  leftHand.position.set(-0.004, -0.04, -0.42);
  leftHand.rotation.x = -0.2;
  leftArm.add(leftHand);
  leftArm.add(limb([-0.16, -0.27, -0.20], [-0.02, -0.075, -0.39], 0.052, 0.036, sleeve));
  const leftFingers = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.022, 0.075), skin);
  leftFingers.position.set(-0.004, -0.062, -0.43);
  leftArm.add(leftFingers);

  // Muzzle flash sprite + light.
  const flashTex = makeFlashTexture();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flashTex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false,
  }));
  flash.position.set(0, 0.032, -1.16);
  flash.scale.setScalar(0.34);
  flash.visible = false;
  g.add(flash);

  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  g.userData = { bolt, bayonet, flash, butt, leftArm };
  return g;
}

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,240,1)');
  grd.addColorStop(0.2, 'rgba(255,215,140,0.95)');
  grd.addColorStop(0.5, 'rgba(255,140,40,0.55)');
  grd.addColorStop(1, 'rgba(255,80,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? 22 : 60;
    ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
