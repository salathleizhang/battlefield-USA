import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = '/assets/models/';
const MIL = '/assets/models/military/';

/**
 * Scene props borrowed from the reference project (cktang88/3d-fps, Poly Haven CC0).
 * Each catalogue entry is a single-material GLB optimised for web; the loader bakes the
 * node transform into the geometry, then `flush` emits one InstancedMesh per prop, so a
 * whole map of crates and barrels costs a handful of draw calls.
 *
 * The `mil*` entries come from the "Military Pack Part1" Unity package. Those models were
 * authored for Unity as one shared atlas per family (sandbags, crates, tents...), so the
 * GLBs carry no texture at all: each mesh inside is named after the atlas it samples and
 * the material is built once per atlas here, then shared by every prop that uses it.
 * `scale` is applied where the source FBX was not authored in metres.
 */
const CATALOG = {
  crate: { file: 'props/crate.glb', surface: 'wood' },
  crateWood: { file: 'props/crate_wood.glb', surface: 'wood', scale: 1.2 },
  barrier: { file: 'props/barrier.glb', surface: 'concrete', scale: 0.9 },
  barrel: { file: 'props/barrel.glb', surface: 'metal' },
  barrelRust: { file: 'props/barrel_rust.glb', surface: 'metal' },
  ammo: { file: 'props/ammo_box.glb', surface: 'metal', scale: 2.4 },
  jerrycan: { file: 'props/jerrycan.glb', surface: 'metal', scale: 0.7 },
  hydrant: { file: 'props/fire_hydrant/model.gltf', surface: 'metal' },
  manhole: { file: 'props/water_manhole_cover/model.gltf', surface: 'metal' },

  /* --- 军用道具包：沙袋 / 铁丝网 / 掩体 --------------------------------- */
  sandbagWall: { file: 'military/sandbags_1a.glb', surface: 'sand' },
  sandbagLong: { file: 'military/sandbags_2.glb', surface: 'sand' },
  sandbagCorner: { file: 'military/sandbags_3.glb', surface: 'sand' },
  sandbagPit: { file: 'military/sandbags_box1.glb', surface: 'sand' },
  sandbagTower: { file: 'military/sandbags_box2.glb', surface: 'sand' },
  barbedWire: { file: 'military/barbed_wire1.glb', surface: 'metal' },
  concreteBarrier: { file: 'military/barrier_block_el1.glb', surface: 'concrete' },
  concreteBarrierShort: { file: 'military/barrier_block_el3.glb', surface: 'concrete' },
  target: { file: 'military/shooting_target.glb', surface: 'wood' },

  /* --- 营地设施 ---------------------------------------------------------- */
  guardTower: { file: 'military/guard_tower1.glb', surface: 'wood' },
  ladder: { file: 'military/ladder1.glb', surface: 'metal' },
  tentLarge: { file: 'military/tent1.glb', surface: 'sand' },
  tentCamo: { file: 'military/cammo_tent1.glb', surface: 'sand', scale: 0.55 },
  locker: { file: 'military/locker1.glb', surface: 'metal' },
  lampMast: { file: 'military/lamp_mast.glb', surface: 'metal' },
  powerpole: { file: 'military/powerpole_single.glb', surface: 'wood' },
  brickWall: { file: 'military/wall1_el2.glb', surface: 'concrete' },

  /* --- 补给 / 杂物 ------------------------------------------------------ */
  drumTall: { file: 'military/barrel1.glb', surface: 'metal' },
  drumSmall: { file: 'military/barrel2.glb', surface: 'metal' },
  ammoCrate: { file: 'military/ammo1.glb', surface: 'metal' },
  weaponBox: { file: 'military/weaponbox1.glb', surface: 'wood' },
  weaponChest: { file: 'military/weaponbox2.glb', surface: 'wood' },
  weaponCrate: { file: 'military/weaponbox3.glb', surface: 'wood' },
  fuelTank: { file: 'military/fuel_container1.glb', surface: 'metal' },
  pallet: { file: 'military/palette1.glb', surface: 'wood' },
  plankPile: { file: 'military/planks1.glb', surface: 'wood' },
  cableSpool: { file: 'military/spool1.glb', surface: 'wood' },
  dumpster: { file: 'military/trash_container1.glb', surface: 'metal' },
  bench: { file: 'military/bench1.glb', surface: 'wood' },
  table: { file: 'military/table1.glb', surface: 'wood' },
  chair: { file: 'military/chair1.glb', surface: 'wood' },
  signPost: { file: 'military/warning_pole1.glb', surface: 'metal' },
  signBoard: { file: 'military/warning1.glb', surface: 'metal' },

  /* --- 自然散件 --------------------------------------------------------- */
  rockSmall: { file: 'military/stone1.glb', surface: 'rubble' },
  rockMedium: { file: 'military/stone2.glb', surface: 'rubble' },
  rockLarge: { file: 'military/stone3.glb', surface: 'rubble' },
  rockBoulder: { file: 'military/stone4.glb', surface: 'rubble' },
  rubbleSmall: { file: 'military/debris_el1.glb', surface: 'rubble' },
  rubbleLarge: { file: 'military/debris_el2.glb', surface: 'rubble' },
};

