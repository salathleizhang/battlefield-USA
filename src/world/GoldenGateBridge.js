import * as THREE from 'three';
import { uvBox } from './Geo.js';
import { clamp, lerp } from '../core/MathUtil.js';

/**
 * Golden Gate Bridge — structural replica at half the real dimensions.
 *
 * The real span is 1280 m between towers, 67 m of clearance under the deck and
 * 227 m from the water to the tower tops. Everything here is that geometry at
 * 0.5x (640 / 33.5 / 113.5), so the silhouette, the cable sag and the deck
 * proportions match photographs instead of being eyeballed. On top of the
 * dimensions the model carries the details that actually read at play
 * distance: stepped Art Deco tower portals with fluted legs, a 3.8 m deep
 * stiffening truss, paired suspender ropes with cable bands, the picket
 * railing, lane paint, expansion joints and the 1937 lamp standards.
 */

export const GG_DEFAULTS = {
  deckY: 33.5,          // roadway elevation (real 67 m)
  deckWidth: 13.8,
  roadWidth: 10,
  walkWidth: 1.9,
  length: 1080,         // deck end to end, including the approaches
  towerZ: 320,          // main span 640 m (real 1280 m)
  anchorZ: 486,
  towerTop: 113.5,      // real 227 m
  pierTop: 9,
  legX: 7.45,
  legBaseW: 4.6,
  legTopW: 3.2,
  legBaseD: 8.0,
  legTopD: 5.2,
  cableX: 7.45,
  cableMidY: 35.9,
  cableTopY: 114.7,
  anchorY: 38.5,
  panel: 4.0,
  trussX: 6.6,
  trussTop: -1.0,       // offsets from deckY
  trussBottom: -4.6,
  railX: 6.65,
  lampX: 6.15,
};

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

/* --------------------------------------------------------------- helpers */

/** A box between two points, used for truss diagonals. */
function strut(L, ax, ay, az, bx, by, bz, w, mat, uv = 0.3) {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.05) return;
  const geo = uvBox(w, len, w, uv);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const m = new THREE.Matrix4().compose(
    a.add(b).multiplyScalar(0.5), q, ONE,
  );
  L.batch.add(geo, mat, m);
}

/** Catenary height of the main cable at a given station. */
export function cableY(P, z) {
  const a = Math.abs(z);
  if (a <= P.towerZ) {
    const t = a / P.towerZ;
    return P.cableMidY + (P.cableTopY - P.cableMidY) * t * t;
  }
  if (a >= P.anchorZ) return P.anchorY;
  const t = (a - P.towerZ) / (P.anchorZ - P.towerZ);
  // Side spans are a shallow sagging curve, not a straight line.
  return lerp(P.cableTopY, P.anchorY, t) + Math.sin(Math.PI * t) * 3.4;
}

/* ------------------------------------------------------------------ deck */

function buildDeck(L, P, M) {
  const { length, deckY, deckWidth, roadWidth, walkWidth } = P;
  const half = length / 2;
  const top = deckY + 0.06;

  // Deck slab: steel box girder deck, 0.8 m thick, carrying the roadway.
  L.batch.box(deckWidth, 0.8, length, 0, deckY - 0.4, 0, M.steel, { uv: 0.16 });
  L.solidBox(0, deckY - 0.37, 0, deckWidth, 0.86, length, 0, { surface: 'metal' });

  // Asphalt roadway (six lanes) and the raised concrete sidewalks.
  L.batch.box(roadWidth, 0.06, length, 0, deckY + 0.03, 0, M.deck, { uv: 0.15 });
  for (const s of [-1, 1]) {
    const wx = s * (roadWidth / 2 + walkWidth / 2);
    L.batch.box(walkWidth, 0.24, length, wx, deckY + 0.12, 0, M.walk, { uv: 0.22 });
    L.solidBox(wx, deckY + 0.12, 0, walkWidth, 0.24, length, 0, { surface: 'concrete' });
    // Curb face.
    L.batch.box(0.22, 0.26, length, s * (roadWidth / 2 + 0.01), deckY + 0.13, 0, M.walk, { uv: 0.5 });
  }

  // Lane paint: six 3 m lanes, dashed separators, double yellow centre.
  const dash = (x, mat, len = 3, gap = 6) => {
    for (let z = -half + 6; z < half - 6; z += len + gap) {
      L.batch.box(0.14, 0.02, len, x, top + 0.006, z, mat, { uv: 1.2 });
    }
  };
  for (const x of [-P.roadWidth / 4, P.roadWidth / 4]) dash(x, M.white);
  // Solid edge lines and centre pair.
  for (const x of [-P.roadWidth / 2 + 0.22, P.roadWidth / 2 - 0.22]) {
    L.batch.box(0.14, 0.02, length - 4, x, top + 0.006, 0, M.white, { uv: 1.2 });
  }
  for (const x of [-0.15, 0.15]) {
    L.batch.box(0.12, 0.02, length - 4, x, top + 0.006, 0, M.yellow, { uv: 1.2 });
  }

  // Expansion joints, every 64 m: a dark steel finger joint across the deck.
  for (let z = -half + 64; z < half; z += 64) {
    L.batch.box(roadWidth, 0.03, 0.55, 0, top + 0.004, z, M.dark, { uv: 0.8 });
    L.batch.box(roadWidth, 0.05, 0.12, 0, top + 0.01, z + 0.4, M.steel, { uv: 0.8 });
  }

  // Finger joints / drain scuppers along the curb line.
  for (let z = -half + 12; z < half; z += 24) {
    for (const s of [-1, 1]) {
      L.batch.box(0.3, 0.1, 0.5, s * (P.roadWidth / 2 + 0.03), deckY + 0.1, z, M.dark, { uv: 1 });
    }
  }
}

