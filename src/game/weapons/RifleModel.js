import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const RIFLE_URL = '/assets/models/weapons/rifle_7_62/model.gltf';

/**
 * Poly Haven "Bolt Action Rifle 7.62" (CC0 1.0).
 *
 * Returns the raw glTF scene; Type38.buildFromTemplate owns the metric normalisation,
 * sight-line origin and bolt re-parenting so the procedural and scanned rifles share
 * exactly the same animation anchors.
 */
export async function loadRifle() {
  const gltf = await new GLTFLoader().loadAsync(RIFLE_URL);
  return gltf.scene;
}
