import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp } from '../../core/MathUtil.js';

const BASE = '/assets/models/chars/';
const V2 = BASE + 'v2/';
const TARGET_HEIGHT = 1.83;

/** Camera-space clip split: hips belong to the lower body, everything above the waist to the upper. */
const UPPER = /(Spine|Neck|Head|Shoulder|Arm|Hand|ForeArm)/i;

function splitClip(clip, upper) {
  if (!clip) return null;
  const tracks = clip.tracks.filter((t) => {
    const bone = t.name.split('.')[0];
    if (bone.includes('Hips')) return !upper;
    return upper ? UPPER.test(bone) : !UPPER.test(bone);
  });
  return new THREE.AnimationClip(clip.name + (upper ? '_up' : '_lo'), clip.duration, tracks);
}

/** Merge skinned sub-meshes that share a skeleton + material into one draw call each. */
function mergeByMaterial(scene) {
  const groups = new Map();
  scene.traverse((o) => {
    if (o.isSkinnedMesh && !Array.isArray(o.material)) {
      const key = `${o.material.uuid}|${o.skeleton.bones[0].uuid}|${o.skeleton.bones.length}|${o.parent.uuid}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const base = list[0];
    if (!list.every((m) => m.bindMatrix.equals(base.bindMatrix) && m.matrix.equals(base.matrix))) continue;
    const names = Object.keys(base.geometry.attributes).sort().join();
    if (!list.every((m) => Object.keys(m.geometry.attributes).sort().join() === names)) continue;
    // BufferGeometryUtils keeps this cheap; no merging when the primitives differ in layout.
    if (!THREE.BufferGeometryUtils) continue;
  }
}

// ---------------------------------------------------------------------------------------------
// Materials — ported from Ironline's Character.js. Flat, textureless meshes get their life from an
// object-space triplanar detail tile (twill weave, macro blotching, scratches), a dust gradient up
// the legs and a rest-pose cavity term, all injected into MeshStandardMaterial.
// ---------------------------------------------------------------------------------------------
let _detailTex = null;
function detailTex() {
  if (_detailTex) return _detailTex;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  let s = 1337;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const P = 64;
  const lat = new Float32Array(P * P);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const vn = (x, y, f) => {
    const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const L = (a, b) => lat[((b % f) + f) % f * P + ((a % f) + f) % f];
    const a = L(xi, yi), b = L(xi + 1, yi), c = L(xi, yi + 1), d = L(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const fbm = (u, v, f0, oct) => {
    let r = 0, amp = 0.5, n = 0;
    for (let o = 0; o < oct; o++) { const f = f0 << o; r += amp * vn(u * f, v * f, f); n += amp; amp *= 0.5; }
    return r / n;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = (y * N + x) * 4;
    const t = (x + y) % 8, cross = ((x >> 2) + (y >> 2)) & 1;
    const twill = 0.5 + 0.5 * Math.sin((t / 8) * Math.PI * 2) * (cross ? 1 : 0.7);
    const det = fbm(u, v, 8, 4);
    const blot = fbm(u, v, 2, 5);
    const scratch = fbm(u, v, 16, 3) ** 3;
    data[i] = Math.round(twill * 255);
    data[i + 1] = Math.round(det * 255);
    data[i + 2] = Math.round(clamp((blot - 0.5) * 1.8 + 0.5, 0, 1) * 255);
    data[i + 3] = Math.round(clamp(scratch * 3, 0, 1) * 255);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return (_detailTex = t);
}

/** [colour (linear), roughness, metalness, weave, weave scale (tiles/m), dirt] */
const PALETTES = {
  // 八路军: cool blue-grey cotton over field-grey webbing.
  0: {
    cloth: [[0.085, 0.092, 0.101], 0.88, 0, 1.0, 24, 1.0],
    webbing: [[0.115, 0.104, 0.086], 0.90, 0, 1.0, 26, 0.9],
    armour: [[0.068, 0.074, 0.084], 0.66, 0.02, 0.35, 14, 0.6],
    leather: [[0.034, 0.030, 0.026], 0.73, 0, 0.42, 35, 1.4],
    metal: [[0.120, 0.124, 0.120], 0.40, 0.78, 0.1, 40, 0.3],
    skin: [[0.300, 0.195, 0.135], 0.66, 0, 0.3, 45, 0.3],
    glass: [[0.012, 0.016, 0.016], 0.12, 0.60, 0, 1, 0],
  },
  // US Army: sun-faded olive drab.
  1: {
    cloth: [[0.068, 0.066, 0.043], 0.88, 0, 1.0, 24, 1.1],
    webbing: [[0.120, 0.108, 0.068], 0.90, 0, 1.0, 26, 1.0],
    armour: [[0.085, 0.080, 0.055], 0.64, 0.02, 0.35, 14, 0.7],
    leather: [[0.042, 0.034, 0.026], 0.72, 0, 0.45, 35, 1.4],
    metal: [[0.150, 0.155, 0.150], 0.38, 0.75, 0.1, 40, 0.3],
    skin: [[0.330, 0.210, 0.140], 0.62, 0, 0.3, 45, 0.3],
    glass: [[0.012, 0.016, 0.016], 0.12, 0.60, 0, 1, 0],
  },
};

/** The Bamen body ships eleven primitives; folding them into seven buckets keeps the silhouette and
 *  drops the per-soldier draw calls from eleven to seven (two of them share a material). */
const BUCKET = {
  Soldier_Clothes: 'cloth', Soldier_Fabric: 'webbing', Soldier_Elements: 'webbing',
  Soldier_Armor: 'armour',
  Soldier_Iron: 'metal', Soldier_Metal: 'metal',
  Soldier_Shoes: 'leather', Soldier_Boots: 'leather',
  Soldier_Flesh: 'skin', Soldier_Skin: 'skin',
  Soldier_Glass: 'glass',
};

function soldierMaterial(name, look, team) {
  const m = new THREE.MeshStandardMaterial({ name, side: THREE.FrontSide });
  const [col, rough, metal, weave, scale, dirt] = look;
  m.color.setRGB(col[0], col[1], col[2], THREE.LinearSRGBColorSpace);
  m.roughness = rough;
  m.metalness = metal;
  m.envMapIntensity = 0.85;
  m.team = team;
  const uDet = { value: new THREE.Vector4(weave, scale, dirt, metal > 0.5 ? 1 : 0) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSoldierTex = { value: detailTex() };
    sh.uniforms.uSoldierDet = uDet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRest; attribute vec3 aRestN; varying vec3 vRest; varying vec3 vRestN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest; vRestN = aRestN;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uSoldierTex; uniform vec4 uSoldierDet; varying vec3 vRest; varying vec3 vRestN;
        vec4 sTri(vec3 p, vec3 w, float s) {
          return texture2D(uSoldierTex, p.zy * s) * w.x + texture2D(uSoldierTex, p.xz * s) * w.y + texture2D(uSoldierTex, p.xy * s) * w.z;
        }
        vec3 sPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 vSigmaX = normalize(dFdx(surf_pos.xyz)); vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
          vec3 vN = surf_norm; vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
          float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
          return normalize(abs(fDet) * surf_norm - vGrad);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 sN = normalize(vRestN);
        vec3 sW = pow(abs(sN), vec3(4.0)); sW /= (sW.x + sW.y + sW.z + 1e-4);
        vec4 sFine = sTri(vRest, sW, uSoldierDet.y);
        vec4 sMacro = sTri(vRest, sW, 1.7);
        float sH = clamp(vRest.y / 1.78, 0.0, 1.0);
        float sDirt = uSoldierDet.z * smoothstep(0.42, 0.02, sH + (sMacro.g - 0.5) * 0.18) * (0.55 + 0.6 * sMacro.b);
        sDirt = clamp(sDirt, 0.0, 0.85);
        diffuseColor.rgb *= 0.9 + 0.18 * sMacro.b + 0.1 * (sFine.g - 0.5);
        diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(-0.9, 0.35, sN.y));
        diffuseColor.rgb *= 1.0 - 0.12 * uSoldierDet.x * (1.0 - sFine.r);
        float sWear = sFine.a * (1.0 - uSoldierDet.x * 0.6) * 0.6;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.6 + 0.02, sWear * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.26, 0.21, 0.15), sDirt * 0.6);
        float sHeight = (sFine.r * uSoldierDet.x + (sFine.g - 0.5) * 0.35) * 0.0035;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.9 + 0.2 * sMacro.g) + sDirt * 0.25 - sWear * 0.15, 0.06, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = sPerturb(-vViewPosition, normal, vec2(dFdx(sHeight), dFdy(sHeight)) * (uSoldierDet.w > 0.5 ? 0.3 : 1.0) * 60.0 * 0.02, faceDirection);`);
  };
  m.customProgramCacheKey = () => 'soldier' + team;
  return m;
}

/** Rest-pose (bind) object-space positions, feet at y = 0, for the triplanar detail. */
function bakeRest(root, scale, yOffset) {
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isSkinnedMesh || o.geometry.attributes.aRest) return;
    const pos = o.geometry.attributes.position;
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      o.getVertexPosition(i, v);
      v.applyMatrix4(o.matrixWorld).multiplyScalar(scale);
      arr[i * 3] = v.x;
      arr[i * 3 + 1] = v.y + yOffset;
      arr[i * 3 + 2] = v.z;
    }
    o.geometry.setAttribute('aRest', new THREE.BufferAttribute(arr, 3));
    const tmp = new THREE.BufferGeometry();
    tmp.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (o.geometry.index) tmp.setIndex(o.geometry.index);
    tmp.computeVertexNormals();
    o.geometry.setAttribute('aRestN', tmp.attributes.normal);
  });
}

