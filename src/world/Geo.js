import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Box geometry with world-scaled UVs so tiled textures keep a constant texel density
 * regardless of building size. Critical for the "one material, many boxes" batching.
 */
export function uvBox(w, h, d, scale = 0.28) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each).
  const dims = [
    [d, h], [d, h],
    [w, d], [w, d],
    [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = dims[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * fw * scale, uv.getY(k) * fh * scale);
    }
  }
  return g;
}

export function uvPlane(w, h, scale = 0.3) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * scale, uv.getY(i) * h * scale);
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/**
 * Collects static geometry per material and merges it into a handful of draw calls.
 */
export class Batcher {
  constructor() {
    this.groups = new Map();
    this.count = 0;
  }

  add(geo, material, matrix = null) {
    if (matrix) geo.applyMatrix4(matrix);
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(geo);
    this.count++;
    return geo;
  }

  /** Adds an axis-aligned (or Y-rotated) box. */
  box(w, h, d, x, y, z, material, { rotY = 0, uv = 0.28 } = {}) {
    const geo = uvBox(w, h, d, uv);
    _e.set(0, rotY, 0);
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1));
    return this.add(geo, material, _m.clone());
  }

  cylinder(rt, rb, h, seg, x, y, z, material, { rotY = 0, rotX = 0, rotZ = 0 } = {}) {
    const geo = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
    _e.set(rotX, rotY, rotZ);
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1));
    return this.add(geo, material, _m.clone());
  }

  plane(w, h, x, y, z, material, { rotY = 0, rotX = 0, uv = 0.28 } = {}) {
    const geo = uvPlane(w, h, uv);
    _e.set(rotX, rotY, 0);
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1));
    return this.add(geo, material, _m.clone());
  }

  sphere(r, x, y, z, material, seg = 10) {
    const geo = new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1));
    geo.translate(x, y, z);
    return this.add(geo, material);
  }

  flush(scene) {
    const meshes = [];
    for (const [material, geos] of this.groups) {
      if (!geos.length) continue;
      // Keep attributes consistent; BoxGeometry/PlaneGeometry/Cylinder all have uv+normal.
      const merged = mergeGeometries(geos, false);
      if (!merged) { console.warn('merge failed for material', material.name); continue; }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
      meshes.push(mesh);
      for (const g of geos) g.dispose();
    }
    this.groups.clear();
    return meshes;
  }
}

/* --------------------------------------------------------------- textures */

const signCache = new Map();

export function signTexture(text, { bg = '#1a1a16', fg = '#d8cba8', border = '#8a7a54', w = 512, h = 160, font = 700 } = {}) {
  const key = `${text}|${bg}|${fg}|${w}x${h}`;
  if (signCache.has(key)) return signCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = fg;
  ctx.font = `${font} ${Math.min(h * 0.5, w * 0.16)}px "Songti SC", "Noto Serif SC", serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  signCache.set(key, tex);
  return tex;
}

export function flagTexture(team) {
  const key = `flag${team}`;
  if (signCache.has(key)) return signCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const ctx = c.getContext('2d');
  if (team === 0) {
    ctx.fillStyle = '#b3271d'; ctx.fillRect(0, 0, 256, 160);
    // Five-pointed star (八路军臂章风格简化旗).
    ctx.fillStyle = '#e8c44a';
    const cx = 70, cy = 78, R = 40;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? R : R * 0.42;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    // Victory streak.
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, 110, 256, 12);
  } else {
    for (let i = 0; i < 13; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#a8342c' : '#e7e2d4';
      ctx.fillRect(0, (i * 160) / 13, 256, 160 / 13);
    }
    ctx.fillStyle = '#22325c'; ctx.fillRect(0, 0, 110, 86);
    ctx.fillStyle = '#e7e2d4';
    for (let r = 0; r < 4; r++) for (let cc = 0; cc < 5; cc++) {
      ctx.beginPath(); ctx.arc(14 + cc * 20, 14 + r * 20, 3, 0, 7); ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  signCache.set(key, tex);
  return tex;
}
