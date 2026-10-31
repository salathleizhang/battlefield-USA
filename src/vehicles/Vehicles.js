import * as THREE from 'three';
import { Tank } from './Tank.js';
import { TANK_DEFS } from './TankModel.js';
import { G } from '../core/Physics.js';

/**
 * Owns the mission's tanks, the player's seat, and the enter/exit interaction.
 * Map builders queue spawns during Level.build (before the player exists), and
 * spawnAll() turns them into live tanks once the mission is running.
 */
export class Vehicles {
  constructor(game) {
    this.game = game;
    this.tanks = [];
    this.queue = [];
    this.playerSpawn = null;
    this.playerTank = null;
    this.wrecks = [];
    this._enterCooldown = 0;
  }

  /** Map-side spawn request. `player: true` marks the hull the player can board. */
  add(kind, x, z, yaw = 0, { team = 1, player = false, base = null, name = null } = {}) {
    const level = this.game.level;
    const y = base ?? (level ? level.groundHeight(x, z) : 0);
    const spec = {
      kind, team, player, name,
      position: new THREE.Vector3(x, y + 0.05, z),
      yaw,
    };
    this.queue.push(spec);
    return spec;
  }

  spawnAll() {
    for (const spec of this.queue) {
      const def = TANK_DEFS[spec.kind];
      const spot = def ? this._clearSpot(spec.position, def, spec.yaw) : null;
      if (spot) spec.position.set(spot.x, spot.y, spot.z);
      const tank = new Tank(this.game, spec.kind, {
        team: spec.team,
        position: spec.position,
        yaw: spec.yaw,
        playerTank: spec.player,
        name: spec.name,
      });
      this.tanks.push(tank);
      if (spec.player) {
        this.playerTank = tank;
        this.playerSpawn = spec;
      }
      console.info(`[vehicle] ${spec.kind} ${spec.team === 0 ? 'CN' : 'US'} at ${spec.position.x.toFixed(0)},${spec.position.z.toFixed(0)}`);
    }
    this.queue.length = 0;
  }

