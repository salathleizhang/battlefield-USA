import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/Physics.js';
import { clamp, rand } from '../core/MathUtil.js';

/**
 * Destruction layer: crates, barrels, battlefield cover and small buildings.
 *
 * Props are single GLB instances (see world/Props.js): they are registered here
 * so a hit can retire one instance, drop its collider and replace it with a few
 * physics fragments.
 *
 * Structures are built from a grid of wall panels sharing one InstancedMesh, one
 * static collider per panel and a roof. A shell takes hit points, punches panels
 * out of the wall it struck (opening a real sight line and a hole a man can walk
 * through), and at zero the rest comes down: panels turn into debris, the roof
 * drops, a rubble heap and a low collider replace the building. Tanks hurt them
 * by ramming, shells by penetrating, grenades by blast.
 */

const PANEL_W = 1.5;
const WALL_T = 0.26;
const STAGE_HP = { intact: 1, damaged: 0.68, breached: 0.34, collapsed: 0 };

/** Whose wall panels can be punched out by a single hit (hit points each). */
const PANEL_HP = { wood: 55, brick: 110, plaster: 95, concrete: 220 };

/** One explosion per this many hp of `blast` damage on an explosive prop. */
const EXPLOSIVE = {
  ammo: { radius: 6.5, power: 150 },
  ammo_box: { radius: 6.5, power: 150 },
  barrel: { radius: 5.5, power: 110 },
  barrelRust: { radius: 5.5, power: 110 },
  jerrycan: { radius: 4.0, power: 70 },
  fuel_container1: { radius: 8.0, power: 220 },
  fuel_container2: { radius: 8.0, power: 220 },
};

const DESTRUCTIBLE_PROPS = new Set([
  'crate', 'crateWood', 'barrel', 'barrelRust', 'ammo', 'jerrycan', 'barrier',
  'palette1', 'pallet1', 'planks1', 'planks2', 'fuel_container1', 'fuel_container2',
  'trash_container1', 'weaponbox1', 'weaponbox1b', 'weaponbox2', 'weaponbox3',
  'ammo1', 'barrel1', 'barrel2', 'can1', 'sandbags_box1', 'sandbags_box2',
]);

const STRUCTURE_TYPES = {
  shed: {
    w: 4.5, d: 3.0, h: 2.7, floors: 1, material: 'wood', roof: 'gable',
    hp: 170, label: '木棚',
  },
  house: {
    w: 7.5, d: 6.0, h: 5.4, floors: 2, material: 'plaster', roof: 'gable',
    hp: 560, label: '民居',
  },
  brickhouse: {
    w: 7.5, d: 6.0, h: 5.4, floors: 2, material: 'brick', roof: 'flat',
    hp: 700, label: '砖房',
  },
  barn: {
    w: 10.5, d: 7.5, h: 6.0, floors: 1, material: 'wood', roof: 'gable',
    hp: 640, label: '谷仓',
  },
  bunker: {
    w: 6.0, d: 4.5, h: 2.4, floors: 1, material: 'concrete', roof: 'flat',
    hp: 1350, label: '混凝土掩体',
  },
  depot: {
    w: 6.0, d: 4.5, h: 3.3, floors: 1, material: 'wood', roof: 'gable',
    hp: 300, label: '补给棚',
  },
};

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/* ---------------------------------------------------------------- textures */

