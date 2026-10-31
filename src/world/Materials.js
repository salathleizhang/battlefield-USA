import * as THREE from 'three';
import { PBR } from './PBR.js';

const BASE = '/assets/textures/';

function canvasTex(w, h, draw, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.setScalar(repeat);
  t.anisotropy = 8;
  return t;
}

function noiseFill(ctx, w, h, base, amount, tint = [0, 0, 0]) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n + tint[0]));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n + tint[1]));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n + tint[2]));
  }
  ctx.putImageData(img, 0, 0);
}

function brickTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#8e4a37', 26);
    const bw = 128, bh = 42;
    for (let y = 0; y < h; y += bh) {
      const off = (Math.floor(y / bh) % 2) * (bw / 2);
      for (let x = -bw; x < w; x += bw) {
        const shade = 0.82 + Math.random() * 0.38;
        ctx.fillStyle = `rgba(${Math.floor(126 * shade)},${Math.floor(62 * shade)},${Math.floor(45 * shade)},1)`;
        ctx.fillRect(x + off + 3, y + 3, bw - 6, bh - 6);
        ctx.strokeStyle = 'rgba(55,42,36,0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + off + 3, y + 3, bw - 6, bh - 6);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x + off + 5, y + 5, bw - 10, 3);
      }
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(30,25,20,${Math.random() * 0.15})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 14, 0, 7);
      ctx.fill();
    }
  }, { repeat: 1 });
}

function woodTexture(dark = false) {
  return canvasTex(512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, dark ? '#4a3826' : '#7d6444', 22);
    const planks = 6;
    const pw = w / planks;
    for (let i = 0; i < planks; i++) {
      const x = i * pw;
      ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
      ctx.fillRect(x, 0, pw, h);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, 0, 3, h);
      for (let j = 0; j < 22; j++) {
        ctx.strokeStyle = `rgba(${dark ? '20,12,8' : '40,26,14'},${0.06 + Math.random() * 0.15})`;
        ctx.lineWidth = 0.6 + Math.random();
        ctx.beginPath();
        let yy = Math.random() * h;
        ctx.moveTo(x + 4, yy);
        for (let k = 0; k < 8; k++) {
          yy += (Math.random() - 0.5) * 16;
          ctx.lineTo(x + 4 + (k / 8) * (pw - 8), yy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(230,220,190,0.16)';
      for (let n = 0; n < 2; n++) {
        const nx = x + 10 + Math.random() * (pw - 24);
        const ny = Math.random() * h;
        ctx.beginPath(); ctx.ellipse(nx, ny, 2.4, 1.4, 0, 0, 7); ctx.fill();
      }
    }
  });
}

function metalTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#5c6063', 18);
    for (let i = 0; i < 400; i++) {
      ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? '200,200,200' : '40,40,40'},${Math.random() * 0.08})`;
      ctx.beginPath();
      const x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y); ctx.lineTo(x + Math.random() * 40 - 20, y + Math.random() * 4 - 2);
      ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(120,58,24,${Math.random() * 0.28})`;
      ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 26, 0, 7); ctx.fill();
    }
  });
}

function roofTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#7c3c2a', 20);
    const tw = 42, th = 26;
    for (let y = 0; y < h; y += th) {
      for (let x = -tw; x < w; x += tw) {
        const off = (Math.floor(y / th) % 2) * (tw / 2);
        const s = 0.8 + Math.random() * 0.4;
        ctx.fillStyle = `rgb(${Math.floor(132 * s)},${Math.floor(62 * s)},${Math.floor(44 * s)})`;
        ctx.beginPath();
        ctx.moveTo(x + off, y);
        ctx.lineTo(x + off + tw, y);
        ctx.lineTo(x + off + tw, y + th - 4);
        ctx.quadraticCurveTo(x + off + tw / 2, y + th + 5, x + off, y + th - 4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(40,20,14,0.35)'; ctx.stroke();
      }
    }
  });
}

function sandTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#b9a077', 30);
    for (let i = 0; i < 2000; i++) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '90,74,50' : '230,214,180'},${Math.random() * 0.35})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = 'rgba(120,100,70,0.12)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      const y = Math.random() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + 20, w * 0.6, y - 20, w, y + 10);
      ctx.stroke();
    }
  });
}

function asphaltTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#3b3b38', 22);
    for (let i = 0; i < 9000; i++) {
      const g = 40 + Math.random() * 55;
      ctx.fillStyle = `rgba(${g},${g},${g},${0.2 + Math.random() * 0.4})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = 'rgba(18,18,16,0.55)';
      ctx.lineWidth = 1 + Math.random() * 1.5;
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += Math.random() * 40 - 20; y += Math.random() * 40 - 20; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(20,22,20,${0.1 + Math.random() * 0.2})`;
      ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 8 + Math.random() * 20, Math.random() * 3, 0, 7); ctx.fill();
    }
  });
}

function concreteTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#8d8b82', 20);
    for (let i = 0; i < 5000; i++) {
      const g = 90 + Math.random() * 60;
      ctx.fillStyle = `rgba(${g},${g},${g},${0.2 + Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    }
    ctx.strokeStyle = 'rgba(60,58,52,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, (i * h) / 4); ctx.lineTo(w, (i * h) / 4); ctx.stroke();
    }
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = 'rgba(50,48,42,0.18)';
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += Math.random() * 30 - 15; y += Math.random() * 30 - 15; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
}

function waterNormalTexture(size = 768) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  // Seamless directional wave spectrum. Integer wave numbers keep the map
  // tileable; a 1/k amplitude falloff and many directions avoid the regular
  // "fish scale" interference a handful of equal sines produces.
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const waves = [];
  for (let i = 0; i < 14; i++) {
    const k = 1 + Math.floor(Math.pow(rnd(), 1.5) * 17);
    const a = rnd() * Math.PI * 2;
    waves.push({
      kx: Math.max(1, Math.round(Math.cos(a) * k)),
      ky: Math.round(Math.sin(a) * k),
      amp: 1 / Math.pow(k, 1.15),
      ph: rnd() * Math.PI * 2,
    });
  }

  const STRENGTH = 0.05;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let gx = 0;
      let gy = 0;
      for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        const arg = 2 * Math.PI * (w.kx * u + w.ky * v) + w.ph;
        const s = Math.cos(arg) * w.amp * 2 * Math.PI;
        gx += s * w.kx;
        gy += s * w.ky;
      }
      const nx = -gx * STRENGTH;
      const ny = -gy * STRENGTH;
      const len = Math.hypot(nx, ny, 1);
      const idx = (y * size + x) * 4;
      d[idx] = Math.round((nx / len * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function craterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
  g.addColorStop(0, 'rgba(28,22,15,0.85)');
  g.addColorStop(0.45, 'rgba(46,36,24,0.55)');
  g.addColorStop(0.72, 'rgba(120,100,72,0.28)');
  g.addColorStop(0.9, 'rgba(180,160,120,0.22)');
  g.addColorStop(1, 'rgba(180,160,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(128, 128, 126, 0, 7); ctx.fill();
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * 6.28, r = 15 + Math.random() * 100;
    ctx.fillStyle = `rgba(30,24,16,${Math.random() * 0.35})`;
    ctx.beginPath(); ctx.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 1 + Math.random() * 5, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function foamTexture() {
  return canvasTex(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const len = 6 + Math.random() * 60;
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.35})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + len * 0.3, y + (Math.random() * 6 - 3), x + len * 0.7, y + (Math.random() * 4 - 2), x + len, y + (Math.random() * 4 - 2));
      ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.12})`;
      ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 2 + Math.random() * 6, 0, 0, 7); ctx.fill();
    }
  });
}

function puddleMaskTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const blobs = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.28;
    blobs.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 0.16 + Math.random() * 0.2]);
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / (S - 1), v = y / (S - 1);
    let m = 0;
    for (const [bx, by, br] of blobs) {
      const d = Math.hypot(u - bx, v - by) / br;
      m = Math.max(m, 1 - d * d);
    }
    const edge = Math.min(1, Math.min(u, 1 - u) * 12) * Math.min(1, Math.min(v, 1 - v) * 12);
    const a = Math.max(0, Math.min(1, m * 1.5 * edge));
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function grassTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#6f7448', 34);
    for (let i = 0; i < 9000; i++) {
      const g = 70 + Math.random() * 70;
      ctx.strokeStyle = `rgba(${Math.floor(g * 0.8)},${Math.floor(g)},${Math.floor(g * 0.5)},${0.15 + Math.random() * 0.3})`;
      ctx.lineWidth = 1;
      const x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 3 - Math.random() * 5); ctx.stroke();
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(120,100,60,${Math.random() * 0.25})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

function plasterTexture(base = '#c8bda4') {
  return canvasTex(512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, base, 16);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(70,60,48,${Math.random() * 0.10})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 8, 0, 7);
      ctx.fill();
    }
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = 'rgba(55,48,40,0.14)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += Math.random() * 24 - 12; y += Math.random() * 24; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
}

/* ------------------------------------------------------------------------------------------------
 * The "unify" shader patch, ported from the reference project (Ironline).
 *
 * One block injected into every lit material gives the whole game a single material response:
 *   1. albedo luminance clamped into a PBR band and pulled toward the palette (no chalk / plastic);
 *   2. shared world-space weathering: macro grime, ground-contact dirt on walls and props;
 *   3. GLOBAL WETNESS: exposed up-facing surfaces darken and gloss, walls get rain streaks, and
 *      ground materials collect mirror puddles in low areas of a world-noise field. Puddles drop
 *      roughness to ~0.03 and flatten the normal to world-up, so they mirror the sky IBL and the
 *      fire/sun specular. `uRain` adds animated ripple rings.
 *
 * World-space, so it works across the batcher, instanced props and GLB models alike.
 * ---------------------------------------------------------------------------------------------- */

