import * as THREE from 'three';

const GEO = {
  torso: new THREE.BoxGeometry(0.42, 0.56, 0.25),
  hips: new THREE.BoxGeometry(0.36, 0.22, 0.24),
  head: new THREE.BoxGeometry(0.20, 0.23, 0.21),
  upperArm: new THREE.BoxGeometry(0.115, 0.34, 0.13),
  lowerArm: new THREE.BoxGeometry(0.10, 0.30, 0.11),
  upperLeg: new THREE.BoxGeometry(0.155, 0.40, 0.17),
  lowerLeg: new THREE.BoxGeometry(0.14, 0.40, 0.15),
  boot: new THREE.BoxGeometry(0.16, 0.12, 0.26),
  helmet: new THREE.SphereGeometry(0.155, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  cap: new THREE.BoxGeometry(0.22, 0.09, 0.22),
  rifle: new THREE.BoxGeometry(0.055, 0.075, 0.78),
  barrel: new THREE.CylinderGeometry(0.012, 0.014, 0.52, 6),
  pack: new THREE.BoxGeometry(0.30, 0.30, 0.16),
};

/**
 * Low-poly 1940s infantry: grey-cloth 八路军 (team 0) or olive US Army (team 1).
 * Built from shared geometry; ~1.8 m tall with origin at the feet.
 */
export class SoldierModel {
  constructor(team, materials) {
    this.team = team;
    this.group = new THREE.Group();
    this.time = Math.random() * 10;
    this.dead = false;
    this.deadT = 0;
    this.walkPhase = Math.random() * 6.28;

    const uni = team === 0 ? materials.get('uniformGrey') : materials.get('uniformOlive');
    const trouser = team === 0 ? materials.get('uniformBlue') : materials.get('uniformOlive');
    const skin = materials.get('skin');
    const gear = materials.get('leather');
    const metal = materials.get('gunMetal');
    const wood = materials.get('gunWood');

    const mesh = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    this.hips = mesh(GEO.hips, trouser);
    this.hips.position.y = 0.96;
    this.group.add(this.hips);

    this.torso = mesh(GEO.torso, uni);
    this.torso.position.y = 1.26;
    this.group.add(this.torso);

    // Belt and pack.
    const belt = mesh(new THREE.BoxGeometry(0.44, 0.07, 0.27), gear);
    belt.position.y = 1.02;
    this.group.add(belt);
    const pack = mesh(GEO.pack, gear);
    pack.position.set(0, 1.36, 0.20);
    this.group.add(pack);
    if (team === 0) {
      // Bedroll.
      const roll = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 7), materials.get('canvasTan'));
      roll.rotation.z = Math.PI / 2;
      roll.position.set(0, 1.55, 0.20);
      this.group.add(roll);
    }

    this.head = mesh(GEO.head, skin);
    this.head.position.y = 1.70;
    this.group.add(this.head);

    if (team === 0) {
      // 八路军布帽 + red star.
      const cap = mesh(GEO.cap, uni);
      cap.position.y = 1.84;
      this.group.add(cap);
      const star = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.012), new THREE.MeshStandardMaterial({ color: 0xa8241c, roughness: 0.95 }));
      star.position.set(0, 1.855, -0.115);
      this.group.add(star);
      const band = mesh(new THREE.BoxGeometry(0.045, 0.05, 0.012), new THREE.MeshStandardMaterial({ color: 0xa8241c, roughness: 0.95 }));
      band.position.set(-0.225, 1.30, 0);
      this.group.add(band);
    } else {
      // M1 helmet.
      const helmet = mesh(GEO.helmet, materials.get('helmetUs'));
      helmet.position.y = 1.80;
      helmet.scale.set(1.05, 1.0, 1.05);
      this.group.add(helmet);
    }

    // Arms.
    this.armL = new THREE.Group();
    this.armL.position.set(-0.265, 1.48, 0);
    const upperL = mesh(GEO.upperArm, uni);
    upperL.position.y = -0.16;
    this.armL.add(upperL);
    const lowerL = mesh(GEO.lowerArm, uni);
    lowerL.position.y = -0.45;
    this.armL.add(lowerL);
    const handL = mesh(new THREE.BoxGeometry(0.09, 0.10, 0.10), skin);
    handL.position.y = -0.62;
    this.armL.add(handL);
    this.group.add(this.armL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.265, 1.48, 0);
    const upperR = mesh(GEO.upperArm, uni);
    upperR.position.y = -0.16;
    this.armR.add(upperR);
    const lowerR = mesh(GEO.lowerArm, uni);
    lowerR.position.y = -0.45;
    this.armR.add(lowerR);
    const handR = mesh(new THREE.BoxGeometry(0.09, 0.10, 0.10), skin);
    handR.position.y = -0.62;
    this.armR.add(handR);
    this.group.add(this.armR);

    // Legs.
    this.legL = new THREE.Group();
    this.legL.position.set(-0.11, 0.92, 0);
    const uL = mesh(GEO.upperLeg, trouser);
    uL.position.y = -0.20;
    this.legL.add(uL);
    const lL = mesh(GEO.lowerLeg, team === 0 ? materials.get('canvasTan') : trouser);
    lL.position.y = -0.60;
    this.legL.add(lL);
    const bL = mesh(GEO.boot, gear);
    bL.position.set(0, -0.82, -0.03);
    this.legL.add(bL);
    this.group.add(this.legL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.11, 0.92, 0);
    const uR = mesh(GEO.upperLeg, trouser);
    uR.position.y = -0.20;
    this.legR.add(uR);
    const lR = mesh(GEO.lowerLeg, team === 0 ? materials.get('canvasTan') : trouser);
    lR.position.y = -0.60;
    this.legR.add(lR);
    const bR = mesh(GEO.boot, gear);
    bR.position.set(0, -0.82, -0.03);
    this.legR.add(bR);
    this.group.add(this.legR);

    // Rifle, held across the chest (arms posed around it).
    this.rifle = new THREE.Group();
    const stock = mesh(GEO.rifle, wood);
    stock.position.z = 0.18;
    this.rifle.add(stock);
    const barrel = mesh(GEO.barrel, metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.52;
    this.rifle.add(barrel);
    const mag = mesh(new THREE.BoxGeometry(0.045, 0.09, 0.08), metal);
    mag.position.set(0, -0.06, 0.0);
    this.rifle.add(mag);
    if (team === 0) {
      const blade = mesh(new THREE.BoxGeometry(0.01, 0.03, 0.30), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.3 }));
      blade.position.z = -0.90;
      this.rifle.add(blade);
    }
    this.rifle.position.set(0.06, 1.20, -0.28);
    this.rifle.rotation.x = 0.05;
    this.group.add(this.rifle);

    // Pose arms around the rifle.
    this.armR.rotation.set(-1.05, -0.22, -0.18);
    this.armL.rotation.set(-1.25, 0.55, 0.25);

    // Muzzle marker for effects.
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0.06, 1.23, -1.05);
    this.group.add(this.muzzle);

    this.group.userData.model = this;
  }

  setPosition(x, y, z, yaw) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
  }

  /** speed in m/s, aiming raises the rifle. */
  update(dt, speed, aiming = false, alive = true) {
    this.time += dt;
    if (!alive) {
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.65);
      this.group.rotation.z = t * Math.PI * 0.5;
      this.group.position.y -= dt * 0.4 * t;
      return;
    }
    if (this.dead) return;
    const moving = Math.min(1, speed / 4.2);
    this.walkPhase += dt * (2.2 + speed * 2.1);
    const sw = Math.sin(this.walkPhase) * 0.62 * moving;
    const sw2 = Math.cos(this.walkPhase) * 0.35 * moving;
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.armL.rotation.x = -1.25 + sw2 * 0.4;
    this.armR.rotation.x = -1.05 - sw2 * 0.25;
    this.torso.position.y = 1.26 + Math.abs(Math.sin(this.walkPhase)) * 0.025 * moving;
    this.hips.position.y = 0.96 + Math.abs(Math.sin(this.walkPhase)) * 0.02 * moving;

    if (aiming) {
      this.rifle.rotation.x = -0.02;
      this.armR.rotation.x = -1.38;
      this.armL.rotation.x = -1.44;
    } else {
      this.rifle.rotation.x = 0.05;
    }
    // Idle breathing.
    if (moving < 0.05) {
      this.torso.position.y = 1.26 + Math.sin(this.time * 1.7) * 0.008;
    }
  }

  setDead() {
    this.dead = true;
    this.deadT = 0;
  }
}
