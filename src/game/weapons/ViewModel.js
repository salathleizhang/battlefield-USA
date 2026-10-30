import * as THREE from 'three';
import { buildType38 } from './Type38.js';
import { clamp, damp, rand } from '../../core/MathUtil.js';

const HIP = new THREE.Vector3(0.185, -0.20, -0.44);
const ADS = new THREE.Vector3(0, -0.072, -0.31);

/** First-person rifle presentation: sway, bob, ADS, bolt cycling, reload, bayonet lunge. */
export class ViewModel {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.viewScene;
    this.rig = new THREE.Group();
    this.scene.add(this.rig);

    this.gun = buildType38(game.materials);
    this.gun.position.copy(HIP);
    this.gun.rotation.set(0.015, 0.04, 0);
    this.rig.add(this.gun);
    this.gun.scale.setScalar(0.72);
    this.bolt = this.gun.userData.bolt;
    this.bayonet = this.gun.userData.bayonet;
    this.flash = this.gun.userData.flash;

    this.flashLight = new THREE.PointLight(0xffc070, 0, 6, 2);
    this.flashLight.position.set(0.1, -0.05, -0.8);
    this.scene.add(this.flashLight);

    this.ads = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.kickZ = 0;
    this.kickRot = 0;
    this.bobT = 0;
    this.flashT = 0;
    this.lunge = 0;
    this.sprintBlend = 0;
    this.reloadBlend = 0;
    this.time = 0;
    this.enabled = true;
  }

  onFire() {
    this.kickZ = 0.075;
    this.kickRot = 0.10;
    this.flashT = 0.055;
    this.flash.visible = true;
    this.flash.material.rotation = rand(0, 6.28);
    this.flash.scale.setScalar(rand(0.28, 0.42));
    this.flashLight.intensity = 6;
  }

  onMelee() { this.lunge = 1; }

  update(dt, player, weapon, look) {
    this.time += dt;
    const adsTarget = player.aiming && !weapon.reloading && !player.sprinting ? 1 : 0;
    this.ads = damp(this.ads, adsTarget, 14, dt);

    // Sway follows the look delta, lagging slightly behind.
    const sx = clamp(-look.x * 0.00022, -0.02, 0.02);
    const sy = clamp(look.y * 0.00022, -0.02, 0.02);
    this.swayX = damp(this.swayX, sx, 9, dt);
    this.swayY = damp(this.swayY, sy, 9, dt);

    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const moving = player.grounded ? Math.min(1, speed / 5) : 0;
    this.bobT += dt * (4 + speed * 1.4);
    const bobX = Math.cos(this.bobT) * 0.012 * moving * (1 - this.ads * 0.8);
    const bobY = Math.sin(this.bobT * 2) * 0.008 * moving * (1 - this.ads * 0.8);

    this.kickZ = damp(this.kickZ, 0, 13, dt);
    this.kickRot = damp(this.kickRot, 0, 12, dt);
    this.lunge = damp(this.lunge, 0, 7, dt);
    this.sprintBlend = damp(this.sprintBlend, player.sprinting ? 1 : 0, 9, dt);
    this.reloadBlend = damp(this.reloadBlend, weapon.reloading ? 1 : 0, 9, dt);

    const base = HIP.clone().lerp(ADS, this.ads);
    base.x += this.swayX + bobX;
    base.y += this.swayY + bobY;
    base.z += this.kickZ + this.lunge * 0.19;
    base.y -= this.sprintBlend * 0.10;
    base.x += this.sprintBlend * 0.03;
    base.y -= this.reloadBlend * 0.10;
    base.x -= this.reloadBlend * 0.06;
    base.z += this.lunge * 0.1;

    this.gun.position.lerp(base, 1 - Math.exp(-26 * dt));
    const rotX = 0.015 + this.kickRot - this.sprintBlend * 0.35 + this.reloadBlend * 0.42 - this.lunge * 0.25;
    const rotY = 0.04 - this.swayX * 1.6 + this.sprintBlend * 0.18;
    const rotZ = this.sprintBlend * 0.32 + this.reloadBlend * 0.35 - this.lunge * 0.12;
    this.gun.rotation.x = damp(this.gun.rotation.x, rotX, 18, dt);
    this.gun.rotation.y = damp(this.gun.rotation.y, rotY, 18, dt);
    this.gun.rotation.z = damp(this.gun.rotation.z, rotZ, 18, dt);
    // ADS yaw must stay centred for usable iron sights.
    if (this.ads > 0.6) this.gun.rotation.y *= 1 - (this.ads - 0.6) / 0.4;

    // Bolt cycle.
    const cd = weapon.cycleDuration || 0.72;
    const c = weapon.cycleT > 0 ? 1 - weapon.cycleT / cd : 0;
    let boltLift = 0, boltPull = 0;
    if (weapon.cycleT > 0 && !weapon.reloading) {
      if (c < 0.2) { boltLift = c / 0.2; boltPull = 0; }
      else if (c < 0.45) { boltLift = 1; boltPull = (c - 0.2) / 0.25; }
      else if (c < 0.7) { boltLift = 1; boltPull = 1 - (c - 0.45) / 0.25; }
      else { boltLift = 1 - (c - 0.7) / 0.3; boltPull = 0; }
    }
    this.bolt.rotation.z = damp(this.bolt.rotation.z, -1.25 * boltLift, 26, dt);
    this.bolt.position.z = damp(this.bolt.position.z, boltPull * 0.075, 26, dt);

    // Muzzle flash.
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
      else this.flashLight.intensity = 6 * (this.flashT / 0.055);
    }
  }

  setEnabled(v) { this.rig.visible = v; }
}