/* ----------------------------------------------------------------- truss */

function buildTruss(L, P, M) {
  const { length, deckY, panel, trussX } = P;
  const half = length / 2;
  const top = deckY + P.trussTop;
  const bot = deckY + P.trussBottom;
  const panels = Math.round(length / panel);

  for (const s of [-1, 1]) {
    const x = s * trussX;
    // Top and bottom chords.
    L.batch.box(0.55, 0.6, length, x, top, 0, M.orange, { uv: 0.25 });
    L.batch.box(0.55, 0.6, length, x, bot, 0, M.orange, { uv: 0.25 });

    for (let i = 0; i <= panels; i++) {
      const z = -half + i * panel;
      L.batch.box(0.3, top - bot, 0.3, x, (top + bot) / 2, z, M.orange, { uv: 0.45 });
    }
    for (let i = 0; i < panels; i++) {
      const z0 = -half + i * panel;
      const z1 = z0 + panel;
      // Warren truss: alternating diagonals.
      if (i % 2 === 0) strut(L, x, top - 0.3, z0, x, bot + 0.3, z1, 0.24, M.orange, 0.45);
      else strut(L, x, bot + 0.3, z0, x, top - 0.3, z1, 0.24, M.orange, 0.45);
    }

    // Portal bracing between the trusses, above the deck edge.
    for (let i = 0; i <= panels; i += 2) {
      const z = -half + i * panel;
      strut(L, -trussX, top - 0.4, z, trussX, top - 0.4, z, 0.22, M.orange, 0.4);
    }
  }

  // Floor beams and bottom lateral bracing under the roadway.
  for (let i = 0; i <= panels; i++) {
    const z = -half + i * panel;
    L.batch.box(trussX * 2, 0.42, 0.42, 0, bot + 0.3, z, M.orange, { uv: 0.3 });
    if (i < panels && i % 2 === 0) {
      const z1 = z + panel;
      strut(L, -trussX, bot + 0.1, z, trussX, bot + 0.1, z1, 0.18, M.orange, 0.4);
      strut(L, trussX, bot + 0.1, z, -trussX, bot + 0.1, z1, 0.18, M.orange, 0.4);
    }
  }
}

/* -------------------------------------------------------------- railings */

function railingMaterial() {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 48, 128);
  const paint = '#b8432f';
  ctx.fillStyle = paint;
  // Top rail, mid rail, bottom rail.
  ctx.fillRect(0, 2, 48, 9);
  ctx.fillRect(0, 54, 48, 6);
  ctx.fillRect(0, 116, 48, 10);
  // Closely spaced pickets, the signature of the 1937 railing.
  for (let x = 2; x < 48; x += 8) ctx.fillRect(x, 0, 3, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.45, side: THREE.DoubleSide,
    roughness: 0.62, metalness: 0.32, color: 0xffffff,
  });
}

