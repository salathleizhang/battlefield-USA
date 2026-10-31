import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batcher, signTexture, flagTexture } from './Geo.js';
import { G } from '../core/Physics.js';
import { mulberry32 } from '../core/MathUtil.js';
import { BUILDERS } from './maps/index.js';
import { Materials } from './Materials.js';

const TEAM_COLORS = [0xd23a2b, 0x3f6fa8];

/**
 * Base level: terrain + batching + capture points + spawns + atmosphere.
 * Concrete missions live in ./maps/*.js and call the helpers below.
 */
export class Level {
  constructor(game, campaign) {
    this.game = game;
    this.campaign = campaign;
    this.scene = game.worldGroup;
    this.physics = game.physics;
    this.mats = game.materials;
    this.batch = new Batcher();
    this.capturePoints = [];
    this.spawns = { 0: [], 1: [] };
    this.playerSpawn = null;
    this.aiRoutes = [];
    this.animated = [];
    this.fires = [];
    this.smokes = [];
    this.fireSites = [];
    this.smokeSites = [];
    this.puddles = [];
    this.rand = mulberry32(19470419);
    this.heightFn = () => 0;
    this.bounds = { minX: -400, maxX: 400, minZ: -400, maxZ: 400 };
    this.waterY = 0;
    this.worldGround = 0;
  }

  /* ------------------------------------------------------------- terrain */
  addTerrain({ size = 600, segments = 120, height = () => 0, color = null, material = null, texture = 'rubble', tile = 9, tint = 0xffffff }) {
    this.heightFn = height;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = color ? new Float32Array(pos.count * 3) : null;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = height(x, z);
      pos.setY(i, y);
      if (colors) {
        color(x, z, y, c);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
    }
    if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // Texel density is fixed in metres: one tile every `tile` metres.
    const set = texture === 'grass' ? 'terrain' : texture === 'sand' ? 'sand' : 'rubble';
    const mat = material || this.mats.terrain(set, {
      repeat: size / tile,
      color: tint,
      vertexColors: !!colors,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.scene.add(mesh);
    this.terrainMesh = mesh;
    this.physics.addTrimesh(mesh, { surface: 'dirt' });
    this.size = size;
    return mesh;
  }

  addShoreFoam({ x, z, w = 6, d = 200, rotY = 0, opacity = 0.55 }) {
    const tex = this.mats.textures.foam.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / 12, d / 14);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity, depthWrite: false, color: 0xe8f0ec,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotY;
    mesh.position.set(x, this.waterY + 0.07, z);
    this.scene.add(mesh);
    this.animated.push({ type: 'foam', mesh, mat, speed: 0.006 });
    return mesh;
  }

  warship(x, z, rot = 0, scale = 1, team = 1) {
    const mat = this.mats.get('metal');
    const rust = this.mats.get('rust');
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const hullH = 7 * scale, hullL = 90 * scale, hullW = 14 * scale;
    this.batch.box(hullL, hullH, hullW, x, this.waterY + hullH / 2 - 1.5, z, mat, { rotY: rot, uv: 0.15 });
    this.batch.box(hullL * 0.55, hullH * 0.7, hullW * 0.86, x, this.waterY + hullH + 1.2, z, mat, { rotY: rot, uv: 0.2 });
    const [sx, sz] = at(0, 0);
    this.batch.box(18 * scale, 12 * scale, hullW * 0.5, x, this.waterY + hullH + 8, z, mat, { rotY: rot, uv: 0.25 });
    this.batch.cylinder(1.2 * scale, 1.6 * scale, 20 * scale, 6, x, this.waterY + hullH + 22, z, rust);
    this.batch.box(4 * scale, 3 * scale, 4 * scale, x + 18 * c, this.waterY + hullH + 12, z - 18 * s, rust, { rotY: rot });
    const [bx, bz] = at(-hullL * 0.32, 0);
    this.batch.box(22 * scale, 1.2 * scale, hullW * 0.9, bx, this.waterY + hullH + 2, bz, mat, { rotY: rot });
    this.batch.cylinder(0.8 * scale, 1.0 * scale, 12 * scale, 6, bx, this.waterY + hullH + 8, bz, rust, { rotY: rot });
    this.smokeColumn(x + 12 * c, this.waterY + hullH + 12, z - 12 * s, 2.2 * scale);
    this.fire(bx + 8 * c, this.waterY + hullH + 2, bz - 8 * s, 1.2 * scale);
  }

  addWater({ y = 0, size = 900, color = 0x8b9a94, opacity = 0.94, rough = 0.2 }) {
    this.waterY = y;
    const mat = this.mats.waterMaterial({ color, opacity, size, rough });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.water = mesh;
    this.waterMat = mat;
    this.waterBaseRepeat = size / 55;
    return mesh;
  }

  /* ------------------------------------------------- vehicles & destruction */
  /** Queue a tank spawn. `player: true` marks the hull the player can board. */
  vehicle(kind, x, z, yaw = 0, opts = {}) {
    return this.game.vehicles?.add(kind, x, z, yaw, opts) ?? null;
  }

  /**
   * Place a destructible building. It is not part of the static batch: each
   * wall bay is its own instanced panel with its own collider, so a shell can
   * open a hole and a collapse can take the box apart.
   */
  structure(spec = {}) {
    return this.game.destructibles?.addStructure(spec) ?? null;
  }

  /* ----------------------------------------------------------- colliders */
  solidBox(x, y, z, w, h, d, rotY = 0, data = {}) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    return this.physics.addStaticBox(
      { x, y, z }, { x: w / 2, y: h / 2, z: d / 2 }, q, { surface: 'stucco', ...data },
    );
  }

