import * as THREE from 'three';
import { lerp, smoothstep } from '../../core/MathUtil.js';
import { buildGoldenGateBridge } from '../GoldenGateBridge.js';

/**
 * 飞夺金门大桥 — 1947.3.19
 *
 * The bridge is a half-scale structural replica of the real Golden Gate
 * (640 m main span, 33.5 m deck clearance, 113.5 m towers) sitting in a
 * 1.6 km model of the strait: Marin headlands to the north, the Presidio
 * bluff to the south, Alcatraz in the fog off to the west. Capture the north
 * tower, the mid-span, then the south tower.
 */
export function buildGoldenGate(L) {
  const P = {
    deckY: 33.5,
    length: 1080,
    towerZ: 320,
    anchorZ: 520,
  };
  const DECK = P.deckY + 0.06;

  L.bounds = { minX: -220, maxX: 220, minZ: -590, maxZ: 590 };
  L.worldGround = P.deckY;

  /* ------------------------------------------------------------- terrain */
  // A deep channel through the strait, then the two headlands. The shoreline
  // wanders along x so the coast reads as coves and points instead of a wall,
  // and rises over ~100 m rather than as a vertical cliff.
  const height = (x, z) => {
    const d = Math.abs(z);
    const shore = 452 + Math.sin(x * 0.013) * 14 + Math.sin(x * 0.037 + 1.7) * 6;
    if (d < shore) return -26 + Math.sin(x * 0.021) * 1.2;
    const t = smoothstep(shore, shore + 95, d);
    let h = lerp(-26, 32 + Math.sin(x * 0.009) * 6, t);
    if (d > shore + 80) {
      const g = smoothstep(shore + 80, 760, d);
      h += g * (z < 0 ? 86 : 40);
      h += Math.sin(x * 0.018 + z * 0.006) * 9 * g;
      h += Math.sin(x * 0.05 + 1.3) * 3.2 * g;
    }
    return h;
  };

  L.addTerrain({
    size: 1600, segments: 300, height, texture: 'grass', tile: 7,
    color: (x, z, y, c) => {
      const n = Math.random();
      if (y < 1.5) c.setHex(0x4d4b42);
      else if (y < 30) c.setHex(0x5b5f43).lerp(new THREE.Color(0x7a7050), n * 0.7);
      else c.setHex(0x566440).lerp(new THREE.Color(0x7b7450), n * 0.75);
    },
  });

  L.addWater({ y: 0, size: 3000, color: 0x33474a, opacity: 0.985, rough: 0.12 });
  // Cold, choppy bay water: small wind waves, very little mirror. The default
  // sea material is tuned for bright tropical shallows and turns the strait
  // into white corrugated iron at this scale.
  if (L.waterMat) {
    L.waterMat.color.setHex(0x233438);
    L.waterMat.roughness = 0.3;
    L.waterMat.envMapIntensity = 0.55;
    L.waterMat.normalScale.setScalar(0.28);
    if (L.waterMat.normalMap) L.waterMat.normalMap.repeat.set(3000 / 42, 3000 / 42);
  }

  /* -------------------------------------------------------------- bridge */
  buildGoldenGateBridge(L, P);

  // Approach viaduct: twin concrete columns carry the deck from the anchorage
  // down to where the road cuts into the headland.
  const conc = L.mats.get('concrete');
  for (const zs of [-1, 1]) {
    for (let z = 492; z <= 536; z += 11) {
      const gy = height(0, zs * z);
      const h = P.deckY - gy;
      if (h < 1.2) continue;
      for (const s of [-1, 1]) {
        L.batch.box(1.4, h, 1.4, s * 8, gy + h / 2, zs * z, conc, { uv: 0.25 });
      }
      L.batch.box(18, 0.9, 1.6, 0, gy + h - 0.4, zs * z, conc, { uv: 0.25 });
    }
  }

  /* -------------------------------------------------------- environment */
  const rock = L.mats.get('ground');
  const concrete = L.mats.get('concrete');
  const foliage = L.mats.get('foliage');

  // Alcatraz, 700 m west of the span and half lost in the fog.
  L.batch.box(96, 26, 58, -340, 2, 150, rock, { uv: 0.08 });
  L.batch.box(70, 12, 40, -340, 20, 150, rock, { uv: 0.1 });
  L.batch.box(42, 13, 22, -344, 31, 150, concrete, { uv: 0.2 });
  L.batch.box(9, 8, 8, -312, 30, 140, concrete, { uv: 0.25 });
  L.batch.cylinder(1.6, 2.2, 14, 8, -312, 40, 140, concrete);
  L.batch.sphere(0.5, -312, 47.5, 140, L.mats.get('lampWarm'), 8);

  // A Liberty ship anchored in the roads, for scale. Kept far enough out that
  // it reads as a silhouette rather than a floating box.
  const hull = L.mats.get('metal');
  const white = L.mats.get('plasterWhite');
  L.batch.box(74, 7, 11, -390, 2.5, -95, hull, { uv: 0.1 });
  L.batch.box(46, 1.5, 10, -386, 6.2, -95, hull, { uv: 0.12 });
  L.batch.box(13, 7, 9, -402, 9, -95, white, { uv: 0.18 });
  L.batch.box(7, 4, 7, -398, 14.5, -95, white, { uv: 0.2 });
  L.batch.box(3, 3, 3, -416, 13, -95, L.mats.get('rust'), { uv: 0.3 });
  L.batch.cylinder(0.35, 0.5, 11, 5, -414, 9, -95, hull);
  L.batch.cylinder(0.35, 0.5, 9, 5, -370, 8, -95, hull);
  L.batch.box(30, 0.4, 0.4, -390, 11, -95, hull, { uv: 0.4 });

  // Rocks and kelp along the waterline soften the meeting of land and bay.
  for (let i = 0; i < 30; i++) {
    const x = -370 + ((i * 97) % 740);
    const zs = i % 2 ? 1 : -1;
    const shoreZ = 452 + Math.sin(x * 0.013) * 14 + Math.sin(x * 0.037 + 1.7) * 6;
    const z = zs * (shoreZ + (i % 3) * 5);
    const r = 2.2 + (i % 4) * 1.5;
    L.batch.box(r * 2.2, r, r * 1.5, x, r * 0.25, z, rock, { uv: 0.35 });
  }

  // Presidio conifers on the southern bluff, and scrub on the Marin side.
  const conifer = (x, z, s) => {
    const gy = height(x, z);
    if (gy < 26) return;
    L.batch.cylinder(0.35 * s, 0.5 * s, 4 * s, 6, x, gy + 2 * s, z, L.mats.get('palmTrunk'));
    const cone = (r, h, dy) => {
      const g = new THREE.ConeGeometry(r, h, 7);
      g.translate(x, gy + dy, z);
      L.batch.add(g, foliage);
    };
    cone(2.6 * s, 6 * s, 6.4 * s);
    cone(2.0 * s, 5 * s, 9.6 * s);
    cone(1.3 * s, 4 * s, 12.2 * s);
  };
  for (let i = 0; i < 16; i++) {
    conifer(-160 + (i * 53) % 320, 545 + ((i * 37) % 60), 0.8 + (i % 3) * 0.35);
  }
  for (let i = 0; i < 10; i++) {
    conifer(-180 + (i * 67) % 360, -560 - ((i * 41) % 70), 0.9 + (i % 4) * 0.3);
  }

  // Dense scrub and cypress along the Marin shore, so the headland has scale.
  for (let i = 0; i < 34; i++) {
    const x = -210 + ((i * 83) % 420);
    const z = -505 - ((i * 37) % 90);
    conifer(x, z, 0.55 + (i % 5) * 0.22);
  }

  /* ------------------------------------------------ shadow on the water */
  // No planar reflections in this pipeline, so the bridge gets a soft,
  // sun-offset shadow strip on the bay. Without it the deck floats.
  {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 8;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.32, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.68, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 8);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.32, depthWrite: false, color: 0x101a1c,
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(92, 1180), mat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(-16, 0.06, -14);
    L.scene.add(shadow);
  }

  /* ------------------------------------------------------------- fog banks */
  // Soft, camera-facing puffs drifting through the span. The hard-edged planes
  // of the old build read as floating glass, so these use a radial alpha ramp.
  const fogTex = softFogTexture();
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.SpriteMaterial({
      map: fogTex, color: 0xd7dcd9, transparent: true,
      opacity: 0.12 + Math.random() * 0.08, depthWrite: false, fog: true,
    });
    const sp = new THREE.Sprite(mat);
    const z = -520 + i * 68;
    const x = (Math.random() - 0.5) * 90;
    const y = P.deckY + 2 + Math.random() * 26;
    sp.position.set(x, y, z);
    sp.scale.set(110 + Math.random() * 70, 34 + Math.random() * 18, 1);
    L.scene.add(sp);
    L.animated.push({
      type: 'fog', mesh: sp, baseX: x, baseZ: z, baseY: y,
      phase: Math.random() * 6.28, opacity: mat.opacity,
    });
  }

  /* ------------------------------------------------------------- gameplay */
  L.addCapturePoint({ id: 'A', name: '北塔', x: 0, z: -P.towerZ, radius: 16, owner: -1, base: DECK, height: 10 });
  L.addCapturePoint({ id: 'B', name: '中跨', x: 0, z: 0, radius: 16, owner: -1, base: DECK, height: 10 });
  L.addCapturePoint({ id: 'C', name: '南塔 · 旧金山', x: 0, z: P.towerZ, radius: 16, owner: 1, base: DECK, height: 10 });

  L.setPlayerSpawn(0, -512, Math.PI, { base: DECK });
  L.addSpawn(0, 0, -512, Math.PI, { base: DECK });
  L.addSpawn(0, -7, -500, Math.PI, { base: DECK });
  L.addSpawn(0, 7, -494, Math.PI, { base: DECK });
  L.addSpawn(0, 0, -462, Math.PI, { base: DECK });
  L.addSpawn(0, 0, -398, Math.PI, { base: DECK });
  L.addSpawn(1, 0, 512, 0, { base: DECK });
  L.addSpawn(1, -7, 500, 0, { base: DECK });
  L.addSpawn(1, 7, 494, 0, { base: DECK });
  L.addSpawn(1, 0, 462, 0, { base: DECK });
  L.addSpawn(1, 0, 398, 0, { base: DECK });

  // Strongpoints on the deck: sandbags under each portal, roadblocks and
  // supply caches at the three objectives.
  for (const tz of [-P.towerZ, P.towerZ]) {
    L.sandbags(-8, tz - 8, 0, 5, { base: DECK });
    L.sandbags(8, tz + 8, Math.PI, 5, { base: DECK });
    L.batch.cylinder(0.25, 0.3, 4, 6, -8, DECK + 2, tz - 8, L.mats.get('metal'));
    L.batch.cylinder(0.25, 0.3, 4, 6, 8, DECK + 2, tz + 8, L.mats.get('metal'));
  }
  L.sandbags(0, 106, Math.PI / 2, 7, { base: DECK });
  L.sandbags(0, -96, Math.PI / 2, 6, { base: DECK });
  L.barbedWire(-6, 78, Math.PI / 2, 14, { base: DECK });
  L.barbedWire(6, -70, Math.PI / 2, 14, { base: DECK });

  L.wreck(5, 14, 1.2, { base: DECK, kind: 'truck' });
  L.wreck(-5, -44, 0.3, { base: DECK, kind: 'car' });

  const cache = (x, z, rot = 0) => {
    L.prop('crate', x, z, rot, { base: DECK });
    L.prop('ammo', x + 0.5, z + 0.6, rot, { base: DECK, y: 0.32 });
    L.prop('barrel', x + 1.9, z - 0.4, 0, { base: DECK });
  };
  cache(-8.6, -310);
  cache(8.6, -330);
  cache(-8.4, 8);
  cache(8.4, -10);
  cache(-8.6, 304);
  cache(8.6, 330);

  for (const z of [-382, -258, -64, 64, 250, 382]) {
    L.prop('barrier', -5.5, z, 0.1, { base: DECK });
    L.prop('barrier', 5.5, z + 1, -0.1, { base: DECK });
  }
  L.prop('crateWood', -7, -150, 0.4, { base: DECK });
  L.prop('barrelRust', 7, 148, 0, { base: DECK });
  L.prop('ammo', 2.4, 150, 0, { base: DECK });

  // A pair of searchlights watching the southern approach.
  for (const s of [-1, 1]) {
    L.batch.cylinder(0.3, 0.36, 1.2, 8, s * 7, DECK + 0.6, 452, L.mats.get('metal'));
    L.batch.cylinder(0.5, 0.62, 1.4, 10, s * 7, DECK + 1.9, 452, L.mats.get('metal'), {
      rotZ: s * 0.5, rotX: -0.4,
    });
  }

  L.addRoute([
    new THREE.Vector3(0, DECK, -512), new THREE.Vector3(0, DECK, -400),
    new THREE.Vector3(0, DECK, -320), new THREE.Vector3(0, DECK, -200),
    new THREE.Vector3(0, DECK, 0), new THREE.Vector3(0, DECK, 200),
    new THREE.Vector3(0, DECK, 320), new THREE.Vector3(0, DECK, 440),
    new THREE.Vector3(0, DECK, 512),
  ]);
}

/* A soft radial blob used for the drifting fog banks. */
function softFogTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
