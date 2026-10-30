import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = '/assets/models/props/';

/**
 * Scene props borrowed from the reference project (cktang88/3d-fps, Poly Haven CC0).
 * Each catalogue entry is a single-material GLB optimised for web; the loader bakes the
 * node transform into the geometry, then `flush` emits one InstancedMesh per prop, so a
 * whole map of crates and barrels costs a handful of draw calls.
 */
const CATALOG = {
  crate: { file: 'crate.glb', surface: 'wood' },
  crateWood: { file: 'crate_wood.glb', surface: 'wood', scale: 1.2 },
  barrier: { file: 'barrier.glb', surface: 'concrete', scale: 0.9 },
  barrel: { file: 'barrel.glb', surface: 'metal' },
  barrelRust: { file: 'barrel_rust.glb', surface: 'metal' },
  ammo: { file: 'ammo_box.glb', surface: 'metal', scale: 2.4 },
  jerrycan: { file: 'jerrycan.glb', surface: 'metal', scale: 0.7 },
  hydrant: { file: 'fire_hydrant/model.gltf', surface: 'metal' },
  manhole: { file: 'water_manhole_cover/model.gltf', surface: 'metal' },
};

const UP = new THREE.Vector3(0, 1, 0);

export class Props {
  constructor() {
    this.loader = new GLTFLoader();
    this.defs = new Map();
    this.pending = new Map();
    this.ready = false;
  }

  async load(onProgress) {
    const entries = Object.entries(CATALOG);
    let done = 0;
    await Promise.all(entries.map(async ([name, def]) => {
      try {
        const gltf = await this.loader.loadAsync(BASE + def.file);
        const prepared = this._prepare(gltf, def);
        if (prepared) this.defs.set(name, prepared);
      } catch (e) {
        console.warn(`[props] ${name} unavailable`, e?.message || e);
      }
      done += 1;
      onProgress?.(done / entries.length, '场景道具');
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
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
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
