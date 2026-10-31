import * as THREE from 'three';
import { clamp, lerp, mulberry32, smoothstep } from '../core/MathUtil.js';

/**
 * Sea fog for the Golden Gate mission.
 *
 * Global `FogExp2` alone reads as a flat grey wash: it has no parallax and no
 * structure, so the bridge appears to end in a painted backdrop. The fog that
 * actually sits on the strait is two more layers:
 *
 *  - banks of soft billboards drifting through the span at deck height, so the
 *    player walks through volumes instead of a gradient;
 *  - horizontal sheets just above the water, scrolling at different speeds so
 *    the sea below the deck has some depth.
 *
 * The scene density itself breathes on a slow tide, which is what makes the fog
 * feel like weather rather than a setting. Everything is generated once and the
 * whole layer is a few dozen transparent draws with depth writes off; it never
 * touches the depth prepass or the lighting.
 */
export class Weather {
  constructor(game, env = {}) {
    this.game = game;
    this.env = env;
    this.scene = game.worldGroup;
    this.renderer = game.renderer;
    this.enabled = env.weather === 'fog';
    this.banks = [];
    this.sheets = [];
    this.baseDensity = env.fogDensity ?? 0.0024;
    this.densitySwing = 0;
    this.time = 0;
    this.sheetGeo = null;
    this.bankTexture = null;
    this.sheetTexture = null;
    this.rng = mulberry32(0x19470319);

    if (!this.enabled) return;
    const cfg = env.fogBanks || {};
    // Fractional swing around the campaign density, not an absolute value: the
    // map still owns the baseline, weather only owns how much it breathes.
    this.densitySwing = cfg.densitySwing ?? 0.32;
    this.wind = new THREE.Vector2(cfg.wind?.[0] ?? 3.6, cfg.wind?.[1] ?? 1.0);

    this.bankTexture = makeBankTexture(this.rng);
    this.sheetTexture = makeSheetTexture(this.rng);
    this._buildSheets(cfg);
    this._buildBanks(cfg);
    this._applyDensity(0.5);
  }

  /* --------------------------------------------------------------- layers */
  _buildSheets(cfg) {
    const count = Math.max(0, cfg.sheets ?? 3);
    if (!count) return;
    const size = cfg.sheetSize ?? 2800;
    this.sheetGeo = new THREE.PlaneGeometry(size, size, 1, 1);
    this.sheetGeo.rotateX(-Math.PI / 2);
    const opacity = cfg.sheetOpacity ?? 0.3;
    for (let i = 0; i < count; i++) {
      const tex = this.sheetTexture.clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.repeat.set(1.8 + i * 0.55, 1.6 + i * 0.45);
      tex.rotation = i * 1.15;
      tex.offset.set(this.rng(), this.rng());
      const mat = new THREE.MeshBasicMaterial({
        map: tex, color: cfg.sheetColor ?? 0xdfe7e3, transparent: true,
        opacity: opacity * (1 - i * 0.2), depthWrite: false, side: THREE.DoubleSide, fog: true,
      });
      const mesh = new THREE.Mesh(this.sheetGeo, mat);
      mesh.position.set(0, 3.5 + i * 8.5, 0);
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.sheets.push({
        mesh, tex, speed: 0.0042 + i * 0.0016, cross: 0.0017 + i * 0.0011,
        drift: 8 + i * 7, phase: i * 2.1,
      });
    }
  }

