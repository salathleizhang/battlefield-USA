import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { clamp } from '../../core/MathUtil.js';

const BASE = '/assets/models/chars/';
const TARGET_HEIGHT = 1.83;

/**
 * Loads the CC0 SHADOW SIX / Quaternius-rig PBR soldiers and their UAL clip library,
 * then stamps out cheap skinned clones for the battlefield.
 */
export class CharacterLibrary {
  constructor(game) {
    this.game = game;
    this.ready = false;
    this.error = null;
    this.templates = {};
    this.weapons = {};
    this.clips = [];
    this.matCache = new Map();
    this.texCache = new Map();
    this._loading = null;
  }

  async load(onProgress) {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const load = (file) => new Promise((resolve, reject) => {
        loader.load(BASE + file, resolve, undefined, reject);
      });
      onProgress?.(0.15, '载入写实士兵');
      const [china, us, us2, anims, weapons] = await Promise.all([
        load('greenberet.glb'),
        load('marine.glb'),
        load('sapper.glb'),
        load('commando_anims.glb'),
        load('weapons.glb'),
      ]);
      onProgress?.(0.9, '绑定骨骼动画');
      this.templates.china = us.scene;
      this.templates.us = us.scene;
      this.templates.us2 = us2.scene;
      this.clips = anims.animations;
      const kar = weapons.scene.getObjectByName('kar98k');
      if (kar) this.weapons.kar98k = kar;
      this.ready = true;
      onProgress?.(0.96, '士兵就绪');
    })();
    try {
      await this._loading;
    } catch (e) {
      console.error('character library failed', e);
      this.error = e;
      this.ready = false;
    }
    return this.ready;
  }

  /** Recolours a character atlas once per source texture: green kit becomes cool 八路军 grey or US olive. */
  teamMaterial(team, source) {
    const key = team + '|' + source.uuid;
    const hit = this.matCache.get(key);
    if (hit) return hit;
    const mat = source.clone();
    mat.color.setHex(0xffffff);
    mat.envMapIntensity = 1.25;
    mat.roughness = 0.88;
    mat.metalness = 0.02;
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = 0.26;
    mat.emissiveMap = mat.map;
    if (/alpha/i.test(mat.name)) {
      mat.depthWrite = false;
    } else if (mat.map) {
      const tk = team + '|' + mat.map.uuid;
      let tex = this.texCache.get(tk);
      if (!tex) {
        tex = recolourAtlas(mat.map, team);
        if (tex) this.texCache.set(tk, tex);
      }
      if (tex) { mat.map = tex; mat.emissiveMap = tex; }
    }
    mat.needsUpdate = true;
    this.matCache.set(key, mat);
    return mat;
  }

  create(team, variant = 0) {
    if (!this.ready) return null;
    let key = team === 0 ? 'china' : 'us';
    if (team === 1 && variant % 3 === 0) key = 'us2';
    return new PbrSoldier(this, this.game, this.templates[key], this.clips, this.weapons, team, variant);
  }
}