  /* ----------------------------------------------------------- buildings */
  /**
   * 1940s California building: solid body, punched windows, tiled or flat roof,
   * battle damage, optional shop sign. Interior is intentionally sealed (urban cover).
   */
  building({
    x, z, w = 12, d = 10, h = 9, rotY = 0, material = 'stucco', roofMaterial = 'roof',
    floors = 2, flatRoof = false, damage = 0, sign = null, signColor = '#1b1a14',
    base = null, windows = true, balcony = false,
  }) {
    const gy = base ?? this.groundHeight(x, z);
    const bodyMat = this._facadeMat(material);
    const roofMat = this.mats.get(flatRoof ? 'plaster' : roofMaterial);
    const rot = rotY;
    const c = Math.cos(rot), s = Math.sin(rot);
    const toWorld = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];

    // A row of hotels built from one recipe reads as one hotel repeated. These
    // per-building factors vary the window rhythm, which is the thing the eye
    // locks onto: identical spacing on every facade is what looks manufactured.
    const winW = 1.1 * (0.86 + this.rand() * 0.3);
    const winH = (h / floors) * (0.46 + this.rand() * 0.14);
    const bayJitter = 0.88 + this.rand() * 0.26;

    // Main mass.
    this.batch.box(w, h, d, x, gy + h / 2, z, bodyMat, { rotY });
    this.solidBox(x, gy + h / 2, z, w, h, d, rotY, { surface: 'stucco' });

    // Cornice / parapet.
    this.batch.box(w + 0.5, 0.5, d + 0.5, x, gy + h + 0.2, z, this.mats.get('plasterWhite'), { rotY });

    if (!flatRoof) {
      // Low-pitch tile roof.
      const rh = Math.min(2.4, w * 0.14);
      this.batch.box(w + 1.1, 0.35, d + 1.1, x, gy + h + 0.62, z, roofMat, { rotY, uv: 0.5 });
      this.batch.cylinder(w * 0.34, w * 0.34, d * 0.36, 4, x, gy + h + 1.2, z, roofMat, { rotY, rotZ: Math.PI / 4 });
    }

    if (windows) {
      const floorH = h / floors;
      const cols = Math.max(2, Math.round((w / 3.4) * bayJitter));
      const backCols = Math.max(2, Math.round((d / 3.4) * bayJitter));
      for (let f = 0; f < floors; f++) {
        // Each floor sits a hair off the nominal line, like real masonry.
        const wy = gy + floorH * f + floorH * (0.55 + this.rand() * 0.09);
        for (let i = 0; i < cols; i++) {
          const lx = -w / 2 + (w / cols) * (i + 0.5);
          for (const [nz, flip] of [[d / 2 + 0.06, 0], [-d / 2 - 0.06, Math.PI]]) {
            const [wx, wz] = toWorld(lx, nz);
            const awning = f === 0 && this.rand() < 0.5 ? 0.55 + this.rand() * 0.35 : 0;
            this._window(wx, wy, wz, rot + flip, winW, winH, f === 0 && i === Math.floor(cols / 2), { awning });
          }
        }
        for (let i = 0; i < backCols; i++) {
          const lz = -d / 2 + (d / backCols) * (i + 0.5);
          for (const [nx, flip] of [[w / 2 + 0.06, Math.PI / 2], [-w / 2 - 0.06, -Math.PI / 2]]) {
            const [wx, wz] = toWorld(nx, lz);
            this._window(wx, wy, wz, rot + flip, winW, winH, false, {});
          }
        }
      }
      // Door.
      const [dx, dz] = toWorld(0, d / 2 + 0.08);
      this.batch.box(1.5, 2.5, 0.16, dx, gy + 1.25, dz, this.mats.get('woodDark'), { rotY: rot, uv: 0.4 });
      this.batch.box(2.1, 0.22, 0.5, dx, gy + 2.62, dz, this.mats.get('plasterWhite'), { rotY: rot });
    }

