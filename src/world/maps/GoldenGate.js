import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../../core/MathUtil.js';

/**
 * 飞夺金门大桥 — 1947.3.19
 * A 500 m compressed Golden Gate span: two 150 m towers, catenary cables,
 * deck at 58 m, heavy fog. Capture north tower → mid-span → south tower.
 */
export function buildGoldenGate(L) {
  L.bounds = { minX: -260, maxX: 260, minZ: -420, maxZ: 420 };
  const deckY = 58;

  const height = (x, z) => {
    const d = Math.abs(z);
    if (d < 235) return -14;
    const t = smoothstep(235, 300, d);
    return lerp(-14, 42, t) + Math.sin(x * 0.05) * 3 * t;
  };
  L.addTerrain({
    size: 900, segments: 150, height,
    color: (x, z, y, c) => {
      if (y < 2) c.setHex(0x4a5048);
      else c.setHex(0x66684a).lerp(new THREE.Color(0x3f4436), Math.random() * 0.5);
    },
  });
  L.addWater({ y: 0, size: 2000, color: 0x5c6a68, opacity: 0.98, rough: 0.14 });
  L.worldGround = deckY;

  /* ---------------------------------------------------------------- deck */
  const orange = new THREE.MeshStandardMaterial({ color: 0xa8402b, roughness: 0.62, metalness: 0.25 });
  L.mats.mats.bridgeOrange = orange;
  const deckMat = L.mats.get('asphalt');
  L.batch.box(24, 1.3, 500, 0, deckY, 0, deckMat, { uv: 0.15 });
  L.solidBox(0, deckY, 0, 24, 1.3, 500, 0, { surface: 'concrete' });
  // Sidewalks & railings.
  for (const side of [-1, 1]) {
    L.batch.box(2.2, 0.5, 500, side * 10.6, deckY + 0.9, 0, L.mats.get('plaster'), { uv: 0.3 });
    L.batch.box(0.18, 1.25, 500, side * 11.7, deckY + 1.6, 0, orange, { uv: 0.3 });
    L.solidBox(side * 11.7, deckY + 1.2, 0, 0.4, 1.6, 500, 0, { surface: 'metal' });
    // Lamp posts every 24 m.
    for (let z = -240; z <= 240; z += 24) {
      L.batch.cylinder(0.07, 0.09, 5.5, 6, side * 11.2, deckY + 3.2, z, L.mats.get('metal'));
      L.batch.sphere(0.22, side * 11.2, deckY + 6, z, new THREE.MeshStandardMaterial({ color: 0xffddaa, emissive: 0xffb060, emissiveIntensity: 1.6 }));
    }
  }
  // Road markings.
  for (let z = -245; z < 245; z += 12) {
    L.batch.box(0.18, 0.02, 4, 0, deckY + 0.68, z, L.mats.get('plasterWhite'), { uv: 0.4 });
  }
  // Approach ramps at both ends.
  for (const dir of [-1, 1]) {
    const anchorZ = dir * 250;
    const geo = new THREE.BoxGeometry(24, 1.3, 60);
    const m = new THREE.Matrix4().makeRotationX(dir * 0.35);
    m.setPosition(0, deckY - 12, anchorZ + dir * 28);
    L.batch.add(geo, deckMat, m);
    L.solidBox(0, deckY - 12, anchorZ + dir * 28, 24, 1.3, 60, 0, { surface: 'concrete' });
  }

  /* -------------------------------------------------------------- towers */
  const towerTop = 208;
  for (const tz of [-140, 140]) {
    for (const side of [-1, 1]) {
      const legX = side * 14;
      // Tapering steel legs: three stacked segments.
      L.batch.box(6.5, 80, 7.5, legX, deckY + 40, tz, orange, { uv: 0.16 });
      L.batch.box(5.4, 70, 6.2, legX, deckY + 115, tz, orange, { uv: 0.16 });
      L.batch.box(4.4, 60, 5.2, legX, deckY + 180, tz, orange, { uv: 0.16 });
      L.solidBox(legX, deckY + 60, tz, 7, 120, 8, 0, { surface: 'metal' });
      L.solidBox(legX, deckY + 150, tz, 5, 60, 6, 0, { surface: 'metal' });
    }
    // Cross braces.
    for (const y of [deckY + 40, deckY + 100, deckY + 155, deckY + 200]) {
      L.batch.box(28, 2.0, 3.2, 0, y, tz, orange, { uv: 0.2 });
      L.batch.box(2.0, 2.0, 6, -14, y, tz, orange);
      L.batch.box(2.0, 2.0, 6, 14, y, tz, orange);
    }
    // Tower-top cross bracing.
    L.batch.box(28, 1.4, 3, 0, towerTop, tz, orange, { uv: 0.2 });
    // Deck-level portal bracing (players walk through the middle).
    L.batch.box(22, 4.5, 4, 0, deckY + 5.5, tz, orange, { uv: 0.25 });
    L.solidBox(0, deckY + 5.5, tz, 22, 4.5, 4, 0, { surface: 'metal' });
    // Sandbag nests on the portals.
    L.sandbags(-8, tz - 3, 0, 5, { base: deckY + 7.8 });
    L.sandbags(8, tz - 3, 0, 5, { base: deckY + 7.8 });
    L.batch.cylinder(0.25, 0.3, 4, 6, -8, deckY + 9.5, tz - 3, L.mats.get('metal'));
    L.batch.cylinder(0.25, 0.3, 4, 6, 8, deckY + 9.5, tz - 3, L.mats.get('metal'));
  }

  /* --------------------------------------------------------------- cables */
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x8e3a28, roughness: 0.6, metalness: 0.4 });
  for (const side of [-1, 1]) {
    const cableX = side * 14;
    const pts = [];
    pts.push(new THREE.Vector3(cableX, deckY + 12, -250));
    pts.push(new THREE.Vector3(cableX, deckY + 70, -190));
    pts.push(new THREE.Vector3(cableX, 200, -140));
    for (let z = -120; z <= 120; z += 20) {
      const k = z / 140;
      pts.push(new THREE.Vector3(cableX, 200 - 122 * (1 - k * k), z));
    }
    pts.push(new THREE.Vector3(cableX, 200, 140));
    pts.push(new THREE.Vector3(cableX, deckY + 70, 190));
    pts.push(new THREE.Vector3(cableX, deckY + 12, 250));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 0.6, 6, false), cableMat);
    tube.castShadow = true;
    L.scene.add(tube);

    // Suspender ropes.
    const ropeMat = new THREE.MeshBasicMaterial({ color: 0x5e3a30 });
    for (let z = -235; z <= 235; z += 9) {
      const t = (z + 250) / 500;
      const p = curve.getPoint(t);
      if (p.y <= deckY + 2) continue;
      const h = p.y - (deckY + 1.2);
      if (h < 1) continue;
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, h, 4), ropeMat);
      rope.position.set(cableX, deckY + 1.2 + h / 2, z);
      L.scene.add(rope);
    }
  }

  /* --------------------------------------------------------- environment */
  // Marin headlands (north) and San Francisco (south) silhouettes.
  L.skyline([
    { x: -120, z: -330, w: 70, h: 26, d: 60 },
    { x: 40, z: -340, w: 80, h: 18, d: 50 },
    { x: 150, z: -320, w: 60, h: 30, d: 60 },
    { x: -150, z: 340, w: 90, h: 34, d: 70 },
    { x: 20, z: 350, w: 80, h: 46, d: 60 },
    { x: 140, z: 345, w: 70, h: 24, d: 50 },
  ]);
  // Distant Alcatraz-ish island.
  L.batch.box(60, 24, 40, -170, 6, 60, new THREE.MeshStandardMaterial({ color: 0x4d5148, roughness: 1 }));
  L.batch.box(20, 12, 16, -170, 24, 60, new THREE.MeshStandardMaterial({ color: 0x5b5d50, roughness: 1 }));

  // Fog banks drifting on the deck.
  const fogMat = new THREE.MeshBasicMaterial({ color: 0xc3c8c6, transparent: true, opacity: 0.10, depthWrite: false });
  for (let i = 0; i < 8; i++) {
    const fog = new THREE.Mesh(new THREE.PlaneGeometry(90, 32), fogMat.clone());
    fog.position.set((Math.random() - 0.5) * 30, deckY + 6 + Math.random() * 10, -220 + i * 60);
    fog.material.opacity = 0.07 + Math.random() * 0.09;
    L.scene.add(fog);
    L.animated.push({ type: 'fog', mesh: fog, phase: Math.random() * 6.28 });
  }

  // Fallen girders + wrecked truck on the deck.
  L.wreck(5, 20, 1.2, { base: deckY + 0.7, kind: 'truck' });
  L.wreck(-4, -60, 0.3, { base: deckY + 0.7, kind: 'car' });
  L.sandbags(0, 100, Math.PI / 2, 7, { base: deckY + 0.7 });
  L.barbedWire(-6, 70, Math.PI / 2, 14);
  L.batch.cylinder(0.3, 0.35, 7, 6, -9, deckY + 4, -160, L.mats.get('metal'));

  /* ------------------------------------------------------------- gameplay */
  L.addCapturePoint({ id: 'A', name: '北塔', x: 0, z: -140, radius: 15, owner: -1, base: deckY + 0.7, height: 9 });
  L.addCapturePoint({ id: 'B', name: '中跨', x: 0, z: 0, radius: 15, owner: -1, base: deckY + 0.7, height: 9 });
  L.addCapturePoint({ id: 'C', name: '南塔 · 旧金山', x: 0, z: 140, radius: 15, owner: 1, base: deckY + 0.7, height: 9 });

  const SPAWN_Y = deckY + 0.7;
  L.setPlayerSpawn(0, -230, Math.PI, { base: SPAWN_Y });
  L.addSpawn(0, 0, -228, Math.PI, { base: SPAWN_Y });
  L.addSpawn(0, -6, -205, Math.PI, { base: SPAWN_Y });
  L.addSpawn(0, 6, -195, Math.PI, { base: SPAWN_Y });
  L.addSpawn(0, 0, -160, Math.PI, { base: SPAWN_Y });
  L.addSpawn(1, 0, 228, 0, { base: SPAWN_Y });
  L.addSpawn(1, -6, 205, 0, { base: SPAWN_Y });
  L.addSpawn(1, 6, 190, 0, { base: SPAWN_Y });
  L.addSpawn(1, 0, 160, 0, { base: SPAWN_Y });
  L.addRoute([new THREE.Vector3(0, deckY, -140), new THREE.Vector3(-7, deckY, -70), new THREE.Vector3(0, deckY, 0)]);
  L.addRoute([new THREE.Vector3(-7, deckY, 20), new THREE.Vector3(7, deckY, 80), new THREE.Vector3(0, deckY, 140)]);
}

/* Fog animation hook is handled by Level.update via `animated` entries. */
