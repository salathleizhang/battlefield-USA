import * as THREE from 'three';
import { rand, clamp } from '../../core/MathUtil.js';

import { WEAPONS, weaponDef } from './WeaponDefs.js';

// Back-compat: the Type 38 def used to live here.
export const TYPE38 = WEAPONS.type38;

export class Weapon {
  constructor(game, player, def = weaponDef('type38')) {
    this.game = game;
    this.player = player;
    this.def = def;
    this.id = def.id;
    this.ammo = this.def.magazine;
    this.reserve = this.def.reserve;
    this.cycleT = 0;
    this.reloadT = 0;
    this.reloadTotal = this.def.reloadTime;
    this.reloadCommitted = false;
    this.reloading = false;
    this.aiming = false;
    this.adsT = 0;
    this.spread = 0;
    this.shotIndex = 0;
    this.lastShot = -9;
    this.sprintLock = 0;
    this.equipT = 0;
    this.meleeCd = 0;
    this.grenadeCd = 0;
    this.triggerHeld = false;
    this.time = 0;
    this.shotsFired = 0;
  }

  get canFire() {
    return !this.reloading && this.cycleT <= 0 && this.ammo > 0 && this.player.alive
      && this.sprintLock <= 0 && this.equipT <= 0 && !this.player.sliding && !this.player.mantle;
  }

  mobility() { return this.player.aiming ? (this.def.adsMobility ?? 0.92) : (this.def.mobility ?? 0.97); }

  update(dt, cmd) {
    this.time += dt;
    this.aiming = !!cmd.aim && !this.player.sprinting && !this.player.sliding && !this.player.mantle;

    // Aim-down-sights blend: the sight picture settles over adsTime, not instantly.
    const wantAds = this.aiming;
    const adsRate = 1 / Math.max(0.05, this.def.adsTime);
    this.adsT = clamp(this.adsT + (wantAds ? adsRate : -adsRate * 1.3) * dt, 0, 1);

    // Sprint-to-fire lockout, so sprinting is a real commitment.
    if (this.player.sprinting) this.sprintLock = this.def.sprintToFire;
    else this.sprintLock = Math.max(0, this.sprintLock - dt);

    this.cycleT = Math.max(0, this.cycleT - dt);
    this.equipT = Math.max(0, this.equipT - dt);
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);

    // Bloom only recovers once the string pauses, so tapping resets and spraying walks off.
    if (this.time - this.lastShot > 0.12) {
      this.spread = Math.max(0, this.spread - this.def.spreadRecovery * dt);
    }
    if (this.time - this.lastShot > 0.35) this.shotIndex = Math.max(0, this.shotIndex - dt * 20);

    if (this.reloading) {
      const p = 1 - this.reloadT / this.reloadTotal;
      if (!this.reloadCommitted && p >= this.def.reloadCommit) {
        this.reloadCommitted = true;
        this._commitAmmo();
      }
      if (this.reloadT <= 0) this.finishReload();
    }

    if (cmd.reload && !this.reloading && this.ammo < this.def.magazine && this.reserve > 0) {
      this.startReload();
    }