class PbrSoldier {
  constructor(library, game, template, clips, weapons, team, variant) {
    this.library = library;
    this.game = game;
    this.team = team;
    this.variant = variant;
    this.dead = false;
    this.deadT = 0;
    this.alive = true;
    this.speed = 0;
    this.aiming = false;
    this.lodT = 0;
    this.currentName = '';
    this.oneShot = null;
    this.timeScale = 1;

    this.group = new THREE.Group();
    this.root = cloneSkeleton(template);
    this.root.scale.setScalar(TARGET_HEIGHT / 1.991);
    this.group.add(this.root);

    this.lods = {};
    this.headgear = null;
    this.handR = null;
    this.head = null;
    this.spine = null;
    this.materials = [];

    this.root.traverse((o) => {
      if (o.name === 'LOD0' || o.name === 'LOD0_alpha' || o.name === 'LOD1' || o.name === 'LOD2') {
        this.lods[o.name] = o;
      }
      if (o.name === 'headgear') this.headgear = o;
      if (o.isBone && o.name === 'hand_r') this.handR = o;
      if (o.isBone && o.name === 'Head') this.head = o;
      if (o.isBone && (o.name === 'spine_03' || o.name === 'spine_3')) this.spine = o;
    });
    if (this.lods.LOD1) this.lods.LOD1.visible = false;
    if (this.lods.LOD2) this.lods.LOD2.visible = false;

    this._tintAndShadow();

    if (team === 0) {
      if (this.headgear) this.headgear.visible = false;
      this._addCap();
    } else if (this.headgear) {
      this.headgear.visible = true;
    }

    this.weapon = null;
    this.muzzle = new THREE.Object3D();
    this.group.add(this.muzzle);
    this._mountWeapon(weapons.kar98k);

    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of clips) {
      if (!clip || !clip.name) continue;
      const action = this.mixer.clipAction(clip);
      this.actions[clip.name] = action;
    }
    this._base = 'idle';
    this.play('idle', 0);
    this.mixer.addEventListener('finished', (e) => {
      if (e.action !== this.oneShot) return;
      const name = this.oneShotName;
      this.oneShot = null;
      if (name === 'die') {
        this._force('dead');
      } else {
        this.play(this._desiredBase(), 0.18);
      }
    });
  }

  _tintAndShadow() {
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const out = list.map((m) => this.library.teamMaterial(this.team, m));
      o.material = Array.isArray(o.material) ? out : out[0];
      this.materials.push(...out);
    });
  }

  _addCap() {
    if (!this.head) return;
    const capMat = new THREE.MeshStandardMaterial({ color: 0x6b7370, roughness: 0.95, metalness: 0 });
    const cap = new THREE.Group();
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.108, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), capMat);
    crown.scale.set(1, 0.86, 1.04);
    crown.position.y = 0.028;
    cap.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.109, 0.109, 0.022, 16), capMat);
    band.position.y = 0.008;
    cap.add(band);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.009, 0.075), capMat);
    brim.position.set(0, 0.012, -0.105);
    brim.rotation.x = -0.12;
    cap.add(brim);
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.024, 5), new THREE.MeshStandardMaterial({
      color: 0xb3271d, roughness: 0.68, metalness: 0,
    }));
    star.position.set(0, 0.038, -0.113);
    star.rotation.y = Math.PI;
    cap.add(star);
    cap.position.set(0, 0.055, 0.004);
    cap.rotation.x = -0.04;
    this.head.add(cap);
    cap.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.cap = cap;
  }

  _mountWeapon(weaponTemplate) {
    if (!weaponTemplate || !this.handR) return;
    const w = weaponTemplate.clone(true);
    w.visible = true;
    const grip = w.getObjectByName('kar98k.grip_r');
    const muzzle = w.getObjectByName('kar98k.muzzle');
    w.updateMatrixWorld(true);
    if (grip) {
      const gp = w.worldToLocal(grip.getWorldPosition(new THREE.Vector3()));
      w.position.copy(gp).multiplyScalar(-1);
    }
    // UAL hand bones point down the fingers; rotate the rifle so the barrel leaves the palm forward.
    w.rotation.set(-Math.PI / 2, 0, 0);
    this.handR.add(w);
    this.weapon = w;
    if (muzzle) this.muzzle = muzzle;
  }

  setPosition(x, y, z, yaw) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw + Math.PI;
  }

  _desiredBase() {
    if (!this.alive) return 'dead';
    if (this.aiming && this.speed < 0.6) return 'aim';
    if (this.speed > 4.3) return 'run';
    if (this.speed > 0.45) return 'walk';
    return 'idle';
  }

  play(name, fade = 0.2) {
    const action = this.actions[name];
    if (!action) return;
    if (this.current === action) return;
    const prev = this.current;
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(this.timeScale);
    action.fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.current = action;
    this.currentName = name;
    this.oneShot = null;
  }

  _force(name) {
    const action = this.actions[name];
    if (!action) return;
    const prev = this.current;
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    if (prev && prev !== action) prev.stop();
    this.current = action;
    this.currentName = name;
    this.oneShot = null;
  }

  playOneShot(name, fade = 0.08) {
    const action = this.actions[name];
    if (!action) return false;
    const prev = this.current;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    action.fadeIn(fade).play();
    if (prev && prev !== action) prev.fadeOut(fade);
    this.current = action;
    this.currentName = name;
    this.oneShot = action;
    this.oneShotName = name;
    return true;
  }

  shoot() {
    if (!this.alive) return;
    if (!this.playOneShot('rifle_shoot', 0.06)) this.playOneShot('shoot', 0.06);
  }

  reload() {
    if (!this.alive) return;
    this.playOneShot('reload', 0.12);
  }

  setDead() {
    this.dead = true;
    this.deadT = 0;
    this.alive = false;
    this.aiming = false;
    if (this.playOneShot('die', 0.1)) {
      // `dead` follows when the clip finishes.
    } else {
      this._force('dead');
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
    this._force('idle');
  }

  update(dt, speed, aiming, alive = true) {
    this.speed = speed;
    this.aiming = !!aiming;
    this.alive = !!alive;
    this.deadT += dt;

    if (alive) {
      const base = this._desiredBase();
      if (!this.oneShot) {
        const ts = base === 'run' ? clamp(speed / 4.6, 0.75, 1.5)
          : base === 'walk' ? clamp(speed / 1.6, 0.7, 1.6)
            : 1;
        if (this.currentName === base) this.current.setEffectiveTimeScale(ts);
        else this.play(base, 0.2);
      }
    }

    this.mixer.update(dt);

    this.lodT -= dt;
    if (this.lodT <= 0) {
      this.lodT = 0.35;
      this._updateLod();
    }
  }

  _updateLod() {
    const cam = this.game.renderer?.camera;
    if (!cam) return;
    const d = cam.position.distanceTo(this.group.position);
    const use = d < 55 ? 'LOD0' : d < 110 ? 'LOD1' : 'LOD2';
    for (const key of ['LOD0', 'LOD1', 'LOD2']) {
      if (this.lods[key]) this.lods[key].visible = key === use;
    }
    if (this.lods.LOD0_alpha) this.lods.LOD0_alpha.visible = use === 'LOD0';
    if (this.headgear) this.headgear.visible = this.team !== 0 && use === 'LOD0';
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.group.removeFromParent();
    this.materials.length = 0;
  }
}

/** Team reskin: desaturate green kit into cool grey-blue (China) or warm olive (US), leaving skin untouched. */
function recolourAtlas(source, team) {
  const img = source?.image;
  if (!img) return null;
  const w = img.width || img.videoWidth || 1024;
  const h = img.height || img.videoHeight || 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max - min;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 26) continue; // keep boots and webbing dark
    const isSkin = r > 85 && r > g * 1.06 && g >= b * 0.92 && r - b > 10;
    if (isSkin) continue;
    if (team === 0) {
      // 八路军: plain cool blue-grey cotton, lifting dark kit so it reads in shadow.
      const L = 62 + lum * 0.55;
      d[i] = L * 0.86;
      d[i + 1] = L * 0.94;
      d[i + 2] = L * 1.04;
    } else {
      // US: sun-faded olive drab.
      const L = 56 + lum * 0.58;
      d[i] = L * 1.08;
      d[i + 1] = L * 1.0;
      d[i + 2] = L * 0.8;
    }
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = source.colorSpace;
  tex.flipY = source.flipY;
  tex.wrapS = source.wrapS;
  tex.wrapT = source.wrapT;
  tex.anisotropy = source.anisotropy;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
