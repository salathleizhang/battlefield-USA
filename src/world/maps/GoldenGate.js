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
    anchorZ: 486,
  };
  const DECK = P.deckY + 0.06;

  L.bounds = { minX: -220, maxX: 220, minZ: -590, maxZ: 590 };
  L.worldGround = P.deckY;

  /* ------------------------------------------------------------- terrain */
  // A deep channel through the strait, then the two headlands. The shoreline
  // sits at z = ±450…500 so both towers stand offshore, as they do in life.
  const height = (x, z) => {
    const d = Math.abs(z);
    if (d < 450) return -26 + Math.sin(x * 0.021) * 1.2;
    const t = smoothstep(450, 500, d);
    let h = lerp(-26, 34, t);
    if (d > 500) {
      const g = smoothstep(500, 720, d);
      h += g * (z < 0 ? 88 : 42);
      h += Math.sin(x * 0.018 + z * 0.006) * 9 * g;
      h += Math.sin(x * 0.05 + 1.3) * 3.2 * g;
    }
    return h;
  };

  L.addTerrain({
    size: 1600, segments: 220, height, texture: 'grass', tile: 7,
    color: (x, z, y, c) => {
      const n = Math.random();
      if (y < 1.5) c.setHex(0x4d4b42);
      else if (y < 30) c.setHex(0x5b5f43).lerp(new THREE.Color(0x7a7050), n * 0.7);
      else c.setHex(0x566440).lerp(new THREE.Color(0x7b7450), n * 0.75);
    },
  });

  L.addWater({ y: 0, size: 3000, color: 0x33474a, opacity: 0.985, rough: 0.09 });

  /* -------------------------------------------------------------- bridge */
  buildGoldenGateBridge(L, P);

  /* -------------------------------------------------------- environment */
  const rock = L.mats.get('ground');
  const concrete = L.mats.get('concrete');
  const foliage = L.mats.get('foliage');
  const dark = L.mats.get('bridgeDark');

  // Alcatraz, 700 m west of the span and half lost in the fog.
  L.batch.box(96, 26, 58, -340, 2, 150, rock, { uv: 0.08 });
  L.batch.box(70, 12, 40, -340, 20, 150, rock, { uv: 0.1 });
  L.batch.box(42, 13, 22, -344, 31, 150, concrete, { uv: 0.2 });
  L.batch.box(9, 8, 8, -312, 30, 140, concrete, { uv: 0.25 });
  L.batch.cylinder(1.6, 2.2, 14, 8, -312, 40, 140, concrete);
  L.batch.sphere(0.5, -312, 47.5, 140, L.mats.get('lampWarm'), 8);

  // A Liberty ship anchored in the roads, for scale.
  const hull = L.mats.get('metal');
  L.batch.box(92, 9, 14, -220, 4, -70, hull, { uv: 0.08 });
  L.batch.box(20, 9, 11, -246, 12, -70, hull, { uv: 0.12 });
  L.batch.box(9, 6, 9, -236, 19, -70, L.mats.get('rust'), { uv: 0.15 });
  L.batch.cylinder(1.1, 1.4, 14, 6, -236, 28, -70, L.mats.get('rust'));
  L.batch.box(46, 1.2, 12, -214, 9.5, -70, hull, { uv: 0.15 });

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

  // A few Marin rock outcrops breaking through the grass.
  for (let i = 0; i < 12; i++) {
    const x = -190 + (i * 71) % 380;
    const z = -548 - (i * 29) % 90;
    const gy = height(x, z);
    L.batch.box(6 + (i % 4) * 4, 3 + (i % 3) * 2, 5 + (i % 5) * 3, x, gy + 1, z, rock, { uv: 0.1 });
  }

  /* ------------------------------------------------------------- fog banks */
  // Soft, camera-facing puffs drifting through the span. The hard-edged planes
  // of the old build read as floating glass, so these use a radial alpha ramp.
  const fogTex = softFogTexture();
  const fogGroup = [];
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
    fogGroup.push(sp);
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
