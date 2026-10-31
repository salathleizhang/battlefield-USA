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
    this.combat = []; // recent kill sites: spawns keep away from live fights
    this.spawnUsedAt = new Map();
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
          this.game.level.refreshPoint(cp);
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
    const next = this.points.find((p) => p.owner !== 0);
    this.game.hud?.setObjective(next ? `夺取 ${next.id} 点 · ${next.name}` : '守住全部据点，等待美军兵力耗尽');
  }

  onKill(victim, killer) {
    this.kills[victim.team === 0 ? 1 : 0]++;
    // A death costs one ticket.
    this.tickets[victim.team] = Math.max(0, this.tickets[victim.team] - 1);
    this.combat.push({ pos: victim.position.clone(), t: this.game.time });
    if (killer?.position) this.combat.push({ pos: killer.position.clone(), t: this.game.time });
    this.combat = this.combat.filter((c) => this.game.time - c.t < 12);
  }

  end(winner) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.game.onMatchEnd(winner);
  }

  /**
   * Spawn safety, Battlefield-style: never directly in an enemy's line of sight,
   * away from live fire, avoid reusing the point that just killed you, then jitter
   * so a squad doesn't stack on one metre.
   */
  getSpawn(team) {
    const owned = this.points.filter((p) => p.owner === team && !p.contested);
    const list = owned.length ? owned : this.points.filter((p) => p.owner === team);
    if (list.length) {
      let best = null, bestScore = -1e9;
      const eye = new THREE.Vector3();
      for (const p of list) {
        let s = rand(0, 6);
        s += (p.radius || 8) * 0.5;
        for (const a of this.game.combatants()) {
          if (!a.alive) continue;
          const d = a.position.distanceTo(p.position);
          if (a.team === team) {
            s += d < 20 ? 4 : Math.min(d, 40) * 0.1;
            continue;
          }
          if (d < 12) s -= 140;
          else if (d < 28) s -= 35;
          s += Math.min(d, 90) * 0.5;
          // Visible spawns are the worst: a rifleman can hold the flag from 100 m out.
          eye.set(p.position.x, p.position.y + 1.6, p.position.z);
          const head = a.isPlayer
            ? new THREE.Vector3(a.position.x, a.position.y + a.eyeHeight, a.position.z)
            : new THREE.Vector3(a.position.x, a.position.y + 1.5, a.position.z);
          if (d < 110 && this.game.physics.lineOfSight(eye, head)) s -= d < 55 ? 180 : 90;
        }
        for (const c of this.combat) {
          const d = c.pos.distanceTo(p.position);
          if (d < 24) s -= 50 * (1 - (this.game.time - c.t) / 12) * (1 - d / 24);
        }
        const used = this.spawnUsedAt.get(p.id) ?? -99;
        if (this.game.time - used < 6) s -= 40;
        if (s > bestScore) { bestScore = s; best = p; }
      }
      if (best) {
        this.spawnUsedAt.set(best.id, this.game.time);
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