function buildRailings(L, P, M) {
  const { length, deckY, railX } = P;
  const half = length / 2;
  const mat = railingMaterial();
  mat.map.repeat.set(length / 2.4, 1);

  for (const s of [-1, 1]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(length, 1.3), mat);
    plane.rotation.y = Math.PI / 2;
    plane.position.set(s * railX, deckY + 0.95, 0);
    plane.castShadow = false;
    plane.receiveShadow = false;
    L.scene.add(plane);

    // Panel posts every 12 m give the railing real depth up close.
    for (let z = -half; z <= half; z += 12) {
      L.batch.box(0.16, 1.42, 0.16, s * railX, deckY + 0.97, z, M.orange, { uv: 0.8 });
      L.batch.box(0.1, 0.1, 0.55, s * railX, deckY + 1.66, z, M.orange, { uv: 0.8 });
    }
    // Hidden collider so nobody walks off the bridge by accident.
    L.solidBox(s * railX, deckY + 1.05, 0, 0.3, 2.0, length, 0, { surface: 'metal' });
  }

  // 1937 lamp standards, every 36 m on both sidewalks.
  for (const s of [-1, 1]) {
    for (let z = -half + 18; z < half; z += 36) {
      const x = s * P.lampX;
      L.batch.cylinder(0.3, 0.36, 0.55, 10, x, deckY + 0.52, z, M.dark);
      L.batch.cylinder(0.1, 0.22, 6.4, 10, x, deckY + 4.0, z, M.orange);
      L.batch.cylinder(0.16, 0.12, 0.5, 10, x, deckY + 7.2, z, M.orange);
      // Curved arm reaching over the roadway.
      L.batch.cylinder(0.09, 0.09, 1.15, 8, x - s * 0.5, deckY + 7.45, z, M.orange, {
        rotZ: s * Math.PI / 2.4,
      });
      L.batch.cylinder(0.26, 0.3, 0.32, 10, x - s * 1.05, deckY + 7.35, z, M.orange);
      L.batch.sphere(0.22, x - s * 1.05, deckY + 7.1, z, M.lamp, 10);
    }
  }
}

/* ----------------------------------------------------------------- tower */