const UP = new THREE.Vector3(0, 1, 0);
const _hq = new THREE.Quaternion();
const _bodyQ = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _wv = new THREE.Vector3();

/**
 * Rotation taking the rifle's own axes (barrel = grip→muzzle, up = model +Y) onto the body frame
 * (barrel +Z, up +Y). Applied in world space each frame so the barrel stays on the aim line.
 */
function weaponAlignQuat(weapon) {
  const grip = weapon.getObjectByName('kar98kgrip_r');
  const muzzle = weapon.getObjectByName('kar98kmuzzle');
  if (!grip || !muzzle) return new THREE.Quaternion();
  weapon.updateMatrixWorld(true);
  const g = grip.getWorldPosition(new THREE.Vector3());
  const m = muzzle.getWorldPosition(new THREE.Vector3());
  const zL = m.sub(g).normalize();
  const yL = new THREE.Vector3(0, 1, 0);
  yL.addScaledVector(zL, -yL.dot(zL)).normalize();
  const xL = new THREE.Vector3().crossVectors(yL, zL).normalize();
  const mL = new THREE.Matrix4().makeBasis(xL, yL, zL);
  const mD = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  return new THREE.Quaternion().setFromRotationMatrix(mD.multiply(mL.clone().invert()));
}

/**
 * Fold the body's primitives into one skinned mesh per kit bucket. They all share the rig and the
 * attribute layout, so the merge is lossless and takes ten draw calls per soldier down to six.
 */
