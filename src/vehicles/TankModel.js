import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural WWII tanks.
 *
 * Every part is built from boxes, cylinders and bevelled extrusions, then merged
 * per material so one tank costs a handful of draw calls: hull (one mesh per
 * paint/steel material), turret, gun, one instanced run of track links per side
 * and one instanced set of wheels.
 *
 * Model space: forward is -Z, up is +Y, origin at the ground contact point under
 * the hull centre. `Tank.js` owns the world transform.
 */

export const TANK_DEFS = {
  stuart: {
    id: 'stuart',
    name: 'M3A3 斯图亚特',
    short: 'M3A3',
    nation: '中国远征军',
    paint: 0x6b7149,
    length: 5.0,
    width: 2.24,
    height: 2.55,
    hullTop: 1.44,
    trackWidth: 0.4,
    mass: 14.7,
    maxSpeed: 9.2,
    reverseSpeed: 4.2,
    accel: 2.9,
    brake: 7.5,
    turnRate: 1.05,
    turretSpeed: 2.4,
    hp: 620,
    crew: 4,
    armor: { front: 38, side: 25, rear: 25, turret: 38, top: 12, track: 12 },
    gun: {
      name: '37mm M6', caliber: '37mm', pen: 75, damage: 105, velocity: 884,
      reload: 2.8, blast: 2.4, spread: 0.0016, sightFov: 30,
    },
    mg: { name: 'M1919A4', caliber: '.30-06', damage: 26, interval: 0.09, ammo: 250 },
    turret: { w: 1.4, d: 1.62, h: 0.68, y: 1.5, z: -0.05 },
    barrel: { length: 2.05, radius: 0.062, muzzle: 0.085 },
    wheels: 5,
    hasHullMg: true,
    engineNote: 0.62,
  },
  sherman: {
    id: 'sherman',
    name: 'M4A1 谢尔曼',
    short: 'M4A1',
    nation: '美军',
    paint: 0x626846,
    length: 6.2,
    width: 2.62,
    height: 3.0,
    hullTop: 1.62,
    trackWidth: 0.46,
    mass: 30.3,
    maxSpeed: 7.4,
    reverseSpeed: 3.4,
    accel: 1.9,
    brake: 6.0,
    turnRate: 0.8,
    turretSpeed: 0.95,
    hp: 1150,
    crew: 5,
    armor: { front: 63, side: 38, rear: 38, turret: 76, top: 19, track: 15 },
    gun: {
      name: '75mm M3', caliber: '75mm', pen: 103, damage: 235, velocity: 618,
      reload: 5.0, blast: 3.6, spread: 0.0018, sightFov: 26,
    },
    mg: { name: 'M2HB', caliber: '.50', damage: 38, interval: 0.11, ammo: 300 },
    turret: { w: 1.85, d: 2.05, h: 0.86, y: 1.68, z: 0.08 },
    barrel: { length: 2.55, radius: 0.072, muzzle: 0.098 },
    wheels: 6,
    hasHullMg: false,
    engineNote: 0.5,
  },
  /**
   * M46 Patton. The hull, turret and gun are the authored procedural vehicle
   * exported from Kevin-Liu-01/Claude-of-Tanks (MIT): its textureless geometry
   * is re-skinned with this project's paint and weathering pass at load time.
   */
  patton: {
    id: 'patton',
    name: 'M46 巴顿',
    short: 'M46',
    nation: '美军',
    asset: 'm46',
    paint: 0x6a6f4e,
    length: 7.0,
    width: 3.51,
    height: 3.18,
    hullTop: 1.62,
    trackWidth: 0.6,
    mass: 44.3,
    maxSpeed: 6.8,
    reverseSpeed: 3.2,
    accel: 1.7,
    brake: 5.5,
    turnRate: 0.62,
    turretSpeed: 0.55,
    hp: 1650,
    crew: 5,
    armor: { front: 101, side: 76, rear: 50, turret: 127, top: 25, track: 30 },
    gun: {
      name: '90mm M3', caliber: '90mm', pen: 170, damage: 330, velocity: 810,
      reload: 6.2, blast: 4.0, spread: 0.0014, sightFov: 24,
    },
    mg: { name: 'M2HB', caliber: '.50', damage: 42, interval: 0.11, ammo: 300 },
    turret: { w: 2.3, d: 2.9, h: 1.0, y: 1.62, z: 0.34 },
    barrel: { length: 3.86, radius: 0.09, muzzle: 0.12 },
    wheels: 6,
    hasHullMg: false,
    engineNote: 0.42,
  },
};

