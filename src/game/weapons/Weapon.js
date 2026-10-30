import * as THREE from 'three';
import { rand, clamp } from '../../core/MathUtil.js';

export const TYPE38 = {
  id: 'type38',
  name: '三八大盖',
  fullName: '三八式步枪 · 6.5×50mm',
  kind: '栓动步枪',
  magazine: 5,
  reserve: 60,
  damage: 78,
  headshot: 2.4,
  velocity: 760,
  cycleTime: 0.78,
  reloadTime: 2.55,
  spreadHip: 0.010,
  spreadAds: 0.0011,
  recoil: 0.030,
  meleeDamage: 130,
  zeroRange: 100,
};

export class Weapon {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.def = TYPE38;
    this.ammo = this.def.magazine;
    this.reserve = this.def.reserve;
    this.cycleT = 0;
    this.reloadT = 0;
    this.reloading = false;
    this.aiming = false;
    this.meleeCd = 0;
    this.grenadeCd = 0;
    this.triggerHeld = false;
    this.time = 0;
    this.shotsFired = 0;
    this.lastFire = 0;
  }

  get canFire() {
    return !this.reloading && this.cycleT <= 0 && this.ammo > 0 && this.player.alive;
  }

  mobility() { return this.player.aiming ? 0.92 : 0.97; }

  update(dt, cmd) {
    this.time += dt;
    this.aiming = !!cmd.aim && !this.player.sprinting;
    this.cycleT = Math.max(0, this.cycleT - dt);
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);

    if (this.reloading) {
      if (this.reloadT <= 0) this.finishReload();
    }

    if (cmd.reload && !this.reloading && this.ammo < this.def.magazine && this.reserve > 0) {
      this.startReload();
    }

    if (cmd.fire && this.canFire) {
      if (this.ammo === 0) this.startReload();
      else this.fire();
    } else if (cmd.fire && !this.reloading && this.ammo === 0 && this.reserve > 0 && this.cycleT <= 0) {
      this.startReload();
    }
    this.triggerHeld = cmd.fire;

    if (cmd.melee && this.meleeCd <= 0) this.melee();
    if (cmd.grenade && this.grenadeCd <= 0) {
      this.grenadeCd = 1.4;
      this.game.throwGrenade(this.player);
    }

    // Auto-reload once the bolt is cycled on an empty magazine.
    if (this.ammo === 0 && !this.reloading && this.cycleT <= 0 && this.reserve > 0) {
      this.startReload();
    }
  }

  fire() {
    const p = this.player;
    this.ammo--;
    this.shotsFired++;
    this.cycleT = this.def.cycleTime;
    this.lastFire = this.time;

    const cam = this.game.renderer.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const spread = this.aiming ? this.def.spreadAds : this.def.spreadHip;
    const moving = Math.hypot(p.velocity.x, p.velocity.z) > 1 ? 1.6 : 1;
    dir.x += rand(-spread, spread) * moving;
    dir.y += rand(-spread, spread) * moving;
    dir.z += rand(-spread, spread) * moving;
    dir.normalize();

    const origin = cam.position.clone().addScaledVector(dir, 0.45);
    this.game.spawnProjectile({
      origin, dir,
      speed: this.def.velocity,
      damage: this.def.damage,
      owner: p,
      team: 0,
      kind: 'type38',
      headshot: this.def.headshot,
    });

    this.game.audio.shot('type38', { dist: 0 });
    this.game.viewmodel.onFire();
    p.addRecoil(this.def.recoil, rand(-0.006, 0.006));
    this.game.effects.muzzleSmoke(origin, dir);
    this.game.hud?.shot();
  }

  startReload() {
    if (this.reloading || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadT = this.def.reloadTime;
    this.game.audio.reload('clip');
    this.game.hud?.setReloading(true);
    setTimeout(() => this.game.audio.reload('clip'), 900);
    setTimeout(() => this.game.audio.bolt(), 1900);
  }

  finishReload() {
    const need = this.def.magazine - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    this.reloading = false;
    this.game.hud?.setReloading(false);
  }

  melee() {
    this.meleeCd = 1.15;
    this.game.viewmodel.onMelee();
    this.game.audio.impact('flesh', 0, 0);
    const cam = this.game.renderer.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const worldHit = this.game.physics.raycast(cam.position, dir, 2.4,
      (1 << 0) | (1 << 1) | (1 << 2), this.player.collider);
    if (worldHit?.data?.actor && worldHit.data.actor.team !== 0) {
      this.game.damageActor(worldHit.data.actor, this.def.meleeDamage, this.player, { weapon: 'bayonet' });
    } else if (worldHit) {
      this.game.effects.impact(worldHit.point, worldHit.normal, worldHit.data.surface || 'dirt');
    }
  }
}