function mergeToBuckets(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) return;
  const parent = meshes[0].parent;
  const groups = new Map();
  for (const m of meshes) {
    const bucket = BUCKET[m.material?.name || ''] || 'cloth';
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(m);
  }
  for (const [bucket, list] of groups) {
    if (list.length === 0) continue;
    const base = list[0];
    let geo = list.length === 1 ? base.geometry : mergeGeometries(list.map((m) => m.geometry), false);
    if (!geo) { for (const m of list) m.userData.bucket = bucket; continue; }
    const mesh = new THREE.SkinnedMesh(geo, base.material);
    mesh.name = 'soldier_' + bucket;
    mesh.userData.bucket = bucket;
    mesh.bind(base.skeleton, base.bindMatrix);
    mesh.bindMatrixInverse.copy(base.bindMatrixInverse);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    for (const m of list) m.removeFromParent();
  }
}

/**
 * Loads Ironline's Bamen soldier (Mixamo rig, 78 bones, 50 clips) and hands out clones.
 * Same surface as CharacterLibrary so Bot and PlayerBody do not care which one is live.
 */
export class IronlineLibrary {
  constructor(game) {
    this.game = game;
    this.ready = false;
    this.error = null;
    this.template = null;
    this.weapons = {};
    this.scale = 1;
    this._loading = null;
  }

