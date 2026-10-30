import * as THREE from 'three';
import { clamp, rand } from '../core/MathUtil.js';

/** Battlefield-style conquest: capture A/B/C, bleed tickets, first to zero loses. */
export class Match {
  constructor(game) {
    this.game = game;
    this.points = game.level.capturePoints;
    this.tickets = [320, 320];
    this.maxTickets = 320;
    this.state = 'live';
    this.time = 0;
    this.timeLimit = 15 * 60;
    this.kills = [0, 0];
    this.captureMsgT = 0;
    this.bleedT = 0;
    this.lastBanner = '';
    this.started = false;
  }

  start() {
    this.started = true;
    this.game.hud?.banner('战役开始', '夺取并守住 A / B / C 三个据点', 2.6);
    this.game.audio.ui('click');
  }

  update(dt) {
    if (this.state !== 'live' || !this.started) return;
    this.time += dt;
    const actors = this.game.combatants().filter((a) => a.alive);
    for (const cp of this.points) {
      let c0 = 0, c1 = 0;
      for (const a of actors) {
        const dx = a.position.x - cp.position.x;
        const dz = a.position.z - cp.position.z;
        if (dx * dx + dz * dz <= cp.radius * cp.radius) {
          if (a.team === 0) c0++; else c1++;
        }
      }
      const contested = c0 > 0 && c1 > 0;
      cp.contested = contested;
      const team = c0 > c1 ? 0 : c1 > c0 ? 1 : -1;
      if (!contested && team !== -1 && cp.owner !== team) {
        if (cp.capturingTeam !== team) { cp.capturingTeam = team; cp.captureT = Math.max(0, cp.captureT * 0.35); }
        const rate = (100 / 13) * (1 + 0.35 * (Math.max(c0, c1) - 1)) * (cp.owner === -1 ? 1 : 0.8);
        cp.captureT += rate * dt;
        if (cp.captureT >= 100) {
          cp.owner = team;
          cp.captureT = 0;
          cp.capturingTeam = -1;
          this.onCapture(cp, team);
        }
      } else if (!contested && team === cp.owner) {
        cp.captureT = Math.max(0, cp.captureT - 30 * dt);
      } else if (contested) {
        // Progress stalls while contested.
      } else {
        cp.captureT = Math.max(0, cp.captureT - 12 * dt);
      }
    }

    // Ticket bleed from flag majority.
    const owned0 = this.points.filter((p) => p.owner === 0).length;
    const owned1 = this.points.filter((p) => p.owner === 1).length;
    if (owned0 > owned1) this.tickets[1] -= (owned0 - owned1) * 1.6 * dt;
    else if (owned1 > owned0) this.tickets[0] -= (owned1 - owned0) * 1.6 * dt;

    this.tickets[0] = Math.max(0, this.tickets[0]);
    this.tickets[1] = Math.max(0, this.tickets[1]);

    if (this.tickets[0] <= 0) this.end(1);
    else if (this.tickets[1] <= 0) this.end(0);
    else if (this.time >= this.timeLimit) this.end(this.tickets[0] >= this.tickets[1] ? 0 : 1);
  }

  onCapture(cp, team) {
    const who = team === 0 ? '中国远征军' : '美军';
    this.game.hud.banner(`${who} 夺取了 ${cp.id} 点`, cp.name, 2.4);
    this.game.audio.capture();
    this.game.player?.addTrauma(0.08);
    this.game.assignObjectives?.();
  }

  onKill(victim, killer) {
    this.kills[victim.team === 0 ? 1 : 0]++;
    // A death costs one ticket.
    this.tickets[victim.team] = Math.max(0, this.tickets[victim.team] - 1);
  }

  end(winner) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.game.onMatchEnd(winner);
  }

  getSpawn(team) {
    const owned = this.points.filter((p) => p.owner === team && !p.contested);
    const list = owned.length ? owned : this.points.filter((p) => p.owner === team);
    if (list.length) {
      // Prefer a point that isn't right on top of enemies.
      let best = null, bestScore = -1e9;
      for (const p of list) {
        let enemyDist = 1e9;
        for (const a of this.game.combatants()) {
          if (!a.alive || a.team === team) continue;
          enemyDist = Math.min(enemyDist, a.position.distanceTo(p.position));
        }
        const score = Math.min(enemyDist, 90) + rand(0, 12);
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best) {
        const angle = rand(0, Math.PI * 2);
        return {
          position: new THREE.Vector3(
            best.position.x + Math.cos(angle) * best.radius * 0.55,
            best.position.y + 0.1,
            best.position.z + Math.sin(angle) * best.radius * 0.55,
          ),
          yaw: rand(0, Math.PI * 2),
        };
      }
    }
    const arr = this.game.level.spawns[team];
    const s = arr[(Math.random() * arr.length) | 0] || { position: new THREE.Vector3(), yaw: 0 };
    return { position: s.position.clone(), yaw: s.yaw };
  }
}