function buildTower(L, P, M, z) {
  const y0 = P.pierTop;
  const y1 = P.towerTop;
  const segs = 9;
  const segH = (y1 - y0) / segs;
  const frac = (y) => clamp((y - y0) / (y1 - y0), 0, 1);
  const legW = (y) => lerp(P.legBaseW, P.legTopW, frac(y));
  const legD = (y) => lerp(P.legBaseD, P.legTopD, frac(y));

  /* Concrete pier and its stepped cap. */
  L.batch.box(24, y0, 12, 0, y0 / 2, z, M.concrete, { uv: 0.12 });
  L.batch.box(26, 1.1, 14, 0, y0 - 0.4, z, M.concrete, { uv: 0.25 });
  L.solidBox(0, y0 / 2, z, 24, y0, 12, 0, { surface: 'concrete' });

  /* X-bracing between the legs below the roadway (visible from the water). */
  const bx = P.legX - 0.55;
  strut(L, -bx, y0 + 0.6, z, bx, P.deckY - 2.6, z, 0.75, M.orange, 0.3);
  strut(L, bx, y0 + 0.6, z, -bx, P.deckY - 2.6, z, 0.75, M.orange, 0.3);

  /* Two cellular legs: stepped, and covered in closely spaced vertical
   * fluting — the detail that actually makes a Golden Gate tower read as
   * itself rather than as a generic suspension bridge. */
  for (const s of [-1, 1]) {
    const lx = s * P.legX;
    for (let i = 0; i < segs; i++) {
      const ya = y0 + i * segH;
      const yb = ya + segH;
      const cy = (ya + yb) / 2;
      const w = legW(cy);
      const d = legD(cy);

      L.batch.box(w, segH, d, lx, cy, z, M.orange, { uv: 0.12 });

      // Front and back faces: six flutes each.
      for (let k = 0; k < 6; k++) {
        const fx = ((k + 0.5) / 6 - 0.5) * (w - 0.5);
        L.batch.box(0.2, segH, 0.2, lx + fx, cy, z + d / 2 + 0.05, M.orange, { uv: 0.7 });
        L.batch.box(0.2, segH, 0.2, lx + fx, cy, z - d / 2 - 0.05, M.orange, { uv: 0.7 });
      }
      // Inner and outer faces: eight flutes each.
      for (let k = 0; k < 8; k++) {
        const fz = ((k + 0.5) / 8 - 0.5) * (d - 0.5);
        L.batch.box(0.2, segH, 0.2, lx + w / 2 + 0.05, cy, z + fz, M.orange, { uv: 0.7 });
        L.batch.box(0.2, segH, 0.2, lx - w / 2 - 0.05, cy, z + fz, M.orange, { uv: 0.7 });
      }
      // Corner pilasters.
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          L.batch.box(0.52, segH, 0.52, lx + sx * (w / 2 - 0.2), cy, z + sz * (d / 2 - 0.2),
            M.orange, { uv: 0.7 });
        }
      }
      // Belt course at every setback.
      L.batch.box(w + 0.45, 0.44, d + 0.45, lx, yb - 0.22, z, M.orange, { uv: 0.2 });
    }

    L.solidBox(lx, (y0 + y1) / 2, z, P.legBaseW, y1 - y0, P.legBaseD, 0, { surface: 'metal' });
  }

  /* Four portal struts above the roadway. Each is a frame around a recessed,
   * ribbed panel with stepped haunches dropping into the legs. */
  for (const y of [52, 70, 88, 104]) {
    const w = legW(y);
    const span = 2 * P.legX - w + 1.0;
    const bh = 3.2;
    const bd = 4.4;

    L.batch.box(span, 0.75, bd, 0, y + bh / 2 - 0.375, z, M.orange, { uv: 0.14 });
    L.batch.box(span, 0.75, bd, 0, y - bh / 2 + 0.375, z, M.orange, { uv: 0.14 });
    for (const sx of [-1, 1]) {
      L.batch.box(0.95, bh, bd, sx * (span / 2 - 0.475), y, z, M.orange, { uv: 0.25 });
    }
    for (const sz of [-1, 1]) {
      const zf = z + sz * (bd / 2 - 0.5);
      L.batch.box(span - 1.9, bh - 1.5, 0.34, 0, y, zf, M.orange, { uv: 0.4 });
      for (let k = 0; k < 7; k++) {
        const rx = ((k + 0.5) / 7 - 0.5) * (span - 2.6);
        L.batch.box(0.24, bh - 1.5, 0.22, rx, y, zf + sz * 0.22, M.orange, { uv: 0.8 });
      }
    }
    // Stepped haunches under each end.
    for (const s of [-1, 1]) {
      L.batch.box(2.6, 1.7, bd + 0.4, s * (P.legX - w * 0.32), y - 2.35, z, M.orange, { uv: 0.3 });
      L.batch.box(1.3, 1.7, bd + 0.4, s * (P.legX - w * 0.5 + 0.35), y - 3.55, z, M.orange, { uv: 0.3 });
    }
  }
  L.solidBox(0, 52, z, 2 * P.legX, 3.2, 4.4, 0, { surface: 'metal' });

  /* Tower top: saddle housings, walkway and beacon. */
  for (const s of [-1, 1]) {
    const lx = s * P.legX;
    const w = legW(y1);
    const d = legD(y1);
    L.batch.box(w + 0.5, 1.5, d + 0.5, lx, y1 - 0.75, z, M.orange, { uv: 0.2 });
    L.batch.box(4.2, 4.6, 5.2, lx, y1 + 0.9, z, M.orange, { uv: 0.18 });
    L.batch.box(4.7, 0.5, 5.7, lx, y1 + 3.2, z, M.orange, { uv: 0.3 });
    const saddle = new THREE.CylinderGeometry(1.05, 1.05, 1.9, 16);
    saddle.rotateZ(Math.PI / 2);
    saddle.translate(lx, P.cableTopY, z);
    L.batch.add(saddle, M.cable);
  }
  // Thin maintenance walkway linking the legs, with a railing.
  L.batch.box(2 * P.legX, 0.18, 2.6, 0, y1 + 1.4, z, M.orange, { uv: 0.5 });
  for (let k = -3; k <= 3; k++) {
    L.batch.box(0.1, 1.1, 0.1, k * 1.8, y1 + 2.0, z + 1.2, M.orange, { uv: 0.8 });
    L.batch.box(0.1, 1.1, 0.1, k * 1.8, y1 + 2.0, z - 1.2, M.orange, { uv: 0.8 });
  }
  L.batch.box(2 * P.legX, 0.09, 0.09, 0, y1 + 2.5, z + 1.2, M.orange, { uv: 0.8 });
  L.batch.box(2 * P.legX, 0.09, 0.09, 0, y1 + 2.5, z - 1.2, M.orange, { uv: 0.8 });

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M.beacon);
  beacon.position.set(0, y1 + 3.4, z);
  L.scene.add(beacon);

  /* South tower fender. */
  if (z > 0) {
    const fender = new THREE.Mesh(
      new THREE.CylinderGeometry(20, 20, 5.5, 48, 1, true),
      M.concrete,
    );
    fender.scale.z = 1.55;
    fender.position.set(0, 1.6, z);
    fender.receiveShadow = true;
    L.scene.add(fender);
  }
}