/* ------------------------------------------------------------------ textures */

const _paintCache = new Map();
function paintTexture(hex) {
  // The texture carries weathering only and stays near-neutral: the material
  // colour supplies the paint. Tinting both would square the albedo and turn
  // every hull into a black silhouette.
  if (_paintCache.has('neutral')) return _paintCache.get('neutral');
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const base = 'rgb(206,203,188)';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // Paint mottling: olive drab was never one value after a week in the field.
  for (let i = 0; i < 320; i++) {
    const s = 6 + Math.random() * 40;
    ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,235' : '12,14,10'},${0.012 + Math.random() * 0.035})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s * (0.4 + Math.random()));
  }
  // Vertical rain streaks and chips down to bare steel.
  for (let i = 0; i < 34; i++) {
    const x = Math.random() * 256;
    const h = 20 + Math.random() * 130;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(24,22,16,0.18)');
    g.addColorStop(1, 'rgba(24,22,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, Math.random() * 160, 1 + Math.random() * 3, h);
  }
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(${70 + Math.random() * 40},${64 + Math.random() * 35},${54 + Math.random() * 30},${0.15 + Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 5, 1 + Math.random() * 2);
  }
  // Welded panel seams and a few cast-in numbers.
  ctx.strokeStyle = 'rgba(20,20,14,0.35)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    const y = 20 + i * 52 + Math.random() * 8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + (Math.random() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(235,230,210,0.35)';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('USA 30' + Math.floor(Math.random() * 90), 18, 238);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  _paintCache.set('neutral', tex);
  return tex;
}

const _starCache = new Map();
function starTexture(team) {
  if (_starCache.has(team)) return _starCache.get(team);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  // Worn white / red star on transparent ground, drawn as an armoured-vehicle
  // recognition mark with a stencilled border.
  const fill = team === 0 ? 'rgba(178,39,30,0.92)' : 'rgba(232,228,208,0.92)';
  const edge = team === 0 ? 'rgba(90,18,14,0.95)' : 'rgba(60,58,48,0.85)';
  ctx.translate(64, 64);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 50 : 20;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = edge;
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _starCache.set(team, tex);
  return tex;
}

/* --------------------------------------------------------------- geometry */

function roundedRectShape(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  const rr = Math.min(r, w / 2 - 0.01, d / 2 - 0.01);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + d - rr);
  s.quadraticCurveTo(x + w, y + d, x + w - rr, y + d);
  s.lineTo(x + rr, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

function turretGeometry(w, d, h, r, bevel = 0.045) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), {
    depth: h, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 2, curveSegments: 7,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -h / 2, 0);
  return g;
}

function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  return g.applyMatrix4(m);
}

function cyl(rTop, rBot, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  return g.applyMatrix4(m);
}

/** Collects geometries per material, merging each bucket into one mesh. */
class Bucket {
  constructor() { this.map = new Map(); }
  add(geo, mat) {
    // Extrude geometries are non-indexed while boxes/cylinders are indexed;
    // mergeGeometries refuses a mixed bucket, so normalise every part first.
    if (geo.index) {
      const flat = geo.toNonIndexed();
      geo.dispose();
      geo = flat;
    }
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(geo);
    return geo;
  }
  build(parent, name) {
    const meshes = [];
    for (const [mat, geos] of this.map) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${name}:${mat.name || 'part'}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.map.clear();
    return meshes;
  }
}

