import * as THREE from 'three';
import { buildType38 } from './Type38.js';
import { clamp, damp, rand } from '../../core/MathUtil.js';

const HIP = new THREE.Vector3(0.15, -0.17, -0.46);
const ADS = new THREE.Vector3(0, -0.05, -0.30);

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
    this.gun.scale.setScalar(0.55);
    this.bolt = this.gun.userData.bolt;
    this.butt = this.gun.userData.butt;
    this.leftArm = this.gun.userData.leftArm;
    this.bayonet = this.gun.userData.bayonet;
    this.flash = this.gun.userData.flash;

    this.flashLight = new THREE.PointLight(0xffc070, 0, 6, 2);
    this.flashLight.position.set(0.1, -0.05, -0.8);
    this.scene.add(this.flashLight);

    // Dedicated iron-sight rig: clean sight picture, independent of the chunky viewmodel.
    this.sightRig = new THREE.Group();
    this.sightRig.visible = false;
    const sightMat = new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.55, metalness: 0.5 });
    const rearBar = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.004, 0.006), sightMat);
    rearBar.position.set(0, -0.010, -0.30);
    this.sightRig.add(rearBar);
    for (const side of [-1, 1]) {
      const prong = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.020, 0.006), sightMat);
      prong.position.set(side * 0.0115, 0.002, -0.30);
      prong.rotation.z = side * 0.10;
      this.sightRig.add(prong);
    }
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.0032, 0.024, 0.005), sightMat);
    post.position.set(0, 0.004, -0.72);
    this.sightRig.add(post);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 6, 4), new THREE.MeshStandardMaterial({ color: 0xd8b46a, roughness: 0.4, metalness: 0.6 }));
    bead.position.set(0, 0.016, -0.72);
    this.sightRig.add(bead);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.62, 10), sightMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, -0.028, -0.50);
    this.sightRig.add(barrel);
    this.scene.add(this.sightRig);

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

    // Hide the stock and forearms while aiming so the iron sights stay clean.
    const adsOn = this.ads > 0.55;
    if (this.butt) this.butt.visible = !adsOn;
    if (this.leftArm) this.leftArm.visible = !adsOn;
    this.gun.visible = !adsOn;
    this.sightRig.visible = adsOn;
    if (adsOn) {
      this.sightRig.position.set(this.swayX * 0.35, this.swayY * 0.35 + Math.sin(this.time * 1.6) * 0.0012, 0);
    }

    // Muzzle flash.
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
      else this.flashLight.intensity = 6 * (this.flashT / 0.055);
    }
  }

  setEnabled(v) { this.rig.visible = v; }
}