/* ---------------------------------------------------------------- cables */

function buildCables(L, P, M) {
  const cableMat = M.cable;
  const ropeMat = M.cable;

  for (const s of [-1, 1]) {
    const x = s * P.cableX;
    const pts = [];
    for (let z = -P.anchorZ; z <= P.anchorZ; z += 8) {
      pts.push(new THREE.Vector3(x, cableY(P, z), z));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 320, 0.26, 8, false), cableMat,
    );
    tube.castShadow = true;
    tube.receiveShadow = true;
    L.scene.add(tube);

    // Suspenders in pairs every 7.6 m (the real 50 ft spacing), with a cable
    // band clamping each pair.
    for (let z = -470; z <= 470; z += 7.6) {
      const y = cableY(P, z);
      const h = y - (P.deckY + 0.25);
      if (h < 0.8) continue;

      const dy = cableY(P, z + 0.6) - cableY(P, z - 0.6);
      const tangent = new THREE.Vector3(0, dy, 1.2).normalize();
      const band = new THREE.CylinderGeometry(0.36, 0.36, 0.85, 10);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, tangent);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, ONE);
      L.batch.add(band, cableMat, m);

      for (const dz of [-0.26, 0.26]) {
        const rope = new THREE.CylinderGeometry(0.05, 0.05, h, 5);
        rope.translate(x, P.deckY + 0.25 + h / 2, z + dz);
        L.batch.add(rope, ropeMat);
      }
      // Bracket from the deck edge out to the cable plane.
      L.batch.box(P.cableX - P.trussX + 0.5, 0.16, 0.2, s * (P.trussX + P.cableX) / 2,
        P.deckY - 0.35, z, M.orange, { uv: 0.6 });
    }
  }

  /* Anchorages: two concrete blocks flanking the roadway at each end. Kept
   * fully outboard of the deck (deck edge x = 11) so they never become an
   * invisible wall on the walkway. */
  const anchorX = P.deckWidth / 2 + 7;
  for (const zs of [-1, 1]) {
    for (const s of [-1, 1]) {
      const x = s * anchorX;
      const zz = zs * P.anchorZ;
      L.batch.box(14, 30, 24, x, 25, zz, M.concrete, { uv: 0.1 });
      L.batch.box(15, 2.2, 25, x, 41, zz, M.concrete, { uv: 0.2 });
      L.solidBox(x, 25, zz, 14, 30, 24, 0, { surface: 'concrete' });
    }
  }
}

/* -------------------------------------------------------------- assembly */

export function buildGoldenGateBridge(L, options = {}) {
  const P = { ...GG_DEFAULTS, ...options };
  const M = {
    orange: L.mats.get('bridgeOrange'),
    cable: L.mats.get('bridgeCable'),
    steel: L.mats.get('bridgeSteel'),
    concrete: L.mats.get('concrete'),
    walk: L.mats.get('bridgeWalk'),
    deck: L.mats.get('bridgeDeck'),
    white: L.mats.get('roadWhite'),
    yellow: L.mats.get('roadYellow'),
    dark: L.mats.get('bridgeDark'),
    lamp: L.mats.get('lampWarm'),
    beacon: L.mats.get('beacon'),
    brick: L.mats.get('brick'),
  };

  buildDeck(L, P, M);
  buildTruss(L, P, M);
  buildRailings(L, P, M);
  for (const z of [-P.towerZ, P.towerZ]) buildTower(L, P, M, z);
  buildCables(L, P, M);

  return P;
}