/** Tileable 4-channel noise (R macro fbm, G detail fbm, B low-frequency puddle field, A streak noise). */
function unifyNoiseTex(size = 512, seed = 7) {
  const rnd = (() => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const P = 256, lat = new Float32Array(P * P);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const fade = (t) => t * t * (3 - 2 * t);
  const vn = (x, y, fx, fy, off) => {
    const xi = Math.floor(x), yi = Math.floor(y), tx = fade(x - xi), ty = fade(y - yi);
    const L = (a, b) => lat[(((b % fy) + fy) % fy + off) % P * P + ((((a % fx) + fx) % fx) + off * 3) % P];
    const a = L(xi, yi), b = L(xi + 1, yi), c = L(xi, yi + 1), d = L(xi + 1, yi + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const fbm = (u, v, fx, fy, oct, off) => {
    let f = 0, amp = 0.5, n = 0;
    for (let o = 0; o < oct; o++) {
      const m = 1 << o;
      f += amp * vn(u * fx * m, v * fy * m, fx * m, fy * m, off + o * 17);
      n += amp; amp *= 0.5;
    }
    return f / n;
  };
  const data = new Uint8Array(size * size * 4);
  const st = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = (y * size + x) * 4;
      const r = fbm(u, v, 4, 4, 5, 1), g = fbm(u, v, 16, 16, 4, 40);
      const b = fbm(u, v, 2, 2, 5, 90), a = fbm(u, v, 48, 3, 3, 140);
      const k = (n, c) => 0.5 + (n - 0.5) * c;
      data[i] = st(k(r, 1.9)); data[i + 1] = st(k(g, 1.9));
      data[i + 2] = st(k(b, 2.1)); data[i + 3] = st(k(a, 2.2));
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const UNIFY_VERT_PARS = /* glsl */`
varying vec3 vUWP; varying vec3 vUWN;`;
const UNIFY_VERT = /* glsl */`
{
  vec4 uwp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    uwp = instanceMatrix * uwp;
  #endif
  #ifdef USE_BATCHING
    uwp = batchingMatrix * uwp;
  #endif
  vUWP = (modelMatrix * uwp).xyz;
  vec3 uwn = transformedNormal;
  #ifdef USE_INSTANCING
    uwn = mat3(instanceMatrix) * uwn;
  #endif
  #ifdef USE_BATCHING
    uwn = mat3(batchingMatrix) * uwn;
  #endif
  vUWN = normalize(mat3(modelMatrix) * uwn);
}`;
const UNIFY_FRAG_PARS = /* glsl */`
varying vec3 vUWP; varying vec3 vUWN;
uniform sampler2D uNoise; uniform float uWet; uniform float uRain; uniform float uTime; uniform vec3 uSkyReflect;
uniform float uUnifyMode; // 0 full, 1 lite, 2 off
uniform vec4 uUni; uniform vec4 uUni2;
float uHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Expanding rain-ripple rings (returns xz normal offset).
vec2 uRipple(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * (k == 0 ? 2.3 : 3.7) + float(k) * 7.31;
    vec2 c = floor(q); vec2 f = fract(q);
    float h = uHash(c);
    vec2 o = vec2(uHash(c + 3.1), uHash(c + 7.7)) * 0.6 + 0.2;
    float ph = fract(t * 1.1 + h);
    vec2 d = f - o; float r = length(d);
    float w = sin((r - ph * 0.45) * 55.0) * smoothstep(0.0, 0.08, ph * 0.45 - r + 0.08) * smoothstep(0.45, 0.0, r) * (1.0 - ph);
    acc += (r > 1e-4 ? d / r : vec2(0.0)) * w;
  }
  return acc;
}`;
const UNIFY_FRAG = /* glsl */`
if (uUnifyMode < 1.5) {
  vec3 P = vUWP; vec3 N = normalize(vUWN); vec3 aN = abs(N);
  vec2 tp = aN.y > 0.5 ? P.xz : (aN.x > aN.z ? P.zy : P.xy);
  vec4 n1 = texture2D(uNoise, tp * 0.021);
  vec4 n2 = texture2D(uNoise, tp * 0.083 + 0.37);
  float g = n1.r * 0.65 + n2.g * 0.35;
  float up = smoothstep(0.55, 0.92, N.y);
  // 1. albedo normalisation + palette pull
  float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = max(mix(vec3(lum), diffuseColor.rgb, uUni2.x), 0.0);
  float tl = clamp(lum, 0.022, 0.70);
  diffuseColor.rgb *= tl / max(lum, 1e-4);
  // 2. shared weathering: macro grime / tint variation
  float gk = uUni.x;
  diffuseColor.rgb *= mix(1.0 - gk * 0.55, 1.0 + gk * 0.18, smoothstep(0.2, 0.8, g));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 0.97, 0.86), n2.g * gk * 0.8);
  // ground-contact dirt band on non-horizontal faces (bottom ~0.9 m)
  float contact = (1.0 - smoothstep(0.0, 0.9 + n2.g * 0.4, P.y)) * (1.0 - up) * uUni2.y;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.56, 0.48), contact * 0.75);
  // roughness band remap
  roughnessFactor = mix(uUni.w, 1.0, roughnessFactor) * (0.93 + n2.g * 0.14);
  // 3. wetness
  float wetK = uWet * uUni.y;
  float sx = aN.x > aN.z ? P.z : P.x;
  float streak = uUnifyMode > 0.5 ? 0.0 : texture2D(uNoise, vec2(sx * 0.11, P.y * 0.035 + n1.r * 0.08)).a;
  streak = smoothstep(0.42, 0.78, streak) * (1.0 - up) * uUni2.z;
  float wet = wetK * clamp(up * 0.8 + streak * 0.75 + (1.0 - up) * (0.12 + 0.3 * smoothstep(0.6, 0.0, P.y)), 0.0, 1.0);
  wet *= mix(0.3, 1.0, smoothstep(0.3, 0.72, g));            // damp vs drying patches
  float pud = 0.0;
  if (uUni.z > 0.0 && up > 0.5 && uUnifyMode < 0.5) {
    float pf = texture2D(uNoise, P.xz * 0.1 + 0.13).b * 0.75 + n1.r * 0.25;
    float rim = smoothstep(0.55, 0.62, pf);
    pud = smoothstep(0.60, 0.622, pf) * smoothstep(0.62, 0.85, up) * uUni.z * uWet;
    wet = max(wet, rim * up * uUni.z * uWet);
  }
  float porous = 1.0 - metalnessFactor * 0.7;
  diffuseColor.rgb *= mix(1.0, 0.58, wet * porous);
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.38 + 0.06, wet);
  if (pud > 0.0) {
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.026, 0.03), pud * 0.9);
    roughnessFactor = mix(roughnessFactor, 0.018, pud);
    metalnessFactor = mix(metalnessFactor, 0.0, pud);
    vec3 nUp = vec3(0.0, 1.0, 0.0);
    if (uRain > 0.0) { vec2 rp = uRipple(P.xz, uTime) * uRain * 0.35; nUp = normalize(vec3(rp.x, 1.0, rp.y)); }
    vec3 vUp = normalize((viewMatrix * vec4(nUp, 0.0)).xyz);
    normal = normalize(mix(normal, vUp, pud * 0.97));
    // Cheat the sky's specular back into the puddle: at grazing angles a mirror puddle reads as bright
    // water even when the IBL is darker than the visible sky.
    vec3 Vw = normalize(cameraPosition - vUWP);
    float fres = pow(1.0 - clamp(dot(N, Vw), 0.0, 1.0), 4.0);
    totalEmissiveRadiance += uSkyReflect * pud * (0.14 + 0.6 * fres);
  }
  // 4. Ground detail, sampled in WORLD space so it cannot repeat with the map.
  //    The albedo map tiles every ~3 m; without something at other frequencies
  //    the sand reads as one photograph stretched over the beach. These three
  //    octaves sit at 23 m / 5.9 m / 0.6 m and are deliberately low-contrast.
  if (uUni2.w > 0.5) {
    float dune = texture2D(uNoise, P.xz * 0.043 + 0.31).r;
    float patchy = texture2D(uNoise, P.xz * 0.17 + 0.77).g;
    float grain = texture2D(uNoise, P.xz * 1.63).b;
    diffuseColor.rgb *= 1.0 + (dune - 0.5) * 0.20 + (patchy - 0.5) * 0.10;
    diffuseColor.rgb *= 0.95 + grain * 0.10;
    // Two-scale de-tiling: the map repeats every ~3 m, which at eye height reads
    // as one photograph stretched over the beach. Re-sampling it at a much larger
    // scale and blending the RATIO keeps the material's own tint while breaking
    // that period, so no second texture is needed.
    #ifdef USE_MAP
    if (vMapUv.x > -1.0) {
      vec3 m1 = texture2D(map, vMapUv).rgb;
      vec3 m2 = texture2D(map, vMapUv * 0.29 + vec2(0.37, 0.61)).rgb;
      vec3 ratio = clamp(m2 / max(m1, vec3(0.02)), vec3(0.55), vec3(1.8));
      diffuseColor.rgb *= mix(vec3(1.0), ratio, smoothstep(0.38, 0.72, dune) * 0.45);
    }
    #endif
    roughnessFactor *= (0.88 + patchy * 0.24) * (0.94 + grain * 0.12);
    // Relief from the same noise, faded out past ~24 m so it cannot shimmer.
    float nf = 1.0 - smoothstep(3.0, 38.0, length(cameraPosition - P));
    if (nf > 0.001) {
      vec2 duv = P.xz * 1.63;
      float h0 = texture2D(uNoise, duv).b;
      float hx = texture2D(uNoise, duv + vec2(0.0035, 0.0)).b;
      float hz = texture2D(uNoise, duv + vec2(0.0, 0.0035)).b;
      vec3 nW = normalize(vec3((h0 - hx) * 12.0, 1.0, (h0 - hz) * 12.0));
      normal = normalize(mix(normal, normalize((viewMatrix * vec4(nW, 0.0)).xyz), 0.60 * nf));
    }
  }
  roughnessFactor = clamp(roughnessFactor, 0.02, 1.0);
}`;

const UNIFY_SKIP = new Set([
  'water', 'glass', 'skin', 'brass', 'lampWarm', 'beacon', 'flagChina', 'flagUs',
  'fire', 'smoke', 'decalHole', 'roadWhite', 'roadYellow',
]);

export class Materials {
  /** Shared uniforms for the unify pass (other systems animate uWet / uRain / uTime). */
  static unify = {
    uNoise: { value: null },
    uUnifyMode: { value: 0 },
    uWet: { value: 0.85 },
    uRain: { value: 0 },
    uTime: { value: 0 },
    uSkyReflect: { value: new THREE.Color(0x9fb6c9) },
  };

  constructor(renderer) {
    this.renderer = renderer;
    this.loader = new THREE.TextureLoader();
    this.textures = {};
    this.mats = {};
    this.maxAniso = renderer.renderer.capabilities.getMaxAnisotropy();
    this.pbr = new PBR(renderer);
    this._unified = new WeakSet();
    this.vfx = {};
    if (!Materials.unify.uNoise.value) Materials.unify.uNoise.value = unifyNoiseTex(512, 7);
  }

  /** CC0 flipbooks (Unity Labs): wispy smoke, flames and explosions. */
  async _loadVfx(onProgress) {
    const files = {
      smoke: 'wispysmoke02_8x8.webp',
      flame: 'flame03_16x4.webp',
      explosion: 'explosion01_5x5.webp',
    };
    const entries = Object.entries(files);
    let done = 0;
    await Promise.all(entries.map(([key, file]) => new Promise((resolve) => {
      this.loader.load(
        `/assets/vfx/${file}`,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
          t.anisotropy = Math.min(4, this.maxAniso);
          this.vfx[key] = t;
          onProgress?.(++done / entries.length);
          resolve();
        },
        undefined,
        () => {
          console.warn('[vfx] missing flipbook', file);
          onProgress?.(++done / entries.length);
          resolve();
        },
      );
    })));
  }

  /* ------------------------------------------------------------------ unify */
  /**
   * Inject the shared cohesion/wetness pass. Idempotent per material object; clones (which drop
   * `onBeforeCompile`) are picked up again. `preset` is a key of PRESETS or an explicit object.
   */
  applyUnify(mat, preset = 'prop') {
    if (!mat || !(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) return;
    if (this._unified.has(mat) || mat.userData?.noUnify) return;
    if (mat.userData?.water) return;
    const p = typeof preset === 'string' ? Materials.PRESETS[preset] ?? Materials.PRESETS.prop : preset;
    if (mat.transparent && !p.alphaOK) return;
    this._unified.add(mat);
    mat.userData.unify = p;
    if (mat.normalMap && mat.normalScale) {
      const s = THREE.MathUtils.clamp(Math.abs(mat.normalScale.x), 0.6, 2.0);
      mat.normalScale.set(s * Math.sign(mat.normalScale.x || 1), s * Math.sign(mat.normalScale.y || 1));
    }
    const uUni = { value: new THREE.Vector4(p.grime ?? 0.3, p.wet ?? 0.7, p.puddle ?? 0, p.rmin ?? 0.38) };
    const uUni2 = { value: new THREE.Vector4(p.sat ?? 0.86, p.contact ?? 1, p.streaks ?? 0.5, p.detail ?? 0) };
    const prev = mat.onBeforeCompile;
    const prevKey = mat.customProgramCacheKey?.bind(mat);
    mat.onBeforeCompile = (sh, r) => {
      prev?.call(mat, sh, r);
      Object.assign(sh.uniforms, Materials.unify, { uUni, uUni2 });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>' + UNIFY_VERT_PARS)
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + UNIFY_VERT);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>' + UNIFY_FRAG_PARS)
        .replace('#include <emissivemap_fragment>', 'float uIndoorK = 0.0;\n' + UNIFY_FRAG + '\n#include <emissivemap_fragment>');
    };
    mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|unify' + (p.paint ? 'P' : '');
    mat.needsUpdate = true;
  }

  /** Preset table, mirroring the reference art pipeline. */
  static PRESETS = {
    level: { grime: 0.42, wet: 0.9, puddle: 0, rmin: 0.4, sat: 0.9, contact: 1, streaks: 1 },
    ground: { grime: 0.5, wet: 1, puddle: 1, rmin: 0.34, sat: 0.9, contact: 1, streaks: 0, detail: 1 },
    sand: { grime: 0.24, wet: 0.85, puddle: 0.04, rmin: 0.5, sat: 0.94, contact: 1, streaks: 0, detail: 1 },
    wall: { grime: 0.3, wet: 0.55, puddle: 0, rmin: 0.45, sat: 0.9, contact: 0.55, streaks: 0.8 },
    metal: { grime: 0.32, wet: 0.65, puddle: 0, rmin: 0.3, sat: 0.88, contact: 1, streaks: 0.4 },
    cloth: { grime: 0.26, wet: 0.55, puddle: 0, rmin: 0.55, sat: 0.85, contact: 1, streaks: 0 },
    wood: { grime: 0.38, wet: 0.85, puddle: 0, rmin: 0.5, sat: 0.88, contact: 1, streaks: 0.6 },
    prop: { grime: 0.3, wet: 0.7, puddle: 0, rmin: 0.38, sat: 0.85, contact: 1, streaks: 0.5 },
    character: { grime: 0.18, wet: 0.35, puddle: 0, rmin: 0.45, sat: 0.85, contact: 0.8, streaks: 0 },
    viewmodel: { grime: 0.08, wet: 0, puddle: 0, rmin: 0.3, sat: 0.9, contact: 0, streaks: 0 },
  };

  _presetFor(key) {
    if (UNIFY_SKIP.has(key)) return null;
    if (/^(stucco|plaster|brick|roof)/.test(key)) return 'wall';
    if (/^(grass|ground|terrain|rubble|sand|asphalt|concrete|bridgeDeck|bridgeWalk)/.test(key)) {
      return key === 'sand' ? 'sand' : 'ground';
    }
    if (/^(metal|rust|bridge|landingHull|helmet)/.test(key)) return 'metal';
    if (/^(wood|palmTrunk|gun)/.test(key)) return key.startsWith('gun') ? 'viewmodel' : 'wood';
    if (/^(sandbag|canvas|uniform|leather|foliage)/.test(key)) return 'cloth';
    if (/^road/.test(key)) return 'wall';
    return 'prop';
  }

  _unifyAll() {
    for (const [key, mat] of Object.entries(this.mats)) {
      const preset = this._presetFor(key);
      if (preset) this.applyUnify(mat, preset);
    }
  }

  setWetness(v) { Materials.unify.uWet.value = v; }
  setRain(v) { Materials.unify.uRain.value = v; }
  update(dt) { Materials.unify.uTime.value += dt; }

  async _loadTex(file, { srgb = true, mirror = false, repeat = 1 } = {}) {
    return new Promise((resolve) => {
      this.loader.load(BASE + file, (t) => {
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
        t.repeat.setScalar(repeat);
        t.anisotropy = Math.min(8, this.maxAniso);
        resolve(t);
      }, undefined, () => { console.warn('texture missing', file); resolve(null); });
    });
  }

  async load(onProgress) {
    // PBR sets first: they carry the look of every surface in the game.
    await this.pbr.load((p, label) => onProgress?.(p * 0.72, label));
    await this._loadVfx((p) => onProgress?.(0.72 + p * 0.04, '战场特效'));

    // Legacy hand-authored maps remain as a fallback when the PBR library is
    // unavailable, and for effects that have no PBR equivalent (crater, foam).
    const files = [
      ['wall_stucco', 'wall_stucco.jpg', { mirror: true }],
      ['rubble', 'ground_rubble.jpg', { mirror: true }],
      ['sandbag', 'sandbag.jpg', { mirror: true }],
      ['water', 'water.jpg', { mirror: true }],
    ];
    for (let i = 0; i < files.length; i++) {
      const [key, file, opt] = files[i];
      this.textures[key] = await this._loadTex(file, { ...opt, repeat: 1 });
      onProgress?.(0.72 + (0.18 * (i + 1)) / files.length, '战地纹理');
    }
    this.textures.brick = brickTexture();
    this.textures.wood = woodTexture(false);
    this.textures.woodDark = woodTexture(true);
    this.textures.metal = metalTexture();
    this.textures.roof = roofTexture();
    this.textures.sand = sandTexture();
    this.textures.plaster = plasterTexture();
    this.textures.plasterWhite = plasterTexture('#cfc8b8');
    this.textures.grass = grassTexture();
    this.textures.foam = foamTexture();
    this.textures.waterNormal = waterNormalTexture();
    this.textures.crater = craterTexture();
    this.textures.asphalt = asphaltTexture();
    this.textures.concrete = concreteTexture();
    onProgress?.(0.96, '材质');
    this._build();
    onProgress?.(1, '材质');
  }

  _std(map, { color = 0xffffff, roughness = 0.92, metalness = 0.0, repeat, bump = true, roughnessMap = null, normalScale = 1 } = {}) {
    if (map && repeat) {
      // Clone so different repeats don't fight.
      map = map.clone();
      map.needsUpdate = true;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeat[0], repeat[1]);
    }
    return new THREE.MeshStandardMaterial({
      map, color, roughness, metalness,
      bumpMap: bump && map ? map : null,
      bumpScale: bump ? 0.35 * normalScale : 0,
      roughnessMap,
    });
  }

  _build() {
    const t = this.textures;
    const m = this.mats;
    const pbr = (name, opts) => this.pbr.material(name, opts);

    /* Masonry: one plaster set, tinted per California palette. */
    m.stucco = pbr('plaster', { color: 0xf2ebdd }) || this._std(t.wall_stucco, { color: 0xffffff, roughness: 0.95 });
    m.stuccoWhite = pbr('plaster', { color: 0xe8e2d5 }) || this._std(t.wall_stucco, { color: 0xd8d2c4, roughness: 0.95 });
    m.stuccoCream = pbr('plaster', { color: 0xecd4a8 }) || this._std(t.wall_stucco, { color: 0xe6cfa2, roughness: 0.95 });
    m.stuccoOchre = pbr('plaster', { color: 0xd9b27f }) || this._std(t.wall_stucco, { color: 0xd8b07c, roughness: 0.95 });
    m.stuccoPink = pbr('plaster', { color: 0xddb4a1 }) || this._std(t.wall_stucco, { color: 0xd9b09a, roughness: 0.95 });
    m.stuccoGrey = pbr('plaster', { color: 0xb4b2a3 }) || this._std(t.wall_stucco, { color: 0xa8a696, roughness: 0.95 });
    // Miami Beach Art Deco pastels.
    m.stuccoMint = pbr('plaster', { color: 0xbfe0d2 }) || this._std(t.wall_stucco, { color: 0xb5d8c8, roughness: 0.93 });
    m.stuccoBlue = pbr('plaster', { color: 0xbfd8e6 }) || this._std(t.wall_stucco, { color: 0xb4ccdc, roughness: 0.93 });
    m.stuccoCoral = pbr('plaster', { color: 0xe8b6a6 }) || this._std(t.wall_stucco, { color: 0xe0ab99, roughness: 0.93 });
    m.stuccoLilac = pbr('plaster', { color: 0xd6c6e0 }) || this._std(t.wall_stucco, { color: 0xcbbad6, roughness: 0.93 });
    m.plaster = pbr('plaster', { color: 0xcec7b7 }) || this._std(t.plaster, { roughness: 0.95 });
    m.plasterWhite = pbr('plaster', { color: 0xefeae0 }) || this._std(t.plasterWhite, { roughness: 0.93 });
    m.brick = pbr('brick', { color: 0xffffff }) || this._std(t.brick, { roughness: 0.95 });
    m.roof = pbr('roof', { color: 0xffffff }) || this._std(t.roof, { roughness: 0.85 });

    /* Ground and structure. */
    m.grass = pbr('terrain', { color: 0x909b70, tile: 4 }) || this._std(t.grass, { roughness: 0.98, bump: false, repeat: [8, 8] });
    m.sand = pbr('sand', { color: 0xffffff }) || this._std(t.sand, { roughness: 0.98, repeat: [6, 6], bump: false });
    m.ground = pbr('rubble', { color: 0xffffff }) || this._std(t.rubble, { roughness: 0.97, repeat: [1, 1] });
    m.asphalt = pbr('asphalt', { color: 0xffffff }) || this._std(t.asphalt, { roughness: 0.94, repeat: [4, 4] });
    m.concrete = pbr('concrete', { color: 0xffffff }) || this._std(t.concrete, { roughness: 0.92 });

    m.wood = pbr('wood', { color: 0xb08a5f }) || this._std(t.wood, { roughness: 0.9, repeat: [2, 2] });
    m.woodDark = pbr('wood', { color: 0x6d5238 }) || this._std(t.woodDark, { roughness: 0.92, repeat: [2, 2] });
    m.woodPlain = pbr('wood', { color: 0xc3a077 }) || this._std(t.wood, { color: 0x9a8264, roughness: 0.87 });
    m.palmTrunk = pbr('wood', { color: 0xa08a66, tile: 1.2 }) || this._std(t.wood, { color: 0x8a7758, roughness: 0.95 });

    /* Metal family. */
    m.metal = pbr('steel', { color: 0x9aa1a6 }) || this._std(t.metal, { roughness: 0.62, metalness: 0.18 });
    // LCM/LCVP hulls: weathered grey-green paint, pale enough to read against the surf.
    m.landingHull = pbr('steel', { color: 0x8b968d, roughness: 0.74, metalness: 0.1 })
      || this._std(t.metal, { color: 0x77827a, roughness: 0.78, metalness: 0.14 });
    m.rust = pbr('rust', { color: 0xd9c2ab }) || this._std(t.metal, { color: 0x8a5a3a, roughness: 0.8, metalness: 0.15 });
    // The source plate is heavily corroded; keep only a hint of that relief so
    // the towers read as painted steel, not as chipped terrazzo.
    m.bridgePaint = pbr('bridgePaint', { color: 0xffffff, normalScale: 0.3, aoIntensity: 0.45, metalness: 0.22 })
      || new THREE.MeshStandardMaterial({ color: 0xa8402b, roughness: 0.62, metalness: 0.25 });
    m.bridgeSteel = pbr('steel', { color: 0xaeb4b8, tile: 2.6 }) || m.metal;
    m.bridgeDeck = this.pbr.retile(m.asphalt, 1 / (4.5 * 0.15)) || m.asphalt;
    if (m.bridgeDeck) {
      // Asphalt albedo stays physical (dark); kill the mirror-like grazing
      // reflection of the overcast HDRI that otherwise reads as snow.
      m.bridgeDeck.envMapIntensity = 0.4;
      m.bridgeDeck.normalScale.setScalar(0.75);
      m.bridgeDeck.color.setHex(0x9b958d);
    }

    /* Golden Gate structural palette. */
    // International Orange (#C0362C), generated as clean satin spray paint.
    // The ambientCG plate underneath is chipped and corroded; on a 113 m tower
    // it reads as leopard spots, so the bridge uses its own set.
    m.bridgeOrange = pbr('bridgeOrange', {
      color: 0xffffff, normalScale: 0.55, aoIntensity: 0.6, metalness: 0.06,
      roughness: 1, envMapIntensity: 0.9,
    }) || new THREE.MeshStandardMaterial({ color: 0xb4432f, roughness: 0.55, metalness: 0.3 });
    // Main cables are wire rope, painted the same orange but worn to a dull,
    // slightly darker sheen where the spinning wheels and bands sit.
    m.bridgeCable = pbr('bridgeOrange', {
      color: 0xd6c0b6, normalScale: 1.0, metalness: 0.18, roughness: 1.05, envMapIntensity: 0.8,
    }) || new THREE.MeshStandardMaterial({ color: 0x8a5a48, roughness: 0.55, metalness: 0.55 });
    m.bridgeWalk = pbr('concrete', { color: 0xc4beb0, tile: 1.4, normalScale: 0.55 })
      || this._std(t.concrete, { color: 0xb8b2a4, roughness: 0.94 });
    m.bridgeDark = new THREE.MeshStandardMaterial({ color: 0x23201c, roughness: 0.84, metalness: 0.2 });
    m.roadWhite = new THREE.MeshStandardMaterial({ color: 0xd9d5c6, roughness: 0.88 });
    m.roadYellow = new THREE.MeshStandardMaterial({ color: 0xb99a34, roughness: 0.88 });
    m.beacon = new THREE.MeshBasicMaterial({ color: 0xff3a22 });

    /* Cloth. */
    m.sandbag = pbr('canvas', { color: 0xf0d0a0, tile: 0.55 }) || this._std(t.sandbag, { color: 0xe8cda0, roughness: 0.98 });
    m.canvas = pbr('canvas', { color: 0x6f7258, tile: 0.5 }) || this._std(null, { color: 0x6f7258, roughness: 0.98, bump: false });
    m.canvasTan = pbr('canvas', { color: 0x9a8a62, tile: 0.5 }) || this._std(null, { color: 0x9a8a62, roughness: 0.98, bump: false });

    const cloth = (color) => pbr('canvas', { color, tile: 0.4, normalScale: 0.9 })
      || new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    m.uniformGrey = cloth(0x6d7268);
    m.uniformBlue = cloth(0x4f5a5e);
    m.uniformOlive = cloth(0x5d5f3f);
    m.leather = pbr('canvas', { color: 0x4a3526, repeat: 1.6, normalScale: 1.2 })
      || new THREE.MeshStandardMaterial({ color: 0x3d2f22, roughness: 0.8 });

    m.helmetUs = pbr('steel', { color: 0x5d6140, repeat: 1.3, metalness: 0.55 })
      || new THREE.MeshStandardMaterial({ color: 0x54563c, roughness: 0.72, metalness: 0.15 });

    m.skin = new THREE.MeshStandardMaterial({ color: 0xb98d6b, roughness: 0.85 });
    m.rubber = new THREE.MeshStandardMaterial({ color: 0x1d1f1f, roughness: 0.95 });
    m.black = new THREE.MeshStandardMaterial({ color: 0x141616, roughness: 0.8 });
    m.gunWood = pbr('wood', { color: 0xa8763f, tile: 0.3, repeat: 1.7 })
      || this._std(t.woodDark, { color: 0x9a6f45, roughness: 0.72 });
    m.gunMetal = pbr('steel', { color: 0x767d82, repeat: 1.1, metalness: 0.9 })
      || new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.46, metalness: 0.55 });
    m.brass = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.32, metalness: 0.95 });
    m.flagChina = new THREE.MeshStandardMaterial({ color: 0xb2271e, roughness: 0.9, side: THREE.DoubleSide });
    m.flagUs = new THREE.MeshStandardMaterial({ color: 0x2f3f6b, roughness: 0.9, side: THREE.DoubleSide });
    m.glass = new THREE.MeshStandardMaterial({ color: 0x1b2626, roughness: 0.12, metalness: 0.5, transparent: true, opacity: 0.6 });
    m.foliage = new THREE.MeshStandardMaterial({ color: 0x3f4a2f, roughness: 0.95, side: THREE.DoubleSide });

    m.water = this.waterMaterial({ color: 0x6f7f7d, opacity: 0.96, size: 900 });
    m.lampWarm = new THREE.MeshStandardMaterial({
      color: 0xffddaa, emissive: 0xffb060, emissiveIntensity: 1.8, roughness: 0.5,
    });

    m.fire = new THREE.MeshBasicMaterial({ color: 0xff7a22, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    m.smoke = new THREE.MeshBasicMaterial({ color: 0x2a2926, transparent: true, opacity: 0.5, depthWrite: false });
    m.decalHole = new THREE.MeshBasicMaterial({ color: 0x151310, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

    // Authored water puddles: a thin mirror sheet laid over low spots in roads, plazas and decks.
    // The shader mask above makes the ground look wet; these guarantee readable standing water,
    // including the sky/fire reflections that sell it.
    m.puddle = new THREE.MeshStandardMaterial({
      color: 0x101b20,
      roughness: 0.035,
      metalness: 0.0,
      envMapIntensity: 2.2,
      alphaMap: puddleMaskTexture(),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    m.puddle.userData.noUnify = true;

    // One shared response for every surface (weathering + wetness + puddles).
    this._unifyAll();
  }

  /**
   * Terrain material whose texel density is fixed in metres, independent of
   * terrain width: `repeat` is simply size / tile.
   */
  terrain(name = 'terrain', { repeat = 60, color = 0xffffff, vertexColors = false } = {}) {
    const base = this.pbr.material(name, { color });
    if (base) {
      const mat = this.pbr.retile(base, repeat);
      mat.vertexColors = vertexColors;
      // Retiling clones the material (and drops onBeforeCompile): re-apply the unify pass.
      this.applyUnify(mat, name === 'sand' ? 'sand' : 'ground');
      return mat;
    }
    const src = this.textures.grass || this.textures.rubble;
    const map = src.clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat, repeat);
    const mat = new THREE.MeshStandardMaterial({ map, color, roughness: 0.97, vertexColors });
    this.applyUnify(mat, name === 'sand' ? 'sand' : 'ground');
    return mat;
  }

  /** Sea material: dark dielectric surface, detail normals and HDRI reflections. */
  waterMaterial({ color = 0x6f7f7d, opacity = 0.96, size = 900, rough = 0.1, normalRepeat = null } = {}) {
    const normal = this.textures.waterNormal.clone();
    // One normal tile spans ~110 m, so swell reads at the right world scale
    // instead of turning the bay into a field of identical ripples.
    const r = normalRepeat ?? size / 110;
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(r, r);
    normal.anisotropy = Math.min(8, this.maxAniso);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: 0.02,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      transparent: true,
      opacity,
      envMapIntensity: 1.6,
    });
    mat.userData.water = true;
    return mat;
  }

  get(name) { return this.mats[name] || this.mats.plaster; }
}
