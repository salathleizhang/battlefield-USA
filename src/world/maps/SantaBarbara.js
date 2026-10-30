import * as THREE from 'three';
import { smoothstep, clamp, lerp } from '../../core/MathUtil.js';

/**
 * 圣塔芭芭拉登陆战 — 1947.3.12
 * West: Pacific. East: Spanish-colonial town rising into dry hills.
 * Blueprint: beach (A) → burning pier (B) → hilltop fort (C).
 */
export function buildSantaBarbara(L) {
  L.bounds = { minX: -150, maxX: 230, minZ: -220, maxZ: 220 };

  const shore = -44;
  const height = (x, z) => {
    const t = clamp((x + 96) / 52, 0, 1);
    let y = lerp(-8.5, 0.9, smoothstep(0, 1, t));
    // Beach shelf.
    y += Math.max(0, 1 - Math.abs(z) / 240) * 0.25;
    // Dry hills east.
    const hill = Math.max(0, x - 96);
    y += hill * 0.11 + Math.sin(x * 0.045 + z * 0.03) * hill * 0.035;
    // Northern bluff and southern point.
    y += Math.max(0, -z - 110) * 0.06;
    y += Math.max(0, z - 130) * 0.035;
    y += Math.sin(x * 0.13) * 0.14 + Math.cos(z * 0.11) * 0.12;
    return y;
  };
  L.addTerrain({
    size: 640, segments: 128, height, texture: 'sand', tile: 7,
    color: (x, z, y, c) => {
      if (y < 1.2) c.setHex(0xcdb78c).lerp(new THREE.Color(0x9c8663), Math.random() * 0.35);
      else if (y < 1.6) c.setHex(0xb9a67e).lerp(new THREE.Color(0x8d7a58), Math.random() * 0.3);
      else if (x > 120) c.setHex(0x8b8055).lerp(new THREE.Color(0x6f6742), Math.random() * 0.4);
      else c.setHex(0x7f805c).lerp(new THREE.Color(0x66684a), Math.random() * 0.35);
    },
  });
  L.addWater({ y: 0, size: 1800, color: 0x7e8f8d, opacity: 0.95 });
  L.worldGround = 0.9;
  L.addShoreFoam({ x: -55, z: 0, w: 8, d: 420, opacity: 0.5 });
  L.addShoreFoam({ x: -60, z: -40, w: 5, d: 300, opacity: 0.33 });
  L.addShoreFoam({ x: -66, z: 90, w: 6, d: 260, opacity: 0.26 });
  L.addShoreFoam({ x: -72, z: -120, w: 4, d: 180, opacity: 0.2 });
  // Distant Pacific squadron.
  L.warship(-265, -70, 0.18, 0.95);
  L.warship(-300, 140, -0.12, 0.8);
  L.warship(-245, 240, 0.35, 0.6);

  /* ------------------------------------------------------------- the pier */
  const pierY = 2.35;
  const deckMat = L.mats.get('wood');
  L.batch.box(66, 0.45, 9, -78, pierY, 72, deckMat, { uv: 0.5 });
  L.solidBox(-78, pierY, 72, 66, 0.45, 9, 0, { surface: 'wood' });
  for (let x = -108; x <= -46; x += 7) {
    for (const z of [68.4, 75.6]) {
      L.batch.cylinder(0.34, 0.4, pierY + 1.5, 8, x, (pierY - 1.5) / 2, z, L.mats.get('woodDark'));
    }
  }
  // Pier sheds + crane.
  for (const [x, w] of [[-96, 12], [-64, 10]]) {
    L.batch.box(w, 4.2, 12, x, pierY + 2.1, 72, L.mats.get('woodDark'), { uv: 0.4 });
    L.batch.box(w + 1, 0.4, 13, x, pierY + 4.4, 72, L.mats.get('rust'));
    L.solidBox(x, pierY + 2.1, 72, w, 4.2, 12, 0, { surface: 'wood' });
  }
  L.batch.box(0.5, 14, 0.5, -80, pierY + 7, 78, L.mats.get('metal'));
  L.batch.box(9, 0.4, 0.5, -84, pierY + 13.5, 78, L.mats.get('metal'));
  L.batch.box(0.1, 3, 0.1, -88.5, pierY + 12, 78, L.mats.get('metal'));
  L.fire(-64, pierY + 4.5, 72, 1.6);
  L.smokeColumn(-64, pierY + 5.5, 72, 1.2);

  // Pier supply cache.
  L.prop('crate', -87.5, 69.2, 0.1, { base: pierY });
  L.prop('barrel', -85, 75.2, 0, { base: pierY });
  L.prop('ammo', -88.2, 69.5, 0.1, { base: pierY, y: 0.3 });

  // Ramp from beach up to pier.
  const ramp = new THREE.BoxGeometry(9, 0.4, 16);
  const m = new THREE.Matrix4().makeRotationX(-0.12);
  m.setPosition(-44, 1.55, 72);
  L.batch.add(ramp, deckMat, m);
  L.solidBox(-44, 1.55, 72, 9, 0.4, 16, 0, { surface: 'wood' });

  /* ---------------------------------------------------------------- beach */
  for (let i = 0; i < 9; i++) {
    const x = -95 + Math.random() * 45;
    const z = -110 + i * 26 + Math.random() * 12;
    L.tankTrap(x, z, { base: Math.max(0, height(x, z)) });
  }
  L.barbedWire(-26, -30, 0.12, 26);
  L.barbedWire(-24, 34, -0.08, 30);
  L.barbedWire(-20, -85, 0.3, 20);
  L.wreck(-18, 44, 0.7);
  L.wreck(-6, -34, -0.4, { kind: 'truck' });
  L.wreck(12, 62, 2.2);
  L.landingCraft(-70, 18, 0, { base: 0.4 });
  L.landingCraft(-66, -8, 0.05, { base: 0.4 });
  L.landingCraft(-74, 44, -0.03, { base: 0.4 });
  L.landingCraft(-30, 104, 0.2, { base: 0.9 });
  for (let i = 0; i < 26; i++) {
    const z = -140 + i * 11 + Math.random() * 4;
    L.crate(-30 + Math.random() * 10, z, 0.8 + Math.random() * 0.5);
  }
  L.sandbags(-20, -6, 0.1, 6);
  L.sandbags(-16, 18, 0.2, 6);
  L.bunker(-30, -58, 0.15);

  // Supply dumps behind the beach strongpoints.
  L.prop('crate', -18.2, -8.8, 0.15);
  L.prop('ammo', -18.9, -8.4, 0.15, { y: 0.3 });
  L.prop('ammo', -17.1, 19.6, -0.2);
  L.prop('jerrycan', -18.4, 20.8, 0.5);

  // Beach palms / boardwalk.
  for (let i = 0; i < 12; i++) L.palm(-14 - Math.random() * 10, -120 + i * 21, 0.85 + Math.random() * 0.3);

  // Boardwalk along the sand.
  const deckMatB = L.mats.get('wood');
  L.batch.box(3.4, 0.22, 300, -10, 1.35, -10, deckMatB, { uv: 0.6 });
  L.solidBox(-10, 1.35, -10, 3.4, 0.22, 300, 0, { surface: 'wood' });
  for (let z = -158; z <= 140; z += 5) {
    L.batch.box(0.12, 1.0, 0.12, -11.5, 1.95, z, L.mats.get('woodDark'));
    L.batch.box(0.1, 0.09, 5, -11.5, 2.4, z, L.mats.get('woodDark'));
  }

  // Street lamps along the main road.
  for (let x = 4; x <= 104; x += 16) {
    for (const z of [-7, 9]) {
      const gy = height(x, z);
      L.batch.cylinder(0.08, 0.11, 5.2, 6, x, gy + 2.6, z, L.mats.get('metal'));
      L.batch.box(1.1, 0.08, 0.08, x, gy + 5.15, z + (z > 0 ? -0.5 : 0.5), L.mats.get('metal'));
      L.batch.sphere(0.16, x, gy + 5.05, z + (z > 0 ? -1.0 : 1.0), new THREE.MeshStandardMaterial({ color: 0xffe9bb, emissive: 0xffb45a, emissiveIntensity: 2.2 }));
    }
  }

  // Awnings + market stalls.
  for (const [x, z, w, color] of [[32, -18, 10, 0x8c3a2a], [64, -18, 9, 0x3f5a4a], [31, 22, 10, 0x8a7440], [82, 22, 9, 0x6b3e35]]) {
    const gy = height(x, z);
    L.batch.box(w, 0.12, 3.2, x, gy + 3.4, z, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }), { rotY: 0 });
    for (const ox of [-w / 2 + 0.4, w / 2 - 0.4]) {
      L.batch.cylinder(0.05, 0.05, 3.4, 5, x + ox, gy + 1.7, z + 1.5, L.mats.get('metal'));
    }
  }

  // Surf obstacles and a beached LCVP.
  for (let i = 0; i < 12; i++) {
    const z = -150 + i * 27;
    L.tankTrap(-64 + Math.sin(i * 1.7) * 3, z, { base: 0.1 });
  }
  for (let i = 0; i < 18; i++) {
    const x = -90 + i * 6;
    L.batch.cylinder(0.18, 0.22, 2.6, 6, x, -0.2, -30 + Math.sin(i) * 30, L.mats.get('woodDark'), { rotZ: 0.3 });
  }
  // Craters on the sand.
  for (let i = 0; i < 16; i++) {
    const x = -38 + Math.random() * 26;
    const z = -130 + Math.random() * 230;
    L.crater(x, z, 1.6 + Math.random() * 1.8);
  }

  // Pier entrance sign.
  for (const ox of [-3.4, 3.4]) L.batch.cylinder(0.12, 0.15, 4.4, 6, -40 + ox, 3.2, 66, L.mats.get('woodDark'));
  L.batch.box(8.4, 1.6, 0.25, -40, 5.3, 66, L.mats.get('woodDark'));
  L.batch.plane(7.6, 1.2, -40, 5.3, 65.85, new THREE.MeshStandardMaterial({ map: L.mats.textures.rubble, color: 0x9a8560, roughness: 1, side: THREE.DoubleSide }), { rotY: Math.PI, uv: 0.5 });

  /* ------------------------------------------------------------- the town */
  const buildings = [
    { x: 14, z: -24, w: 15, d: 13, h: 10, sign: 'HOTEL', damage: 0.35, floors: 3, balcony: true, material: 'stuccoCream' },
    { x: 32, z: -25, w: 13, d: 12, h: 8, sign: 'CAFE', damage: 0.2 },
    { x: 48, z: -24, w: 12, d: 13, h: 11, sign: 'BANK', damage: 0.1, material: 'brick' },
    { x: 64, z: -25, w: 14, d: 12, h: 9, sign: 'PHARMACY', damage: 0.5 },
    { x: 82, z: -24, w: 12, d: 13, h: 8, sign: 'STORE', damage: 0.3, material: 'stuccoPink' },
    { x: 14, z: 28, w: 13, d: 14, h: 9, sign: 'MISSION INN', damage: 0.4, floors: 3, balcony: true, material: 'stuccoOchre' },
    { x: 31, z: 29, w: 12, d: 12, h: 8, sign: 'BAR', damage: 0.15 },
    { x: 47, z: 28, w: 13, d: 13, h: 12, sign: 'GARAGE', damage: 0.55, flatRoof: true, material: 'stuccoGrey' },
    { x: 64, z: 29, w: 14, d: 12, h: 9, sign: 'MARKET', damage: 0.25 },
    { x: 82, z: 28, w: 12, d: 13, h: 10, sign: 'TELEGRAPH', damage: 0.45, material: 'stuccoCream' },
    { x: 18, z: -56, w: 16, d: 14, h: 9, sign: 'FIRE STATION', damage: 0.3, flatRoof: true },
    { x: 40, z: -57, w: 14, d: 13, h: 8, damage: 0.65 },
    { x: 60, z: -56, w: 13, d: 14, h: 10, sign: 'HARDWARE', damage: 0.2 },
    { x: 80, z: -57, w: 15, d: 13, h: 9, damage: 0.75 },
    { x: 20, z: 58, w: 14, d: 13, h: 8, damage: 0.2, sign: 'FISH CO.' },
    { x: 42, z: 59, w: 15, d: 14, h: 10, damage: 0.4 },
    { x: 64, z: 58, w: 13, d: 13, h: 9, sign: 'CANTINA', damage: 0.6 },
    { x: 86, z: 59, w: 14, d: 12, h: 8, damage: 0.3 },
    { x: 32, z: 92, w: 18, d: 16, h: 12, sign: 'SANTA BARBARA', damage: 0.15, floors: 3, balcony: true },
    { x: 58, z: 92, w: 12, d: 12, h: 7, damage: 0.5 },
  ];
  for (const b of buildings) L.building(b);

  // Mission church with bell tower.
  L.building({ x: 46, z: 88, w: 20, d: 16, h: 10, floors: 2, damage: 0.1, sign: 'MISSION' });
  L.batch.box(6, 21, 6, 59, height(59, 82) + 10.5, 82, L.mats.get('stuccoWhite'), { uv: 0.3 });
  L.batch.box(6.6, 0.7, 6.6, 59, height(59, 82) + 21.2, 82, L.mats.get('roof'), { uv: 0.4 });
  L.batch.cylinder(0.7, 0.9, 2.2, 8, 59, height(59, 82) + 22.6, 82, L.mats.get('roof'));
  L.solidBox(59, 12, 82, 6, 21, 6, 0, { surface: 'stucco' });
  L.fire(38, 8, 74, 1.3);
  L.smokeColumn(38, 9, 74, 1.4);

  // Streets.
  for (const [x, z, w, d, rot] of [
    [48, 1, 108, 8, 0], [48, -40, 96, 7, 0], [48, 43, 96, 7, 0],
    [22, 1, 7, 108, 0], [72, 1, 7, 108, 0],
  ]) {
    L.batch.box(w, 0.12, d, x, height(x, z) + 0.06, z, L.mats.get('asphalt'), { rotY: rot, uv: 0.6 });
  }

  /* ------------------------------------------------------------- hill fort */
  const fx = 132, fz = -66;
  const fy = height(fx, fz);
  L.batch.box(34, 3.4, 26, fx, fy + 1.7, fz, L.mats.get('plaster'), { uv: 0.35 });
  L.solidBox(fx, fy + 1.7, fz, 34, 3.4, 26, 0, { surface: 'concrete' });
  L.batch.box(37, 0.7, 29, fx, fy + 3.7, fz, L.mats.get('plasterWhite'), { uv: 0.3 });
  for (const [ox, oz] of [[-15, -10], [15, -10], [-15, 10], [15, 10]]) {
    L.batch.cylinder(1.6, 1.8, 4.5, 10, fx + ox, fy + 5.8, fz + oz, L.mats.get('brick'));
  }
  L.bunker(fx, fz, 0, { base: fy + 3.4 });
  L.sandbags(fx, fz - 12.6, 0, 30, { base: fy + 4.05, rows: 3, depth: 1 });
  L.prop('crate', fx - 10, fz + 2, 0.1, { base: fy + 4.05 });
  L.prop('barrelRust', fx + 10, fz - 2, 0, { base: fy + 4.05 });
  L.prop('ammo', fx - 10.7, fz + 2.3, 0.1, { base: fy + 4.05, y: 0.3 });
  L.sandbags(fx - 8, fz - 20, 0, 7, { base: fy });
  L.sandbags(fx + 9, fz - 20, 0, 7, { base: fy });
  L.sandbags(fx + 20, fz + 4, Math.PI / 2, 8, { base: fy });
  L.flagpole(fx, fz + 6, { base: fy + 3.4, team: 1, height: 8 });
  L.fire(fx + 6, fy + 4, fz - 4, 1.1);

  // Hillside villas.
  L.building({ x: 112, z: 20, w: 12, d: 11, h: 8, damage: 0.4, sign: 'CASA' });
  L.building({ x: 148, z: 40, w: 14, d: 12, h: 9, damage: 0.2 });
  L.building({ x: 100, z: 96, w: 13, d: 12, h: 8, damage: 0.5 });

  // Distant city silhouette + smoke.
  L.skyline([
    { x: 210, z: -150, w: 20, h: 14, d: 20 },
    { x: 230, z: -110, w: 26, h: 20, d: 22 },
    { x: 218, z: -60, w: 18, h: 12, d: 18 },
    { x: 240, z: 10, w: 24, h: 17, d: 20 },
  ]);
  for (const [x, z] of [[70, -90], [95, 110], [160, -20]]) L.smokeColumn(x, height(x, z) + 2, z, 1.8);

  /* ------------------------------------------------------------- gameplay */
  L.addCapturePoint({ id: 'A', name: '血色沙滩', x: -4, z: 4, radius: 17, owner: -1 });
  L.addCapturePoint({ id: 'B', name: '燃烧码头', x: -78, z: 72, radius: 14, owner: -1, base: pierY, height: 6 });
  L.addCapturePoint({ id: 'C', name: '圣塔芭芭拉要塞', x: fx, z: fz, radius: 15, owner: 1, base: fy + 3.4, height: 7 });
  // Fort flag is decorative; capture flag sits on the roof.

  L.setPlayerSpawn(-38, 10, -Math.PI / 2);
  L.addSpawn(0, -36, 4, -Math.PI / 2);
  L.addSpawn(0, -34, 26, -Math.PI / 2);
  L.addSpawn(0, -30, -18, -Math.PI / 2);
  L.addSpawn(0, -78, 66, -Math.PI / 2, { base: pierY });
  L.addSpawn(1, 70, -20, Math.PI / 2);
  L.addSpawn(1, 66, 30, Math.PI / 2);
  L.addSpawn(1, 104, -52, Math.PI / 2, { base: height(104, -52) });
  L.addSpawn(1, 120, 4, Math.PI / 2);
  L.addRoute([new THREE.Vector3(-4, 1, 4), new THREE.Vector3(30, 1, 0), new THREE.Vector3(70, 1, 10)]);
  L.addRoute([new THREE.Vector3(-78, pierY, 72), new THREE.Vector3(-44, 2, 72), new THREE.Vector3(-10, 1, 40)]);
  L.addRoute([new THREE.Vector3(60, 1, 40), new THREE.Vector3(100, 2, -20), new THREE.Vector3(fx, fy + 3.4, fz)]);

  // A few ambient AA / searchlight silhouettes on the bluff.
  L.batch.cylinder(0.3, 0.4, 8, 6, 90, height(90, -120) + 4, -120, L.mats.get('metal'));
  L.batch.box(3, 0.5, 0.5, 90, height(90, -120) + 8, -120, L.mats.get('metal'), { rotY: 0.6 });
}
