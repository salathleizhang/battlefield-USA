import * as THREE from 'three';
import { Tank } from './Tank.js';
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
    if (player) player.inVehicle = null;
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
      const y = level ? level.groundHeight(x, z) : tank.position.y;
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
    if (tank) {
      const i = this.tanks.indexOf(tank);
      if (i >= 0) this.tanks.splice(i, 1);
      tank.dispose();
    }
    const spec = this.playerSpawn;
    const fresh = new Tank(this.game, spec.kind, {
      team: spec.team,
      position: spec.position,
      yaw: spec.yaw,
      playerTank: true,
    });
    this.tanks.push(fresh);
    this.playerTank = fresh;
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