const _wallTex = new Map();
function wallTexture(kind, windowed) {
  const key = `${kind}:${windowed}`;
  if (_wallTex.has(key)) return _wallTex.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const palette = {
    plaster: ['#c8bda6', 0.5],
    brick: ['#8d4a37', 1],
    wood: ['#6c5638', 1],
    concrete: ['#8d8a80', 0.6],
  }[kind] || ['#b0a690', 1];
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, 256, 256);

  if (kind === 'brick') {
    const bw = 42, bh = 16;
    for (let y = 0; y < 256; y += bh) {
      const off = (Math.floor(y / bh) % 2) * (bw / 2);
      for (let x = -bw; x < 256; x += bw) {
        const s = 0.75 + Math.random() * 0.4;
        ctx.fillStyle = `rgb(${Math.floor(133 * s)},${Math.floor(68 * s)},${Math.floor(50 * s)})`;
        ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
    ctx.strokeStyle = 'rgba(40,28,22,0.35)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 256; y += bh) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
    }
  } else if (kind === 'wood') {
    for (let x = 0; x < 256; x += 32) {
      const s = 0.8 + Math.random() * 0.3;
      ctx.fillStyle = `rgba(${Math.floor(96 * s)},${Math.floor(76 * s)},${Math.floor(48 * s)},1)`;
      ctx.fillRect(x, 0, 30, 256);
      ctx.fillStyle = 'rgba(28,20,12,0.5)';
      ctx.fillRect(x + 30, 0, 2, 256);
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = `rgba(30,20,10,${0.06 + Math.random() * 0.12})`;
        ctx.beginPath();
        const yy = Math.random() * 256;
        ctx.moveTo(x + 2, yy);
        ctx.bezierCurveTo(x + 10, yy + 4, x + 20, yy - 4, x + 29, yy + 2);
        ctx.stroke();
      }
    }
  } else {
    // Plaster / concrete: mottling, water stains, hairline cracks.
    for (let i = 0; i < 420; i++) {
      const a = 0.01 + Math.random() * 0.05;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,250,235,${a})` : `rgba(24,22,18,${a})`;
      const s = 3 + Math.random() * 26;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s * (0.4 + Math.random()));
    }
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * 256;
      const g = ctx.createLinearGradient(0, 0, 0, 90);
      g.addColorStop(0, 'rgba(40,38,30,0.12)');
      g.addColorStop(1, 'rgba(40,38,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 1 + Math.random() * 3, 60 + Math.random() * 100);
    }
    ctx.strokeStyle = 'rgba(35,32,26,0.25)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      let x = Math.random() * 256, y = Math.random() * 256;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 30; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }

  if (windowed) {
    // A window is the cheapest way to make a wall read as a building. It sits in
    // the upper third so the texture tiles once per 1.5 m bay / storey panel.
    const wx = 46, wy = 44, ww = 164, wh = 104;
    ctx.fillStyle = 'rgba(20,26,28,0.92)';
    ctx.fillRect(wx, wy, ww, wh);
    const gl = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
    gl.addColorStop(0, 'rgba(150,175,182,0.55)');
    gl.addColorStop(0.45, 'rgba(60,80,86,0.2)');
    gl.addColorStop(1, 'rgba(16,22,24,0.9)');
    ctx.fillStyle = gl;
    ctx.fillRect(wx + 5, wy + 5, ww - 10, wh - 10);
    ctx.strokeStyle = 'rgba(225,218,200,0.55)';
    ctx.lineWidth = 7;
    ctx.strokeRect(wx - 3, wy - 3, ww + 6, wh + 6);
    ctx.fillStyle = 'rgba(230,224,205,0.72)';
    ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    ctx.fillRect(wx, wy + wh / 2 - 2, ww, 4);
    // Sill and a little soot over the lintel.
    ctx.fillStyle = 'rgba(232,226,210,0.8)';
    ctx.fillRect(wx - 8, wy + wh + 4, ww + 16, 6);
    ctx.fillStyle = 'rgba(18,16,12,0.22)';
    ctx.fillRect(wx - 6, wy - 12, ww + 12, 12);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  _wallTex.set(key, tex);
  return tex;
}

export class DestructibleWorld {
  constructor(game) {
    this.game = game;
    this.physics = game.physics;
    this.scene = game.worldGroup;
    this.props = [];
    this.structures = [];
    this.debris = [];
    this.pendingBlasts = [];
    this._wallMats = new Map();
    this._propColliders = new Map();
    this.nextId = 1;
    this._blastDepth = 0;
    this._propByEntry = new WeakMap();
  }

  /* ------------------------------------------------------------- materials */

  wallMaterial(kind, windowed) {
    const key = `${kind}:${windowed}`;
    if (this._wallMats.has(key)) return this._wallMats.get(key);
    const mats = this.game.materials;
    const src = mats.get(kind === 'concrete' ? 'concrete' : kind === 'wood' ? 'wood' : kind);
    const mat = src.clone();
    // A clone keeps the source's compiled-unify hook; applying unify again would
    // inject the same declarations twice and fail shader compilation.
    mat.onBeforeCompile = () => {};
    mat.customProgramCacheKey = undefined;
    mat.map = wallTexture(kind, windowed);
    mat.userData.noUnify = false;
    if (kind === 'wood') mat.color.setHex(0xc9b48d);
    else if (kind === 'brick') mat.color.setHex(0xd8c3b2);
    else mat.color.setHex(0xe2dccd);
    mat.roughness = kind === 'wood' ? 0.92 : 0.88;
    mat.metalness = 0.02;
    mat.name = `wall:${kind}${windowed ? ':window' : ''}`;
    mats.applyUnify(mat, kind === 'wood' ? 'wood' : 'wall');
    this._wallMats.set(key, mat);
    return mat;
  }

  /* ------------------------------------------------------------------ props */

  /**
   * Called by Level.prop after a GLB instance has been queued. `entry` is the
   * queue record Props.flush fills with the instance mesh + index, so the prop
   * can be hidden later without touching the rest of its batch.
   */
  registerProp({ name, entry, collider, size, center, surface }) {
    if (!DESTRUCTIBLE_PROPS.has(name)) return null;
    const vol = Math.max(0.05, size.x * size.y * size.z);
    const hp = Math.round(clamp(30 + vol * 26, 35, 420));
    const rec = {
      id: this.nextId++,
      name,
      entry,
      collider,
      size: size.clone(),
      center: center.clone(),
      surface: surface || 'wood',
      hp,
      maxHp: hp,
      alive: true,
      explosive: EXPLOSIVE[name] || null,
    };
    this.props.push(rec);
    this._propByEntry.set(entry, rec);
    if (collider) this.attachPropCollider(rec, collider);
    return rec;
  }

  attachPropCollider(rec, collider) {
    if (!rec) return;
    rec.collider = collider;
    this._propColliders.set(collider.handle, rec);
    this.physics.tag(collider, { prop: rec, surface: rec.surface });
  }

  damageProp(rec, amount, point, dir = null, info = {}) {
    if (!rec?.alive) return false;
    rec.hp -= amount;
    if (rec.hp > 0) {
      // A crate that has been shot leaks splinters and dust but stays put.
      if (Math.random() < 0.5) {
        this.game.effects?.impact(point, new THREE.Vector3(0, 1, 0), rec.surface);
      }
      return false;
    }
    this.destroyProp(rec, point, dir, info);
    return true;
  }

  destroyProp(rec, point, dir = null, info = {}) {
    if (!rec?.alive) return;
    rec.alive = false;
    const entry = rec.entry;
    if (entry?.parts) {
      for (const p of entry.parts) {
        p.mesh.setMatrixAt(p.index, ZERO);
        p.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (rec.collider) {
      this.physics.colliderData.delete(rec.collider.handle);
      this.physics.world.removeCollider(rec.collider);
      this._propColliders.delete(rec.collider.handle);
      rec.collider = null;
    }
    const pos = rec.center.clone();
    this.spawnDebris(pos, rec.size, rec.entry?.material, 3 + Math.round(Math.random() * 3), {
      dir, spread: 2.2, speed: 3.2, surface: rec.surface,
    });
    this.game.effects?.impact(pos, new THREE.Vector3(0, 1, 0), rec.surface);
    this.game.audio?.impact(rec.surface === 'metal' ? 'metal' : 'wood', 0, 0);
    if (rec.explosive && !info.silent) {
      this.pendingBlasts.push({
        pos: pos.clone().add(new THREE.Vector3(0, rec.size.y * 0.4, 0)),
        radius: rec.explosive.radius,
        power: rec.explosive.power,
        owner: info.attacker || null,
        delay: 0.06 + Math.random() * 0.12,
      });
    }
  }

  /* ------------------------------------------------------------- structures */

  /**
   * Build one destructible building. Everything is snapped to 1.5 m wall bays
   * so all panels share one geometry and one instanced draw.
   */
  addStructure(spec = {}) {
    const type = STRUCTURE_TYPES[spec.type] ? spec.type : 'house';
    const def = STRUCTURE_TYPES[type];
    const w = spec.w ?? def.w;
    const d = spec.d ?? def.d;
    const floors = spec.floors ?? def.floors;
    const h = spec.h ?? def.h;
    const material = spec.material ?? def.material;
    const roof = spec.roof ?? def.roof;
    const yaw = spec.yaw ?? 0;
    const level = this.game.level;
    const gy = spec.base ?? level.groundHeight(spec.x, spec.z);

    const bays = Math.max(2, Math.round(w / PANEL_W));
    const sideBays = Math.max(2, Math.round(d / PANEL_W));
    const bayW = w / bays;
    const sideBayW = d / sideBays;
    const storeyH = h / floors;

    const group = new THREE.Group();
    group.name = `structure:${type}`;
    group.position.set(spec.x, gy, spec.z);
    group.rotation.y = yaw;
    this.scene.add(group);

    const panelGeo = new THREE.BoxGeometry(bayW, storeyH, WALL_T);
    const sidePanelGeo = new THREE.BoxGeometry(sideBayW, storeyH, WALL_T);
    // Two instanced runs: front/back bays and side bays have different widths.
    const frontCount = bays * floors * 2;
    const sideCount = sideBays * floors * 2;
    const wallMat = this.wallMaterial(material, true);
    const fbMesh = new THREE.InstancedMesh(panelGeo, wallMat, frontCount);
    const lrMesh = new THREE.InstancedMesh(sidePanelGeo, wallMat, sideCount);
    fbMesh.name = 'wallPanelsFB';
    lrMesh.name = 'wallPanelsLR';
    for (const m of [fbMesh, lrMesh]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      group.add(m);
    }

    const st = {
      id: this.nextId++,
      type,
      label: spec.label || def.label,
      name: spec.name || def.label,
      x: spec.x, z: spec.z, yaw,
      gy, w, d, h, floors, storeyH,
      material, roof,
      hp: (spec.hp ?? def.hp) * Math.pow((w * d * h) / (def.w * def.d * def.h), 0.7),
      maxHp: 0,
      stage: 'intact',
      alive: true,
      panels: [],
      roofParts: [],
      group,
      fbMesh, lrMesh,
      opened: 0,
      smokeT: 0,
      fireAdded: false,
      smokeAdded: false,
      rubble: null,
    };
    st.maxHp = st.hp;

    const doorBay = Math.floor(bays / 2);
    // Unused instances (the doorway bay) would otherwise render an identity
    // matrix panel at the group origin.
    for (let i = 0; i < frontCount; i++) fbMesh.setMatrixAt(i, ZERO);
    for (let i = 0; i < sideCount; i++) lrMesh.setMatrixAt(i, ZERO);
    let fi = 0, si = 0;
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < bays; i++) {
        // Ground-floor doorway on the front face: an actual opening, so a squad
        // can walk in and a tank shell can be fired out of it.
        const door = f === 0 && i === doorBay;
        for (const zSide of [-1, 1]) {
          if (door && zSide === -1) continue;
          const lx = -w / 2 + bayW * (i + 0.5);
          const lz = zSide * (d / 2);
          const panel = this._wallPanel(st, fbMesh, fi++, {
            lx, ly: storeyH * (f + 0.5), lz, rot: 0,
            size: { x: bayW, y: storeyH, z: WALL_T }, floor: f, door: false,
          });
          st.panels.push(panel);
        }
      }
      for (let i = 0; i < sideBays; i++) {
        for (const xSide of [-1, 1]) {
          const lx = xSide * (w / 2);
          const lz = -d / 2 + sideBayW * (i + 0.5);
          const panel = this._wallPanel(st, lrMesh, si++, {
            lx, ly: storeyH * (f + 0.5), lz, rot: Math.PI / 2,
            size: { x: sideBayW, y: storeyH, z: WALL_T }, floor: f, door: false,
          });
          st.panels.push(panel);
        }
      }
    }
    // Door frame (posts + lintel). Decoration only; the bay itself stays open.
    const frameMat = this.wallMaterial(material, false);
    const frame = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.12, storeyH, 0.34);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(s * (bayW / 2 - 0.06), storeyH / 2, -d / 2);
      post.castShadow = true;
      frame.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(bayW, 0.24, 0.34), frameMat);
    lintel.position.set(0, storeyH - 0.1, -d / 2);
    lintel.castShadow = true;
    frame.add(lintel);
    group.add(frame);

    /* roof */
    const roofMat = this.game.materials.get(roof === 'gable' ? 'roof' : material === 'wood' ? 'woodDark' : 'plaster');
    if (roof === 'gable') {
      const rise = Math.min(1.5, d * 0.22);
      const half = d / 2 + 0.35;
      const slope = Math.hypot(half, rise);
      const angle = Math.atan2(rise, half);
      for (const s of [-1, 1]) {
        const geo = new THREE.BoxGeometry(w + 0.6, 0.2, slope);
        const mesh = new THREE.Mesh(geo, roofMat);
        mesh.position.set(0, h + rise / 2, s * (half / 2));
        mesh.rotation.x = s * angle;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(s * angle, yaw, 0, 'YXZ'));
        const world = new THREE.Vector3(0, h + rise / 2, s * (half / 2))
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(spec.x, gy, spec.z));
        const col = this.physics.addStaticBox(world, { x: (w + 0.6) / 2, y: 0.1, z: slope / 2 }, quat,
          { surface: material === 'wood' ? 'wood' : 'concrete', structure: st, roof: true });
        st.roofParts.push({ mesh, colliders: [col], alive: true });
      }
    } else {
      const geo = new THREE.BoxGeometry(w + 0.7, 0.32, d + 0.7);
      const mesh = new THREE.Mesh(geo, roofMat);
      mesh.position.y = h + 0.16;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      const col = this.physics.addStaticBox(
        { x: spec.x, y: gy + h + 0.16, z: spec.z },
        { x: (w + 0.7) / 2, y: 0.16, z: (d + 0.7) / 2 },
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        { surface: material === 'wood' ? 'wood' : 'concrete', structure: st, roof: true },
      );
      st.roofParts.push({ mesh, colliders: [col], alive: true });
    }

    this.structures.push(st);
    return st;
  }

  _wallPanel(st, mesh, index, { lx, ly, lz, rot, size, floor }) {
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    const wx = st.x + lx * c + lz * s;
    const wz = st.z - lx * s + lz * c;
    const wy = st.gy + ly;
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, st.yaw + rot, 0));
    const col = this.physics.addStaticBox(
      { x: wx, y: wy, z: wz },
      { x: size.x / 2, y: size.y / 2, z: size.z / 2 },
      quat,
      { surface: st.material, structure: st, panel: null },
    );
    const panel = {
      structure: st, mesh, index, colliders: [col], alive: true, floor,
      center: new THREE.Vector3(wx, wy, wz), size,
    };
    // The collider points back at the panel so a ram can knock exactly this one out.
    const data = this.physics.dataOf(col);
    if (data) data.panel = panel;
    _m.compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(index, _m);
    mesh.instanceMatrix.needsUpdate = true;
    return panel;
  }

  damageStructure(st, amount, point, info = {}) {
    if (!st?.alive || st.stage === 'collapsed') return 0;
    st.hp -= amount;
    const impactPoint = point || new THREE.Vector3(st.x, st.gy + st.h * 0.5, st.z);

    // Punch panels out of the wall nearest the blow. Shells take one to three,
    // blasts take everything close, rifle fire only chips.
    if (amount >= 40) {
      const count = clamp(Math.round(amount / 110), 1, 3);
      const near = st.panels
        .filter((p) => p.alive && p.center.distanceTo(impactPoint) < (info.radius ? info.radius + 1.5 : 3.4))
        .sort((a, b) => a.center.distanceToSquared(impactPoint) - b.center.distanceToSquared(impactPoint));
      for (let i = 0; i < Math.min(count, near.length); i++) {
        this.breakPanel(near[i], impactPoint, info.dir, 1);
      }
    } else {
      this.game.effects?.impact(impactPoint, new THREE.Vector3(0, 1, 0), st.material);
    }

    if (!st.smokeAdded && st.hp < st.maxHp * 0.55) {
      st.smokeAdded = true;
      this.game.level?.smokeColumn(st.x, st.gy + st.h * 0.7, st.z, 0.7 + st.h * 0.1);
    }
    if (!st.fireAdded && st.hp < st.maxHp * 0.25) {
      st.fireAdded = true;
      this.game.level?.fire(
        st.x + rand(-st.w * 0.2, st.w * 0.2), st.gy + st.h * 0.35, st.z + rand(-st.d * 0.2, st.d * 0.2), 0.9,
      );
      this.game.level?.smokeColumn(st.x, st.gy + st.h * 0.85, st.z, 1.3);
    }

    const ratio = st.hp / st.maxHp;
    const nextStage = ratio <= 0 ? 'collapsed' : ratio < STAGE_HP.breached ? 'breached' : ratio < STAGE_HP.damaged ? 'damaged' : 'intact';
    if (nextStage !== st.stage && nextStage !== 'collapsed') {
      st.stage = nextStage;
      if (nextStage === 'breached') {
        this.game.effects?.smokeScreen(impactPoint, 1.4);
        this.game.audio?.impact('rubble', 0, 0);
      }
    }
    if (st.hp <= 0) this.collapse(st, point, info);
    return amount;
  }

  breakPanel(panel, point, dir = null, cause = 1) {
    if (!panel?.alive) return;
    panel.alive = false;
    panel.structure.opened++;
    panel.mesh.setMatrixAt(panel.index, ZERO);
    panel.mesh.instanceMatrix.needsUpdate = true;
    for (const col of panel.colliders) {
      this.physics.colliderData.delete(col.handle);
      this.physics.world.removeCollider(col);
    }
    panel.colliders.length = 0;
    const pos = panel.center.clone();
    const normal = new THREE.Vector3(Math.sin(panel.structure.yaw), 0, Math.cos(panel.structure.yaw));
    if (dir) pos.addScaledVector(dir, -0.2);
    this.spawnDebris(pos, panel.size, this.wallMaterial(panel.structure.material, false), 3 + (cause > 1 ? 2 : 0), {
      dir, spread: 1.6, speed: 3.6, surface: panel.structure.material,
    });
    this.game.effects?.impact(pos, normal, panel.structure.material);
    this.game.audio?.impact(panel.structure.material === 'wood' ? 'wood' : 'rubble', 0, 0);
  }

  collapse(st, point, info = {}) {
    if (!st || st.stage === 'collapsed') return;
    st.stage = 'collapsed';
    st.alive = false;
    const at = point || new THREE.Vector3(st.x, st.gy + st.h * 0.4, st.z);
    for (const panel of st.panels) if (panel.alive) this.breakPanel(panel, at, null, 2);
    for (const part of st.roofParts) {
      if (!part.alive) continue;
      part.alive = false;
      for (const col of part.colliders) {
        this.physics.colliderData.delete(col.handle);
        this.physics.world.removeCollider(col);
      }
      part.mesh.visible = false;
      const p = new THREE.Vector3();
      part.mesh.getWorldPosition(p);
      this.spawnDebris(p, { x: st.w * 0.5, y: 0.2, z: st.d * 0.5 }, part.mesh.material, 4, {
        spread: 3, speed: 2.2, surface: 'wood',
      });
    }
    this.raiseRubble(st);
    this.game.effects?.smokeScreen(new THREE.Vector3(st.x, st.gy + 1, st.z), 3.2 + st.w * 0.12);
    this.game.level?.smokeColumn(st.x, st.gy + 1.4, st.z, 1.6 + st.w * 0.08);
    this.game.level?.fire(st.x, st.gy + 0.8, st.z, 1.1);
    this.game.audio?.explosion(this.game.player ? this.game.player.position.distanceTo(new THREE.Vector3(st.x, st.gy, st.z)) : 0);
    this.game.hud?.toast(`${st.label}被摧毁`);
  }

  raiseRubble(st) {
    const mat = this.wallMaterial(st.material, false);
    const geos = [];
    const n = 16 + Math.round(Math.min(18, st.w * st.d * 0.4));
    for (let i = 0; i < n; i++) {
      const bw = 0.35 + Math.random() * 1.4;
      const bh = 0.2 + Math.random() * 0.55;
      const bd = 0.35 + Math.random() * 1.2;
      const g = new THREE.BoxGeometry(bw, bh, bd);
      g.rotateY(Math.random() * Math.PI);
      g.rotateZ((Math.random() - 0.5) * 0.5);
      const hx = (Math.random() - 0.5) * st.w * 0.9;
      const hz = (Math.random() - 0.5) * st.d * 0.9;
      const r = Math.pow(Math.random(), 1.6);
      g.translate(hx, bh * 0.5 + r * st.h * 0.22, hz);
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'rubble';
    mesh.position.set(st.x, st.gy, st.z);
    mesh.rotation.y = st.yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    st.rubble = mesh;
    // Low enough for the character autostep (0.45 m) to walk over: the heap is
    // scenery, the collapsed building should not create an invisible wall.
    const col = this.physics.addStaticBox(
      { x: st.x, y: st.gy + 0.18, z: st.z },
      { x: st.w * 0.48, y: 0.18, z: st.d * 0.48 },
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, st.yaw, 0)),
      { surface: 'rubble' },
    );
    st.rubbleCollider = col;
  }

  /* ------------------------------------------------------------------ debris */

  spawnDebris(pos, size, material, count, { dir = null, spread = 1.6, speed = 3.2, surface = 'wood' } = {}) {
    const mat = material || this.game.materials.get('rubble');
    for (let i = 0; i < count; i++) {
      const w = clamp(size.x * (0.12 + Math.random() * 0.3), 0.06, 0.8);
      const h = clamp(size.y * (0.1 + Math.random() * 0.3), 0.05, 0.6);
      const d = clamp(size.z * (0.12 + Math.random() * 0.3), 0.06, 0.8);
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * (size.x + spread),
        (Math.random() - 0.5) * (size.y + spread) * 0.6,
        (Math.random() - 0.5) * (size.z + spread),
      ));
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.scene.add(mesh);
      const v = dir
        ? dir.clone().multiplyScalar(speed * (0.4 + Math.random())).add(new THREE.Vector3(
          (Math.random() - 0.5) * 2, 1.2 + Math.random() * 2.2, (Math.random() - 0.5) * 2))
        : new THREE.Vector3((Math.random() - 0.5) * speed, 2 + Math.random() * 3, (Math.random() - 0.5) * speed);
      const link = this.physics.addDynamicBox(mesh, { x: w / 2, y: h / 2, z: d / 2 }, Math.max(0.3, w * h * d * 380), v, {
        x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8,
      });
      this.debris.push({ mesh, link, ttl: 7 + Math.random() * 4, maxTtl: 11, surface });
    }
    // Keep the fragment population bounded: the oldest are retired first.
    while (this.debris.length > 130) this._removeDebris(0);
  }

  _removeDebris(i) {
    const d = this.debris[i];
    this.debris.splice(i, 1);
    d.link && this.physics.removeDynamic(d.link);
    d.mesh.removeFromParent();
    d.mesh.geometry.dispose();
  }

  /* ----------------------------------------------------------------- damage */

  /** A direct hit resolved by Game's projectile step. */
  bulletHit(data, point, normal, damage, dir, attacker) {
    if (!data) return false;
    if (data.prop) {
      return this.damageProp(data.prop, damage, point, dir, { attacker });
    }
    if (data.structure) {
      if (data.panel) {
        // Rifle and MG fire pocks a wall; only a real blow takes a panel.
        this.game.effects?.impact(point, normal, data.structure.material);
        return false;
      }
      return this.damageStructure(data.structure, damage * 0.4, point, { dir, cause: 'bullet' }) > 0;
    }
    return false;
  }

  /** Explosion: damage everything inside the radius, with a soft falloff. */
  blast(pos, radius, power, info = {}) {
    const impacts = [];
    for (const rec of this.props) {
      if (!rec.alive) continue;
      const d = rec.center.distanceTo(pos);
      if (d > radius + Math.max(rec.size.x, rec.size.z) * 0.5) continue;
      const falloff = Math.pow(Math.max(0, 1 - d / radius), 1.3);
      const dmg = power * falloff;
      if (dmg < 4) continue;
      if (this.damageProp(rec, dmg, pos, null, { attacker: info.attacker })) impacts.push(rec);
    }
    for (const st of this.structures) {
      if (!st.alive) continue;
      const d = Math.hypot(st.x - pos.x, st.z - pos.z);
      if (d > radius + Math.max(st.w, st.d) * 0.5) continue;
      const falloff = Math.pow(Math.max(0, 1 - d / (radius + st.w * 0.3)), 1.2);
      const dmg = power * falloff;
      if (dmg < 10) continue;
      this.damageStructure(st, dmg, pos.clone(), { radius, dir: null, cause: 'blast' });
    }
    return impacts;
  }

  /**
   * A tank's hull ran into the collider returned by a forward ray. Break the
   * panel and price the structure damage by the hull's kinetic energy.
   */
  ram(data, speed, massTons) {
    if (!data) return false;
    if (data.panel) {
      const st = data.structure;
      if (!st?.alive) return false;
      this.breakPanel(data.panel, data.panel.center.clone(), null, 1);
      const energy = 0.5 * massTons * speed * speed;
      this.damageStructure(st, clamp(energy * 4.5, 30, 700), data.panel.center.clone(), {
        dir: null, radius: 2.5, cause: 'ram',
      });
      this.game.audio?.impact('rubble', 0, 0);
      return true;
    }
    if (data.prop) {
      this.destroyProp(data.prop, data.prop.center.clone(), null, { attacker: null });
      return true;
    }
    return false;
  }

  /** Crush loose props under the tracks (called every frame by a moving tank). */
  crush(vehicle) {
    const speed = Math.abs(vehicle.speed);
    if (speed < 1.4) return 0;
    let hits = 0;
    const forward = new THREE.Vector3(-Math.sin(vehicle.yaw), 0, -Math.cos(vehicle.yaw));
    for (const rec of this.props) {
      if (!rec.alive) continue;
      const rel = _v.copy(rec.center).sub(vehicle.position);
      const along = rel.dot(forward);
      const lateral = Math.abs(rel.x * Math.cos(vehicle.yaw) - rel.z * Math.sin(vehicle.yaw));
      if (along > -vehicle.def.length * 0.55 && along < vehicle.def.length * 0.55 && lateral < vehicle.def.width * 0.62) {
        this.destroyProp(rec, rec.center.clone(), forward, { attacker: vehicle });
        hits++;
      }
    }
    if (hits) vehicle.onCrush?.(hits);
    return hits;
  }

  /* ------------------------------------------------------------------ update */

  update(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.ttl -= dt;
      if (d.ttl <= 0.8) {
        const s = Math.max(0, d.ttl / 0.8);
        d.mesh.scale.setScalar(s);
        if (d.link?.body?.isValid?.()) {
          d.link.body.setEnabled?.(false);
        }
      }
      if (d.ttl <= 0) this._removeDebris(i);
    }
    if (this.pendingBlasts.length) {
      for (let i = this.pendingBlasts.length - 1; i >= 0; i--) {
        const b = this.pendingBlasts[i];
        b.delay -= dt;
        if (b.delay > 0) continue;
        this.pendingBlasts.splice(i, 1);
        if (this._blastDepth > 3) continue;
        this._blastDepth++;
        this.game.explode(b.pos, b.owner, { radius: b.radius, damage: b.power * 0.6, scale: 1.0 });
        this._blastDepth--;
      }
    }
    // Structures that have been hit keep a thin haze of dust from their holes.
    for (const st of this.structures) {
      if (!st.alive) continue;
      if (st.hp > st.maxHp * 0.55) continue;
      st.smokeT -= dt;
      if (st.smokeT > 0) continue;
      st.smokeT = 0.9 + Math.random() * 0.8;
      if (this.game.player && Math.hypot(st.x - this.game.player.position.x, st.z - this.game.player.position.z) < 55) {
        this.game.effects?.smokeScreen(new THREE.Vector3(st.x, st.gy + st.h * 0.7, st.z), 0.5);
      }
    }
  }

  dispose() {
    for (const d of this.debris) {
      d.link && this.physics.removeDynamic(d.link);
      d.mesh.removeFromParent();
      d.mesh.geometry.dispose();
    }
    this.debris.length = 0;
    this.props.length = 0;
    this.structures.length = 0;
    this.pendingBlasts.length = 0;
    this._propColliders.clear();
  }
}
