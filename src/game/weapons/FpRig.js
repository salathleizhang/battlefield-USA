import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Reference-project first-person weapon rigs.
 *
 * Each `public/assets/models/fp/<id>.glb` ships the gun **and** the gloved arms already posed
 * around it, authored at K× real scale with the muzzle down -Z (see the reference's
 * docs/FP_FRAMING.md). The root carries a JSON blob in `userData.fp` with the hip framing and
 * the bore reference, so we mount the whole rig and only solve hip → ADS ourselves.
 */
export const FP_K = 2;
export const FP_IDS = ['m4a1', 'ak47', 'scarl', 'mp5a5', 'vss', 'm24', 'awm', 'shotgun', 'p226', 'm1911'];

/** Iron-sight lines measured on the source models (K-space, root-local) + per-platform tweaks. */
export const FP_TUNE = {
  default: { ironRelief: 0.26, hipPush: 1 },
  // `rail` is where an optic's base sits (K-space, root-local) — measured on the source models.
  m4a1: { ironRear: [0, 0.2498, 0.255], ironFront: [0, 0.2404, -0.505], rail: [0, 0.1786, 0.06], hipPush: 1.12 },
  ak47: { ironRear: [0, 0.1005, -0.645], ironFront: [0, 0.1005, -1.375], rail: [0, 0.0956, -0.492], hipPush: 1.05 },
  scarl: { ironRear: [0, 0.2655, 0.2311], ironFront: [0, 0.2777, -0.514], rail: [0, 0.1879, -0.058], hipPush: 1.15 },
  mp5a5: { ironRear: [0, 0.238, 0.0978], ironFront: [0, 0.254, -0.5722], rail: [0, 0.2286, -0.21], hipPush: 1.12 },
  p226: { ironRelief: 0.5, ironRear: [0, 0.1352, 0.1435], ironFront: [0, 0.1359, -0.1692], rail: [0, 0.131, 0.04], hipPush: 1.3 },
  m1911: { ironRelief: 0.5, ironRear: [0, 0.1297, 0.1299], ironFront: [0, 0.1287, -0.1954], rail: [0, 0.1281, 0.045], hipPush: 1.3 },
};

/** Optic models shipped in `models/optics/optics.glb`, with the zoom they give at the sights. */
export const OPTICS = {
  irons: { id: 'irons', name: '机械瞄具', zoom: 1 },
  reddot: { id: 'reddot', name: '红点', zoom: 1.25, node: 'MicroOptic', relief: 0.30, reticle: 'MicroReticleAnchor', scale: 0.82 },
  holo: { id: 'holo', name: '全息', zoom: 1.4, node: 'HoloOptic', relief: 0.30, reticle: 'HoloReticleAnchor', scale: 0.82 },
  acog: { id: 'acog', name: '3.5× 瞄准镜', zoom: 3.5, node: 'ScopeOptic', relief: 0.16, reticle: 'ScopeReticleAnchor', scale: 0.72 },
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

let opticsPromise = null;
/** Load (once) the shared optic models. */
export function loadOptics() {
  opticsPromise ||= loader.loadAsync('/assets/models/optics/optics.glb').then((gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = false;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) if (m) m.envMapIntensity = 1.0;
    });
    return gltf.scene;
  }).catch((e) => {
    console.warn('[fp] optics asset failed', e?.message || e);
    return null;
  });
  return opticsPromise;
}

/** Load (and cache) one FP rig. Returns null if the asset is missing. */
export async function loadFpRig(id) {
  if (cache.has(id)) return cache.get(id);
  try {
    const gltf = await loader.loadAsync(`/assets/models/fp/${id}.glb`);
    const root = gltf.scene.getObjectByName(`FP_${id}`) || gltf.scene;
    let meta = {};
    try { meta = JSON.parse(root.userData?.fp || '{}'); } catch { /* keep defaults */ }
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const marker = (n) => {
      const o = root.getObjectByName(n);
      return o ? o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) : null;
    };
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = false;
      o.receiveShadow = false;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) if (m) m.envMapIntensity = 1.0;
    });
    const magazine = root.getObjectByName('Magazine') || null;
    const charging = root.getObjectByName('ChargingHandle') || null;
    const rig = {
      id,
      root,
      meta,
      magazine,
      charging,
      magHome: magazine ? magazine.position.clone() : null,
      chargeHome: charging ? charging.position.clone() : null,
      muzzle: marker('MuzzleSocket'),
      gripR: marker('GripR'),
      gripL: marker('GripL'),
      tune: { ...FP_TUNE.default, ...(FP_TUNE[id] || {}) },
    };
    cache.set(id, rig);
    return rig;
  } catch (e) {
    console.warn(`[fp] ${id} rig failed to load`, e?.message || e);
    cache.set(id, null);
    return null;
  }
}

/** Hip + ADS transforms (view-camera space) for a rig, from its authored metadata. */
export function fpPoses(rig) {
  const K = rig.meta.K || FP_K;
  const scale = 1 / K;
  const D = Math.PI / 180;
  const h = rig.meta.hip || { pos: [0.06, 0.14, -0.04], rot: [0, 0, 0], boreRef: [0, 0, 0] };
  const hipRot = new THREE.Euler((h.rot?.[0] || 0) * D, (h.rot?.[1] || 0) * D, (h.rot?.[2] || 0) * D, 'YXZ');
  const bore = new THREE.Vector3(h.boreRef?.[0] || 0, h.boreRef?.[2] || 0, -(h.boreRef?.[1] || 0)).applyEuler(hipRot);
  const hipPos = new THREE.Vector3(h.pos?.[0] || 0, h.pos?.[2] || 0, -(h.pos?.[1] || 0)).sub(bore);
  hipPos.multiplyScalar(rig.tune.hipPush ?? 1);

  const rear = new THREE.Vector3(...(rig.tune.ironRear || [0, 0.2, 0.2]));
  const front = new THREE.Vector3(...(rig.tune.ironFront || [0, 0.2, -0.5]));
  const axis = front.clone().sub(rear).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 0, -1));
  const adsRot = new THREE.Euler().setFromQuaternion(q);
  const relief = rig.tune.ironRelief ?? 0.26;
  const adsPos = rear.clone().multiplyScalar(scale).applyQuaternion(q).negate()
    .add(new THREE.Vector3(0, 0, -relief));

  return { scale, hipPos, hipRot, adsPos, adsRot, muzzle: rig.muzzle };
}
