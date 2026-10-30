import * as THREE from 'three';

/** Procedural 三八大盖 (Type 38 Arisaka) + Type 30 bayonet, first-person presentation. */
export function buildType38(mats) {
  const g = new THREE.Group();
  const wood = mats.get('gunWood');
  const metal = mats.get('gunMetal');
  const brass = mats.get('brass');

  // Butt stock.
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.135, 0.44), wood);
  stock.position.set(0, -0.035, 0.30);
  stock.rotation.x = -0.06;
  g.add(stock);
  // Wrist.
  const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.095, 0.22), wood);
  wrist.position.set(0, -0.02, 0.06);
  g.add(wrist);
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
  handle.position.set(0.055, 0.02, 0.02);
  bolt.add(handle);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), metal);
  knob.position.set(0.10, 0.02, 0.02);
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

  // Hands (coarse but readable gloves).
  const skin = new THREE.MeshStandardMaterial({ color: 0xa9835f, roughness: 0.9 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x6a6f62, roughness: 0.95 });
  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.11), skin);
  rightHand.position.set(0.015, -0.055, 0.10);
  g.add(rightHand);
  const rightSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.30), sleeve);
  rightSleeve.position.set(0.12, -0.10, 0.26);
  rightSleeve.rotation.set(0.2, -0.3, 0.25);
  g.add(rightSleeve);
  const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.10), skin);
  leftHand.position.set(-0.005, -0.045, -0.42);
  g.add(leftHand);
  const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.34), sleeve);
  leftSleeve.position.set(-0.18, -0.13, -0.33);
  leftSleeve.rotation.set(-0.1, 0.45, -0.35);
  g.add(leftSleeve);

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
  g.userData = { bolt, bayonet, flash };
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