  async load(onProgress) {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const load = (file) => new Promise((resolve, reject) => loader.load(file, resolve, undefined, reject));
      onProgress?.(0.15, '载入 1947 步兵');
      const [soldier, weapons] = await Promise.all([
        load(V2 + 'soldier.glb'),
        load(BASE + 'weapons.glb'),
      ]);

      const scene = soldier.scene;
      scene.updateMatrixWorld(true);
      mergeByMaterial(scene);

      const box = new THREE.Box3().setFromObject(scene);
      const height = Math.max(0.01, box.max.y - box.min.y);
      this.template = {
        scene,
        clips: new Map(soldier.animations.map((c) => [c.name, c])),
        height,
        scale: TARGET_HEIGHT / height,
        offsets: [],
        sockets: ['WeaponSocket', 'BackWeaponSocket', 'HeadSocket'].reduce((acc, n) => {
          const o = scene.getObjectByName(n);
          if (o) acc[n] = o;
          return acc;
        }, {}),
      };
      this.template.yOffset = -box.min.y * this.template.scale;
      this.scale = this.template.scale;
      bakeRest(scene, this.template.scale, this.template.yOffset);
      mergeToBuckets(scene);
      scene.updateMatrixWorld(true);

      const kar = weapons.scene.getObjectByName('kar98k');
      if (kar) {
        this.weapons.kar98k = kar;
        this.weaponAlign = weaponAlignQuat(kar);
      }

      onProgress?.(0.92, '绑定骨骼与材质');
      this.ready = true;
    })();
    try {
      await this._loading;
    } catch (e) {
      console.error('ironline character library failed', e);
      this.error = e;
      this.ready = false;
    }
    return this.ready;
  }

  create(team, variant = 0) {
    if (!this.ready) return null;
    return new IronlineSoldier(this, this.game, team, variant);
  }
}

