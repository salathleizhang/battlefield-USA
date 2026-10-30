import * as THREE from 'three';
import { rand, pick } from '../core/MathUtil.js';

/**
 * Distant battle dressing: artillery flashes beyond the playable area, tracer arcs,
 * flak bursts and wandering smoke. Keeps the horizon alive without costing AI budget.
 */
export class Atmosphere {
  constructor(game) {
    this.game = game;
    this.timer = 1.2;
    this.tracerTimer = 2.5;
    this.flakTimer = 6;
    this.tracers = [];
    this.puffs = [];
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
  }

  update(dt) {
    this.timer -= dt;
    this.tracerTimer -= dt;
    this.flakTimer -= dt;
    if (this.timer <= 0) {
      this.timer = rand(2.4, 5.5);
      this.artillery();
    }
    if (this.tracerTimer <= 0) {
      this.tracerTimer = rand(1.6, 3.8);
      this.tracerArc();
    }
    if (this.flakTimer <= 0) {
      this.flakTimer = rand(4, 9);
      this.flak();
    }
    this._updateFx(dt);
  }

  _battlePoint(minD = 110, maxD = 330, high = false) {
    const p = this.game.player?.position || new THREE.Vector3();
    const a = rand(0, Math.PI * 2);
    const d = rand(minD, maxD);
    const x = p.x + Math.cos(a) * d;
    const z = p.z + Math.sin(a) * d;
    const b = this.game.level?.bounds;
    const cx = b ? Math.max(b.minX + 20, Math.min(b.maxX - 20, x)) : x;
    const cz = b ? Math.max(b.minZ + 20, Math.min(b.maxZ - 20, z)) : z;
    const y = this.game.level?.groundHeight(cx, cz) ?? 0;
    return new THREE.Vector3(cx, y + (high ? rand(14, 46) : rand(1, 4)), cz);
  }

  artillery() {
    const pos = this._battlePoint(120, 320);
    const scale = rand(1.6, 3.6);
    const dist = this.game.player ? this.game.player.position.distanceTo(pos) : 200;
    this.game.audio.explosion(dist * 0.85, rand(-0.7, 0.7));
    const tex = this.game.effects.tex.flash;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: 0xffc27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95,
    }));
    s.position.copy(pos);
    s.scale.setScalar(scale * 4);
    this.game.worldGroup.add(s);
    this.puffs.push({ sprite: s, life: 0.22, max: 0.22, grow: 2.2 });
    // Black smoke column.
    const smoke = this.game.effects.tex.smoke;
    for (let i = 0; i < 2; i++) {
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smoke, color: 0x3a3832, transparent: true, depthWrite: false, opacity: 0.5,
      }));
      sm.position.copy(pos).add(new THREE.Vector3(rand(-4, 4), rand(2, 10), rand(-4, 4)));
      sm.scale.setScalar(scale * 8);
      this.game.worldGroup.add(sm);
      this.puffs.push({ sprite: sm, life: rand(2.5, 4.5), max: 4.5, grow: 1.5, rise: rand(1, 2.5) });
    }
  }

  tracerArc() {
    const a = this._battlePoint(90, 260, true);
    const b = this._battlePoint(90, 260, true);
    if (a.distanceTo(b) > 260) return;
    const geo = new THREE.CylinderGeometry(0.16, 0.16, 1, 4, 1, true);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: pick([0xffb45a, 0xff8a3a, 0xffe0a0]), transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(a);
    const dir = b.clone().sub(a);
    mesh.scale.set(1, dir.length(), 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.game.worldGroup.add(mesh);
    this.tracers.push({ mesh, life: 0.12, max: 0.12 });
  }

  flak() {
    const pos = this._battlePoint(150, 300, true);
    pos.y += rand(25, 55);
    for (let i = 0; i < 3; i++) {
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.game.effects.tex.smoke, color: 0x232323, transparent: true, depthWrite: false, opacity: 0.7,
      }));
      sm.position.copy(pos).add(new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)));
      sm.scale.setScalar(rand(2.5, 5));
      this.game.worldGroup.add(sm);
      this.puffs.push({ sprite: sm, life: rand(2, 3.5), max: 3.5, grow: 2, rise: 0.6 });
    }
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.game.effects.tex.flash, color: 0xffd2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    fl.position.copy(pos);
    fl.scale.setScalar(rand(2, 4));
    this.game.worldGroup.add(fl);
    this.puffs.push({ sprite: fl, life: 0.12, max: 0.12, grow: 1.6 });
    this.game.audio.explosion(200, rand(-0.8, 0.8));
  }

  _updateFx(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / t.max) * 0.8;
      if (t.life <= 0) {
        t.mesh.removeFromParent();
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      const k = 1 - p.life / p.max;
      p.sprite.scale.setScalar(p.sprite.scale.x * (1 + (p.grow || 1) * dt * 0.8));
      p.sprite.material.opacity = Math.max(0, (1 - k) * 0.75);
      if (p.rise) p.sprite.position.y += p.rise * dt;
      if (p.life <= 0) {
        p.sprite.removeFromParent();
        p.sprite.material.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const t of this.tracers) { t.mesh.removeFromParent(); t.mesh.geometry.dispose(); t.mesh.material.dispose(); }
    for (const p of this.puffs) { p.sprite.removeFromParent(); p.sprite.material.dispose(); }
    this.tracers.length = 0;
    this.puffs.length = 0;
  }
}