    if (sign) {
      const [sx, sz] = toWorld(0, d / 2 + 0.22);
      const tex = signTexture(sign, { bg: signColor, fg: '#d9caa5', border: '#7d6a45' });
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(5.4, w * 0.6), 1.35), mat);
      mesh.position.set(sx, gy + 3.1, sz);
      mesh.rotation.y = rot;
      this.scene.add(mesh);
    }

    if (balcony) {
      const [bx, bz] = toWorld(0, d / 2 + 0.7);
      this.batch.box(w * 0.6, 0.16, 1.4, bx, gy + h * 0.52, bz, this.mats.get('wood'), { rotY: rot });
      this.batch.box(w * 0.6, 0.7, 0.1, bx, gy + h * 0.52 + 0.42, bz + 0.65, this.mats.get('metal'), { rotY: rot });
    }

    if (damage > 0) this._damage(x, z, w, h, d, rot, damage, gy);

    return { x, z, gy, w, d, h };
  }

  _window(x, y, z, rotY, w, h, doorLike = false, { awning = 0 } = {}) {
    const dark = this.mats.get('glass');
    this.batch.box(w, h, 0.1, x, y, z, dark, { rotY });
    // Frame.
    this.batch.box(w + 0.22, 0.1, 0.12, x, y + h / 2 + 0.06, z, this.mats.get('plasterWhite'), { rotY });
    this.batch.box(w + 0.22, 0.1, 0.12, x, y - h / 2 - 0.06, z, this.mats.get('plasterWhite'), { rotY });
    // Sill: a 4 cm lip that catches its own shadow line on the wall.
    const ox = Math.sin(rotY), oz = Math.cos(rotY);
    this.batch.box(w + 0.34, 0.07, 0.26, x + ox * 0.08, y - h / 2 - 0.16, z + oz * 0.08, this.mats.get('plasterWhite'), { rotY });
    if (awning > 0) {
      // Projecting fabric shade — the single cheapest thing that breaks up a
      // facade, because it puts a horizontal line and a shadow where the eye
      // expects only stucco.
      const mat = this.rand() < 0.5 ? this.mats.get('canvas') : this._facadeMat('metal');
      this.batch.box(w + 0.5, 0.06, 0.85 * awning, x + ox * 0.46, y + h / 2 + 0.42, z + oz * 0.46, mat, { rotY });
      // Valance hanging off the front edge.
      this.batch.box(w + 0.5, 0.22, 0.05, x + ox * (0.46 + 0.42 * awning), y + h / 2 + 0.32, z + oz * (0.46 + 0.42 * awning), mat, { rotY });
    }
    // Randomly boarded up.
    if (this.rand() < 0.28 && !doorLike) {
      this.batch.box(w + 0.3, h * 0.55, 0.14, x, y, z + 0.06, this.mats.get('wood'), { rotY, uv: 0.5 });
    }
  }

  /**
   * Facade material variants.
   *
   * One stucco material for forty hotels is why the row reads as a copy-paste:
   * same albedo, same roughness, same texel scale. Three clones per name with a
   * slight hue/roughness shift give the row tonal drift for three extra draw
   * calls, and each clone is still batched.
   */
  _facadeMat(name) {
    if (!this._facadeCache) this._facadeCache = new Map();
    const base = this.mats.get(name);
    if (!base) return base;
    const v = (this.rand() * 3) | 0;
    const key = `${name}#${v}`;
    let m = this._facadeCache.get(key);
    if (m) return m;
    m = base.clone();
    const hsl = { h: 0, s: 0, l: 0 };
    m.color.getHSL(hsl);
    m.color.setHSL(
      (hsl.h + (v - 1) * 0.008 + 1) % 1,
      THREE.MathUtils.clamp(hsl.s * (1 + (v - 1) * 0.08), 0, 1),
      THREE.MathUtils.clamp(hsl.l * (1 + (v - 1) * 0.05), 0.02, 0.98),
    );
    m.roughness = THREE.MathUtils.clamp((m.roughness ?? 0.9) + (v - 1) * 0.05, 0.2, 1);
    m.userData.facadeVariant = v;
    this._facadeCache.set(key, m);
    return m;
  }

  _damage(x, z, w, h, d, rot, amount, gy) {
    const n = Math.floor(amount * 9);
    for (let i = 0; i < n; i++) {
      const side = this.rand() * 4;
      const lx = (this.rand() - 0.5) * w;
      const lz = (this.rand() - 0.5) * d;
      const px = side < 2 ? lx : (side < 3 ? w / 2 : -w / 2);
      const pz = side < 2 ? (side === 0 ? d / 2 : -d / 2) : lz;
      const c = Math.cos(rot), s = Math.sin(rot);
      const wx = x + px * c + pz * s;
      const wz = z - px * s + pz * c;
      const wy = gy + this.rand() * h;
      // Scorch. Collected, not added: a damaged street block produces a hundred
      // of these one-off transparent meshes, and a hundred draw calls to paint
      // black discs is exactly the kind of budget a 60 fps target cannot spare.
      // They are merged into one mesh in finalize().
      const geo = new THREE.CircleGeometry(0.9 + this.rand() * 1.4, 9);
      const m4 = new THREE.Matrix4();
      const scorch = new THREE.Object3D();
      scorch.position.set(wx, wy, wz);
      scorch.lookAt(wx + (wx - x), wy, wz + (wz - z));
      scorch.updateMatrix();
      m4.copy(scorch.matrix);
      geo.applyMatrix4(m4);
      (this._scorch ||= []).push(geo);
    }
    // Rubble at the base.
    const pile = new THREE.Mesh(
      new THREE.DodecahedronGeometry(Math.min(w, d) * 0.09, 0),
      this.mats.get('brick'),
    );
    pile.position.set(x + (this.rand() - 0.5) * w * 0.8, gy + 0.25, z + d / 2 + 0.6);
    pile.rotation.set(this.rand(), this.rand() * 6, this.rand());
    pile.castShadow = pile.receiveShadow = true;
    this.scene.add(pile);
    this.physics.addMeshBox(pile, { surface: 'rubble' });
  }

  /* --------------------------------------------------------------- props */
  /**
   * Lumpy stacked sandbag wall, adapted from the reference project's hand-built
   * bags: squashed spheres with pinched tops rather than boxes. Bags are merged
   * into the level batch, so a whole trench line is still one draw call.
   */
  sandbags(x, z, rot = 0, len = 5, { base = null, rows = 4, depth = 2 } = {}) {
    const gy = base ?? this.groundHeight(x, z);
    const bagW = 0.62, bagH = 0.215, bagD = 0.4;
    const count = Math.max(1, Math.round(len / bagW));
    const c = Math.cos(rot), s = Math.sin(rot);
    const mat = this.mats.get('sandbag');
    const layers = Math.max(1, rows);
    const deep = Math.max(1, depth);
    for (let r = 0; r < layers; r++) {
      const off = r % 2 ? bagW * 0.5 : 0;
      for (let i = 0; i < count - (r % 2); i++) {
        for (let d = 0; d < deep; d++) {
          const lz = deep === 1 ? 0 : (d - (deep - 1) / 2) * bagD;
          const lx = -len / 2 + bagW / 2 + i * bagW + off;
          const geo = new THREE.SphereGeometry(0.5, 9, 6);
          geo.scale(bagW * 1.03, bagH * 1.3, bagD * 1.12);
          const pos = geo.attributes.position;
          for (let k = 0; k < pos.count; k++) {
            const py = pos.getY(k);
            pos.setY(k, Math.max(-bagH * 0.48, Math.min(bagH * 0.5, py)) * (1 + (this.rand() - 0.5) * 0.05));
            pos.setX(k, pos.getX(k) * (1 + (this.rand() - 0.5) * 0.06));
          }
          geo.computeVertexNormals();
          const px = x + lx * c + lz * s;
          const pz = z - lx * s + lz * c;
          const m = new THREE.Matrix4().makeRotationY(rot + (this.rand() - 0.5) * 0.1);
          m.setPosition(px, gy + bagH * 0.5 + r * bagH * 0.95, pz);
          geo.applyMatrix4(m);
          const uv = new Float32Array(pos.count * 2);
          for (let k = 0; k < pos.count; k++) {
            uv[k * 2] = (pos.getX(k) + pos.getZ(k)) * 0.32;
            uv[k * 2 + 1] = pos.getY(k) * 0.55;
          }
          geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          this.batch.add(geo, mat);
        }
      }
    }
    const h = (layers - 1) * bagH * 0.95 + bagH;
    const d = deep * bagD + 0.04;
    this.solidBox(x, gy + h / 2, z, len, h, d, rot, { surface: 'sand' });
  }

  /**
   * Place one GLB scene prop (see world/Props.js) on the ground and give it a
   * cuboid collider. Returns null when the asset library is unavailable.
   */
  prop(name, x, z, rot = 0, { base = null, scale = null, y = 0, solid = true, surface = null, color = null } = {}) {
    const lib = this.game.props;
    if (!lib) return null;
    const gy = base ?? this.groundHeight(x, z);
    const hit = lib.place(name, { x, z, y: gy + y, rot, scale, color });
    if (!hit) return null;
    const surf = surface || hit.surface;
    // Crates, barrels, ammo boxes and light cover can be destroyed; the record
    // is what the projectile path and blast radius look up.
    const rec = this.game.destructibles?.registerProp({
      name, entry: hit.entry, collider: null, size: hit.size, center: hit.center, surface: surf,
    }) || null;
    if (solid) {
      const p = hit.center;
      const col = this.solidBox(p.x, p.y, p.z, hit.size.x, hit.size.y, hit.size.z, rot, {
        surface: surf, prop: rec,
      });
      if (rec) this.game.destructibles.attachPropCollider(rec, col);
    }
    hit.prop = rec;
    return hit;
  }

  /**
   * 撒道具 —— 随机落点、随机朝向、随机缩放。
   *
   * 战场上的东西没人摆正过：成排对齐、等间距的工事一眼就假。所以除了确有意义的
   * 主线（比如一道防线），一律用这个撒，位置和角度都带抖动。
   * `avoid` 用来给出生点、据点圆心留空，免得把玩家卡在箱子里。
   */
  scatter(names, x, z, w, d, count, {
    base = null, rot = null, jitter = 0.7, scale = null, scaleJitter = 0.3,
    solid = true, avoid = null, y = 0,
  } = {}) {
    const list = Array.isArray(names) ? names : [names];
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const px = x + (this.rand() - 0.5) * w;
      const pz = z + (this.rand() - 0.5) * d;
      if (avoid && Math.hypot(px - avoid.x, pz - avoid.z) < avoid.r) continue;
      const name = list[(this.rand() * list.length) | 0];
      const s = scale === null ? null : scale * (1 + (this.rand() - 0.5) * scaleJitter);
      const r = rot === null ? this.rand() * Math.PI * 2 : rot + (this.rand() - 0.5) * jitter;
      if (this.prop(name, px, pz, r, { base, scale: s, solid, y })) placed += 1;
    }
    return placed;
  }

  /**
   * 断续的墙线：沿 rot 方向铺一段工事，随机塌口、随机歪斜，像被打过一轮。
   * 注意模型的长轴是 +X，所以 rot 同时决定走向 —— 沿 (cos rot, -sin rot) 前进。
   */
  wallRun(name, x, z, rot, length, {
    step = 2, gap = 0.28, jitter = 0.22, base = null, solid = true, drift = 0.3,
  } = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    let placed = 0;
    for (let t = -length / 2; t <= length / 2; t += step) {
      if (this.rand() < gap) continue;
      const px = x + t * c + (this.rand() - 0.5) * drift;
      const pz = z - t * s + (this.rand() - 0.5) * drift;
      const r = rot + (this.rand() - 0.5) * jitter;
      if (this.prop(name, px, pz, r, { base, solid })) placed += 1;
    }
    return placed;
  }

  crate(x, z, size = 1.1, { base = null, rot = 0 } = {}) {
    const gy = base ?? this.groundHeight(x, z);
    this.batch.box(size, size, size, x, gy + size / 2, z, this.mats.get('wood'), { rotY: rot, uv: 0.8 });
    this.batch.box(size * 1.02, 0.08, size * 1.02, x, gy + size * 0.78, z, this.mats.get('woodDark'), { rotY: rot });
    this.solidBox(x, gy + size / 2, z, size, size, size, rot, { surface: 'wood' });
  }

  barrel(x, z, { base = null } = {}) {
    const gy = base ?? this.groundHeight(x, z);
    this.batch.cylinder(0.32, 0.32, 0.92, 12, x, gy + 0.46, z, this.mats.get('rust'));
    this.batch.cylinder(0.34, 0.34, 0.06, 12, x, gy + 0.9, z, this.mats.get('metal'));
    this.physics.addStaticCylinder({ x, y: gy + 0.46, z }, 0.46, 0.34, { surface: 'metal' });
  }

  palm(x, z, scale = 1, { base = null } = {}) {
    const gy = base ?? this.groundHeight(x, z);
    const h = 7 * scale;
    const lean = (this.rand() - 0.5) * 0.5;
    this.batch.cylinder(0.16 * scale, 0.3 * scale, h, 7, x + lean, gy + h / 2, z, this.mats.get('palmTrunk'));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + this.rand() * 0.4;
      const len = 3.1 * scale * (0.8 + this.rand() * 0.4);
      const frond = new THREE.PlaneGeometry(len, 0.72 * scale);
      frond.translate(len / 2, 0, 0);
      const m = new THREE.Matrix4().makeRotationY(-a);
      m.multiply(new THREE.Matrix4().makeRotationZ(-0.45 - this.rand() * 0.25));
      m.setPosition(x + lean, gy + h - 0.15, z);
      this.batch.add(frond, this.mats.get('foliage'), m);
    }
    this.physics.addStaticCylinder({ x: x + lean, y: gy + h / 2, z }, h / 2, 0.3 * scale, { surface: 'wood' });
  }

  wreck(x, z, rot = 0, { base = null, kind = 'car' } = {}) {
    const gy = base ?? this.groundHeight(x, z);
    const mat = this.mats.get('rust');
    const c = Math.cos(rot), s = Math.sin(rot);
    if (kind === 'car') {
      this.batch.box(4.1, 0.75, 1.8, x, gy + 0.62, z, mat, { rotY: rot });
      this.batch.box(2.0, 0.68, 1.7, x - 0.2 * c, gy + 1.24, z + 0.2 * s, mat, { rotY: rot });
      for (const [lx, lz] of [[-1.3, 0.9], [1.3, 0.9], [-1.3, -0.9], [1.3, -0.9]]) {
        this.batch.cylinder(0.36, 0.36, 0.24, 10, x + lx * c + lz * s, gy + 0.36, z - lx * s + lz * c,
          this.mats.get('rubber'), { rotZ: Math.PI / 2 });
      }
    } else {
      // Half-track / truck.
      this.batch.box(5.4, 1.0, 2.4, x, gy + 0.9, z, mat, { rotY: rot });
      this.batch.box(3.0, 1.5, 2.2, x - 0.4 * c, gy + 1.9, z + 0.4 * s, mat, { rotY: rot });
      this.batch.box(2.2, 0.9, 2.1, x + 2.4 * c, gy + 1.5, z - 2.4 * s, mat, { rotY: rot });
    }
    this.solidBox(x, gy + 0.9, z, 4.2, 1.5, 2.2, rot, { surface: 'metal' });
    this.fire(x + (this.rand() - 0.5) * 1.5, gy + 1.4, z + (this.rand() - 0.5) * 1.5, 0.8 + this.rand() * 0.8);
    this.smokeColumn(x, gy + 2.0, z, 0.8);
  }

  barbedWire(x, z, rot = 0, len = 8, { base = null } = {}) {
    const gy = base ?? this.groundHeight(x, z);
    const posts = Math.max(2, Math.round(len / 3));
    for (let i = 0; i <= posts; i++) {
      const off = -len / 2 + (len / posts) * i;
      const px = x + Math.cos(rot) * off;
      const pz = z - Math.sin(rot) * off;
      this.batch.box(0.09, 1.15, 0.09, px, gy + 0.58, pz, this.mats.get('woodDark'));
      for (let k = 0; k < 2; k++) {
        this.batch.box(len / posts, 0.02, 0.02, px + Math.cos(rot) * (len / posts / 2), gy + 0.4 + k * 0.45,
          pz - Math.sin(rot) * (len / posts / 2), this.mats.get('metal'), { rotY: rot });
      }
    }
  }

  landingCraft(x, z, rot = 0, { base = null } = {}) {
    const gy = base ?? this.waterY;
    const mat = this.mats.get('landingHull');
    const c = Math.cos(rot), s = Math.sin(rot);
    this.batch.box(18, 1.3, 4.6, x, gy + 0.55, z, mat, { rotY: rot });
    this.batch.box(18, 1.3, 0.35, x + 0.4 * s, gy + 1.65, z + 2.2 * c, mat, { rotY: rot });
    this.batch.box(18, 1.3, 0.35, x - 0.4 * s, gy + 1.65, z - 2.2 * c, mat, { rotY: rot });
    // Ramp.
    const ramp = new THREE.BoxGeometry(4.4, 0.22, 3.2);
    const m = new THREE.Matrix4().makeRotationY(rot);
    m.multiply(new THREE.Matrix4().makeRotationX(0.32));
    m.setPosition(x - 9.5 * c, gy + 0.6, z + 9.5 * s);
    this.batch.add(ramp, mat, m);
    this.batch.box(2.6, 1.0, 1.6, x + 6.5 * c, gy + 1.6, z - 6.5 * s, this.mats.get('metal'), { rotY: rot });
    this.solidBox(x, gy + 0.8, z, 18, 1.6, 4.6, rot, { surface: 'metal' });
  }

  bunker(x, z, rot = 0, { base = null } = {}) {
    const gy = base ?? this.groundHeight(x, z);
    const conc = this.mats.get('plaster');
    this.batch.box(8, 2.4, 5, x, gy + 1.2, z, conc, { rotY: rot, uv: 0.4 });
    this.batch.box(8.6, 0.5, 5.6, x, gy + 2.55, z, conc, { rotY: rot });
    // Embrasure.
    this.batch.box(3.4, 0.55, 0.2, x, gy + 1.75, z + 2.55, this.mats.get('black'), { rotY: rot });
    this.solidBox(x, gy + 1.4, z, 8, 2.8, 5, rot, { surface: 'concrete' });
    this.sandbags(x, z + 3.4, rot, 7, { base: gy });
  }

  tankTrap(x, z, { base = null, rot = 0 } = {}) {
    const gy = base ?? this.groundHeight(x, z);
    const m = this.mats.get('metal');
    this.batch.box(0.22, 1.6, 0.22, x, gy + 0.8, z, m, { rotY: rot, rotZ: 0.6 });
    this.batch.box(0.22, 1.6, 0.22, x, gy + 0.8, z, m, { rotY: rot + 1.05, rotZ: 0.6 });
    this.batch.box(0.22, 1.6, 0.22, x, gy + 0.8, z, m, { rotY: rot + 2.1, rotZ: 0.6 });
  }

  flagpole(x, z, { base = null, team = 0, height = 6 } = {}) {
    const gy = base ?? this.groundHeight(x, z);
    this.batch.cylinder(0.08, 0.1, height, 8, x, gy + height / 2, z, this.mats.get('metal'));
    const mat = new THREE.MeshStandardMaterial({
      map: flagTexture(team), roughness: 0.9, side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(2.2, 1.4, 8, 1);
    geo.translate(1.1, 0, 0);
    const flag = new THREE.Mesh(geo, mat);
    flag.position.set(x, gy + height - 1.0, z);
    flag.castShadow = true;
    this.scene.add(flag);
    const baseGeo = geo.clone();
    this.animated.push({ type: 'flag', mesh: flag, base: baseGeo, phase: this.rand() * 6.28 });
    return flag;
  }

  /**
   * Register a burning point. The Ambience layer turns this into flame cards, a smoke plume,
   * embers and a flickering point light (only the nearest few fires get a real light).
   */
  fire(x, y, z, scale = 1) {
    const site = { pos: new THREE.Vector3(x, y, z), scale };
    this.fireSites.push(site);
    this.fires.push(site);
    return site;
  }

  /** Register a smoke source (burning wreck, skyline column, burning building). */
  smokeColumn(x, y, z, scale = 1) {
    const site = { pos: new THREE.Vector3(x, y, z), scale };
    this.smokeSites.push(site);
    this.smokes.push(site);
    return site;
  }

  _fireTexture() {
    if (this._fireTex) return this._fireTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 80, 2, 64, 70, 62);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.25, 'rgba(255,190,80,0.95)');
    g.addColorStop(0.55, 'rgba(230,80,20,0.6)');
    g.addColorStop(1, 'rgba(80,20,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(64, 6);
    ctx.bezierCurveTo(100, 40, 104, 92, 64, 122);
    ctx.bezierCurveTo(24, 92, 28, 40, 64, 6);
    ctx.fill();
    this._fireTex = new THREE.CanvasTexture(c);
    this._fireTex.colorSpace = THREE.SRGBColorSpace;
    return this._fireTex;
  }

  _smokeTexture() {
    if (this._smokeTex) return this._smokeTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    this._smokeTex = new THREE.CanvasTexture(c);
    return this._smokeTex;
  }

  /**
   * Standing water: a flat, low-roughness mirror patch with a gentle normal ripple. Sits a few
   * centimetres above the surface (`y` defaults to local ground height) and renders over the road.
   */
  puddle(x, z, { y = null, r = 2, stretch = 0.55, rot = null } = {}) {
    const gy = y ?? this.groundHeight(x, z) + 0.035;
    const geo = new THREE.CircleGeometry(r, 26);
    const mesh = new THREE.Mesh(geo, this.mats.get('puddle'));
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rot ?? this.rand() * Math.PI * 2;
    mesh.scale.y = stretch;
    mesh.position.set(x, gy, z);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.puddles.push(mesh);
    return mesh;
  }

  crater(x, z, radius = 3, y = null) {
    const gy = y ?? this.groundHeight(x, z);
    const mat = new THREE.MeshBasicMaterial({
      map: this.mats.textures.crater, transparent: true, opacity: 0.9,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = this.rand() * 6.28;
    m.position.set(x, gy + 0.04, z);
    this.scene.add(m);
    return m;
  }

  skyline(points) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5b5e58, roughness: 1, metalness: 0 });
    for (const p of points) {
      this.batch.box(p.w, p.h, p.d, p.x, p.h / 2, p.z, mat, { uv: 0.1 });
    }
  }

  /* ------------------------------------------------------------- capture */
  addCapturePoint({ id, name, x, z, radius = 16, owner = -1, base = null, height = 7 }) {
    const gy = base ?? this.groundHeight(x, z);
    const def = {
      id, name, position: new THREE.Vector3(x, gy, z), radius, owner,
      progress: owner === -1 ? 0 : 100, contested: false, attacker: -1,
      captureT: 0, capturingTeam: -1,
    };
    this.capturePoints.push(def);

    const ringMat = new THREE.MeshBasicMaterial({
      color: owner === -1 ? 0xccc6b4 : TEAM_COLORS[owner], transparent: true, opacity: 0.42,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.92, radius, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, gy + 0.06, z);
    this.scene.add(ring);

    const marker = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, height, 8), this.mats.get('metal'));
    pole.position.y = height / 2;
    marker.add(pole);
    const flagMat = new THREE.MeshStandardMaterial({
      map: flagTexture(owner === 1 ? 1 : owner === 0 ? 0 : 2), roughness: 0.9, side: THREE.DoubleSide,
    });
    const flagGeo = new THREE.PlaneGeometry(2.4, 1.5, 10, 1);
    flagGeo.translate(1.2, 0, 0);
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.y = height - 1.1;
    flag.castShadow = true;
    marker.add(flag);
    marker.position.set(x, gy, z);
    this.scene.add(marker);

    def.ring = ring;
    def.ringMat = ringMat;
    def.flag = flag;
    def.flagMat = flagMat;
    def.marker = marker;
    def.baseGeo = flagGeo.clone();
    this.animated.push({ type: 'flag', mesh: flag, base: flagGeo.clone(), phase: this.rand() * 6.28 });
    return def;
  }

  refreshPoint(cp) {
    if (!cp) return;
    const team = cp.owner;
    cp.ringMat.color.setHex(team === -1 ? 0xccc6b4 : team === 0 ? 0xd23a2b : 0x3f6fa8);
    cp.flagMat.map = flagTexture(team === 1 ? 1 : team === 0 ? 0 : 2);
    cp.flagMat.needsUpdate = true;
  }

  /* --------------------------------------------------------------- spawn */
  addSpawn(team, x, z, yaw = 0, { base = null } = {}) {
    const y = base ?? this.groundHeight(x, z);
    this.spawns[team].push({ position: new THREE.Vector3(x, y + 0.1, z), yaw });
  }

  setPlayerSpawn(x, z, yaw = 0, { base = null } = {}) {
    const y = base ?? this.groundHeight(x, z);
    this.playerSpawn = { position: new THREE.Vector3(x, y + 0.15, z), yaw };
  }

  addRoute(points) { this.aiRoutes.push(points); }

  /* ------------------------------------------------------------ utilities */
  groundHeight(x, z) {
    // Terrain height is authoritative; props on structures pass `base`.
    return this.heightFn(x, z);
  }

  inBounds(x, z) {
    return x > this.bounds.minX && x < this.bounds.maxX && z > this.bounds.minZ && z < this.bounds.maxZ;
  }

  randomInRect(x, z, w, d) {
    return [x + (this.rand() - 0.5) * w, z + (this.rand() - 0.5) * d];
  }

  /* --------------------------------------------------------------- build */
  build() {
    const fn = BUILDERS[this.campaign.id];
    if (!fn) throw new Error('unknown map ' + this.campaign.id);
    fn(this);
    this.batch.flush(this.scene);
    this.game.props?.flush(this.scene);
    this.finalize();
  }

  /**
   * Run every world material through the shared unify pass (weathering + wetness + puddles).
   * Called after the map is built, so procedural materials, GLB props and palm shaders all get
   * the same response. Already-patched materials are skipped by the WeakSet in Materials.
   */
  applyUnify() {
    const seen = new WeakSet();
    this.scene.traverse((o) => {
      if (!o.material) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        // Ground surfaces are the ones that read as a repeating photograph from
        // eye height, so they get the extra world-space detail octaves. Every
        // other material keeps the flat `level` preset it had.
        const key = m.name?.startsWith('pbr:') ? m.name.slice(4) : '';
        const preset = /^(sand|terrain|rubble)$/.test(key)
          ? { ...Materials.PRESETS.level, detail: 1 }
          : (o.name || '').startsWith('prop:') ? 'prop' : 'level';
        this.mats.applyUnify(m, preset);
      }
    });
  }

  /** Merge every scorch decal into a single mesh — one draw call for the whole map. */
  _flushScorch() {
    const list = this._scorch;
    if (!list || !list.length) return;
    this._scorch = null;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) return;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x15120e, transparent: true, opacity: 0.55, depthWrite: false,
    });
    mat.name = 'scorch';
    const mesh = new THREE.Mesh(merged, mat);
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
  }

  finalize() {
    this._flushScorch();
    this.game.renderer.setEnvironment(this.campaign.env);
    this.game.audio.setAmbience(this.campaign.env.ambience);
    this.mats.setWetness(this.campaign.env.wetness ?? 0.85);
    this.mats.setRain(this.campaign.env.rain ?? 0);
    const env = this.campaign.env;
    const sky = this.mats.constructor.unify.uSkyReflect.value;
    sky.set(env.skyHorizon ?? 0xc9d0ce).lerp(new THREE.Color(env.skyTop ?? 0x8e9ea5), 0.12).multiplyScalar(1.05);
    // Standing water normally mirrors a bright HDRI. Under a heavy fog lid the
    // sky is diffuse, and leaving the 2.2x reflection in turns every puddle into
    // a white patch on the deck. Always write it, so switching campaigns restores
    // the shared material's default.
    this.mats.get('puddle').envMapIntensity = env.puddleReflection ?? 2.2;
  }

  update(dt, t) {
    if (this.puddles.length) {
      const n = this.mats.get('puddle').normalMap;
      if (n) { n.offset.x += dt * 0.003; n.offset.y += dt * 0.0015; }
    }
    if (this.waterMat?.map) {
      this.waterMat.map.offset.x += dt * 0.006;
      this.waterMat.map.offset.y += dt * 0.0035;
      if (this.waterMat.normalMap) {
        this.waterMat.normalMap.offset.x = Math.sin(t * 0.05) * 0.02 + t * 0.002;
        this.waterMat.normalMap.offset.y = t * 0.0016;
      }
    }
    for (const a of this.animated) {
      if (a.type === 'foam') {
        a.mat.map.offset.x += dt * a.speed;
        a.mat.map.offset.y = Math.sin(t * 0.7 + a.mesh.position.z) * 0.02;
      } else if (a.type === 'flag') {
        const pos = a.base.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const k = x / 2.4;
          pos.setZ(i, Math.sin(t * 6 + x * 2.4 + a.phase) * 0.14 * k);
          pos.setY(i, a.base.attributes.position.getY(i) + Math.sin(t * 4 + x * 3 + a.phase) * 0.05 * k);
        }
        pos.needsUpdate = true;
        a.mesh.geometry.computeVertexNormals();
      } else if (a.type === 'fn') {
        a.update(t, dt);
      }
    }
  }
}