class IronlineSoldier {
  constructor(library, game, team, variant) {
    this.library = library;
    this.game = game;
    this.team = team;
    this.variant = variant;
    this.alive = true;
    this.dead = false;
    this.deadT = 0;
    this.speed = 0;
    this.aiming = false;
    this.currentName = '';
    this.current = null;
    this.oneShot = null;
    this.oneShotName = '';
    this.timeScale = 1;
    this._lodT = Math.random() * 0.25;

    this.group = new THREE.Group();
    this.root = cloneSkeleton(library.template.scene);
    this.root.scale.setScalar(library.scale);
    this.group.add(this.root);

    this.materials = [];
    this._assignMaterials();
    this._tintShadow();

    this.weaponSocket = this.root.getObjectByName('WeaponSocket');
    this.weapon = null;
    this.muzzle = new THREE.Object3D();
    this.group.add(this.muzzle);
    this._mountWeapon(library.weapons.kar98k);

    const tpl = library.template;
    const pick = (...names) => names.map((n) => tpl.clips.get(n)).find(Boolean) || null;
    const C = {
      idle: pick('idle', 'ready_idle', 'aim_idle'),
      walk: pick('walk', 'ready_walk', 'aim_walk'),
      run: pick('run', 'ready_run', 'aim_run'),
      sprint: pick('sprint', 'ready_sprint', 'run'),
      aimIdle: pick('aim_idle', 'idle'),
      aimCrouch: pick('aim_crouch_idle', 'aim_idle'),
      shoot: pick('shoot', 'aim_shoot'),
      reload: pick('reload'),
      hit: pick('hit'),
      death: pick('death'),
      downed: pick('downed', 'death'),
    };
    this.clips = C;

    this.mixer = new THREE.AnimationMixer(this.root);
    this.lower = {
      idle: this._action(splitClip(C.idle, false), 1),
      walk: this._action(splitClip(C.walk, false), 0),
      run: this._action(splitClip(C.run, false), 0),
      sprint: this._action(splitClip(C.sprint, false), 0),
    };
    this.aim = this._action(splitClip(C.aimIdle, true), 1);
    this.upperShots = {
      shoot: this._action(splitClip(C.shoot, true), 0),
      reload: this._action(splitClip(C.reload, true), 0),
      hit: this._action(splitClip(C.hit, true), 0),
    };
    this.deathAction = this._action(C.death, 0);
    this._base = 'idle';
    this.lower.idle?.play();
    this.aim?.play();

    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.deathAction) return;
      if (e.action === this.oneShot) {
        this.oneShot = null;
        this._fadeUpper(true);
      }
    });
  }

  _action(clip, weight = 0) {
    if (!clip || !clip.tracks.length) return null;
    const a = this.mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(weight);
    a.play();
    a.paused = weight === 0;
    return a;
  }

  _assignMaterials() {
    const cache = new Map();
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const out = list.map((src) => {
        const bucket = o.userData.bucket || BUCKET[src?.name || ''] || 'cloth';
        const key = this.team + '|' + bucket;
        let m = cache.get(key);
        if (!m) {
          const look = PALETTES[this.team]?.[bucket] || [[0.10, 0.10, 0.10], 0.7, 0, 0.3, 25, 0.5];
          m = soldierMaterial(bucket, look, this.team);
          cache.set(key, m);
        }
        return m;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
      this.materials.push(...out);
    });
  }

  _tintShadow() {
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });
  }

  _mountWeapon(template) {
    if (!template) return;
    const w = template.clone(true);
    w.visible = true;
    w.position.set(0, 0, 0);
    w.quaternion.identity();
    w.updateMatrixWorld(true);
    // glTFLoader strips dots from node names, so the grip is `kar98kgrip_r`, not `kar98k.grip_r`.
    const grip = w.getObjectByName('kar98kgrip_r') || w.getObjectByName('kar98k.grip_r');
    const muzzle = w.getObjectByName('kar98kmuzzle') || w.getObjectByName('kar98k.muzzle');
    const gripLocal = grip ? w.worldToLocal(grip.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3();

    // The Bamen rig works in centimetres and its bones carry a ~1/110 world scale, so a rifle parented
    // straight to the hand shrinks to nothing. Mount it on a counter-scaled pivot at the palm, keeping
    // the authored WeaponSocket orientation (the socket itself sits half a metre off the hand).
    const hand = this.root.getObjectByName('mixamorigRightHand');
    this.hand = hand;
    if (!hand) return;
    const hs = hand.getWorldScale(new THREE.Vector3()).x || 1;
    const mount = new THREE.Object3D();
    mount.scale.setScalar(1 / hs);
    hand.add(mount);
    // Two pivots: the inner one rotates about the grip so the stock swings correctly.
    const pivot = new THREE.Object3D();
    pivot.position.copy(gripLocal).multiplyScalar(-1);
    mount.add(pivot);
    pivot.add(w);

    this.weaponMount = pivot;
    this.weapon = w;
    if (muzzle) this.muzzle = muzzle;
  }

  setPosition(x, y, z, yaw) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw + Math.PI;
  }

  _desiredBase() {
    if (!this.alive) return 'dead';
    if (this.speed > 5.6) return 'sprint';
    if (this.speed > 2.6) return 'run';
    if (this.speed > 0.45) return 'walk';
    return 'idle';
  }

  _fadeUpper(on) {
    const target = on ? 1 : 0;
    for (const a of Object.values(this.upperShots)) {
      if (!a) continue;
      if (target === 1) {
        a.setEffectiveWeight(0);
        a.stop();
      }
    }
    if (this.aim) {
      this.aim.enabled = true;
      this.aim.setEffectiveWeight(target);
      if (target === 1) {
        this.aim.play();
      }
    }
  }

  _playLower(name, fade = 0.25) {
    const next = this.lower[name];
    if (!next || this.current === next) return;
    const prev = this.current;
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();
    if (prev) {
      prev.crossFadeTo(next, fade, false);
    }
    // crossFadeTo drives both weights; keep the aim layer untouched.
    this.current = next;
    this.currentName = name;
  }

  playOneShotUpper(name, fade = 0.07) {
    const action = this.upperShots[name];
    if (!action) return false;
    this.aim?.setEffectiveWeight(0);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.play();
    this.oneShot = action;
    this.oneShotName = name;
    return true;
  }

  shoot() {
    if (!this.alive) return;
    this.playOneShotUpper('shoot', 0.04);
  }

  reload() {
    if (!this.alive) return;
    this.playOneShotUpper('reload', 0.1);
  }

  hit() {
    if (!this.alive) return;
    this.playOneShotUpper('hit', 0.04);
  }

  setDead() {
    if (!this.alive) return;
    this.dead = true;
    this.deadT = 0;
    this.alive = false;
    this.aiming = false;
    for (const a of Object.values(this.lower)) a?.stop();
    for (const a of Object.values(this.upperShots)) a?.stop();
    this.aim?.stop();
    const d = this.deathAction;
    if (d) {
      d.reset();
      d.setLoop(THREE.LoopOnce, 1);
      d.clampWhenFinished = true;
      d.enabled = true;
      d.setEffectiveWeight(1);
      d.play();
    }
  }

  reset() {
    this.alive = true;
    this.dead = false;
    this.deadT = 0;
    this.aiming = false;
    this.speed = 0;
    this.group.visible = true;
    this.group.rotation.set(0, this.group.rotation.y, 0);
    this.deathAction?.stop();
    for (const a of Object.values(this.upperShots)) a?.stop();
    this.aim?.reset().play();
    this.aim?.setEffectiveWeight(1);
    this.current = null;
    this._playLower('idle', 0);
  }

  update(dt, speed, aiming, alive = true) {
    this.speed = speed;
    this.aiming = !!aiming;
    this.alive = !!alive;
    this.deadT += dt;

    if (!alive) {
      this.mixer.update(dt);
      return;
    }

    const base = this._desiredBase();
    if (!this.oneShot) {
      const ts = base === 'sprint' ? clamp(speed / 6.2, 0.85, 1.3)
        : base === 'run' ? clamp(speed / 4.6, 0.8, 1.4)
          : base === 'walk' ? clamp(speed / 1.7, 0.7, 1.6)
            : 1;
      this._playLower(base, 0.22);
      const a = this.lower[base];
      if (a) a.setEffectiveTimeScale(ts);
      if (this.aim && this.aim.getEffectiveWeight() < 1) this.aim.setEffectiveWeight(1);
    }

    this.mixer.update(dt);
    this._orientWeapon();
  }

  /**
   * Point the rifle along the body's forward axis. The aim clips hold a pistol, so the hand's own
   * rotation is not a usable weapon axis; orienting in world space keeps the barrel on the aim line
   * for every clip instead of letting it swing with the wrist.
   */
  _orientWeapon() {
    const pivot = this.weaponMount;
    if (!pivot || !this.hand) return;
    this.hand.getWorldQuaternion(_hq);
    _bodyQ.setFromAxisAngle(UP, this.group.rotation.y);
    _wq.copy(_bodyQ).multiply(this.library.weaponAlign);
    pivot.quaternion.copy(_hq.invert().multiply(_wq));
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.group.removeFromParent();
    this.materials.length = 0;
  }
}