/* ------------------------------------------------------------------ model */

/**
 * Build a tank from an exported authored GLB. The reference export keeps its
 * control rigs (`rig_hull`, `rig_turret`, `rig_gun`, `rig_recoil`, `rig_muzzle`)
 * and one merged mesh per paint slot, so the same animation hooks as the
 * procedural hull work: turret yaw, gun elevation, recoil and muzzle position.
 */
function buildFromAsset(def, game, template) {
  const mats = game.materials;
  const paint = mats.get('metal').clone();
  paint.onBeforeCompile = () => {};
  paint.customProgramCacheKey = () => 'tankpaint';
  paint.color.setHex(def.paint);
  paint.map = paintTexture(def.paint);
  paint.roughness = 0.82;
  paint.metalness = 0.18;
  paint.normalScale?.set(0.6, 0.6);
  paint.name = 'tankPaint';
  mats.applyUnify(paint, 'metal');

  const dark = mats.get('metal').clone();
  dark.onBeforeCompile = () => {};
  dark.customProgramCacheKey = () => 'tanksteel';
  dark.color.setHex(0x33322b);
  dark.roughness = 0.74;
  dark.metalness = 0.5;
  dark.name = 'tankSteel';

  const rubber = mats.get('rubber').clone();
  rubber.name = 'tankRubber';
  const glass = mats.get('glass').clone();
  glass.name = 'tankGlass';
  const accent = mats.get('canvas').clone();
  accent.color.setHex(0x6b6042);
  accent.name = 'tankAccent';

  const slots = {
    'tank:paint': paint,
    'tank:dark': dark,
    'tank:rubber': rubber,
    'tank:glass': glass,
    'tank:accent': accent,
  };

  const root = new THREE.Group();
  root.name = `tank:${def.id}`;
  // The reference rig points +Z; this project's tanks point -Z.
  const base = new THREE.Group();
  base.name = 'assetBase';
  base.rotation.y = Math.PI;
  root.add(base);
  const body = template.clone(true);
  body.name = 'assetBody';
  base.add(body);

  body.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    const name = Array.isArray(o.material) ? o.material[0]?.name : o.material?.name;
    const mat = slots[name];
    if (mat) o.material = mat;
  });

  const turretPivot = body.getObjectByName('rig_turret') || body;
  const gunPivot = body.getObjectByName('rig_gun') || turretPivot;
  const recoilGroup = body.getObjectByName('rig_recoil') || null;
  const muzzle = body.getObjectByName('rig_muzzle') || gunPivot;

  // Recognition stars, placed in the rig's own frame so they follow the hull
  // and the turret. The export's hull half-width is 1.755 m.
  const starMat = new THREE.MeshBasicMaterial({
    map: starTexture(0), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.92,
  });
  const addStar = (parent, w, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), starMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.userData.noShadow = true;
    m.userData.isStar = true;
    parent.add(m);
  };
  if (body.getObjectByName('rig_hull')) {
    addStar(body.getObjectByName('rig_hull'), 0.6, 1.79, 1.15, 0.4, Math.PI / 2);
    addStar(body.getObjectByName('rig_hull'), 0.6, -1.79, 1.15, 0.4, -Math.PI / 2);
  }
  addStar(turretPivot, 0.48, 0, 0.32, -1.45, Math.PI);

  const model = {
    def, root, hull: body, turretPivot, gunPivot, recoilGroup, muzzle,
    gunPitchSign: -1, recoilSign: -1,
    materials: { paint, dark, rubber, glass, accent },
    track: null,
    wheels: null,
    setTeamStar(team) {
      starMat.map = starTexture(team);
      starMat.needsUpdate = true;
    },
    animate() { /* the authored running gear is a static merged mesh */ },
    setWreck() {
      paint.color.setHex(0x24231e);
      paint.roughness = 0.96;
      paint.metalness = 0.18;
      dark.color.setHex(0x171612);
      turretPivot.rotation.y += (Math.random() - 0.5) * 0.8;
      gunPivot.rotation.x = -0.16 * (model.gunPitchSign || 1);
    },
    dispose() {
      root.removeFromParent();
      for (const m of Object.values(model.materials)) m.dispose?.();
      starMat.dispose();
    },
  };
  return model;
}