  _buildBanks(cfg) {
    const count = Math.max(0, cfg.count ?? 0);
    if (!count) return;
    const scale = cfg.size ?? 1;
    const alpha = cfg.opacity ?? 1;
    // Walk the span end to end so that no stretch of deck is without a bank to
    // pass through. The three kinds share one z sequence and differ only in the
    // altitude and footprint they occupy.
    for (let i = 0; i < count; i++) {
      const roll = this.rng();
      let kind = 'deck';
      let x, y, w, h, op;
      if (roll < 0.58) {
        x = (this.rng() - 0.5) * 180;
        y = 34 + this.rng() * 26;
        w = (62 + this.rng() * 82) * scale;
        h = (18 + this.rng() * 17) * scale;
        op = (0.12 + this.rng() * 0.09) * alpha;
      } else if (roll < 0.84) {
        kind = 'sea';
        x = (this.rng() - 0.5) * 440;
        y = 3 + this.rng() * 20;
        w = (170 + this.rng() * 150) * scale;
        h = (30 + this.rng() * 26) * scale;
        op = (0.2 + this.rng() * 0.12) * alpha;
      } else {
        kind = 'high';
        x = (this.rng() - 0.5) * 260;
        y = 54 + this.rng() * 46;
        w = (50 + this.rng() * 70) * scale;
        h = (30 + this.rng() * 38) * scale;
        op = (0.07 + this.rng() * 0.06) * alpha;
      }
      const z = -560 + (i / count) * 1120 + (this.rng() - 0.5) * 24;
      const mat = new THREE.SpriteMaterial({
        map: this.bankTexture, color: kind === 'sea' ? 0xe5ece8 : 0xe9efeb, transparent: true,
        opacity: op, depthWrite: false, fog: true, rotation: (this.rng() - 0.5) * 0.36,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(x, y, z);
      sprite.scale.set(w, h, 1);
      sprite.renderOrder = 3;
      this.scene.add(sprite);
      this.banks.push({
        sprite, baseX: x, baseY: y, baseZ: z, opacity: op, phase: this.rng() * Math.PI * 2,
        drift: 12 + this.rng() * 18, rot: mat.rotation, freq: 0.024 + this.rng() * 0.012,
      });
    }
  }

  /* ---------------------------------------------------------------- update */
  update(dt, t) {
    if (!this.enabled) return;
    this.time = t;
    // Two out-of-phase sines make a tide that thickens, thins and never repeats
    // on a loop the player can anticipate.
    const tide = 0.5 + 0.3 * Math.sin(t * 0.031 + 1.7) + 0.2 * Math.sin(t * 0.074 + 0.4);
    this._applyDensity(clamp(tide, 0, 1));

    for (const s of this.sheets) {
      s.tex.offset.x = (t * s.speed) % 1;
      s.tex.offset.y = (t * s.cross) % 1;
      s.mesh.position.x = Math.sin(t * 0.008 + s.phase) * s.drift;
      s.mesh.position.z = Math.cos(t * 0.006 + s.phase) * s.drift;
    }

    for (const b of this.banks) {
      const p = t * b.freq + b.phase;
      const s = b.sprite;
      s.position.x = b.baseX + Math.sin(p) * b.drift + Math.sin(t * 0.011 + b.phase * 2) * b.drift * 0.5;
      s.position.z = b.baseZ + Math.cos(p * 0.7) * b.drift * 0.6;
      s.position.y = b.baseY + Math.sin(t * 0.041 + b.phase) * 2.4;
      s.material.opacity = b.opacity * (0.68 + 0.32 * Math.sin(t * 0.087 + b.phase));
      s.material.rotation = b.rot + Math.sin(t * 0.023 + b.phase) * 0.06;
    }
  }

  _applyDensity(k) {
    const fog = this.renderer?.fog;
    if (!fog) return;
    fog.density = this.baseDensity * (1 - this.densitySwing * 0.5 + this.densitySwing * k);
  }

  dispose() {
    for (const b of this.banks) {
      b.sprite.removeFromParent();
      b.sprite.material.dispose();
    }
    for (const s of this.sheets) {
      s.mesh.removeFromParent();
      s.tex.dispose();
      s.mesh.material.dispose();
    }
    this.bankTexture?.dispose();
    this.sheetTexture?.dispose();
    this.sheetGeo?.dispose();
    this.banks.length = 0;
    this.sheets.length = 0;
    if (this.renderer?.fog) this.renderer.fog.density = this.baseDensity;
  }
}

/* ------------------------------------------------------------ fog textures */

/** Small value-noise + fbm helpers, baked once into a canvas texture. */
function hash(seed, x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(seed, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(
    lerp(hash(seed, xi, yi), hash(seed, xi + 1, yi), u),
    lerp(hash(seed, xi, yi + 1), hash(seed, xi + 1, yi + 1), u), v,
  );
}

function fbm(seed, x, y, octaves) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(seed + i * 1013, x, y) * amp;
    norm += amp;
    x = x * 2.03 + 1.7; y = y * 2.03 + 4.1;
    amp *= 0.5;
  }
  return sum / norm;
}

/** A wide, ragged puff with soft shoulders — the billboard bank texture. */
function makeBankTexture(rng) {
  const w = 256, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const seed = (rng() * 1e9) | 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1), v = y / (h - 1);
      const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
      const edge = smoothstep(1.0, 0.42, Math.sqrt(dx * dx + dy * dy * 1.15));
      const n = fbm(seed, u * 5.2, v * 2.8, 4);
      const detail = fbm(seed + 91, u * 13, v * 7, 3);
      const a = clamp(edge * (0.28 + 0.85 * n) * (0.7 + 0.5 * detail), 0, 1);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tiling fog-sea layer: broken banks with holes rather than a solid sheet. */
function makeSheetTexture(rng) {
  const w = 192, h = 192;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const seed = (rng() * 1e9) | 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1), v = y / (h - 1);
      const n = fbm(seed, u * 5.5, v * 5.5, 5);
      const fine = fbm(seed + 37, u * 13, v * 13, 3);
      const a = smoothstep(0.36, 0.7, n) * (0.62 + 0.38 * fine);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 235;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
