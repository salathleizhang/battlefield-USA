import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../../core/MathUtil.js';

/**
 * 解放华盛顿 — 1947.4.19
 * Potomac crossing → Lincoln Memorial → National Mall → Capitol.
 * Dusk, smoke, low sun down the Mall axis.
 */
export function buildWashington(L) {
  L.bounds = { minX: -280, maxX: 280, minZ: -300, maxZ: 300 };

  const groundY = 2.2;
  const height = (x, z) => {
    if (z > 150) return lerp(-4, groundY, smoothstep(150, 190, z));
    let y = groundY;
    // Capitol Hill.
    y += smoothstep(110, 175, -z) * 5.2;
    // Slight Mall crown.
    y += Math.max(0, 1 - Math.abs(x) / 80) * Math.max(0, 1 - Math.abs(z + 20) / 130) * 0.8;
    return y;
  };

  L.addTerrain({
    size: 820, segments: 140, height,
    color: (x, z, y, c) => {
      if (z > 150) c.setHex(0x6e6a4f);
      else if (Math.abs(x) < 64 && z < 120 && z > -130) c.setHex(0x5f6c46).lerp(new THREE.Color(0x4a5738), Math.random() * 0.4);
      else c.setHex(0x7a7457).lerp(new THREE.Color(0x605c45), Math.random() * 0.4);
    },
  });
  L.addWater({ y: 0, size: 2000, color: 0x5f6a68, opacity: 0.98, rough: 0.18 });
  L.worldGround = groundY;

  /* --------------------------------------------------------- Potomac bridge */
  const bridgeY = 2.6;
  for (let z = 138; z <= 186; z += 8) {
    L.batch.box(12, 0.4, 7.7, 0, bridgeY, z, L.mats.get('wood'), { uv: 0.6 });
    for (const side of [-1, 1]) {
      L.batch.box(0.14, 1.3, 7.8, side * 5.7, bridgeY + 0.9, z, L.mats.get('metal'));
      L.batch.cylinder(0.3, 0.3, 9, 8, side * 5.7, bridgeY - 4, z, L.mats.get('metal'));
    }
  }
  L.solidBox(0, bridgeY, 162, 12, 0.4, 52, 0, { surface: 'wood' });
  for (const dir of [-1, 1]) {
    L.sandbags(0, 162 + dir * 28, Math.PI / 2, 7, { base: bridgeY });
  }
  L.landingCraft(-30, 150, 1.57, { base: 0.3 });
  L.landingCraft(34, 155, 1.5, { base: 0.3 });

  /* -------------------------------------------------------- Lincoln Memorial */
  const lx = 0, lz = 96;
  const ly = height(lx, lz);
  // Stepped plinth.
  for (let i = 0; i < 4; i++) {
    L.batch.box(46 - i * 2, 0.5, 26 - i * 1.5, lx, ly + 0.25 + i * 0.5, lz, L.mats.get('plasterWhite'), { uv: 0.3 });
  }
  L.solidBox(lx, ly + 1.0, lz, 48, 2.0, 27, 0, { surface: 'concrete' });
  // Colonnade.
  for (let i = 0; i < 10; i++) {
    const cx = -20 + i * 4.4;
    L.batch.cylinder(0.75, 0.85, 9, 10, cx, ly + 2 + 4.5, lz + 10, L.mats.get('plasterWhite'));
    L.batch.cylinder(0.9, 0.9, 0.5, 10, cx, ly + 2.2, lz + 10, L.mats.get('plasterWhite'));
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      L.batch.cylinder(0.75, 0.85, 9, 10, side * 20, ly + 2 + 4.5, lz + 10 - i * 4.4, L.mats.get('plasterWhite'));
    }
  }
  L.batch.box(44, 2.6, 24, lx, ly + 13, lz, L.mats.get('plasterWhite'), { uv: 0.25 });
  L.batch.box(48, 1.2, 28, lx, ly + 14.8, lz, L.mats.get('plaster'), { uv: 0.25 });
  // Inner cella + seated figure.
  L.batch.box(30, 9, 14, lx, ly + 6.5, lz - 2, L.mats.get('plaster'), { uv: 0.3 });
  L.batch.box(4, 5, 3, lx, ly + 4.5, lz - 2, L.mats.get('plasterWhite'));
  L.solidBox(lx, ly + 9, lz, 44, 18, 24, 0, { surface: 'concrete' });
  L.fire(lx + 14, ly + 12, lz + 6, 1.0);

  /* ------------------------------------------------------- Washington Monument */
  const mx = 0, mz = -34;
  const my = height(mx, mz);
  L.batch.box(11, 2.5, 11, mx, my + 1.2, mz, L.mats.get('plasterWhite'), { uv: 0.3 });
  const ob = new THREE.CylinderGeometry(1.5, 3.4, 92, 4);
  ob.rotateY(Math.PI / 4);
  ob.translate(mx, my + 48, mz);
  L.batch.add(ob, L.mats.get('plasterWhite'));
  L.batch.box(0.6, 4, 0.6, mx, my + 95, mz, L.mats.get('metal'));
  L.solidBox(mx, my + 48, mz, 7, 92, 7, 0, { surface: 'concrete' });

  /* ------------------------------------------------------------ Reflecting pool */
  const poolY = groundY + 0.55;
  L.batch.box(30, 0.7, 74, 0, poolY - 0.2, 28, L.mats.get('plaster'), { uv: 0.3 });
  const poolMat = new THREE.MeshStandardMaterial({
    color: 0x3f4b47, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.9,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(26, 68), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, poolY + 0.2, 28);
  L.scene.add(pool);
  L.animated.push({ type: 'pool', mesh: pool });
  L.solidBox(0, poolY - 0.2, 28, 30, 0.7, 74, 0, { surface: 'concrete' });

  /* ----------------------------------------------------------------- Capitol */
  const cx = 0, cz = -168;
  const cy = height(cx, cz);
  // Terrace & steps.
  for (let i = 0; i < 8; i++) {
    L.batch.box(96 - i * 2.5, 0.55, 8, cx, cy + 0.28 + i * 0.55, cz + 40 - i * 1.1, L.mats.get('plasterWhite'), { uv: 0.3 });
  }
  L.batch.box(104, 4, 64, cx, cy + 2, cz, L.mats.get('plasterWhite'), { uv: 0.2 });
  // Wings.
  for (const side of [-1, 1]) {
    L.batch.box(38, 16, 30, cx + side * 46, cy + 10, cz + 4, L.mats.get('plasterWhite'), { uv: 0.18 });
    L.batch.box(40, 1.6, 32, cx + side * 46, cy + 18.5, cz + 4, L.mats.get('plaster'), { uv: 0.2 });
    // Colonnade front.
    for (let i = 0; i < 8; i++) {
      L.batch.cylinder(0.8, 0.9, 12, 8, cx + side * (30 + i * 4.6 / 1.0) - side * 0, cy + 8, cz + 20, L.mats.get('plasterWhite'));
    }
    L.solidBox(cx + side * 46, cy + 10, cz + 4, 38, 16, 30, 0, { surface: 'concrete' });
  }
  // Central block + portico.
  L.batch.box(56, 20, 38, cx, cy + 12, cz, L.mats.get('plasterWhite'), { uv: 0.16 });
  L.batch.box(56, 1.8, 38, cx, cy + 23, cz, L.mats.get('plaster'), { uv: 0.2 });
  for (let i = 0; i < 12; i++) {
    L.batch.cylinder(0.85, 0.95, 15, 9, cx - 22 + i * 4, cy + 8, cz + 21, L.mats.get('plasterWhite'));
  }
  L.solidBox(cx, cy + 12, cz, 56, 20, 38, 0, { surface: 'concrete' });
  // Drum + dome.
  L.batch.cylinder(16, 16, 8, 24, cx, cy + 27, cz, L.mats.get('plasterWhite'));
  const dome = new THREE.SphereGeometry(16, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(cx, cy + 31, cz);
  L.batch.add(dome, L.mats.get('plasterWhite'));
  L.batch.cylinder(1.8, 2.4, 8, 12, cx, cy + 52, cz, L.mats.get('plasterWhite'));
  L.batch.cylinder(1.2, 1.2, 4, 10, cx, cy + 58, cz, L.mats.get('metal'));

  /* ------------------------------------------------------------------- Mall */
  // Paths.
  for (const x of [-30, 30]) {
    L.batch.box(5, 0.1, 250, x, groundY + 0.05, -20, L.mats.get('plaster'), { uv: 0.25 });
  }
  L.batch.box(130, 0.1, 6, 0, groundY + 0.05, 118, L.mats.get('plaster'), { uv: 0.25 });

  // Museums / Smithsonian on the Mall edges.
  L.building({ x: 86, z: 40, w: 30, d: 22, h: 13, floors: 2, material: 'brick', flatRoof: true, damage: 0.2, sign: 'SMITHSONIAN' });
  L.building({ x: -88, z: 30, w: 26, d: 20, h: 12, floors: 2, material: 'stucco', damage: 0.35, sign: 'MUSEUM' });
  L.building({ x: 96, z: -40, w: 28, d: 22, h: 14, floors: 3, damage: 0.15, sign: 'ARCHIVES' });
  L.building({ x: -96, z: -50, w: 30, d: 20, h: 11, floors: 2, damage: 0.5, sign: 'JUSTICE' });
  L.building({ x: 130, z: 100, w: 22, d: 18, h: 10, damage: 0.6 });

  // White House, west of the Mall.
  const wx = -150, wz = -10;
  const wy = height(wx, wz);
  L.batch.box(46, 13, 26, wx, wy + 6.5, wz, L.mats.get('plasterWhite'), { uv: 0.2 });
  L.batch.box(48, 1.4, 28, wx, wy + 13.6, wz, L.mats.get('plaster'), { uv: 0.2 });
  for (let i = 0; i < 10; i++) {
    L.batch.cylinder(0.55, 0.6, 7, 8, wx - 18 + i * 4, wy + 3.5, wz + 13.4, L.mats.get('plasterWhite'));
  }
  L.solidBox(wx, wy + 6.5, wz, 46, 13, 26, 0, { surface: 'concrete' });
  L.flagpole(wx, wz + 20, { base: wy, team: 1, height: 9 });

  // Trees lining the Mall.
  for (let i = 0; i < 16; i++) {
    const x = (i % 2 ? 1 : -1) * (44 + Math.random() * 10);
    const z = -110 + Math.floor(i / 2) * 32;
    const gy = height(x, z);
    L.batch.cylinder(0.5, 0.75, 7, 7, x, gy + 3.5, z, L.mats.get('palmTrunk'));
    L.batch.sphere(4.6, x, gy + 8.5, z, L.mats.get('foliage'), 9);
    L.physics.addStaticCylinder({ x, y: gy + 3.5, z }, 3.5, 0.7, { surface: 'wood' });
  }

  /* ------------------------------------------------------------- battlefield */
  // Defensive line before the Capitol.
  for (let x = -40; x <= 40; x += 20) {
    L.sandbags(x, -118, 0, 14, { base: height(x, -118) });
    L.batch.cylinder(0.28, 0.32, 4, 6, x + 6, height(x, -118) + 2, -118, L.mats.get('metal'));
  }
  L.barbedWire(-55, -104, 0, 30);
  L.barbedWire(25, -104, 0, 30);
  L.bunker(-16, -100, 0);
  L.bunker(22, -96, 0.1);

  // Wrecks on the Mall.
  L.wreck(-42, -24, 0.5, { kind: 'truck' });
  L.wreck(36, -62, -0.3);
  L.wreck(-30, 68, 1.4);
  L.fire(-42, 3.5, -24, 1.6);
  L.smokeColumn(-42, 5, -24, 1.4);
  L.smokeColumn(60, 4, -120, 1.8);
  L.smokeColumn(-120, 4, 40, 1.6);

  // Craters.
  for (let i = 0; i < 20; i++) {
    const x = -70 + Math.random() * 140;
    const z = -120 + Math.random() * 210;
    L.batch.cylinder(2.4 + Math.random() * 2.6, 4 + Math.random() * 2.6, 0.18, 12, x, height(x, z) + 0.08, z, L.mats.get('ground'), { uv: 0.5 });
  }

  // Distant skyline across the river.
  L.skyline([
    { x: -180, z: 300, w: 70, h: 28, d: 60 },
    { x: 40, z: 320, w: 90, h: 36, d: 70 },
    { x: 200, z: 300, w: 60, h: 24, d: 50 },
  ]);

  /* ---------------------------------------------------------------- gameplay */
  L.addCapturePoint({ id: 'A', name: '波托马克桥头', x: 0, z: 134, radius: 16, owner: -1, base: height(0, 134), height: 7 });
  L.addCapturePoint({ id: 'B', name: '林肯纪念堂', x: 0, z: 96, radius: 16, owner: -1, base: ly + 2, height: 8 });
  L.addCapturePoint({ id: 'C', name: '国会大厦', x: 0, z: -150, radius: 18, owner: 1, base: cy + 1.2, height: 9 });

  L.setPlayerSpawn(0, 190, 0);
  L.addSpawn(0, -20, 186, 0);
  L.addSpawn(0, 20, 184, 0);
  L.addSpawn(0, 0, 160, 0, { base: bridgeY });
  L.addSpawn(0, -30, 130, 0);
  L.addSpawn(1, 60, -70, Math.PI);
  L.addSpawn(1, -60, -80, Math.PI);
  L.addSpawn(1, 0, -120, Math.PI);
  L.addSpawn(1, 100, 10, Math.PI);
  L.addRoute([new THREE.Vector3(0, groundY, 134), new THREE.Vector3(-20, groundY, 110), new THREE.Vector3(0, ly + 2, 96)]);
  L.addRoute([new THREE.Vector3(0, ly + 2, 96), new THREE.Vector3(30, groundY, 40), new THREE.Vector3(0, groundY, -50), new THREE.Vector3(0, cy + 1.2, -150)]);
}