/** 图集材质：GLB 里的网格名就是图集名，一张图集只建一个材质，所有道具共用。 */
const ATLAS_MATERIAL = {
  'sandbags1.tif': { roughness: 0.95, metalness: 0 },
  'sandbags2.tif': { roughness: 0.95, metalness: 0 },
  'sandbags3.tif': { roughness: 0.95, metalness: 0 },
  'container.tif': { roughness: 0.88, metalness: 0.1 },
  'wire2.tif': { roughness: 0.6, metalness: 0.7, side: THREE.DoubleSide },
  'barrierblocks.tif': { roughness: 0.92, metalness: 0.02 },
  'props1.tif': { roughness: 0.85, metalness: 0.05 },
  'props2.tif': { roughness: 0.78, metalness: 0.2 },
  'props3.tif': { roughness: 0.62, metalness: 0.45 },
  'props4.tif': { roughness: 0.8, metalness: 0.08 },
  'props5.tif': { roughness: 0.75, metalness: 0.15 },
  'props6.tif': { roughness: 0.9, metalness: 0.05 },
  'guard_tower.tif': { roughness: 0.87, metalness: 0.05 },
  'tent1.tif': { roughness: 0.93, metalness: 0 },
  'weapon_box1.tif': { roughness: 0.74, metalness: 0.18 },
  'weapon_box2.tif': { roughness: 0.78, metalness: 0.14 },
  'weapon_box3.tif': { roughness: 0.7, metalness: 0.25 },
  'fuel_container2.tif': { roughness: 0.58, metalness: 0.5 },
  'palette.tif': { roughness: 0.88, metalness: 0.02 },
  'stones.tif': { roughness: 0.96, metalness: 0 },
  'spool.tif': { roughness: 0.85, metalness: 0.06 },
  'trash1.tif': { roughness: 0.66, metalness: 0.42 },
  'warnings.tif': { roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide },
  'wall_01.tif': { roughness: 0.9, metalness: 0.03 },
  'brick_el1.tif': { roughness: 0.92, metalness: 0.02 },
  'cable.tif': { roughness: 0.8, metalness: 0.1 },
  'barrel2.tif': { roughness: 0.6, metalness: 0.45 },
};

const UP = new THREE.Vector3(0, 1, 0);

export class Props {
  constructor() {
    this.loader = new GLTFLoader();
    this.texLoader = new THREE.TextureLoader();
    this.defs = new Map();
    this.atlases = new Map();
    this.pending = new Map();
    this.ready = false;
  }

