import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Third-person weapon for the bots.
 *
 * The player's first-person rigs (`models/fp/<id>.glb`) contain the gun **and** the gloved arms.
 * For a bot we only want the gun: `Gun_<id>` is extracted, normalised to a real-world length and
 * pinned into the character's right hand by its authored `GripR` marker, so the AI carries the
 * same M4/AK/MP5 the player does instead of the old low-poly Kar98k.
 */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

/** Real-world length (muzzle to butt, metres) used to normalise each model. */
const LENGTH = { m4a1: 0.84, ak47: 0.88, scarl: 0.89, mp5a5: 0.52, vss: 0.89, m24: 1.10, awm: 1.24, shotgun: 0.98, p226: 0.20, m1911: 0.22 };

async function buildTemplate(id) {
  const gltf = await loader.loadAsync(`/assets/models/fp/${id}.glb`);
  const root = gltf.scene.getObjectByName(`FP_${id}`) || gltf.scene;
  const gunSrc = root.getObjectByName(`Gun_${id}`) || root;
  root.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const local = (o) => (o ? o.getWorldPosition(new THREE.Vector3()).applyMatrix4(invRoot) : null);
  const gripRoot = local(root.getObjectByName('GripR'));
  const muzzleRoot = local(root.getObjectByName('MuzzleSocket'));

  // Keep the authored transform: quantized GLBs carry their dequantisation scale on the node.
  const gun = gunSrc.clone(true);
  const holder = new THREE.Group();
  holder.add(gun);
  holder.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(holder);
  const size = bb.getSize(new THREE.Vector3());
  const s = (LENGTH[id] || 0.85) / Math.max(0.001, size.z);

  gun.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) if (m) m.envMapIntensity = 0.8;
  });

  // Grip / muzzle are already in root space (same space as the bbox above).
  const grip = gripRoot || new THREE.Vector3(0, 0, 0);
  const muzzle = muzzleRoot || new THREE.Vector3(0, 0, -size.z);

  const wrapper = new THREE.Group();
  wrapper.name = `bot_${id}`;
  wrapper.add(holder);
  // Put the grip on the wrapper origin, then scale to the real weapon length.
  holder.position.copy(grip).multiplyScalar(-1);
  wrapper.scale.setScalar(s);

  const muzzleMarker = new THREE.Object3D();
  muzzleMarker.name = 'muzzle';
  muzzleMarker.position.copy(muzzle).sub(grip);
  holder.add(muzzleMarker);

  // Hand-bone convention: fingers point down, so the grip is rotated -90° about X and the barrel
  // is yawed +90° to leave the palm along the character's forward axis (matches the reference arms).
  wrapper.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
  wrapper.scale.setScalar(1);
  return { template: wrapper, length: size.z * s };
}

/** Load (and cache) one bot gun template. */
export function loadBotGun(id) {
  if (cache.has(id)) return cache.get(id);
  const p = buildTemplate(id).catch((e) => {
    console.warn(`[botgun] ${id} failed`, e?.message || e);
    return null;
  });
  cache.set(id, p);
  return p;
}

/**
 * Give a bot the reference gun. Hides the character's own rifle; returns a promise that resolves
 * once the model is in the hand (safe to ignore).
 */
export async function equipBotGun(model, id) {
  if (!model?.handR) return null;
  const tpl = await loadBotGun(id);
  if (!tpl || !model.handR) return null;
  if (model.weapon) model.weapon.visible = false;
  if (model._botGun) model._botGun.removeFromParent();
  const gun = tpl.template.clone(true);
  model.handR.add(gun);
  model._botGun = gun;
  const muzzle = gun.getObjectByName('muzzle');
  if (muzzle) model.muzzle = muzzle;
  return gun;
}
