import * as THREE from 'three';
import { smoothstep, clamp, lerp } from '../../core/MathUtil.js';
import { signTexture } from '../Geo.js';
import { planMiamiPalms, buildPalms } from '../palms/MiamiPalms.js';

/**
 * 迈阿密海滩登陆战 — 1947.3.12
 * East: Atlantic surf, Lummus Park, Ocean Drive's Art Deco hotel row.
 * West: Biscayne Bay, the MacArthur Causeway, downtown Miami on the far shore.
 * Blueprint: beach (A) → Art Deco blocks (B) → causeway (C) → mainland.
 */
export function buildMiamiBeach(L) {
  L.bounds = { minX: -336, maxX: 284, minZ: -252, maxZ: 252 };

  const shore = 70;
  const deckY = 5.62;
  const islandY = 2.0;
  const bayFloor = -4.2;

  const height = (x, z) => {
    let y;
    if (x >= shore) {
      y = lerp(0, -7.2, smoothstep(shore, shore + 52, x));
      y += Math.sin(z * 0.055) * 0.05 * smoothstep(shore, shore + 22, x);
      return y;
    }
    if (x > 18) {
      y = lerp(islandY, 0, smoothstep(18, shore, x));
      y += Math.sin(x * 0.42 + z * 0.05) * 0.05;
    } else if (x > -60) {
      y = islandY + Math.sin(x * 0.09 + z * 0.04) * 0.08;
    } else if (x > -72) {
      y = lerp(islandY, bayFloor, smoothstep(-60, -72, x));
    } else if (x > -196) {
      y = bayFloor;
    } else if (x > -210) {
      y = lerp(bayFloor, 2.2, smoothstep(-210, -196, x));
    } else {
      y = 2.2 + Math.max(0, -x - 220) * 0.004;
    }

    // MacArthur Causeway: raised earthen approaches on the z = 0 axis.
    const ridge = 1 - smoothstep(8.5, 13.5, Math.abs(z));
    if (ridge > 0 && x < -58 && x > -94) {
      const t = smoothstep(-62, -94, x);
      y = Math.max(y, lerp(islandY, deckY, t * ridge));
    } else if (ridge > 0 && x < -192 && x > -214) {
      const t = smoothstep(-214, -192, x);
      y = Math.max(y, lerp(2.2, deckY, t * ridge));
    }
    return y;
  };

  const sandMat = L.mats.terrain('sand', { repeat: 760 / 12, color: 0xffffff, vertexColors: true });
  if (sandMat.normalScale) sandMat.normalScale.setScalar(0.35);
  sandMat.roughness = 1;
  sandMat.envMapIntensity = 0.35;

  L.addTerrain({
    size: 760, segments: 150, height, material: sandMat, texture: 'sand', tile: 12,
    color: (x, z, y, c) => {
      const causeway = Math.abs(z) < 14 && ((x > -100 && x < -56) || (x > -218 && x < -188));
      if (causeway) c.setHex(0x8d897c).lerp(new THREE.Color(0x777468), Math.random() * 0.3);
      else if (x > shore + 2) c.setHex(0x8f8b6e);
      else if (x > 36) c.setHex(0xf4e6c6).lerp(new THREE.Color(0xe2d0ab), Math.random() * 0.3);
      else if (x > 16) c.setHex(0x8b9a62).lerp(new THREE.Color(0x74834f), Math.random() * 0.4);
      else if (x > -60) c.setHex(0x918a79).lerp(new THREE.Color(0x7f796b), Math.random() * 0.35);
      else if (x > -196) c.setHex(0x5f6b60);
      else c.setHex(0x7d7864).lerp(new THREE.Color(0x6c6857), Math.random() * 0.3);
    },
  });
  L.addWater({ y: 0, size: 1800, color: 0x3f938c, opacity: 0.91, rough: 0.11 });
  L.worldGround = islandY;

  L.addShoreFoam({ x: 68, z: 0, w: 9, d: 500, opacity: 0.8 });
  L.addShoreFoam({ x: 72, z: -40, w: 6, d: 360, opacity: 0.48 });
  L.addShoreFoam({ x: 76, z: 90, w: 4, d: 260, opacity: 0.28 });

  /* --------------------------------------------------------- material kit */
  const M = {
    white: L.mats.get('plasterWhite'),
    plaster: L.mats.get('plaster'),
    concrete: L.mats.get('concrete'),
    asphalt: L.mats.get('asphalt'),
    wood: L.mats.get('wood'),
    woodDark: L.mats.get('woodDark'),
    metal: L.mats.get('metal'),
    rust: L.mats.get('rust'),
    glass: L.mats.get('glass'),
  };
  // Pale sky-reflecting glass for the hotel ribbon windows.
  const windowGlass = new THREE.MeshStandardMaterial({
    color: 0x3d5f68, roughness: 0.16, metalness: 0.45, transparent: true, opacity: 0.72,
    emissive: 0x223b44, emissiveIntensity: 0.35, envMapIntensity: 1.3,
  });
  const neonMat = (hex) => new THREE.MeshStandardMaterial({
    color: 0xfff2e6, emissive: hex, emissiveIntensity: 2.6, roughness: 0.4,
  });
  const neonPink = neonMat(0xff4f7d);
  const neonAqua = neonMat(0x2fd8cf);
  const neonGold = neonMat(0xffb45e);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe6bd, emissive: 0xffb45a, emissiveIntensity: 2.1, roughness: 0.5,
  });
  const awnings = ['stuccoCoral', 'stuccoMint', 'stuccoBlue', 'stuccoLilac'].map((n) => L.mats.get(n));
  const beachTints = [
    new THREE.MeshStandardMaterial({ color: 0xe8b6a6, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xbfe0d2, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xbfd8e6, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xf0d9a8, roughness: 0.9 }),
  ];
  const carPaints = [0x9fd8c8, 0xe3a995, 0xf0dfb2, 0xbfd8e6, 0xd6c6e0].map((color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.42 }));

  const addSign = (text, x, y, z, w, h, rotY = 0, colors = {}) => {
    const tex = signTexture(text, { bg: '#221b24', fg: '#ffe6c2', border: '#9a7152', ...colors });
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    L.scene.add(mesh);
    return mesh;
  };

  /** Vertical stacked-letter blade sign, the other Ocean Drive signature. */
  const verticalSign = (text) => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = Math.max(256, 96 * text.length);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1c1820';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#8a6a52';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, c.width - 8, c.height - 8);
    ctx.fillStyle = '#ffe6c1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cell = (c.height - 24) / text.length;
    ctx.font = `700 ${Math.min(74, cell * 0.76)}px "Songti SC", "Noto Serif SC", serif`;
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], 64, 12 + cell * (i + 0.5));
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.62, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(1.2, text.length * 1.03), mat);
  };

  /* ------------------------------------------------ Ocean Drive hotel row */
  const HOTEL_X = -8;
  const addDecoHotel = ({ z, h, mat, name, floors = 4, damage = 0.3, balcony = false, neon = neonPink, awning = 0 }) => {
    const gy = height(HOTEL_X, z);
    L.building({
      x: HOTEL_X, z, w: 26, d: 14, h, rotY: Math.PI / 2, floors, damage, balcony,
      material: mat, flatRoof: true,
    });

    const floorH = h / floors;
    // Continuous ribbon glazing with white mullions: the streamline look.
    for (let f = 0; f < floors; f++) {
      const wy = gy + floorH * f + floorH * 0.62;
      L.batch.box(0.14, Math.min(1.55, floorH * 0.34), 19.5, -0.8, wy, z, windowGlass, { uv: 0.4 });
      for (let mz = -8.8; mz <= 8.9; mz += 3.2) {
        L.batch.box(0.18, Math.min(1.8, floorH * 0.42), 0.16, -0.76, wy, z + mz, M.white);
      }
    }
    // Horizontal "eyebrow" ledges: the signature Art Deco shadow line.
    for (let f = 1; f < floors; f++) {
      L.batch.box(1.5, 0.2, 24, -0.55, gy + floorH * f + 0.4, z, M.white, { uv: 0.5 });
    }
    // Vertical fins and neon pinstripes.
    for (const dz of [-9, 9]) {
      L.batch.box(0.55, h * 0.56, 0.9, -0.6, gy + h * 0.56, z + dz, M.white);
      L.batch.box(0.16, h * 0.4, 0.28, -0.33, gy + h * 0.56, z + dz, neon);
    }
    // Entrance awning with a white valance.
    L.batch.box(2.8, 0.18, 7, -0.5, gy + 4.15, z, awnings[awning % awnings.length]);
    L.batch.box(0.1, 0.42, 7, 0.86, gy + 3.98, z, M.white);
    // Vertical stacked-letter blade sign on a white fin.
    const bladeH = name.length * 1.03;
    L.batch.box(0.94, bladeH + 0.4, 1.6, -0.53, gy + h * 0.6, z, M.white);
    const blade = verticalSign(name);
    blade.position.set(-0.04, gy + h * 0.6, z);
    blade.rotation.y = Math.PI / 2;
    L.scene.add(blade);
    // Rooftop marquee on two posts.
    for (const dz of [-3.8, 3.8]) L.batch.cylinder(0.08, 0.08, 2.6, 5, -0.6, gy + h + 1.3, z + dz, M.metal);
    addSign(name, -0.15, gy + h + 2.7, z, 8.6, 2.1, Math.PI / 2, { w: 512, h: 128 });
  };

  const hotels = [
    { z: -156, h: 14, mat: 'stuccoCream', name: 'COLONY', floors: 4, damage: 0.35, neon: neonGold },
    { z: -124, h: 12, mat: 'stuccoMint', name: 'TIDES', floors: 3, damage: 0.2, neon: neonAqua },
    { z: -92, h: 16, mat: 'stuccoWhite', name: 'BEACON', floors: 4, damage: 0.8, neon: neonPink, balcony: true },
    { z: -60, h: 11, mat: 'stuccoCoral', name: 'CARLYLE', floors: 3, damage: 0.4, neon: neonPink },
    { z: -28, h: 15, mat: 'stuccoPink', name: 'AVALON', floors: 4, damage: 0.25, neon: neonGold },
    { z: 4, h: 13, mat: 'stuccoBlue', name: 'PELICAN', floors: 4, damage: 0.55, neon: neonAqua, balcony: true },
    { z: 36, h: 17, mat: 'stuccoWhite', name: 'MAJESTIC', floors: 5, damage: 0.3, neon: neonPink },
    { z: 68, h: 12, mat: 'stuccoLilac', name: 'STARLITE', floors: 3, damage: 0.9, neon: neonPink },
    { z: 100, h: 15, mat: 'stuccoCream', name: 'SURF', floors: 4, damage: 0.45, neon: neonAqua },
    { z: 132, h: 13, mat: 'stuccoMint', name: 'CORAL', floors: 4, damage: 0.2, neon: neonGold },
    { z: 164, h: 12, mat: 'stuccoOchre', name: 'OCEANA', floors: 3, damage: 0.5, neon: neonPink },
  ];
  hotels.forEach((h, i) => addDecoHotel({ ...h, awning: i }));

  // Fires on the hotel row.
  L.fire(0.55, height(HOTEL_X, -92) + 9, -92, 2.0);
  L.smokeColumn(0.4, height(HOTEL_X, -92) + 11, -92, 1.7);
  L.fire(0.55, height(HOTEL_X, 68) + 7, 68, 1.5);
  L.smokeColumn(0.4, height(HOTEL_X, 68) + 9, 68, 1.6);
  L.fire(0.55, height(HOTEL_X, 4) + 6, 4, 1.2);
  L.smokeColumn(0.4, height(HOTEL_X, 4) + 8, 4, 1.3);

  // Collins Avenue second row (background depth).
  const second = [
    { z: -120, h: 10, name: 'DRUGS', mat: 'stuccoWhite', damage: 0.4 },
    { z: -56, h: 12, name: 'THEATER', mat: 'stuccoCream', damage: 0.3, balcony: true },
    { z: 8, h: 9, name: 'MARKET', mat: 'stuccoGrey', damage: 0.5 },
    { z: 72, h: 11, name: 'GARAGE', mat: 'stuccoPink', damage: 0.2 },
    { z: 136, h: 10, name: 'CAFE', mat: 'stuccoMint', damage: 0.45 },
  ];
  for (const b of second) {
    L.building({
      x: -44, z: b.z, w: 24, d: 14, h: b.h, rotY: Math.PI / 2, floors: 3,
      material: b.mat, flatRoof: true, damage: b.damage, sign: b.name, balcony: !!b.balcony,
    });
  }

  /* ------------------------------------------------------------- streets */
  // Ocean Drive itself.
  L.batch.box(12, 0.1, 384, 8, 2.06, 0, M.asphalt, { uv: 0.55 });
  L.batch.box(3, 0.18, 384, 0.5, 2.09, 0, M.concrete, { uv: 0.5 });
  L.batch.box(3, 0.18, 384, 15.5, 2.09, 0, M.concrete, { uv: 0.5 });
  // Lane dashes.
  for (let z = -186; z <= 186; z += 9) {
    L.batch.box(0.16, 0.02, 3.4, 8, 2.13, z, M.white);
  }
  // Cross streets down to the bay.
  for (const z of [-140, -44, 52, 148]) {
    L.batch.box(78, 0.1, 10, -21, 2.07, z, M.asphalt, { uv: 0.55 });
  }
  // Standing rainwater: mirror puddles along Ocean Drive and under the awnings.
  for (let z = -172; z <= 178; z += 13) {
    const x = 8 + (L.rand() - 0.5) * 5.6;
    L.puddle(x, z, { y: 2.125, r: 1.1 + L.rand() * 2.4, stretch: 0.4 + L.rand() * 0.5 });
    if (L.rand() < 0.55) {
      L.puddle(15.5 + (L.rand() - 0.5) * 1.8, z + 4, { y: 2.2, r: 0.7 + L.rand() * 1.3, stretch: 0.45 + L.rand() * 0.4 });
    }
    if (L.rand() < 0.35) {
      L.puddle(8 + (L.rand() - 0.5) * 74, -140 + (L.rand() - 0.5) * 2, { y: 2.105, r: 1.6 + L.rand() * 2.2, stretch: 0.35 + L.rand() * 0.4 });
    }
  }

  /* ------------------------------------------------------- Ocean Drive life */
  const addCar = (x, z, rot, paint) => {
    const gy = height(x, z);
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    L.batch.box(4.3, 0.72, 1.85, x, gy + 0.7, z, paint, { rotY: rot, uv: 0.5 });
    L.batch.box(2.15, 0.62, 1.72, x, gy + 1.33, z, paint, { rotY: rot, uv: 0.5 });
    for (const [lx, lz] of [[1.08, 0], [-1.08, 0]]) {
      const [wx, wz] = at(lx, lz);
      L.batch.box(0.16, 0.3, 1.62, wx, gy + 1.36, wz, M.glass, { rotY: rot });
    }
    for (const [lx, lz] of [[0, 0.87], [0, -0.87]]) {
      const [wx, wz] = at(lx, lz);
      L.batch.box(1.9, 0.3, 0.06, wx, gy + 1.36, wz, M.glass, { rotY: rot });
    }
    for (const [lx, lz] of [[-1.35, 0.93], [1.35, 0.93], [-1.35, -0.93], [1.35, -0.93]]) {
      const [wx, wz] = at(lx, lz);
      L.batch.box(0.72, 0.58, 0.22, wx, gy + 0.33, wz, L.mats.get('rubber'), { rotY: rot });
    }
    L.solidBox(x, gy + 0.8, z, 4.3, 1.6, 1.85, rot, { surface: 'metal' });
  };
  [-96, 104, 160].forEach((z, i) => addCar(3.2, z, Math.PI / 2, carPaints[i % carPaints.length]));
  [-64, 136].forEach((z, i) => addCar(12.8, z, Math.PI / 2, carPaints[(i + 2) % carPaints.length]));

  // Ocean Drive's hero convertible (the GLB from ocean-drive): two hand-placed cars.
  if (L.game.miamiCar) {
    const proto = L.game.miamiCar;
    const box = new THREE.Box3().setFromObject(proto);
    const size = box.getSize(new THREE.Vector3());
    const blobMat = new THREE.MeshBasicMaterial({
      color: 0x1a1510, transparent: true, opacity: 0.3, depthWrite: false,
    });
    const spots = [
      [2.9, 70, 0, 0x8fc6bf],
      [13.0, -20, Math.PI, 0xe6a08f],
    ];
    for (const [x, z, rot, paint] of spots) {
      const car = proto.clone(true);
      const painted = new Map();
      car.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.receiveShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const next = mats.map((m) => {
          if (m?.name !== 'paint') return m;
          if (!painted.has(m)) {
            const clone = m.clone();
            clone.color.setHex(paint);
            painted.set(m, clone);
          }
          return painted.get(m);
        });
        o.material = Array.isArray(o.material) ? next : next[0];
      });
      const gy = height(x, z);
      car.position.set(x, gy - box.min.y + 0.02, z);
      car.rotation.y = rot;
      L.scene.add(car);
      // Cheap blob shadow instead of a second full shadow pass for the whole car.
      const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 18), blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.scale.set(1.25, 2.55, 1);
      blob.position.set(x, gy + 0.035, z);
      L.scene.add(blob);
      L.solidBox(x, gy + 0.75, z, size.x, 1.5, size.z, rot, { surface: 'metal' });
    }
  }

  const addLamp = (x, z) => {
    const gy = height(x, z);
    const inward = x < 8 ? 1 : -1;
    L.batch.cylinder(0.09, 0.12, 4.8, 6, x, gy + 2.4, z, M.metal);
    L.batch.box(1.1, 0.08, 0.08, x + inward * 0.55, gy + 4.8, z, M.metal);
    L.batch.sphere(0.17, x + inward * 1.05, gy + 4.66, z, lampMat);
  };
  for (let z = -176; z <= 176; z += 32) {
    addLamp(1.35, z);
    addLamp(14.65, z + 16);
  }

  // Low clipped hedges and flower beds along Lummus Park.
  const hedgeMat = L.mats.get('foliage');
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xd66f78, roughness: 0.9 });
  for (let z = -172; z <= 172; z += 12) {
    if (Math.abs(z) < 14 || (z > -144 && z < -110)) continue;
    L.batch.box(1.8, 0.72, 8.4, 22.5, 2.36, z, hedgeMat, { uv: 0.5 });
    L.batch.box(0.5, 0.28, 4.2, 21.7, 2.5, z, flowerMat);
  }

  // A few cafe tables under parasols on the west sidewalk.
  const cafeSpots = [[1.1, -148], [1.1, -76], [1.1, 28], [1.1, 92]];
  cafeSpots.forEach(([x, z], i) => {
    const gy = height(x, z);
    L.batch.cylinder(0.06, 0.08, 0.75, 6, x, gy + 0.4, z, M.metal);
    L.batch.cylinder(0.62, 0.62, 0.06, 12, x, gy + 0.8, z, M.white);
    L.batch.cylinder(0.04, 0.05, 1.9, 5, x, gy + 0.98, z, M.metal);
    L.batch.cylinder(0.05, 1.05, 0.32, 8, x, gy + 2.28, z, awnings[i % awnings.length]);
  });

  // Bayfront promenade, split around the causeway.
  L.batch.box(9, 0.14, 174, -55.5, 2.06, -103, M.concrete, { uv: 0.4 });
  L.batch.box(9, 0.14, 174, -55.5, 2.06, 103, M.concrete, { uv: 0.4 });

  // Seawall + railing; the gap at z = 0 is the causeway.
  for (const [z0, z1] of [[-190, -14], [14, 190]]) {
    const len = z1 - z0, cz = (z0 + z1) / 2;
    L.batch.box(1.4, 3.6, len, -60, 0.6, cz, M.concrete, { uv: 0.4 });
    L.solidBox(-60, 0.6, cz, 1.4, 3.6, len, 0, { surface: 'concrete' });
    for (let z = z0; z <= z1; z += 4) {
      L.batch.box(0.09, 1.0, 0.09, -60, 2.85, z, M.metal);
    }
    L.batch.box(0.08, 0.08, len, -60, 3.32, cz, M.metal);
  }

  /* ---------------------------------------------------------- beach walk */
  for (let z = -188; z <= 188; z += 8) {
    const gy = height(36, z);
    L.batch.box(4.2, 0.12, 7.7, 36, gy + 0.06, z, M.concrete, { uv: 0.5 });
  }

  // Lifeguard towers: pastel huts on stilts.
  const addLifeguard = (x, z, tint) => {
    const gy = height(x, z);
    for (const dx of [-1.3, 1.3]) {
      for (const dz of [-1.05, 1.05]) {
        L.batch.cylinder(0.09, 0.11, 3.2, 6, x + dx, gy + 1.6, z + dz, M.woodDark);
      }
    }
    const hy = gy + 3.9;
    L.batch.box(3.4, 2.2, 2.8, x, hy, z, tint);
    L.batch.box(3.5, 0.3, 2.9, x, hy - 1.15, z, M.white);
    L.batch.box(4.2, 0.22, 3.6, x, hy + 1.25, z, M.white);
    L.batch.box(1.3, 0.9, 0.08, x, hy + 0.1, z + 1.43, M.glass);
    L.solidBox(x, hy, z, 3.4, 2.2, 2.8, 0, { surface: 'wood' });
    const ramp = new THREE.BoxGeometry(5.2, 0.16, 1.4);
    const m = new THREE.Matrix4().makeRotationZ(-0.42);
    m.setPosition(x - 3.6, gy + 1.9, z);
    L.batch.add(ramp, M.wood, m);
  };
  addLifeguard(56, -104, beachTints[0]);
  addLifeguard(57, -34, beachTints[1]);
  addLifeguard(55, 40, beachTints[2]);
  addLifeguard(58, 112, beachTints[3]);

  // Beach umbrellas.
  const addUmbrella = (x, z, tint) => {
    const gy = height(x, z);
    L.batch.cylinder(0.04, 0.05, 2.3, 5, x, gy + 1.15, z, M.metal);
    L.batch.cylinder(0.06, 1.55, 0.5, 8, x, gy + 2.45, z, tint);
  };
  for (let i = 0; i < 9; i++) {
    const x = 46 + (i % 3) * 7;
    const z = -78 + i * 22;
    if (Math.hypot(x - 58, z - 10) < 15) continue; // keep the landing view clear
    addUmbrella(x, z, beachTints[i % 4]);
  }


  /* ------------------------------------------------------------- Lido club */
  L.building({
    x: 27, z: -128, w: 22, d: 10, h: 6, rotY: Math.PI / 2, floors: 1, damage: 0.25,
    material: 'stuccoWhite', flatRoof: true, sign: 'LIDO', signColor: '#221c22',
  });
  for (let i = 0; i < 6; i++) {
    L.batch.cylinder(0.22, 0.26, 4.4, 8, 33, 4.2, -137 + i * 3.6, M.white);
  }
  L.batch.box(5, 0.35, 24, 33.2, 6.5, -128, M.white);
  L.batch.box(0.3, 0.12, 20, 35.6, 6.2, -128, neonAqua);

  /* ------------------------------------------------------------- defenses */
  // Beach obstacles.
  for (let i = 0; i < 12; i++) {
    const z = -170 + i * 29;
    L.tankTrap(48 + Math.sin(i * 1.4) * 3, z, { base: height(48, z) });
  }
  L.barbedWire(44, -56, 0.06, 34);
  L.barbedWire(42, 64, -0.04, 30);
  L.barbedWire(46, 140, 0.1, 22);
  L.bunker(44, -92, 0.1);
  L.bunker(44, 96, -0.1);
  L.sandbags(40, -22, 0.08, 12);
  L.sandbags(40, 28, -0.05, 10);
  L.sandbags(38, 58, 0.1, 9);
  L.sandbags(42, -66, 0, 8);

  // Beach wrecks and craters.
  L.wreck(52, -48, 0.6, { kind: 'truck' });
  L.wreck(45, 34, -0.4);
  L.wreck(58, 150, 1.2, { kind: 'truck' });
  L.wreck(46, -16, 0.7, { kind: 'truck' });
  for (let i = 0; i < 18; i++) {
    L.crater(42 + Math.random() * 24, -160 + Math.random() * 320, 1.5 + Math.random() * 1.8);
  }
  for (let i = 0; i < 6; i++) {
    L.crater(20 + Math.random() * 14, -170 + Math.random() * 330, 1.2 + Math.random() * 1.4);
  }
  // Loose planking and a forward supply bundle around the landing point.
  L.sandbags(44, 12, 0.06, 9);
  for (let i = 0; i < 9; i++) {
    const x = 48 + Math.random() * 15;
    const z = -14 + Math.random() * 34;
    L.batch.box(2.6, 0.12, 0.28, x, height(x, z) + 0.08, z, M.wood, { rotY: Math.random() * 6.28, uv: 0.6 });
  }
  L.crate(46, 14, 1.0, { base: height(46, 14) });
  L.prop('ammo', 46.8, 14.2, 0.2, { base: height(46, 14), y: 0.3 });

  // Landing craft on the waterline.
  L.landingCraft(110, 124, 0.03, { base: 0.2 });
  L.landingCraft(120, -112, 0, { base: 0.35 });
  L.landingCraft(134, 162, 0.04, { base: 0.3 });
  L.landingCraft(142, -158, -0.03, { base: 0.28 });

  // Supply dumps at the beach strongpoints.
  L.prop('crate', 36, -10, 0.2, { base: height(36, -10) });
  L.prop('ammo', 36.7, -9.7, 0.2, { base: height(36, -10), y: 0.3 });
  L.prop('barrel', 38, 20, 0, { base: height(38, 20) });
  L.prop('jerrycan', 37.2, 22, 0.5, { base: height(37, 22) });
  L.prop('ammo', 39, -58, 0.3, { base: height(39, -58) });
  L.prop('crate', 40.5, 56, 1.1, { base: height(40, 56) });

  // Ocean Drive strongpoints.
  L.wreck(6, -34, 0.35, { kind: 'truck' });
  L.sandbags(4, -112, 0.1, 10);
  L.sandbags(12, 88, -0.05, 9);
  L.bunker(1, -70, 0.05);
  L.barbedWire(8, 52, 0, 16);
  L.barbedWire(8, -140, 0, 14);
  L.crater(8, -18, 1.8);
  L.crater(4, 44, 1.4);
  L.prop('crate', 3, -108, 0.4, { base: height(3, -108) });
  L.prop('ammo', 3.7, -107.7, 0.4, { base: height(3, -108), y: 0.3 });
  L.prop('barrier', 13, -76, 0.02, { base: height(13, -76) });
  L.prop('barrelRust', 2, 34, 0, { base: height(2, 34) });

  // Welcome sign across Ocean Drive.
  for (const x of [1.5, 14.5]) L.batch.cylinder(0.12, 0.16, 4.6, 6, x, 4.3, -178, M.woodDark);
  addSign('MIAMI BEACH', 8, 4.7, -177.8, 12, 2.4, 0, { w: 768, h: 160 });

  /* --------------------------------------------------------- MacArthur causeway */
  const BX0 = -194, BX1 = -94;
  const bx = (BX0 + BX1) / 2, bl = BX1 - BX0;
  L.batch.box(bl, 0.7, 18, bx, deckY - 0.35, 0, M.asphalt, { uv: 0.55 });
  L.solidBox(bx, deckY - 0.35, 0, bl, 0.7, 18, 0, { surface: 'concrete' });
  // Asphalt surface over the raised earthen approaches.
  {
    const east = new THREE.BoxGeometry(34.4, 0.18, 12);
    const me = new THREE.Matrix4().makeRotationZ(-0.106);
    me.setPosition(-77, 3.92, 0);
    L.batch.add(east, M.asphalt, me);
    const west = new THREE.BoxGeometry(22.4, 0.18, 12);
    const mw = new THREE.Matrix4().makeRotationZ(0.154);
    mw.setPosition(-203, 4.0, 0);
    L.batch.add(west, M.asphalt, mw);
  }
  // Girders and curbs.
  for (const z of [-8.8, 8.8]) {
    L.batch.box(bl, 1.3, 0.7, bx, deckY - 1.15, z, M.concrete);
    L.batch.box(bl, 0.25, 0.35, bx, deckY + 0.12, z, M.concrete);
  }
  // Piers.
  for (const x of [-112, -136, -160, -184]) {
    for (const z of [-5.2, 5.2]) L.batch.cylinder(1.0, 1.15, 9.6, 10, x, 0.4, z, M.concrete);
    L.batch.box(2.6, 1.0, 16, x, deckY - 1.7, 0, M.concrete);
  }
  // Railings + solid edge so nobody walks off the deck.
  for (let x = BX0 + 2; x <= BX1 - 2; x += 4) {
    for (const z of [-8.8, 8.8]) L.batch.box(0.1, 1.1, 0.1, x, deckY + 0.55, z, M.metal);
  }
  for (const z of [-8.8, 8.8]) {
    L.batch.box(bl, 0.08, 0.08, bx, deckY + 1.1, z, M.metal);
    L.batch.box(bl, 0.07, 0.07, bx, deckY + 0.66, z, M.metal);
    L.solidBox(bx, deckY + 0.55, z, bl, 1.1, 0.22, 0, { surface: 'metal' });
  }
  // Centre line and lamps.
  for (let x = BX0 + 5; x <= BX1 - 5; x += 8) {
    L.batch.box(4.2, 0.02, 0.16, x, deckY + 0.02, 0, M.white);
  }
  for (let x = -186; x <= -102; x += 28) {
    for (const z of [-8.4, 8.4]) {
      L.batch.cylinder(0.09, 0.12, 5.0, 6, x, deckY + 2.5, z, M.metal);
      L.batch.box(1.2, 0.08, 0.08, x, deckY + 5.0, z + (z > 0 ? -0.6 : 0.6), M.metal);
      L.batch.sphere(0.16, x, deckY + 4.9, z + (z > 0 ? -1.1 : 1.1), lampMat);
    }
  }
  // Bridge sign on the island approach, facing arriving landing craft.
  const signBase = height(-74, 11.5);
  for (const z of [6.4, 16.6]) L.batch.cylinder(0.1, 0.13, 4.4, 6, -74, signBase + 2.2, z, M.woodDark);
  addSign('MACARTHUR CAUSEWAY', -74, signBase + 4.7, 11.5, 11.5, 2.0, Math.PI / 2, { w: 1024, h: 160 });

  // Checkpoints at each bridgehead.
  L.sandbags(-66, 8, 0.08, 9, { base: height(-66, 8) });
  L.sandbags(-192, -8, -0.06, 9, { base: height(-192, -8) });
  L.bunker(-200, 14, 0.04);
  L.wreck(-120, 5, 0.1, { kind: 'truck' });
  L.prop('crate', -70, -8, 0.3, { base: height(-70, -8) });
  L.prop('ammo', -70.7, -7.7, 0.3, { base: height(-70, -8), y: 0.3 });

  /* -------------------------------------------------------------- mainland */
  // Seawall with a causeway gap.
  for (const [z0, z1] of [[-230, -14], [14, 230]]) {
    const len = z1 - z0, cz = (z0 + z1) / 2;
    L.batch.box(1.4, 3.4, len, -204, 0.9, cz, M.concrete, { uv: 0.4 });
    L.solidBox(-204, 0.9, cz, 1.4, 3.4, len, 0, { surface: 'concrete' });
  }
  // Bridgehead plaza.
  L.batch.box(44, 0.12, 54, -226, 2.27, 0, M.asphalt, { uv: 0.5 });
  L.batch.cylinder(13, 13, 0.1, 24, -218, 2.28, 0, M.asphalt);
  // Downtown street grid and a bayfront park block.
  for (let z = -180; z <= 180; z += 36) {
    L.batch.box(140, 0.08, 7, -276, 2.3, z, M.asphalt, { uv: 0.5 });
  }
  for (let x = -246; x >= -330; x -= 30) {
    L.batch.box(7, 0.08, 250, x, 2.3, 0, M.asphalt, { uv: 0.5 });
  }
  L.batch.box(18, 0.1, 20, -230, 2.31, 94, L.mats.get('grass'));
  L.sandbags(-210, 20, 0.05, 12);
  L.sandbags(-210, -20, -0.05, 10);
  L.bunker(-218, 28, 0.2);

  const downtown = [
    { x: -244, z: -40, w: 22, d: 18, h: 16, mat: 'stuccoCream', name: 'HOTEL MIAMI', damage: 0.45 },
    { x: -250, z: 22, w: 20, d: 16, h: 12, mat: 'stuccoWhite', name: 'BAYFRONT', damage: 0.3 },
    { x: -234, z: 62, w: 18, d: 14, h: 10, mat: 'stuccoGrey', name: 'GARAGE', damage: 0.55 },
    { x: -262, z: -94, w: 24, d: 20, h: 20, mat: 'stuccoPink', name: 'COLUMBIA', damage: 0.25, balcony: true },
    { x: -238, z: -116, w: 18, d: 16, h: 14, mat: 'stuccoMint', damage: 0.5 },
    { x: -272, z: 70, w: 22, d: 18, h: 18, mat: 'stuccoBlue', damage: 0.35 },
  ];
  for (const b of downtown) {
    L.building({
      x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, rotY: Math.PI / 2, floors: Math.max(2, Math.round(b.h / 4)),
      material: b.mat, flatRoof: true, damage: b.damage, sign: b.name || null, balcony: !!b.balcony,
    });
  }
  L.fire(-234, height(-234, -40) + 8, -40, 1.8);
  L.smokeColumn(-234, height(-234, -40) + 10, -40, 2.0);
  L.smokeColumn(-262, height(-262, 80) + 14, 80, 2.4);

  // Downtown skyline into the haze.
  const towers = [
    { x: -292, z: -120, w: 24, h: 42, d: 22, mat: 'stuccoWhite' },
    { x: -308, z: -70, w: 20, h: 34, d: 20, mat: 'stuccoCream' },
    { x: -286, z: -20, w: 18, h: 28, d: 18, mat: 'stuccoGrey' },
    { x: -314, z: 18, w: 26, h: 46, d: 24, mat: 'stuccoWhite' },
    { x: -290, z: 64, w: 20, h: 32, d: 20, mat: 'stuccoPink' },
    { x: -320, z: 116, w: 22, h: 38, d: 22, mat: 'stuccoCream' },
    { x: -280, z: 150, w: 18, h: 26, d: 18, mat: 'stuccoMint' },
    { x: -306, z: -168, w: 20, h: 30, d: 20, mat: 'stuccoBlue' },
  ];
  for (const t of towers) {
    const gy = height(t.x, t.z);
    const mat = L.mats.get(t.mat);
    L.batch.box(t.w, t.h, t.d, t.x, gy + t.h / 2, t.z, mat, { uv: 0.16 });
    for (let f = 1; f * 3.8 < t.h - 4; f++) {
      L.batch.box(t.w + 0.12, 1.1, t.d + 0.12, t.x, gy + 3.2 + f * 3.8, t.z, M.glass, { uv: 0.6 });
    }
    L.batch.box(t.w * 0.62, 5, t.d * 0.62, t.x, gy + t.h + 2.5, t.z, mat);
    L.batch.box(t.w * 0.32, 4, t.d * 0.32, t.x, gy + t.h + 7, t.z, mat);
    L.batch.sphere(0.24, t.x, gy + t.h + 9.4, t.z, neonAqua);
  }

  // Port cranes on the bay.
  for (const z of [166, 190]) {
    for (const dz of [-3.2, 3.2]) L.batch.box(1.0, 24, 1.0, -216, 14.2, z + dz, M.metal);
    L.batch.box(1.2, 1.2, 11, -216, 26.2, z, M.metal);
    L.batch.box(1.0, 1.0, 15, -224, 26.6, z, M.metal);
    L.batch.box(0.18, 8.6, 0.18, -230.5, 22, z, M.metal, { rotZ: 0.5 });
  }

  /* ---------------------------------------------------------- distant fleet */
  L.warship(760, -160, 0.12, 0.8);
  L.warship(820, 120, -0.08, 0.7);
  L.warship(700, 250, 0.3, 0.5);

  /* ------------------------------------------------------------------ combat */
  const cpA = L.addCapturePoint({ id: 'A', name: '血色沙滩', x: 50, z: 0, radius: 18, owner: -1 });
  const cpB = L.addCapturePoint({ id: 'B', name: '装饰艺术街区', x: 8, z: 0, radius: 16, owner: -1 });
  const cpC = L.addCapturePoint({ id: 'C', name: '麦克阿瑟堤道', x: -140, z: 0, radius: 15, owner: 1, base: deckY, height: 7 });
  // Face the flags across the American advance (east → west) so they read from the beach.
  for (const cp of [cpA, cpB, cpC]) cp.marker.rotation.y = Math.PI / 2;

  L.setPlayerSpawn(58, 10, Math.PI / 2);
  L.addSpawn(0, 56, -12, Math.PI / 2);
  L.addSpawn(0, 62, 30, Math.PI / 2);
  L.addSpawn(0, 54, 58, Math.PI / 2);
  L.addSpawn(0, 46, -54, Math.PI / 2);
  L.addSpawn(1, 8, -120, -Math.PI / 2);
  L.addSpawn(1, 8, 120, -Math.PI / 2);
  L.addSpawn(1, -214, 6, -Math.PI / 2);
  L.addSpawn(1, -216, -10, -Math.PI / 2);

  // Miami palms, ported from ocean-drive: coconut, royal and sabal palms.
  const palms = planMiamiPalms(height);
  const palmSystem = buildPalms(L.scene, palms);
  L.animated.push({ type: 'fn', update: (t) => palmSystem.update(t) });

  L.addRoute([
    new THREE.Vector3(50, 1, 0),
    new THREE.Vector3(8, 2, 0),
    new THREE.Vector3(-30, 2, 0),
    new THREE.Vector3(-70, 4.5, 0),
    new THREE.Vector3(-140, deckY, 0),
    new THREE.Vector3(-204, 3, 0),
    new THREE.Vector3(-226, 2.3, 0),
  ]);
  L.addRoute([
    new THREE.Vector3(56, 1, 60),
    new THREE.Vector3(8, 2, 60),
    new THREE.Vector3(-30, 2, 20),
    new THREE.Vector3(-70, 4.5, 0),
    new THREE.Vector3(-140, deckY, 0),
  ]);
  L.addRoute([
    new THREE.Vector3(56, 1, -70),
    new THREE.Vector3(8, 2, -70),
    new THREE.Vector3(-30, 2, -20),
    new THREE.Vector3(-70, 4.5, 0),
    new THREE.Vector3(-140, deckY, 0),
  ]);
}
