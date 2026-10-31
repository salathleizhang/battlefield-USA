import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../../core/MathUtil.js';

/**
 * 强渡密西西比河 — 1947.4.2
 * 110 m river, pontoon bridge (A), levee trenches (B), Baton Rouge river port (C).
 */
export function buildMississippi(L) {
  L.bounds = { minX: -260, maxX: 260, minZ: -260, maxZ: 220 };

  const height = (x, z) => {
    const d = Math.abs(z);
    if (d < 52) return -4.5;
    const bank = smoothstep(52, 82, d);
    let y = lerp(-4.5, 2.2, bank);
    if (z < 0) {
      y += smoothstep(70, 90, d) * 2.0; // north levee
      y += smoothstep(110, 160, d) * 1.4;
    } else {
      y += smoothstep(100, 160, d) * 2.6;
    }
    return y + Math.sin(x * 0.03) * 0.25;
  };

  L.addTerrain({
    size: 760, segments: 140, height, texture: 'sand', tile: 9,
    color: (x, z, y, c) => {
      if (y < 1.2) c.setHex(0x8f7c55);
      else if (z < -60) c.setHex(0x777a4e).lerp(new THREE.Color(0x5e6040), Math.random() * 0.4);
      else c.setHex(0x6e7350).lerp(new THREE.Color(0x565b40), Math.random() * 0.4);
    },
  });
  L.addWater({ y: 0, size: 1600, color: 0x8b7c5c, opacity: 0.98, rough: 0.3 });
  L.worldGround = 2.2;

  // Mud puddles on the levee and road approaches.
  for (let i = 0; i < 18; i++) {
    const x = -60 + L.rand() * 140;
    const z = -110 + L.rand() * 210;
    L.puddle(x, z, { y: height(x, z) + 0.04, r: 0.8 + L.rand() * 2.0, stretch: 0.35 + L.rand() * 0.45 });
  }

  /* --------------------------------------------------------- pontoon bridge */
  const bridgeY = 2.8;
  const zStart = -72, zEnd = 72;
  for (let z = zStart; z <= zEnd; z += 8) {
    // Plank sections.
    L.batch.box(9, 0.35, 7.7, 0, bridgeY, z, L.mats.get('wood'), { uv: 0.6 });
    if (Math.abs(z % 24) < 8) {
      L.batch.cylinder(1.5, 1.5, 8.4, 12, 0, 0.9, z, L.mats.get('rust'), { rotZ: Math.PI / 2 });
    }
    // Side ropes / rails.
    for (const side of [-1, 1]) {
      L.batch.cylinder(0.07, 0.07, 1.3, 5, side * 4.3, bridgeY + 0.7, z, L.mats.get('woodDark'));
      L.batch.box(0.1, 0.1, 8, side * 4.3, bridgeY + 1.3, z + 3.8, L.mats.get('woodDark'));
    }
  }
  L.solidBox(0, bridgeY, 0, 9, 0.35, 144, 0, { surface: 'wood' });
  // Ramps at the banks.
  for (const dir of [-1, 1]) {
    const geo = new THREE.BoxGeometry(9, 0.35, 22);
    const m = new THREE.Matrix4().makeRotationX(-dir * 0.09);
    m.setPosition(0, bridgeY - 0.4, dir * 80);
    L.batch.add(geo, L.mats.get('wood'), m);
    L.solidBox(0, bridgeY - 0.4, dir * 80, 9, 0.35, 22, 0, { surface: 'wood' });
  }
  L.sandbags(0, -76, Math.PI / 2, 9, { base: height(0, -78) });
  L.sandbags(0, 76, Math.PI / 2, 9, { base: height(0, 78) });
  L.fire(-3, bridgeY + 0.8, 12, 0.7);

  /* ----------------------------------------------------------- south bank */
  // Staging area: supply crates, artillery, moored boats.
  for (let i = 0; i < 26; i++) L.crate(-50 + Math.random() * 25, 96 + Math.random() * 40, 0.9 + Math.random() * 0.6);
  for (let i = 0; i < 10; i++) L.barrel(-30 + Math.random() * 14, 120 + Math.random() * 20);
  L.batch.box(14, 5, 10, -70, height(-70, 120) + 2.5, 120, L.mats.get('canvasTan'), { uv: 0.4 });
  L.solidBox(-70, height(-70, 120) + 2.5, 120, 14, 5, 10, 0, { surface: 'wood' });
  // Field gun.
  L.batch.cylinder(1.3, 1.3, 0.25, 12, 40, height(40, 130) + 0.6, 130, L.mats.get('metal'));
  L.batch.box(0.35, 0.35, 5.2, 40, height(40, 130) + 1.4, 127, L.mats.get('metal'), { rotX: 0.1 });
  L.batch.box(2.4, 1.1, 1.2, 40, height(40, 130) + 1.0, 131, L.mats.get('rust'));

  // Supplies around the staging tent and bunker.
  L.prop('crate', -62, 116, 0.2, { base: height(-62, 116) });
  L.prop('ammo', -62.7, 116.3, 0.2, { base: height(-62, 116), y: 0.3 });
  L.prop('barrelRust', -58, 124, 0, { base: height(-58, 124) });
  L.prop('jerrycan', -60, 121, 0.6, { base: height(-60, 121) });
  L.prop('ammo', 18.5, 92, 0.3, { base: height(18.5, 92) });

  for (let i = 0; i < 7; i++) L.palm(60 + i * 13, 150, 0.9);
  L.building({ x: -30, z: 150, w: 18, d: 12, h: 7, damage: 0.4, sign: 'FERRY' });
  L.building({ x: 10, z: 168, w: 14, d: 12, h: 8, damage: 0.2, sign: 'DEPOT' });
  L.barbedWire(-20, 90, 0, 24);
  L.bunker(24, 96, 0.2);
  L.smokeColumn(-46, 3, 120, 1.2);

  /* ----------------------------------------------------------- north bank */
  // Levee trench line.
  for (let x = -110; x <= 110; x += 18) {
    L.sandbags(x, -76, 0, 10, { base: height(x, -76) });
  }
  L.barbedWire(-60, -68, 0, 26);
  L.barbedWire(20, -68, 0, 26);
  L.batch.box(0.9, 2.6, 0.9, -30, height(-30, -84) + 1.3, -84, L.mats.get('woodDark'));
  L.batch.box(0.9, 2.6, 0.9, 34, height(34, -84) + 1.3, -84, L.mats.get('woodDark'));

  // Ammunition resupply along the levee.
  for (const x of [-90, -54, -18, 36, 72]) {
    L.prop('ammo', x, -80, 0.1, { base: height(x, -80) });
  }
  L.prop('barrelRust', 90, -80, 0, { base: height(90, -80) });

  // Cotton fields: rows of low bushes.
  for (let x = -100; x <= 80; x += 9) {
    for (let z = -160; z <= -100; z += 7) {
      const gy = height(x, z);
      L.batch.box(1.4, 0.75, 1.0, x + Math.random(), gy + 0.38, z + Math.random() * 2,
        new THREE.MeshStandardMaterial({ color: 0x9d9c72, roughness: 1 }), { uv: 0.5 });
    }
  }
  // Farmhouse & barn.
  L.building({ x: -50, z: -126, w: 15, d: 12, h: 7, damage: 0.55, flatRoof: true, sign: 'FARM' });
  L.batch.box(20, 9, 14, 40, height(40, -140) + 4.5, -140, L.mats.get('woodDark'), { uv: 0.3 });
  L.batch.box(22, 2, 16, 40, height(40, -140) + 9.8, -140, L.mats.get('rust'));
  L.solidBox(40, height(40, -140) + 4.5, -140, 20, 9, 14, 0, { surface: 'wood' });
  L.fire(40, height(40, -140) + 9, -140, 1.4);

  /* ------------------------------------------------------------- the port */
  const px = -120, pz = -150;
  const py = height(px, pz);
  // Warehouses.
  for (const [ox, oz, w, d, h] of [[0, 0, 26, 16, 11], [34, 6, 20, 14, 8], [-32, 10, 18, 12, 7]]) {
    L.building({ x: px + ox, z: pz + oz, w, d, h, flatRoof: true, damage: 0.3, material: 'brick', base: py });
  }
  L.batch.box(80, 1.0, 30, px, py + 0.4, pz - 22, L.mats.get('plaster'), { uv: 0.2 });
  L.solidBox(px, py + 0.4, pz - 22, 80, 1.0, 30, 0, { surface: 'concrete' });
  // Docks and cranes.
  for (let i = 0; i < 4; i++) {
    const cx = px - 30 + i * 24;
    L.batch.cylinder(0.4, 0.5, 16, 8, cx, py + 8, pz - 30, L.mats.get('metal'));
    L.batch.box(0.5, 0.5, 14, cx, py + 16, pz - 36, L.mats.get('metal'));
    L.batch.box(0.1, 4, 0.1, cx, py + 13.5, pz - 42, L.mats.get('metal'));
  }
  // Moored barge.
  L.batch.box(26, 3, 10, -150, 1.2, -110, L.mats.get('rust'), { uv: 0.25 });
  L.batch.box(8, 4, 6, -156, 3.5, -110, L.mats.get('metal'), { uv: 0.3 });

  // Cargo on the quay.
  L.prop('crate', -142, -168, 0.2, { base: py + 0.9 });
  L.prop('ammo', -141, -168.4, 0.2, { base: py + 0.9, y: 0.3 });
  L.prop('crateWood', -136, -172, 1.4, { base: py + 0.9 });
  L.prop('barrel', -104, -168, 0, { base: py + 0.9 });
  L.smokeColumn(-150, 4, -110, 1.6);

  // Sunk gunboat in the river.
  L.batch.box(30, 4, 8, 50, 0.6, -20, L.mats.get('metal'), { uv: 0.2, rotY: 0.4 });
  L.batch.box(8, 4, 6, 58, 3.2, -22, L.mats.get('metal'), { uv: 0.3, rotY: 0.4 });
  L.batch.cylinder(0.25, 0.3, 5, 6, 35, 3.2, -18, L.mats.get('metal'));
  L.fire(58, 4.4, -22, 1.2);
  L.smokeColumn(58, 6, -22, 1.6);

  // Trees along the banks.
  for (let i = 0; i < 14; i++) {
    const x = -170 + i * 24 + Math.random() * 8;
    const z = i % 2 ? -95 : 115;
    const gy = height(x, z);
    L.batch.cylinder(0.35, 0.55, 5, 7, x, gy + 2.5, z, L.mats.get('palmTrunk'));
    L.batch.sphere(3.2, x, gy + 6, z, L.mats.get('foliage'), 8);
    L.physics.addStaticCylinder({ x, y: gy + 2.5, z }, 2.5, 0.5, { surface: 'wood' });
  }

  // Flooded field / shell craters.
  for (let i = 0; i < 14; i++) {
    const x = -120 + Math.random() * 220;
    const z = -90 - Math.random() * 60;
    L.batch.cylinder(3 + Math.random() * 3, 4.5 + Math.random() * 3, 0.2, 12, x, height(x, z) + 0.1, z, L.mats.get('ground'), { uv: 0.5 });
  }

  /* -------------------------------------- 堤坝工事与滩头营地（Military Pack） */
  // 北岸堤顶：断续沙袋线，缺口处散着塌下来的包。
  L.wallRun('sandbags_1a', -4, -82, 0, 96, { gap: 0.36, step: 2.0 });
  L.wallRun('sandbags_2', 46, -78, 0.25, 30, { gap: 0.3, step: 3.1 });
  L.wallRun('sandbags_3', -62, -86, -0.3, 26, { gap: 0.34, step: 2.4 });
  L.scatter(['sandbags_1b', 'sandbags_1c'], 0, -84, 130, 10, 26, { solid: false, jitter: 1.4 });
  // 水线一带的铁丝网，层层叠叠。
  for (let i = 0; i < 4; i++) {
    L.wallRun('barbed_wire1', -70 + i * 46, -62 - L.rand() * 10, (L.rand() - 0.5) * 0.5,
      38, { step: 5.4, gap: 0.2, solid: false, jitter: 0.4 });
  }
  L.prop('sandbags_box1', 22, -74, 0.3);
  L.prop('sandbags_box2', -34, -80, -0.2);
  L.prop('guard_tower1', 34, -98, 0.4);
  L.prop('guard_tower1', -52, -96, -0.4);
  L.prop('shooting_target', 52, -70, 2.8);
  L.prop('shooting_target', 56, -76, 3.0);
  // 南岸出发营地：帐篷、补给、车辆，全挤在桥头。
  L.scatter(['tent1', 'cammo_tent1', 'cammo_tent2', 'cammo_tent3'], -44, 108, 34, 26, 6, { jitter: 1.4 });
  L.prop('tent1_interior', -24, 126, 0.4);
  for (const [cx, cz] of [[30, 106], [-6, 118], [16, 94]]) {
    L.scatter(['ammo1', 'weaponbox1', 'weaponbox1b', 'weaponbox2', 'weaponbox3'], cx, cz, 9, 8, 9, { jitter: 1.2 });
    L.scatter(['barrel1', 'barrel2', 'can1'], cx, cz, 9, 9, 5, { jitter: 1.2 });
    L.prop('palette1', cx + 1.8, cz + 1.4, L.rand() * 3);
    L.prop('planks1', cx - 2.0, cz - 1.8, L.rand() * 3);
  }
  L.prop('m923', -20, 100, 0.9);
  L.prop('m1114', 38, 92, -0.5);
  L.scatter(['wheel_101', 'wheel_103'], -14, 96, 10, 10, 3, { solid: false });
  // 营区生活杂物与垃圾。
  L.scatter(['chair1', 'table1', 'bench1', 'locker1', 'toilet1'], -10, 112, 26, 20, 10, { jitter: 1.4 });
  L.prop('trash_container1', -34, 100, 0.8);
  L.prop('fuel_container1', -28, 128, -0.5, { scale: 0.9 });
  L.scatter(['garbage_styro1', 'garbage_styro3', 'garbage_cup', 'garbage_bottle1', 'garbage_oil2',
    'garbage_metal1', 'garbage_wood1', 'garbage_wood2', 'garbage1c', 'garbage1e', 'garbage1f',
    'debris_el1', 'debris_el2', 'styrofoam'],
  0, 104, 120, 60, 66, { solid: false, jitter: 1.8, scaleJitter: 0.5 });
  L.scatter(['stone1', 'stone2', 'stone3', 'stone_detail1', 'stone_detail2', 'stone_detail4'], 0, 60, 140, 90, 28, { solid: false, scaleJitter: 0.6 });
  // 桥头路障与灯柱。
  for (const side of [-1, 1]) {
    L.scatter(['barrier_block_el1', 'barrier_block_el3'], side * 6.5, 86, 4, 10, 4, { jitter: 1.0 });
    L.wallRun('sandbags_1a', side * 10, 80, Math.PI / 2, 16, { gap: 0.35, step: 2.0 });
    L.scatter(['barbed_wire1'], side * 8, 74, 4, 8, 2, { solid: false });
  }
  L.prop('lamp_mast', 3, 88, 0.1);
  L.prop('powerpole_single', -40, 92, 0.2);
  L.prop('warning_pole1', -8, 84, 0);
  L.prop('platform1', 44, 116, 0.6);
  L.prop('warning_pole3', -18, 86, 0.2);
  L.prop('spool2', 12, 124, 0.9);
  // 营地围栏与大门。
  for (let i = 0; i < 7; i++) {
    if (L.rand() < 0.22) continue;
    L.prop('wire_fence1_el1', -64 + i * 4.1, 84 + (L.rand() - 0.5) * 0.8, (L.rand() - 0.5) * 0.14);
    L.prop('wire_fence1_el2', -62 + i * 4.1, 84, 0);
  }
  L.prop('wire_fence2_el1', -40, 132, 0.02);
  L.prop('wire_fence2_el1_fabric', -37.5, 132.1, 0.02, { solid: false });
  L.prop('gate1', -20, 88, 0.05);
  L.prop('m2hb', 22, -72.4, 0.4, { y: 1.6 });
  L.prop('m240', -34, -78.2, -0.5, { y: 1.6 });

  /* ------------------------------------------------------------- gameplay */
  L.addCapturePoint({ id: 'A', name: '浮桥', x: 0, z: 0, radius: 14, owner: -1, base: bridgeY + 0.2, height: 7 });
  L.addCapturePoint({ id: 'B', name: '棉花田堤坝', x: 45, z: -78, radius: 17, owner: -1, base: height(45, -78), height: 6 });
  L.addCapturePoint({ id: 'C', name: '巴吞鲁日港', x: px, z: pz, radius: 18, owner: 1, base: py + 1.0, height: 8 });

  /* 装甲：南岸桥头的斯图亚特，港口前的谢尔曼。 */
  L.vehicle('patton', 21.6, 98.9, 0, { team: 0, player: true });
  L.vehicle('patton', -76.2, -137.7, -Math.PI / 2, { team: 1 });
  L.structure({ type: 'barn', x: 92, z: -104, yaw: 0.2 });
  L.structure({ type: 'house', x: 14, z: -118, yaw: -0.5, material: 'brick' });
  L.structure({ type: 'depot', x: -40, z: -150, yaw: 0.1 });

  L.setPlayerSpawn(18, 104, 0);
  L.addSpawn(0, -14, 100, 0);
  L.addSpawn(0, 0, 96, 0);
  L.addSpawn(0, 12, 112, 0);
  L.addSpawn(0, 0, 74, 0, { base: bridgeY });
  L.addSpawn(1, -70, -90, Math.PI);
  L.addSpawn(1, 60, -100, Math.PI);
  L.addSpawn(1, 40, -140, Math.PI);
  L.addSpawn(1, px + 20, pz + 10, Math.PI, { base: py + 1 });
  L.addRoute([new THREE.Vector3(0, bridgeY, 0), new THREE.Vector3(0, bridgeY, -40), new THREE.Vector3(30, 3, -76)]);
  L.addRoute([new THREE.Vector3(45, 3, -78), new THREE.Vector3(-20, 3, -100), new THREE.Vector3(px, py + 1, pz)]);
}