  /**
   * Map authors place tanks by intent; props and sandbags decide whether that
   * exact metre is free. Walk outward in rings and take the nearest hull-sized
   * gap, so a spawn never starts half inside a wall.
   */
  _clearSpot(pos, def, yaw = 0) {
    this._spotYaw = yaw;
    const halfW = def.width / 2 + 0.35;
    const halfL = def.length / 2 + 0.45;
    const level = this.game.level;
    const physics = this.game.physics;
    const rot = { x: 0, y: 0, z: 0, w: 1 };
    const probe = (x, z) => {
      const hit = physics.raycast({ x, y: pos.y + 30, z }, { x: 0, y: -1, z: 0 }, 90, G.WORLD);
      if (!hit) return null;
      const data = hit.data || {};
      // Do not park a 15-tonne hull on a sandbag line, a crate or a roof: only
      // ground, road, bridge deck and similar load-bearing surfaces count.
      if (data.prop || data.structure || data.vehicle) return null;
      const surface = data.surface || '';
      if (/^(sand|stucco|roof|snow|flesh)$/.test(surface) && !(level && Math.abs(hit.point.y - level.groundHeight(x, z)) < 0.4)) return null;
      const y = hit.point.y;
      if (level?.waterY != null && y < level.waterY + 0.8) return null;
      let blocked = false;
      // Lift the test box off the surface: a box resting exactly on the terrain
      // trimesh counts as an intersection with its own ground.
      physics.world.intersectionsWithShape(
        { x, y: y + 1.15, z }, rot,
        new physics.R.Cuboid(halfW, 1.0, halfL),
        () => { blocked = true; return false; }, undefined, (0xffff << 16) | G.WORLD,
      );
      if (blocked) return null;
      // The hull box can be clear while a sandbag wall sits right in front:
      // require a drivable corridor along the spawn heading, with room to
      // reverse and to swing the nose. Low destructible cover is fine.
      const yaw = this._spotYaw ?? 0;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const passable = (ox, oz, dx, dz, len) => {
        const h = physics.raycast({ x: x + ox, y: y + 0.95, z: z + oz }, { x: dx, y: 0, z: dz }, len, G.WORLD);
        if (!h) return true;
        const d = h.data || {};
        return !!(d.prop || d.panel);
      };
      if (!passable(0, 0, fx, fz, 8.5)) return null;
      if (!passable(0, 0, -fx, -fz, 4.5)) return null;
      if (!passable(rx * 0.9, rz * 0.9, fx, fz, 6)) return null;
      if (!passable(-rx * 0.9, -rz * 0.9, fx, fz, 6)) return null;
      return { x, y, z };
    };
    const direct = probe(pos.x, pos.z);
    if (direct) return direct;
    for (const r of [2, 3.5, 5, 7, 9, 12, 15]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const spot = probe(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r);
        if (spot) return spot;
      }
    }
    return null;
  }

  update(dt) {
    this._enterCooldown = Math.max(0, this._enterCooldown - dt);
    for (const t of this.tanks) t.update(dt);
  }

  /** Closest boardable tank of the player's team, or null. */
  nearestEnterable(team, pos, radius = 6.5) {
    let best = null;
    let bestD = radius;
    for (const t of this.tanks) {
      if (!t.alive || t.team !== team) continue;
      if (t.driver) continue;
      const d = Math.hypot(t.position.x - pos.x, t.position.z - pos.z);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  enter(tank, player) {
    if (!tank?.alive || tank.driver) return false;
    tank.driver = player;
    tank.playerControlled = true;
    this.game.playerVehicle = tank;
    player.inVehicle = tank;
    player.velocity.set(0, 0, 0);
    player.speed = 0;
    player.yaw = tank.turretYaw;
    player.pitch = 0;
    player.crouching = false;
    player.sprinting = false;
    player.sliding = false;
    // While seated the capsule is parked: the hull takes the hits, not the man.
    player.collider?.setEnabled?.(false);
    // Hide the infantry presentation: body, hands and weapon live in separate scenes.
    if (this.game.playerBody?.group) this.game.playerBody.group.visible = false;
    this.game.viewmodel?.setEnabled(false);
    this.game.hud?.showVehicle?.(tank);
    this.game.hud?.toast(`已登上 ${tank.def.name} · F 下车`);
    this.game.audio?.ui?.('click');
    this.game.audio?.play?.('impact_metal_heavy', { volume: 0.35, pitch: 1.4, reverb: 0.4 });
    return true;
  }

  /** Free the seat. `force` skips finding a safe standing spot (destroyed hull). */
  leave(force = false, player = this.game.player) {
    const tank = this.game.playerVehicle;
    if (!tank) return false;
    tank.driver = null;
    tank.playerControlled = false;
    this.game.playerVehicle = null;
    if (player) {
      player.inVehicle = null;
      player.collider?.setEnabled?.(true);
    }
    if (this.game.playerBody?.group) this.game.playerBody.group.visible = true;
    this.game.viewmodel?.setEnabled(true);
    this.game.hud?.showVehicle?.(null);
    if (!force && player) {
      const spot = this._exitSpot(tank);
      player.position.set(spot.x, spot.y + 0.12, spot.z);
      player.velocity.set(0, 0, 0);
      player.yaw = tank.turretYaw;
      player.pitch = 0;
      player._syncBody?.();
      player.eyeHeight = 1.62;
    }
    this._enterCooldown = 0.6;
    this.game.audio?.ui?.('click');
    return true;
  }

  _exitSpot(tank) {
    const right = new THREE.Vector3(Math.cos(tank.yaw), 0, -Math.sin(tank.yaw));
    const back = new THREE.Vector3(Math.sin(tank.yaw), 0, Math.cos(tank.yaw));
    const candidates = [
      right.clone().multiplyScalar(tank.def.width / 2 + 1.3),
      right.clone().multiplyScalar(-(tank.def.width / 2 + 1.3)),
      back.clone().multiplyScalar(tank.def.length / 2 + 1.6),
    ];
    const level = this.game.level;
    for (const c of candidates) {
      const x = tank.position.x + c.x;
      const z = tank.position.z + c.z;
      // Find the deck/ground under the candidate, not the seabed under a bridge.
      const down = this.game.physics.raycast(
        { x, y: tank.position.y + 4, z }, { x: 0, y: -1, z: 0 }, 9, G.WORLD,
      );
      const y = down ? down.point.y : (level ? level.groundHeight(x, z) : tank.position.y);
      // A hull parked against a wall must not eject the player into it.
      const blocked = this.game.physics.raycast(
        { x, y: y + 1.2, z }, { x: 0, y: 1, z: 0 }, 0.4, G.WORLD,
      );
      if (!blocked) return { x, y, z };
    }
    return { x: tank.position.x, y: tank.position.y, z: tank.position.z };
  }

  tryToggle(player) {
    if (this.game.playerVehicle) {
      this.leave(false, player);
      return true;
    }
    if (this._enterCooldown > 0) return false;
    const tank = this.nearestEnterable(player.team, player.position);
    if (!tank) return false;
    return this.enter(tank, player);
  }

  /** Explosion damage: near misses hurt tracks, a direct hit is a shell's job. */
  blast(pos, radius, power, owner = null, ignore = null) {
    for (const t of this.tanks) {
      if (!t.alive || t === ignore) continue;
      // Splash never hurts the squad that threw it.
      if (owner && t !== owner && t.team === owner.team) continue;
      const d = t.position.distanceTo(pos);
      if (d > radius + t.def.length * 0.4) continue;
      // A wall between the blast and the hull stops the pressure wave too.
      if (!this.game.physics.lineOfSight(pos, t.position.clone().setY(t.position.y + 1.2))) continue;
      const falloff = Math.pow(Math.max(0, 1 - d / (radius + 1)), 1.5);
      const dmg = power * falloff * 0.35;
      if (dmg < 3) continue;
      t.hp -= dmg;
      if (d > 2.2) t.modules.tracks = Math.max(0.5, t.modules.tracks - falloff * 0.12);
      if (t.game.playerVehicle === t) t.game.hud?.toast('车体受到爆炸冲击');
      if (t.hp <= 0) t.destroy(owner);
    }
  }

  /** Called when the player redeploys: only rebuild the tank if it was lost. */
  onPlayerRespawn() {
    if (!this.playerSpawn) return;
    const tank = this.playerTank;
    if (tank && tank.alive) return;
    // The burned-out hull stays on the field as a wreck; the replacement rolls
    // out of the same depot. Cap the wrecks so a long match cannot pile them up.
    const spec = this.playerSpawn;
    const fresh = new Tank(this.game, spec.kind, {
      team: spec.team,
      position: spec.position,
      yaw: spec.yaw,
      playerTank: true,
    });
    this.tanks.push(fresh);
    this.playerTank = fresh;
    const dead = this.tanks.filter((t) => t.destroyed);
    while (dead.length > 4) {
      const old = dead.shift();
      const i = this.tanks.indexOf(old);
      if (i >= 0) this.tanks.splice(i, 1);
      old.dispose();
    }
  }

  dispose() {
    for (const t of this.tanks) t.dispose();
    this.tanks.length = 0;
    this.queue.length = 0;
    this.playerTank = null;
    this.playerSpawn = null;
    this.game.playerVehicle = null;
  }
}
