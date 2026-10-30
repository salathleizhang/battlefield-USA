import * as THREE from 'three';
import { Particles } from './Particles.js';
import { makeFlameMaterial } from './flame.js';
import { rand } from '../core/MathUtil.js';

const MAX_FIRES = 24;
const LIGHT_POOL = 4;

/** Cheap fallback if the CC0 smoke atlas failed to load. */
function fallbackSmoke() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  rg.addColorStop(0, 'rgba(255,255,255,0.6)');
  rg.addColorStop(0.5, 'rgba(255,255,255,0.24)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Living battlefield ambience: every `Level.fire()` becomes a shader-flame cluster with a
 * smoke plume, rising embers and a flickering warm light; every `smokeColumn()` becomes a
 * thick, wind-blown plume. Smoke uses the reference project's CC0 WispySmoke flipbook.
 *
 * Budget: three particle draws + one instanced flame draw + four point lights.
 */
export class Ambience {
  constructor(game) {
    this.game = game;
    this.scene = game.worldGroup;
    this.camera = game.renderer.camera;
    this.quality = game.settings?.quality ?? 2;
    this.time = 0;
    this.enabled = true;
    this.windBase = new THREE.Vector3(2.2, 0, 0.9);
    this.wind = this.windBase.clone();
    this.light = {
      ambient: new THREE.Color(0x808080),
      sun: new THREE.Color(1, 0.82, 0.62),
      sunDir: new THREE.Vector3(0.4, 0.6, 0.7).normalize(),
    };
    this._updateLight();
    this._frame = 0;
    this._lightT = 0;

    const vfx = game.materials?.vfx || {};
    const smokeTex = vfx.smoke || fallbackSmoke();
    this.smoke = new Particles(this.scene, {
      max: 720, texture: smokeTex, atlas: vfx.smoke ? 8 : 1, lit: true, sort: true, fogScale: 1, nearFade: 1.2,
    });
    if (vfx.smoke) this.smoke.setAtlas(vfx.smoke, 8, true);
    this.embers = new Particles(this.scene, {
      max: 380, texture: this._glowTex(), additive: true, stretch: 0.06, fogScale: 1, nearFade: 1.4,
    });
    // Photoreal flame flipbook (Unity Labs Flame03, CC0): billowing tongues on top of the shader cards.
    this.useFlipFlames = !!vfx.flame;
    this.flameP = new Particles(this.scene, {
      max: 620, texture: vfx.flame || this._glowTex(), atlas: 16, additive: true, flipbook: true,
      fogScale: 1, nearFade: 0.7, renderOrder: 13,
    });
    if (vfx.flame) this.flameP.setAtlas(vfx.flame, 16, false, 4, 2.0);

    // Fire sites (capped by importance) with deterministic flame card layouts.
    const sites = (this.game.level?.fireSites || []);
    const sorted = sites.slice().sort((a, b) => (b.scale || 1) - (a.scale || 1)).slice(0, MAX_FIRES);
    this.sites = sorted.map((site, i) => this._makeSite(site, i));
    this.smokeSites = (this.game.level?.smokeSites || []).slice(0, 32).map((s) => ({
      pos: s.pos.clone(),
      scale: s.scale || 1,
      acc: Math.random(),
      phase: Math.random() * 100,
    }));

    this._buildFlames();
    this._buildLights();
    this._updateLight(true);

    // Pre-roll the plumes so the first frame already has established smoke.
    for (let i = 0; i < 34; i++) this.update(0.18, true);
  }

  _makeSite(site, i) {
    const pos = site.pos.clone();
    const scale = site.scale || 1;
    const h = 1.7 * scale;
    const cards = [
      { ox: 0, oz: 0, w: 1.0 * scale, hh: h, k: 1.0 },
      { ox: 0.26 * scale, oz: 0.16 * scale, w: 0.55 * scale, hh: h * 0.66, k: 0.8 },
      { ox: -0.2 * scale, oz: -0.14 * scale, w: 0.5 * scale, hh: h * 0.55, k: 0.75 },
    ];
    return {
      pos,
      scale,
      h,
      cards,
      lightPos: pos.clone().add(new THREE.Vector3(0, 0.9 * scale, 0)),
      intensity: 95 * scale,
      distance: 26 * scale,
      phase: (i * 1.7) % 10,
      smokeAcc: Math.random(),
      emberAcc: Math.random(),
      burstT: rand(4, 10),
      smokeColor: [0.07, 0.065, 0.06],
      smokeEnd: [0.17, 0.16, 0.15],
      smokeSize: 0.9 * scale,
      rate: 1.1 + 0.6 * scale,
      smokeAt: pos.clone().add(new THREE.Vector3(0, h * 0.92, 0)),
    };
  }

  _glowTex() {
    if (this._glow) return this._glow;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.35, 'rgba(255,214,150,0.8)');
    rg.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    this._glow = new THREE.CanvasTexture(c);
    this._glow.colorSpace = THREE.SRGBColorSpace;
    return this._glow;
  }

  _buildFlames() {
    const MAX = 32 * 3;
    const geo = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1, 1, 4);
    plane.translate(0, 0.5, 0);
    geo.index = plane.index;
    geo.setAttribute('position', plane.attributes.position);
    geo.setAttribute('uv', plane.attributes.uv);
    this.fBase = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.fSize = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    geo.setAttribute('iBase', this.fBase);
    geo.setAttribute('iSize', this.fSize);
    geo.instanceCount = 0;
    this.flameGeo = geo;
    this.flameMat = makeFlameMaterial();
    this.flameMesh = new THREE.Mesh(geo, this.flameMat);
    this.flameMesh.frustumCulled = false;
    this.flameMesh.renderOrder = 11;
    this.flameMesh.visible = !this.useFlipFlames;
    this.scene.add(this.flameMesh);

    let n = 0;
    for (const s of this.sites) {
      for (const c of s.cards) {
        if (n >= MAX) break;
        const seed = Math.random() * 10;
        this.fBase.setXYZ(n, s.pos.x + c.ox, s.pos.y, s.pos.z + c.oz);
        this.fSize.setXYZW(n, c.w * 1.6, c.hh * 1.35, c.k, seed);
        n++;
      }
    }
    this.fBase.needsUpdate = this.fSize.needsUpdate = true;
    this.flameGeo.instanceCount = n;
  }

  _buildLights() {
    this.lights = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xff7a30, 0, 20, 1.8);
      l.castShadow = false;
      this.scene.add(l);
      this.lights.push(l);
    }
  }

  _updateLight(force = false) {
    const L = this.light, scene = this.scene;
    if (scene.fog) L.ambient.copy(scene.fog.color).multiplyScalar(0.8);
    const sun = this.game.renderer?.sun;
    if (sun) {
      L.sun.copy(sun.color).multiplyScalar(Math.min(sun.intensity, 5) * 0.3);
      L.sunDir.copy(sun.position).sub(sun.target?.position || new THREE.Vector3()).normalize();
    }
    if (force) this._lightDirty = true;
  }

  /** Pick the four fires nearest the camera for the real point-light pool. */
  _assignLights() {
    const cam = this.camera.position;
    const near = this.sites
      .map((s) => ({ s, d: s.lightPos.distanceToSquared(cam) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, LIGHT_POOL);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const hit = near[i];
      if (!hit) { l.intensity = 0; l.visible = false; continue; }
      l.visible = true;
      l.position.copy(hit.s.lightPos);
      l.distance = hit.s.distance;
      l.userData.site = hit.s;
    }
  }

  update(dt, prewarm = false) {
    if (!this.enabled && !prewarm) return;
    this.time += dt;
    const t = this.time;
    const gust = 1 + 0.35 * Math.sin(t * 0.21) + 0.2 * Math.sin(t * 0.73 + 1.3) + 0.1 * Math.sin(t * 1.9);
    const head = Math.sin(t * 0.05) * 0.25;
    this.wind.copy(this.windBase).applyAxisAngle(new THREE.Vector3(0, 1, 0), head).multiplyScalar(gust);

    this.flameMat.uniforms.time.value = t;
    this.flameMat.uniforms.wind.value.copy(this.wind);
    this._updateLight();
    this._frame++;
    if (this._frame % 30 === 0) this._assignLights();

    const cam = this.camera.position;
    for (const s of this.sites) {
      const d = s.lightPos.distanceTo(cam);
      const near = prewarm || d < 90;
      // Flame light flicker.
      const fl = 0.78 + 0.12 * Math.sin(t * 9.1 + s.phase) + 0.08 * Math.sin(t * 23.7 + s.phase * 2) + 0.07 * (Math.random() - 0.5);
      for (const l of this.lights) {
        if (l.userData.site === s) {
          l.intensity = s.intensity * fl;
          l.position.set(s.lightPos.x + Math.sin(t * 5.3 + s.phase) * 0.12, s.lightPos.y + Math.sin(t * 7.1) * 0.1, s.lightPos.z + Math.cos(t * 4.7 + s.phase) * 0.12);
        }
      }
      if (!near) continue;
      // Flame flipbook particles (billowing tongues).
      if (this.useFlipFlames) {
        s.flameAcc = (s.flameAcc || 0) + dt * (8 + s.scale * 9) * (this.quality >= 2 ? 1 : 0.55);
        s.flameAcc = Math.min(s.flameAcc, 20);
        while (s.flameAcc >= 1) {
          s.flameAcc -= 1;
          const c = s.cards[(Math.random() * s.cards.length) | 0];
          const size = s.h * rand(0.35, 0.55);
          const v = rand(0.85, 1.15) * c.k;
          this.flameP.spawn({
            x: s.pos.x + c.ox + rand(-0.25, 0.25) * c.w,
            y: s.pos.y + size * 0.6 + rand(0, 0.15) * s.h,
            z: s.pos.z + c.oz + rand(-0.25, 0.25) * c.w,
            vx: rand(-0.15, 0.15), vy: rand(0.35, 0.9) * s.h, vz: rand(-0.15, 0.15),
            life: rand(0.45, 0.8) * (0.55 + s.h * 0.2), size0: size, size1: size * rand(0.55, 0.8),
            rot: rand(-0.18, 0.18), rotV: rand(-0.4, 0.4), alpha: 0.9, fadeIn: 0.12,
            color: [2.3 * v, 1.95 * v, 1.65 * v], color1: [1.5 * v, 0.62 * v, 0.28 * v], colorSpan: 1,
            frame: (Math.random() * 64) | 0, frameRate: rand(22, 30), gravity: -s.h * 0.9, drag: 0.8, wind: 0.35,
          });
        }
      }
      // Smoke: rolls off the flame tip, wind-blown and expanding.
      s.smokeAcc += dt * s.rate * (this.quality >= 2 ? 1 : 0.7);
      s.smokeAcc = Math.min(s.smokeAcc, 6);
      while (s.smokeAcc >= 1) {
        s.smokeAcc -= 1;
        const a = s.smokeAt;
        this.smoke.spawn({
          x: a.x + rand(-0.3, 0.3) * s.scale, y: a.y + rand(-0.2, 0.3), z: a.z + rand(-0.3, 0.3) * s.scale,
          vx: rand(-0.25, 0.25), vy: rand(1.5, 2.5), vz: rand(-0.25, 0.25),
          life: rand(8, 14), size0: 0.6 * s.scale, size1: rand(5, 8.5) * s.scale, alpha: rand(0.5, 0.72), fadeIn: 0.04,
          color: s.smokeColor, color1: s.smokeEnd, colorSpan: 0.6,
          emissive: [0.9, 0.3, 0.07], emissiveSpan: 0.035,
          drag: 0.18, gravity: -0.05, wind: 0.9, turb: 0.25, rotV: rand(-0.25, 0.25),
        });
      }
      // Embers.
      s.emberAcc += dt * (2.2 + s.scale * 2.2) * (this.quality >= 2 ? 1 : 0.5);
      s.emberAcc = Math.min(s.emberAcc, 8);
      s.burstT -= dt;
      let burst = 0;
      if (s.burstT <= 0) { s.burstT = rand(4, 10); burst = (10 + Math.random() * 12) | 0; }
      while (s.emberAcc >= 1 || burst > 0) {
        if (burst > 0) burst--; else s.emberAcc -= 1;
        const c = s.cards[(Math.random() * s.cards.length) | 0];
        this.embers.spawn({
          x: s.pos.x + c.ox + rand(-0.3, 0.3) * c.w, y: s.pos.y + rand(0.2, 0.7) * s.h, z: s.pos.z + c.oz + rand(-0.3, 0.3) * c.w,
          vx: rand(-0.6, 0.6) * (burst > 0 ? 2 : 1), vy: rand(1.2, 3.2) * (burst > 0 ? 1.5 : 1), vz: rand(-0.6, 0.6) * (burst > 0 ? 2 : 1),
          life: rand(1.4, 3.6), size0: rand(0.012, 0.026), alpha: 1,
          color: [4.5, rand(1.2, 2.0), 0.35], drag: 0.6, gravity: -0.15, wind: 0.8, turb: 2.4,
        });
      }
    }

    // Skyline / wreck plumes.
    for (const s of this.smokeSites) {
      s.acc += dt * (0.9 + 0.7 * s.scale) * (this.quality >= 2 ? 1 : 0.6);
      s.acc = Math.min(s.acc, 5);
      while (s.acc >= 1) {
        s.acc -= 1;
        this.smoke.spawn({
          x: s.pos.x + rand(-1.2, 1.2) * s.scale, y: s.pos.y + rand(-0.3, 0.5), z: s.pos.z + rand(-1.2, 1.2) * s.scale,
          vx: rand(-0.3, 0.3), vy: rand(1.1, 1.9), vz: rand(-0.3, 0.3),
          life: rand(12, 20), size0: 1.2 * s.scale, size1: rand(9, 14) * s.scale, alpha: rand(0.42, 0.6), fadeIn: 0.02,
          color: [0.11, 0.105, 0.1], color1: [0.24, 0.23, 0.22], colorSpan: 0.75,
          drag: 0.12, gravity: -0.04, wind: 1.05, turb: 0.2, rotV: rand(-0.12, 0.12),
        });
      }
    }

    this.smoke.update(dt, this.wind, this.camera, this.scene, this.light);
    this.embers.update(dt, this.wind, this.camera, this.scene, this.light);
    this.flameP.update(dt, this.wind, null, this.scene, null);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.smoke?.mesh) this.smoke.mesh.visible = on;
    if (this.embers?.mesh) this.embers.mesh.visible = on;
    if (this.flameMesh) this.flameMesh.visible = on && !this.useFlipFlames;
    if (this.flameP?.mesh) this.flameP.mesh.visible = on;
    for (const l of this.lights || []) l.visible = on;
  }

  dispose() {
    this.smoke?.dispose();
    this.embers?.dispose();
    this.flameP?.dispose();
    this.flameMesh?.removeFromParent();
    this.flameGeo?.dispose();
    this.flameMat?.dispose();
    for (const l of this.lights || []) l.removeFromParent();
    this.lights = [];
    this.sites = [];
    this.smokeSites = [];
  }
}