export function buildTank(def, game) {
  if (def.asset && game.vehicleAssets?.[def.asset]) {
    return buildFromAsset(def, game, game.vehicleAssets[def.asset]);
  }
  const mats = game.materials;
  const L = def.length, W = def.width;
  const hullTop = def.hullTop;
  const paint = mats.get('metal').clone();
  // Drop the inherited unify hook so applyUnify() injects it exactly once.
  paint.onBeforeCompile = () => {};
  paint.customProgramCacheKey = () => 'tankpaint';
  paint.color.setHex(def.paint);
  paint.map = paintTexture(def.paint);
  paint.roughness = 0.82;
  paint.metalness = 0.18;
  paint.normalScale?.set(0.6, 0.6);
  paint.name = 'tankPaint';
  mats.applyUnify(paint, 'metal');

  const dark = mats.get('metal').clone();
  dark.onBeforeCompile = () => {};
  dark.customProgramCacheKey = () => 'tanksteel';
  dark.color.setHex(0x2a2924);
  dark.roughness = 0.72;
  dark.metalness = 0.55;
  dark.name = 'tankSteel';

  const trackMat = mats.get('rust').clone();
  trackMat.onBeforeCompile = () => {};
  trackMat.customProgramCacheKey = () => 'tanktrack';
  trackMat.color.setHex(0x35322a);
  trackMat.roughness = 0.9;
  trackMat.metalness = 0.35;
  trackMat.name = 'tankTrack';

  const rubber = mats.get('rubber').clone();
  rubber.name = 'tankRubber';

  const root = new THREE.Group();
  root.name = `tank:${def.id}`;
  const hull = new THREE.Group();
  hull.name = 'hull';
  root.add(hull);

  const bucket = new Bucket();
  const zf = -L / 2, zr = L / 2;
  const halfW = W / 2;

  /* --------------------------------------------------------------- hull */
  // Belly and hull box, with a sloped glacis plate and a lower nose casting.
  bucket.add(box(W * 0.74, 0.46, L * 0.84, 0, 0.62, 0), paint);
  bucket.add(box(W * 0.86, 0.4, L * 0.76, 0, 1.0, 0.04), paint);
  bucket.add(box(W * 0.84, 0.34, 0.5, 0, 0.74, zf + 0.32), paint);
  // Glacis: a plate pitched back toward the turret ring.
  bucket.add(box(W * 0.86, 0.52, 0.13, 0, 1.02, zf + 0.52, -0.62, 0, 0), paint);
  bucket.add(box(W * 0.84, 0.42, 0.12, 0, 0.96, zr - 0.14, 0.22, 0, 0), paint);
  // Engine deck and rear plate.
  bucket.add(box(W * 0.8, 0.1, L * 0.32, 0, hullTop - 0.04, zr - L * 0.22), paint);
  for (let i = 0; i < 4; i++) {
    bucket.add(box(W * 0.5, 0.02, 0.1, 0, hullTop + 0.01, zr - L * 0.34 + i * 0.22), dark);
  }
  // Fenders / track guards.
  for (const s of [-1, 1]) {
    bucket.add(box(0.5, 0.06, L * 0.92, s * (halfW - 0.16), hullTop - 0.24, 0), paint);
    bucket.add(box(0.04, 0.22, L * 0.9, s * (halfW - 0.01), hullTop - 0.34, 0), paint);
    // Stowage boxes above the tracks.
    bucket.add(box(0.32, 0.28, 1.05, s * (halfW - 0.2), hullTop - 0.08, -L * 0.16), paint);
    bucket.add(box(0.26, 0.22, 0.6, s * (halfW - 0.2), hullTop - 0.08, L * 0.22), paint);
    // Front and rear mud flaps.
    bucket.add(box(0.46, 0.36, 0.05, s * (halfW - 0.2), 0.42, zf + 0.28, 0.28, 0, 0), paint);
    // Tow hooks.
    bucket.add(box(0.12, 0.16, 0.26, s * (halfW - 0.35), 0.58, zr - 0.05), dark);
  }
  // Spare track links bolted to the glacis.
  for (let i = 0; i < 3; i++) {
    bucket.add(box(0.34, 0.06, 0.16, -0.4 + i * 0.4, 1.16, zf + 0.58, -0.6, 0, 0), trackMat);
  }
  // Headlights with a bright lens.
  for (const s of [-1, 1]) {
    bucket.add(cyl(0.11, 0.12, 0.16, 10, s * (halfW - 0.42), 1.22, zf + 0.42, Math.PI / 2, 0, 0), dark);
    bucket.add(cyl(0.085, 0.085, 0.02, 10, s * (halfW - 0.42), 1.22, zf + 0.34, Math.PI / 2, 0, 0),
      new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffdf9a, emissiveIntensity: 0.6, roughness: 0.3 }));
  }
  // Tools and a tow cable, the things that make a hull read as crewed.
  bucket.add(box(0.06, 0.06, 0.9, halfW - 0.32, hullTop - 0.14, -0.5, 0, 0, 0), dark);
  bucket.add(box(0.28, 0.05, 0.08, halfW - 0.28, hullTop - 0.12, -0.95), dark);
  bucket.add(box(0.18, 0.03, 1.6, -halfW + 0.3, hullTop - 0.18, 0.4, 0, 0, 0.2), dark);
  // Hull machine gun (Stuart): a ball mount in the right glacis.
  if (def.hasHullMg) {
    bucket.add(cyl(0.15, 0.16, 0.18, 10, 0.58, 1.02, zf + 0.62, Math.PI / 2, 0, 0), dark);
    bucket.add(cyl(0.035, 0.045, 0.5, 8, 0.58, 1.02, zf + 0.36, Math.PI / 2, 0, 0), dark);
  }
  // Antenna base.
  bucket.add(cyl(0.07, 0.09, 0.12, 8, -halfW + 0.55, hullTop + 0.06, zr - 0.55), dark);
  bucket.build(hull, 'hull');

  /* ------------------------------------------------------------- tracks */
  const trackX = halfW - def.trackWidth / 2 - 0.02;
  const topY = hullTop - 0.28;
  const botY = 0.08;
  const arcR = (topY - botY) / 2;
  const arcY = (topY + botY) / 2;
  const straight = L * 0.62;
  const zFront = -straight / 2;
  const zRear = straight / 2;
  const loopLen = 2 * straight + 2 * Math.PI * arcR;
  const linkLen = 0.235;
  const perSide = Math.max(12, Math.round(loopLen / linkLen));
  const linkGeo = new THREE.BoxGeometry(def.trackWidth * 1.02, 0.11, linkLen * 0.92);
  const linkMesh = new THREE.InstancedMesh(linkGeo, trackMat, perSide * 2);
  linkMesh.name = 'trackLinks';
  linkMesh.castShadow = true;
  linkMesh.receiveShadow = true;
  linkMesh.frustumCulled = false;
  root.add(linkMesh);

  const trackSample = (s) => {
    const a0 = straight, a1 = straight + Math.PI * arcR, a2 = a1 + straight;
    if (s < a0) {
      return { z: zFront + s, y: botY, tz: 1, ty: 0 };
    }
    if (s < a1) {
      const a = -Math.PI / 2 + (s - a0) / arcR;
      return {
        z: zRear + arcR * Math.cos(a), y: arcY + arcR * Math.sin(a),
        tz: -Math.sin(a), ty: Math.cos(a),
      };
    }
    if (s < a2) {
      return { z: zRear - (s - a1), y: topY, tz: -1, ty: 0 };
    }
    const a = Math.PI / 2 + (s - a2) / arcR;
    return {
      z: zFront + arcR * Math.cos(a), y: arcY + arcR * Math.sin(a),
      tz: -Math.sin(a), ty: Math.cos(a),
    };
  };

  /* ------------------------------------------------------------- wheels */
  const wheelZ = [];
  for (let i = 0; i < def.wheels; i++) {
    const t = def.wheels === 1 ? 0.5 : i / (def.wheels - 1);
    wheelZ.push(zFront + 0.34 + t * (straight - 0.68));
  }
  const wheelR = 0.31;
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, def.trackWidth * 0.86, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  // A darker hub cap reads as a separate casting at distance.
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, def.trackWidth * 0.88, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const wheels = new THREE.InstancedMesh(wheelGeo, rubber, def.wheels * 2);
  wheels.name = 'roadWheels';
  wheels.castShadow = true;
  const hubs = new THREE.InstancedMesh(hubGeo, dark, def.wheels * 2);
  hubs.name = 'wheelHubs';
  root.add(wheels, hubs);

  const sprocketR = arcR * 0.92;
  const sprocketGeo = new THREE.CylinderGeometry(sprocketR, sprocketR, def.trackWidth * 0.8, 10);
  sprocketGeo.rotateZ(Math.PI / 2);
  // Teeth: boxes around the rim, merged into the sprocket geometry.
  const teeth = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    teeth.push(box(def.trackWidth * 0.7, 0.1, 0.12,
      0, Math.cos(a) * (sprocketR + 0.04), Math.sin(a) * (sprocketR + 0.04), a, 0, 0));
  }
  const sprocketMerged = mergeGeometries([sprocketGeo, ...teeth], false);
  const sprockets = new THREE.InstancedMesh(sprocketMerged, dark, 2);
  sprockets.name = 'sprockets';
  sprockets.castShadow = true;
  const idlerR = arcR * 0.82;
  const idlerGeo = new THREE.CylinderGeometry(idlerR, idlerR, def.trackWidth * 0.75, 12);
  idlerGeo.rotateZ(Math.PI / 2);
  const idler = new THREE.InstancedMesh(idlerGeo, dark, 2);
  idler.name = 'idlers';
  const rollerR = 0.13;
  const rollerGeo = new THREE.CylinderGeometry(rollerR, rollerR, def.trackWidth * 0.5, 8);
  rollerGeo.rotateZ(Math.PI / 2);
  const rollers = new THREE.InstancedMesh(rollerGeo, dark, 4);
  root.add(sprockets, idler, rollers);

  /* -------------------------------------------------------------- turret */
  const turretPivot = new THREE.Group();
  turretPivot.name = 'turret';
  turretPivot.position.set(0, def.turret.y, def.turret.z);
  root.add(turretPivot);

  const tBucket = new Bucket();
  const tw = def.turret.w, td = def.turret.d, th = def.turret.h;
  const tGeo = turretGeometry(tw, td, th, Math.min(tw, td) * 0.3);
  tBucket.add(tGeo, paint);
  // Turret ring / splash guard.
  tBucket.add(cyl(tw * 0.5, tw * 0.52, 0.12, 20, 0, -th / 2 - 0.02, 0), dark);
  // Roof: hatch, periscopes, ventilator.
  tBucket.add(cyl(0.27, 0.28, 0.08, 14, -tw * 0.2, th / 2 + 0.02, td * 0.12), paint);
  tBucket.add(cyl(0.24, 0.24, 0.03, 12, -tw * 0.2, th / 2 + 0.07, td * 0.12), dark);
  tBucket.add(box(0.2, 0.1, 0.16, tw * 0.22, th / 2 + 0.03, td * 0.2), dark);
  tBucket.add(cyl(0.09, 0.1, 0.08, 8, 0, th / 2 + 0.03, td * 0.34), dark);
  // Bustle stowage and a rolled tarp.
  tBucket.add(box(tw * 0.62, 0.18, 0.38, 0, 0.02, td * 0.42), paint);
  tBucket.add(cyl(0.1, 0.1, tw * 0.55, 8, 0, th / 2 + 0.14, td * 0.36, 0, 0, Math.PI / 2), mats.get('canvas'));
  // Antenna.
  tBucket.add(cyl(0.015, 0.025, 1.5, 5, -tw * 0.36, th / 2 + 0.6, td * 0.34, 0.12, 0, -0.1), dark);
  // Mantlet and the gun cradle.
  tBucket.add(cyl(0.26, 0.3, 0.22, 14, 0, 0, -td / 2 - 0.02, Math.PI / 2, 0, 0), paint);
  tBucket.add(box(tw * 0.5, 0.24, 0.26, 0, 0.04, -td / 2 + 0.04), paint);
  tBucket.add(cyl(0.03, 0.04, 0.55, 8, -0.42, 0.12, -td / 2 - 0.12, Math.PI / 2, 0, 0), dark);
  tBucket.build(turretPivot, 'turret');

  /* ----------------------------------------------------------------- gun */
  const gunPivot = new THREE.Group();
  gunPivot.name = 'gun';
  gunPivot.position.set(0, 0.02, -td / 2 - 0.12);
  turretPivot.add(gunPivot);

  const barrelLen = def.barrel.length;
  const gunBucket = new Bucket();
  // Recoil sleeve, barrel, muzzle. Cylinders point along +Z after the rotation.
  gunBucket.add(cyl(0.11, 0.12, 0.75, 12, 0, 0, -0.3, Math.PI / 2, 0, 0), paint);
  gunBucket.add(cyl(def.barrel.radius, def.barrel.radius * 1.08, barrelLen, 12, 0, 0, -barrelLen / 2, Math.PI / 2, 0, 0), paint);
  gunBucket.add(cyl(def.barrel.muzzle, def.barrel.muzzle, 0.12, 12, 0, 0, -barrelLen + 0.02, Math.PI / 2, 0, 0), dark);
  gunBucket.add(cyl(def.barrel.radius * 0.62, def.barrel.radius * 0.62, 0.02, 8, 0, 0, -barrelLen - 0.05, Math.PI / 2, 0, 0),
    new THREE.MeshBasicMaterial({ color: 0x0a0a08 }));
  gunBucket.build(gunPivot, 'gun');

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, -barrelLen - 0.08);
  gunPivot.add(muzzle);

  // Coax machine gun, offset left of the main gun.
  const coaxGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.65, 8);
  coaxGeo.rotateX(Math.PI / 2);
  coaxGeo.translate(0.38, 0.1, -0.3);
  const coax = new THREE.Mesh(coaxGeo, dark);
  coax.castShadow = true;
  gunPivot.add(coax);

  /* -------------------------------------------------------------- decals */
  const makeStar = (team) => {
    const mat = new THREE.MeshBasicMaterial({
      map: starTexture(team), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.92,
    });
    return mat;
  };
  // One white/red recognition star per side of the hull, plus one on the turret.
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.52), makeStar(0));
    m.position.set(s * (halfW - 0.02), hullTop - 0.5, 0.45);
    m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    m.userData.noShadow = true;
    hull.add(m);
  }
  const tStar = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), makeStar(0));
  tStar.position.set(0, 0.03, td / 2 + 0.02);
  tStar.rotation.y = Math.PI;
  tStar.userData.noShadow = true;
  turretPivot.add(tStar);

  /* ------------------------------------------------------------- shadows */
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !o.userData.noShadow;
    o.receiveShadow = !o.userData.noShadow;
  });

  const model = {
    def, root, hull, turretPivot, gunPivot, muzzle, materials: { paint, dark, trackMat, rubber },
    track: {
      mesh: linkMesh, perSide, loopLen, trackX, zFront, zRear, topY, botY, arcR, arcY, straight,
      sample: trackSample, offset: 0,
    },
    wheels: { mesh: wheels, hubs, sprockets, idler, rollers, list: wheelZ, radius: wheelR, spin: 0 },
    turret: { geometry: tGeo },
    setTeamStar(team) {
      const mat = makeStar(team);
      const starMeshes = [];
      hull.traverse((o) => { if (o.isMesh && o.geometry?.type === 'PlaneGeometry') starMeshes.push(o); });
      turretPivot.traverse((o) => {
        if (o.isMesh && o.geometry?.type === 'PlaneGeometry') starMeshes.push(o);
      });
      for (const m of starMeshes) { m.material.dispose?.(); m.material = mat; }
    },
    animate(dt, speed) {
      const w = this.wheels;
      w.spin -= (speed * dt) / Math.max(0.05, w.radius);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const one = new THREE.Vector3(1, 1, 1);
      // Road wheels and hubs.
      for (const s of [-1, 1]) {
        for (let i = 0; i < w.list.length; i++) {
          const idx = (s < 0 ? 0 : w.list.length) + i;
          pos.set(s * trackX, w.radius + 0.03, w.list[i]);
          q.setFromEuler(new THREE.Euler(w.spin, 0, 0));
          m.compose(pos, q, one);
          w.mesh.setMatrixAt(idx, m);
          w.hubs.setMatrixAt(idx, m);
        }
      }
      w.mesh.instanceMatrix.needsUpdate = true;
      w.hubs.instanceMatrix.needsUpdate = true;

      // Sprockets / idlers / return rollers spin with the track run.
      const spinSmall = w.spin * 1.15;
      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1;
        q.setFromEuler(new THREE.Euler(spinSmall, 0, 0));
        m.compose(pos.set(side * trackX, this.track.arcY, this.track.zRear), q, one);
        w.sprockets.setMatrixAt(s, m);
        m.compose(pos.set(side * trackX, this.track.arcY, this.track.zFront), q, one);
        w.idler.setMatrixAt(s, m);
      }
      w.sprockets.instanceMatrix.needsUpdate = true;
      w.idler.instanceMatrix.needsUpdate = true;
      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1;
        for (let i = 0; i < 2; i++) {
          q.setFromEuler(new THREE.Euler(spinSmall * 2.4, 0, 0));
          m.compose(pos.set(side * trackX, this.track.topY - 0.05, this.track.zFront + this.track.straight * (0.25 + i * 0.5)), q, one);
          w.rollers.setMatrixAt(s * 2 + i, m);
        }
      }
      w.rollers.instanceMatrix.needsUpdate = true;

      // Track links: walk the loop by distance travelled.
      const t = this.track;
      t.offset = (t.offset + speed * dt) % t.loopLen;
      const step = t.loopLen / t.perSide;
      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1;
        for (let i = 0; i < t.perSide; i++) {
          let d = (i * step - t.offset) % t.loopLen;
          if (d < 0) d += t.loopLen;
          const p = t.sample(d);
          const angle = Math.atan2(-p.ty, p.tz);
          q.setFromEuler(new THREE.Euler(angle, 0, 0));
          m.compose(pos.set(side * t.trackX, p.y, p.z), q, one);
          t.mesh.setMatrixAt(s * t.perSide + i, m);
        }
      }
      t.mesh.instanceMatrix.needsUpdate = true;
    },
    setWreck() {
      paint.color.setHex(0x23231f);
      paint.roughness = 0.96;
      paint.metalness = 0.2;
      dark.color.setHex(0x171612);
      trackMat.color.setHex(0x1b1a16);
      turretPivot.rotation.y += (Math.random() - 0.5) * 0.7;
      gunPivot.rotation.x = -0.12;
    },
    dispose() {
      root.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose();
          if (o.isInstancedMesh) o.dispose?.();
        }
      });
      paint.dispose(); dark.dispose(); trackMat.dispose(); rubber.dispose();
      root.removeFromParent();
    },
  };
  return model;
}