    const wantFire = this.def.mode === 'semi' ? !!cmd.firePressed : !!cmd.fire;
    if (wantFire && this.canFire) {
      if (this.ammo === 0) this.startReload();
      else this.fire();
    } else if (wantFire && !this.reloading && this.ammo === 0 && this.reserve > 0 && this.cycleT <= 0) {
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

  /** Current cone half-angle (radians) for the next shot. */
  currentSpread() {
    const p = this.player;
    const moving = Math.min(1, Math.hypot(p.velocity.x, p.velocity.z) / 5);
    const ads = clamp(this.adsT / 0.6, 0, 1);
    const hip = this.def.spreadHip + this.spread + moving * 0.004;
    const aimed = this.def.spreadAds + this.spread * 0.45 + moving * 0.0016;
    let sp = hip + (aimed - hip) * ads;
    if (p.crouching) sp *= 0.8;
    if (!p.grounded) sp *= 1.8;
    return sp;
  }

  fire() {
    const p = this.player;
    this.ammo--;
    this.shotsFired++;
    this.cycleT = this.def.cycleTime;
    this.lastShot = this.time;

    // Bullets follow the true aim, never the visual camera layers (bob, shake, kick).
    // The punch is felt, not a hidden aim offset.
    const cp = Math.cos(p.pitch);
    const dir = new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
    const spread = this.currentSpread();
    dir.x += rand(-spread, spread);
    dir.y += rand(-spread, spread);
    dir.z += rand(-spread, spread);
    dir.normalize();

    const origin = this.game.renderer.camera.position.clone().addScaledVector(dir, 0.45);
    this.game.spawnProjectile({
      origin, dir,
      speed: this.def.velocity,
      damage: this.def.damage,
      owner: p,
      team: 0,
      kind: this.def.id,
      headshot: this.def.headshot,
    });

    // Recoil profile: a sharp first shot, a short build-up, then a settle; a slow rightward wander.
    const idx = Math.floor(this.shotIndex);
    const shape = idx === 0 ? 1.15 : idx <= 5 ? 1 + 0.05 * idx : 0.72 + 0.43 * Math.exp(-(idx - 5) / 4);
    let v = this.def.recoil * shape * rand(0.85, 1.15);
    let h = this.def.recoil * 0.45 * Math.sin(idx * 1.9 + 0.6) + rand(-0.004, 0.004);
    if (p.crouching) { v *= 0.85; h *= 0.8; }
    const moveF = Math.min(1.3, Math.hypot(p.velocity.x, p.velocity.z) / 4.7);
    v *= 1 + 0.15 * moveF;
    h *= 1 + 0.4 * moveF;
    if (!p.grounded) { v *= 1.5; h *= 1.5; }
    p.addRecoil(v, -h);
    this.shotIndex += 1;
    this.spread = Math.min(this.def.spreadMax, this.spread + this.def.spreadPerShot);

    this.game.audio.shot(this.def.id, { dist: 0 });
    this.game.alertBots(p.position, 70);
    this.game.viewmodel.onFire(this);
    this.game.effects.muzzleSmoke(origin, dir);
    this.game.hud?.shot();
  }

  /** Fresh magazine + reserve (respawn). */
  refill() {
    this.ammo = this.def.magazine;
    this.reserve = this.def.reserve;
    this.cycleT = 0;
    this.reloadT = 0;
    this.reloadCommitted = false;
    this.reloading = false;
    this.adsT = 0;
    this.spread = 0;
    this.shotIndex = 0;
    this.sprintLock = 0;
    this.equipT = 0;
  }

  startReload() {
    if (this.reloading || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadCommitted = false;
    this.reloadTotal = this.def.reloadTime;
    this.reloadT = this.reloadTotal;
    this.game.hud?.setReloading(true);
    // The charger and bolt sounds are cued by the viewmodel timeline.
  }

  _commitAmmo() {
    const need = this.def.magazine - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
  }

  cancelReload() {
    if (!this.reloading || this.reloadCommitted) return;
    this.reloading = false;
    this.reloadT = 0;
    this.game.hud?.setReloading(false);
  }

  finishReload() {
    if (!this.reloadCommitted) this._commitAmmo();
    this.reloading = false;
    this.reloadT = 0;
    this.reloadCommitted = false;
    this.game.hud?.setReloading(false);
  }

  melee() {
    this.meleeCd = 1.15;
    this.cancelReload();
    this.game.viewmodel.onMelee();
    this.game.audio.impact('flesh_heavy', 0, 0);
    const cam = this.game.renderer.camera;
    const cp = Math.cos(this.player.pitch);
    const dir = new THREE.Vector3(
      -Math.sin(this.player.yaw) * cp,
      Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw) * cp,
    );
    const worldHit = this.game.physics.raycast(cam.position, dir, 2.4,
      (1 << 0) | (1 << 1) | (1 << 2), this.player.collider);
    if (worldHit?.data?.actor && worldHit.data.actor.team !== 0) {
      this.game.damageActor(worldHit.data.actor, this.def.meleeDamage, this.player, { weapon: 'bayonet' });
    } else if (worldHit) {
      this.game.effects.impact(worldHit.point, worldHit.normal, worldHit.data.surface || 'dirt');
    }
  }
}
