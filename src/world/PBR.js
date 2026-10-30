import * as THREE from 'three';

/**
 * Physically based material library.
 *
 * The manifest in `public/assets/pbr/manifest.json` is the single source of truth:
 * every entry points at a folder of plain, engine-agnostic maps
 * (albedo / normal / roughness / metalness / ao). Dropping a purchased or
 * downloaded set into `public/assets/pbr/<dir>/` with those five filenames and
 * adding a manifest entry is all it takes to use it — no code changes.
 *
 * Maps are shared through `THREE.Source`, so retiling a material for a different
 * surface only clones the lightweight Texture descriptors, not the pixels.
 */

const SLOTS = [
  ['map', 'albedo', true],
  ['normalMap', 'normal', false],
  ['roughnessMap', 'roughness', false],
  ['metalnessMap', 'metalness', false],
  ['aoMap', 'ao', false],
];

const DEFAULT_FILES = {
  albedo: 'albedo.jpg',
  normal: 'normal.jpg',
  roughness: 'roughness.jpg',
  metalness: 'metalness.jpg',
  ao: 'ao.jpg',
};

const MANIFEST_URL = '/assets/pbr/manifest.json';

function keyOf(value) {
  if (value === null || typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(keyOf).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${k}:${keyOf(value[k])}`).join(',')}}`;
}

export class PBR {
  constructor(renderer) {
    this.renderer = renderer;
    this.gl = renderer.renderer;
    this.loader = new THREE.TextureLoader();
    this.maxAniso = this.gl.capabilities.getMaxAnisotropy();
    this.sets = new Map();
    this.materials = new Map();
    this.hdris = new Map();
    this.manifest = { sets: {}, hdri: {}, basePath: '/assets/pbr/' };
    this.ready = false;
  }

  /* --------------------------------------------------------------- loading */
  async load(onProgress) {
    try {
      const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.manifest = await res.json();
    } catch (e) {
      console.warn('[PBR] manifest unavailable, falling back to procedural materials.', e);
      return;
    }

    const base = this.manifest.basePath || '/assets/pbr/';
    const sets = Object.entries(this.manifest.sets || {});
    const hdris = Object.entries(this.manifest.hdri || {});
    const total = Math.max(1, sets.length + hdris.length);
    let done = 0;
    const tick = (label) => {
      done += 1;
      onProgress?.(done / total, label);
    };

    await Promise.all([
      ...sets.map(async ([name, def]) => {
        const dir = `${base}${def.dir || name}/`;
        const files = { ...DEFAULT_FILES, ...(def.maps || {}) };
        const maps = {};
        await Promise.all(Object.entries(files).map(async ([slot, file]) => {
          if (!file) return;
          const tex = await this._loadTexture(dir + file, slot === 'albedo');
          if (tex) maps[slot] = tex;
        }));
        if (Object.keys(maps).length) this.sets.set(name, { def, maps, dir });
        else console.warn('[PBR] set has no maps:', name);
        tick(`PBR 材质 · ${name}`);
      }),
      ...hdris.map(async ([name, def]) => {
        const tex = await this._loadHDRI(`${base}${def.file || `${name}.hdr`}`);
        if (tex) this.hdris.set(name, tex);
        tick('环境光');
      }),
    ]);

    this.ready = true;
    console.info(`[PBR] ${this.sets.size} material sets, ${this.hdris.size} HDRIs`);
  }

  _loadTexture(url, srgb) {
    return new Promise((resolve) => {
      this.loader.load(
        url,
        (t) => {
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = Math.min(8, this.maxAniso);
          t.channel = 0;
          resolve(t);
        },
        undefined,
        () => {
          console.warn('[PBR] missing map', url);
          resolve(null);
        },
      );
    });
  }

  async _loadHDRI(url) {
    try {
      const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
      const tex = await new Promise((resolve, reject) => {
        new RGBELoader().load(url, resolve, undefined, reject);
      });
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.LinearSRGBColorSpace;
      return tex;
    } catch (e) {
      console.warn('[PBR] missing HDRI', url, e?.message || e);
      return null;
    }
  }

  /* ------------------------------------------------------------- materials */
  set(name) {
    return this.sets.get(name) || null;
  }

  has(name) {
    return this.sets.has(name);
  }

  hdri(name) {
    return name ? this.hdris.get(name) || null : null;
  }

  /**
   * Build (or reuse) a MeshStandardMaterial backed by a PBR set.
   * Returns null when the set is unavailable so callers can fall back.
   *
   * repeat: explicit scalar or [u, v]; omitted → derived from the set's real
   *         world size and the batcher's UV scale (0.28 UV units per metre).
   */
  material(name, opts = {}) {
    const set = this.sets.get(name);
    if (!set) return null;

    const key = `${name}|${keyOf(opts)}`;
    const cached = this.materials.get(key);
    if (cached) return cached;

    const { def, maps } = set;
    const repeat = this._repeat(def, opts);
    const normalScale = opts.normalScale ?? 1;
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      // AmbientCG omits Metalness for dielectrics (brick, plaster, fabric…).
      // Without that map the multiplier must default to 0, not 1.
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? (maps.metalness ? 1 : 0),
      side: opts.side ?? THREE.FrontSide,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      envMapIntensity: opts.envMapIntensity ?? 1,
      aoMapIntensity: opts.aoIntensity ?? 1,
      flatShading: !!opts.flatShading,
    });
    mat.name = `pbr:${name}`;

    for (const [slot, slotName] of SLOTS) {
      const src = maps[slotName];
      if (!src) continue;
      const t = src.clone();
      t.repeat.set(repeat[0], repeat[1]);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.channel = 0;
      if (slot === 'normalMap') mat.normalScale = new THREE.Vector2(normalScale, normalScale);
      mat[slot] = t;
    }

    if (opts.emissive) {
      mat.emissive = new THREE.Color(opts.emissive);
      mat.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    if (opts.depthWrite === false) mat.depthWrite = false;

    mat.userData.pbr = name;
    this.materials.set(key, mat);
    return mat;
  }

  /** Clone a PBR material with every map retiled to `repeat`. */
  retile(material, repeat) {
    if (!material) return material;
    const r = Array.isArray(repeat) ? repeat : [repeat, repeat];
    const clone = material.clone();
    for (const [slot] of SLOTS) {
      const src = material[slot];
      if (!src) continue;
      const t = src.clone();
      t.repeat.set(r[0], r[1]);
      clone[slot] = t;
    }
    return clone;
  }

  _repeat(def, opts) {
    if (opts.repeat !== undefined) {
      return Array.isArray(opts.repeat) ? opts.repeat : [opts.repeat, opts.repeat];
    }
    const uvScale = opts.uvScale ?? 0.28;
    const tile = opts.tile ?? def.tile ?? 2;
    const r = 1 / (tile * uvScale);
    return [r, r];
  }

  dispose() {
    for (const mat of this.materials.values()) mat.dispose();
    this.materials.clear();
  }
}
