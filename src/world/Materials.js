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
  // tileable, which matters because the sea plane repeats it ~20x.
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const waves = [];
  for (let i = 0; i < 9; i++) {
    const k = 2 + Math.floor(rnd() * 8);
    const a = rnd() * Math.PI * 2;
    waves.push({
      kx: Math.max(1, Math.round(Math.cos(a) * k)),
      ky: Math.round(Math.sin(a) * k),
      amp: 1 / (1 + i * 0.55),
      ph: rnd() * Math.PI * 2,
    });
  }

  const STRENGTH = 0.12;
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

export class Materials {
  constructor(renderer) {
    this.renderer = renderer;
    this.loader = new THREE.TextureLoader();
    this.textures = {};
    this.mats = {};
    this.maxAniso = renderer.renderer.capabilities.getMaxAnisotropy();
    this.pbr = new PBR(renderer);
  }

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
    m.rust = pbr('rust', { color: 0xd9c2ab }) || this._std(t.metal, { color: 0x8a5a3a, roughness: 0.8, metalness: 0.15 });
    m.bridgePaint = pbr('bridgePaint', { color: 0xffffff }) || new THREE.MeshStandardMaterial({ color: 0xa8402b, roughness: 0.62, metalness: 0.25 });
    m.bridgeSteel = pbr('steel', { color: 0xaeb4b8, tile: 2.6 }) || m.metal;
    m.bridgeDeck = this.pbr.retile(m.asphalt, 1 / (4.5 * 0.15)) || m.asphalt;
    if (m.bridgeDeck) {
      // Asphalt albedo stays physical (dark); kill the mirror-like grazing
      // reflection of the overcast HDRI that otherwise reads as snow.
      m.bridgeDeck.envMapIntensity = 0.4;
      m.bridgeDeck.normalScale.setScalar(0.75);
    }

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
      return mat;
    }
    const src = this.textures.grass || this.textures.rubble;
    const map = src.clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat, repeat);
    return new THREE.MeshStandardMaterial({ map, color, roughness: 0.97, vertexColors });
  }

  /** Sea material: dark dielectric surface, detail normals and HDRI reflections. */
  waterMaterial({ color = 0x6f7f7d, opacity = 0.96, size = 900, rough = 0.1, normalRepeat = null } = {}) {
    const normal = this.textures.waterNormal.clone();
    const r = normalRepeat ?? size / 46;
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(r, r);
    normal.anisotropy = Math.min(8, this.maxAniso);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: 0.02,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      transparent: true,
      opacity,
      envMapIntensity: 1.6,
    });
    mat.userData.water = true;
    return mat;
  }

  get(name) { return this.mats[name] || this.mats.plaster; }
}