  /** 取一张图集贴图，建成共用的 MeshStandardMaterial。 */
  async _loadAtlas(atlas) {
    const tex = await this.texLoader.loadAsync(MIL + 'tex/' + atlas.replace(/\.tif$/, '.webp'));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const def = ATLAS_MATERIAL[atlas] || {};
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: def.roughness ?? 0.85,
      metalness: def.metalness ?? 0.1,
      side: def.side ?? THREE.FrontSide,
    });
    mat.name = 'atlas:' + atlas;
    this.atlases.set(atlas, mat);
    return mat;
  }

  async load(onProgress) {
    const entries = Object.entries(CATALOG);
    const atlasNames = Object.keys(ATLAS_MATERIAL);
    const total = entries.length + atlasNames.length;
    let done = 0;
    const step = (label) => {
      done += 1;
      onProgress?.(done / total, label);
    };

    // 图集先到：材质的建立只依赖贴图，跟模型加载并行
    await Promise.all(atlasNames.map(async (atlas) => {
      try {
        await this._loadAtlas(atlas);
      } catch (e) {
        console.warn(`[props] 图集 ${atlas} 不可用`, e?.message || e);
      }
      step('军用贴图');
    }));

    await Promise.all(entries.map(async ([name, def]) => {
      try {
        const gltf = await this.loader.loadAsync(BASE + def.file);
        const prepared = this._prepare(gltf, def);
        if (prepared) this.defs.set(name, prepared);
      } catch (e) {
        console.warn(`[props] ${name} unavailable`, e?.message || e);
      }
      step('场景道具');
    }));
    this.ready = this.defs.size > 0;
    console.info(`[props] ${this.defs.size} prop models`);
    return this.ready;
  }

  /** Bake world transforms, split by material and measure the model. */
  _prepare(gltf, def) {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const byMaterial = new Map();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      // Drop skinning / morph attributes: these props are static.
      for (const key of Object.keys(geo.attributes)) {
        if (!['position', 'normal', 'uv'].includes(key)) geo.deleteAttribute(key);
      }
      if (!geo.attributes.uv) {
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      }
      // 军用道具的 GLB 不带贴图，节点 extras 里记着它该用哪张图集。
      // 不能用 o.name：GLTFLoader 会把名字里的 '.' 当保留字符去掉。
      const atlasName = o.userData?.atlas || o.name;
      const mat = this.atlases.get(atlasName)
        || this.atlases.get(atlasName.replace(/\.tif$/, '.tif'))
        || (Array.isArray(o.material) ? o.material[0] : o.material);
      if (!byMaterial.has(mat)) byMaterial.set(mat, []);
      byMaterial.get(mat).push(geo);
    });
    if (!byMaterial.size) return null;

    const parts = [];
    const bb = new THREE.Box3();
    for (const [mat, geos] of byMaterial) {
      let geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!geo) continue;
      geo.computeBoundingBox();
      bb.union(geo.boundingBox);
      mat.envMapIntensity = 0.9;
      if (mat.map) mat.map.anisotropy = 8;
      if (mat.normalMap) mat.normalMap.anisotropy = 8;
      parts.push({ geo, mat });
    }
    if (!parts.length) return null;
    return {
      parts,
      bb,
      size: bb.getSize(new THREE.Vector3()),
      center: bb.getCenter(new THREE.Vector3()),
      surface: def.surface || 'wood',
      scale: def.scale ?? 1,
    };
  }

  has(name) {
    return this.defs.has(name);
  }

  /**
   * Queue one instance. `y` is the ground/base height (world), not the model origin:
   * the model is lifted so its lowest vertex sits exactly on it.
   * Returns world size/centre for the caller's collider, or null if unavailable.
   */
  place(name, { x, z, y = 0, rot = 0, scale = null } = {}) {
    const def = this.defs.get(name);
    if (!def) return null;
    const s = scale ?? def.scale ?? 1;
    const lift = -def.bb.min.y * s;
    const pos = new THREE.Vector3(x, y + lift, z);
    const quat = new THREE.Quaternion().setFromAxisAngle(UP, rot);
    const matrix = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(s, s, s));
    if (!this.pending.has(name)) this.pending.set(name, []);
    this.pending.get(name).push(matrix);

    const size = def.size.clone().multiplyScalar(s);
    const center = def.center.clone().multiplyScalar(s).applyAxisAngle(UP, rot).add(pos);
    return { size, center, surface: def.surface, baseY: pos.y };
  }

  /** Build the instanced meshes for everything queued since the last flush. */
  flush(scene) {
    const meshes = [];
    for (const [name, list] of this.pending) {
      const def = this.defs.get(name);
      if (!def || !list.length) continue;
      for (const part of def.parts) {
        // The level teardown disposes geometries it finds in the world group, so
        // hand every mission its own copy and keep the prototype intact.
        const mesh = new THREE.InstancedMesh(part.geo.clone(), part.mat, list.length);
        mesh.name = `prop:${name}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        for (let i = 0; i < list.length; i++) mesh.setMatrixAt(i, list[i]);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        scene.add(mesh);
        meshes.push(mesh);
      }
    }
    this.pending.clear();
    return meshes;
  }
}
