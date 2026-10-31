import * as THREE from 'three';
import { rand } from '../core/MathUtil.js';

function radialTexture(inner, outer, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.5, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Pooled combat FX: tracers, muzzle flashes, impacts, blood, explosions, smoke.
 */
export class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.worldGroup;
    this.particles = [];
    this.tracers = [];
    this.flashes = [];
    this.flipbooks = [];
    this.tex = {
      spark: radialTexture('rgba(255,250,220,1)', 'rgba(255,170,60,0.7)'),
      dust: radialTexture('rgba(190,170,135,0.85)', 'rgba(150,132,100,0.35)'),
      smoke: radialTexture('rgba(60,58,52,0.8)', 'rgba(40,38,34,0.3)'),
      blood: radialTexture('rgba(160,30,20,0.9)', 'rgba(90,15,10,0.4)'),
      flash: radialTexture('rgba(255,255,235,1)', 'rgba(255,190,90,0.8)'),
    };
    this.tracerGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 4, 1, true);
    this.tracerGeo.translate(0, 0.5, 0);
    this.tmp = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    /**
     * Explosion lights are pooled and stay in the scene forever.
     *
     * three bakes the number of VISIBLE point lights into every material's
     * program cache key, so creating one per explosion and removing it 0.3 s
     * later recompiles every lit material in the scene twice per blast — the
     * classic multi-hundred-millisecond hitch on the frame the grenade lands.
     * A fixed pool with intensity driven to zero costs a constant +2 light
     * slots in the shader and nothing else.
     */
    this.boomLights = [];
    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight(0xffa24a, 0, 60, 2);
      light.position.set(0, -500, 0);
      this.scene.add(light);
      this.boomLights.push({ light, t: 1, dur: 1, peak: 0 });
    }
  }

  /** Hand out the pool slot closest to finishing; an overlap simply steals it. */
  _boomLight(pos, scale) {
    let best = this.boomLights[0];
    for (const s of this.boomLights) if (s.t / s.dur > best.t / best.dur) best = s;
    best.t = 0;
    best.dur = 0.32;
    best.peak = 90 * scale;
    best.light.distance = 60 * scale;
    best.light.position.copy(pos);
    best.light.intensity = best.peak;
    return best;
  }

  _sprite(tex, pos, vel, size, life, color, additive = true, gravity = 0) {
    const mat = new THREE.SpriteMaterial({
      map: tex, color, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      opacity: 1,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.scene.add(s);
    const p = { sprite: s, vel: vel.clone(), life, maxLife: life, size, gravity, drag: 1.6 };
    this.particles.push(p);
    return p;
  }

  muzzleSmoke(origin, dir) {
    for (let i = 0; i < 2; i++) {
      const pos = origin.clone().addScaledVector(dir, rand(0.1, 0.8));
      this._sprite(this.tex.smoke, pos, dir.clone().multiplyScalar(rand(1, 3)).add(new THREE.Vector3(rand(-0.3, 0.3), rand(0.2, 0.7), 0)),
        rand(0.18, 0.34), rand(0.35, 0.7), 0x8d8a80, false);
    }
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex.flash, color: 0xffdd99, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    flash.position.copy(origin);
    flash.scale.setScalar(rand(0.25, 0.5));
    this.scene.add(flash);
    this.flashes.push({ sprite: flash, life: 0.06, max: 0.06 });
  }

  botMuzzle(muzzleObj, dir) {
    const pos = new THREE.Vector3();
    muzzleObj.getWorldPosition(pos);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex.flash, color: 0xffcf88, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    flash.position.copy(pos);
    flash.scale.setScalar(rand(0.35, 0.6));
    this.scene.add(flash);
    this.flashes.push({ sprite: flash, life: 0.055, max: 0.055 });
    for (let i = 0; i < 2; i++) {
      this._sprite(this.tex.smoke, pos, dir.clone().multiplyScalar(rand(0.8, 2)), 0.2, 0.6, 0x8d8a80, false);
    }
  }

  tracer(from, to, color = 0xffcf7a) {
    const dist = from.distanceTo(to);
    if (dist < 0.5) return;
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.tracerGeo, mat);
    mesh.position.copy(from);
    mesh.scale.set(1, dist, 1);
    const dir = this.tmp.subVectors(to, from).normalize();
    mesh.quaternion.setFromUnitVectors(this.up, dir);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.075, max: 0.075 });
  }

  impact(point, normal, surface = 'dirt') {
    const spark = surface === 'metal' || surface === 'concrete';
    const tex = spark ? this.tex.spark : this.tex.dust;
    for (let i = 0; i < (spark ? 7 : 5); i++) {
      const dir = normal.clone().add(new THREE.Vector3(rand(-0.7, 0.7), rand(-0.2, 0.8), rand(-0.7, 0.7))).normalize();
      this._sprite(tex, point, dir.multiplyScalar(rand(1.5, 4.5)), rand(0.06, 0.15), rand(0.25, 0.55),
        spark ? 0xffd27a : 0xb9a886, true, spark ? 9 : 3);
    }
    if (!spark) {
      this._sprite(this.tex.smoke, point, new THREE.Vector3(rand(-0.3, 0.3), rand(0.4, 1.2), rand(-0.3, 0.3)),
        rand(0.3, 0.6), rand(0.6, 1.1), 0x8f8878, false, 1.5);
    }
    this.game.audio.impact(surface, 0, 0);
  }

  blood(point, dir) {
    for (let i = 0; i < 6; i++) {
      const d = dir.clone().add(new THREE.Vector3(rand(-0.6, 0.6), rand(-0.2, 0.7), rand(-0.6, 0.6))).normalize();
      this._sprite(this.tex.blood, point, d.multiplyScalar(rand(1, 3.5)), rand(0.08, 0.2), rand(0.3, 0.6), 0x8e1e14, false, 8);
    }
  }

  explosion(pos, scale = 1) {
    this.game.audio.explosion(this.game.player ? this.game.player.position.distanceTo(pos) : 0);
    // Photoreal fireball flipbook (Unity Labs Explosion01, CC0) when available.
    const atlas = this.game.materials?.vfx?.explosion;
    if (atlas) {
      const map = atlas.clone();
      map.needsUpdate = true;
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
      map.repeat.set(1 / 5, 1 / 5);
      map.offset.set(0, 0.8);
      const mat = new THREE.SpriteMaterial({
        map, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1,
      });
      const blob = new THREE.Sprite(mat);
      blob.position.copy(pos);
      blob.scale.setScalar(7 * scale);
      this.scene.add(blob);
      this.flipbooks.push({ sprite: blob, map, life: 1.35, max: 1.35, size: 7 * scale });
    }
    // Core flash.
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.2 * scale, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd39a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    core.position.copy(pos);
    this.scene.add(core);
    this.flashes.push({ sprite: core, life: 0.18, max: 0.18, grow: 9 * scale });
    this._boomLight(pos, scale);
    for (let i = 0; i < 26 * scale; i++) {
      const d = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize();
      this._sprite(this.tex.spark, pos, d.multiplyScalar(rand(4, 16) * scale), rand(0.1, 0.3), rand(0.4, 1.0), 0xffb050, true, 12);
    }
    for (let i = 0; i < 12 * scale; i++) {
      const d = new THREE.Vector3(rand(-0.7, 0.7), rand(0.3, 1.2), rand(-0.7, 0.7));
      this._sprite(this.tex.smoke, pos.clone().add(new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1))),
        d, rand(0.8, 2.2) * scale, rand(1.6, 3.2), 0x34322c, false, 2.2);
    }
    // Shockwave ring.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.25, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.position.copy(pos);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.flashes.push({ sprite: ring, life: 0.45, max: 0.45, grow: 30 * scale, flat: true });
    if (this.game.player) {
      const d = this.game.player.position.distanceTo(pos);
      if (d < 30) this.game.player.addTrauma(Math.min(0.9, (30 - d) / 22));
    }
  }

  casing(pos, dir) {
    const geo = new THREE.CylinderGeometry(0.008, 0.008, 0.05, 5);
    const mesh = new THREE.Mesh(geo, this.game.materials.get('brass'));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.particles.push({
      sprite: mesh, vel: dir.clone().multiplyScalar(rand(1.5, 3)).add(new THREE.Vector3(rand(-0.5, 0.5), rand(1, 2), rand(-0.5, 0.5))),
      life: 0.9, maxLife: 0.9, size: 1, gravity: 14, drag: 0.6, spin: rand(-14, 14),
    });
  }

  smokeScreen(pos, scale = 1) {
    for (let i = 0; i < 8; i++) {
      this._sprite(this.tex.smoke, pos.clone().add(new THREE.Vector3(rand(-1, 1) * scale, rand(0, 1), rand(-1, 1) * scale)),
        new THREE.Vector3(rand(-0.4, 0.4), rand(0.4, 1.2), rand(-0.4, 0.4)), rand(1.5, 3) * scale, rand(2.5, 5), 0x494640, false, 1.4);
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        if (p.sprite.geometry) p.sprite.geometry.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= (p.gravity || 0) * dt;
      p.vel.multiplyScalar(1 - Math.min(0.9, p.drag * dt));
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.material.opacity = Math.max(0, p.life / p.maxLife);
      const t = 1 - p.life / p.maxLife;
      if (p.sprite.isSprite) p.sprite.scale.setScalar(p.size * (0.7 + t * 1.4));
      else if (p.spin) p.sprite.rotation.z += p.spin * dt;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / t.max) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (const b of this.boomLights) {
      if (b.t >= b.dur) { if (b.light.intensity !== 0) b.light.intensity = 0; continue; }
      b.t = Math.min(b.dur, b.t + dt);
      const k = 1 - b.t / b.dur;
      b.light.intensity = b.peak * k * k;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const t = 1 - f.life / f.max;
      if (f.grow) {
        if (f.flat) f.sprite.scale.setScalar(1 + t * f.grow);
        else f.sprite.scale.setScalar(1 + t * f.grow);
        f.sprite.material.opacity = Math.max(0, 0.9 * (1 - t));
      }
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        if (f.sprite.material) f.sprite.material.dispose();
        if (f.sprite.geometry) f.sprite.geometry.dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.flipbooks.length - 1; i >= 0; i--) {
      const b = this.flipbooks[i];
      b.life -= dt;
      const t = 1 - b.life / b.max;
      // 5x5 atlas, 25 frames: top-left to bottom-right.
      const frame = Math.min(24, Math.floor(t * 25));
      const col = frame % 5, row = (frame / 5) | 0;
      b.map.offset.set(col / 5, 1 - (row + 1) / 5);
      b.sprite.scale.setScalar(b.size * (0.55 + t * 0.8));
      b.sprite.material.opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
      if (b.life <= 0) {
        this.scene.remove(b.sprite);
        b.map.dispose();
        b.sprite.material.dispose();
        this.flipbooks.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.particles) { this.scene.remove(p.sprite); p.sprite.material?.dispose(); }
    for (const t of this.tracers) { this.scene.remove(t.mesh); t.mesh.material.dispose(); }
    for (const f of this.flashes) { this.scene.remove(f.sprite); f.sprite.material?.dispose(); }
    for (const b of this.flipbooks) { this.scene.remove(b.sprite); b.map.dispose(); b.sprite.material.dispose(); }
    this.particles.length = 0;
    this.tracers.length = 0;
    this.flashes.length = 0;
    this.flipbooks.length = 0;
  }
}
