import * as THREE from 'three';
import { G } from '../../core/Physics.js';

/**
 * Lightweight walkable grid + A* for bots, replacing the reference project's Recast
 * navmesh with something dependency-free.
 *
 * Build: one downward ray per cell finds the walking surface, a capsule overlap rejects
 * cells without standing room, then a flood fill from spawns/flags keeps only the
 * connected playable area (so rooftops and other islands drop out).
 */
const MAX_CELLS = 60000;
const MAX_EXPANSIONS = 12000;

export class NavGrid {
  constructor(level, physics) {
    this.level = level;
    this.physics = physics;
    this.R = physics.R;
    this.cell = 3;
    this.w = 0;
    this.h = 0;
    this.walk = null;
    this.heights = null;
    this.buildTime = 0;
    this.reachableCount = 0;
    // A* scratch, stamped by generation so nothing has to be cleared per query.
    this.gen = 0;
    this.gScore = null;
    this.cameFrom = null;
    this.mark = null;
  }

  build() {
    const t0 = performance.now();
    const b = this.level.bounds;
    const area = Math.max(1, (b.maxX - b.minX) * (b.maxZ - b.minZ));
    // Big maps get slightly coarser cells so the build and A* stay cheap.
    this.cell = Math.max(2.5, Math.sqrt(area / MAX_CELLS));
    this.minX = b.minX;
    this.minZ = b.minZ;
    this.w = Math.max(1, Math.ceil((b.maxX - b.minX) / this.cell));
    this.h = Math.max(1, Math.ceil((b.maxZ - b.minZ) / this.cell));
    const n = this.w * this.h;

    const walk = new Uint8Array(n);
    const heights = new Float32Array(n);
    // The query pipeline only sees colliders after a step (level geometry was just added).
    this.physics.world.step();
    const waterY = this.level.waterY ?? -999;
    const down = { x: 0, y: -1, z: 0 };
    const R = this.R;
    const shape = new R.Capsule(0.5, 0.34);
    const shapePos = { x: 0, y: 0, z: 0 };
    const rot = { x: 0, y: 0, z: 0, w: 1 };

    for (let z = 0; z < this.h; z++) {
      const cz = this.minZ + (z + 0.5) * this.cell;
      for (let x = 0; x < this.w; x++) {
        const cx = this.minX + (x + 0.5) * this.cell;
        // Walk down through non-walkable hits (cables, awnings, railings) to the floor below.
        let hit = null;
        let top = 300;
        for (let k = 0; k < 4; k++) {
          const h = this.physics.raycast({ x: cx, y: top, z: cz }, down, top + 120, G.WORLD);
          if (!h) break;
          if (h.normal.y >= 0.72) { hit = h; break; }
          top = h.point.y - 0.02;
          if (top < waterY) break;
        }
        if (!hit) continue;
        const y = hit.point.y;
        if (y < waterY + 0.35) continue;
        // Standing room (crouch height at least): a capsule 0.45 m above the deck.
        shapePos.x = cx; shapePos.y = y + 0.95; shapePos.z = cz;
        let blocked = false;
        this.physics.world.intersectionsWithShape(shapePos, rot, shape,
          () => { blocked = true; return false; }, undefined, (0xffff << 16) | G.WORLD);
        if (blocked) continue;
        const i = z * this.w + x;
        walk[i] = 1;
        heights[i] = y;
      }
    }

    let walkableCount = 0;
    for (let i = 0; i < n; i++) if (walk[i] === 1) walkableCount++;
    // Flood fill from spawns and capture points: keeps the connected walkable area.
    const seeds = [];
    const addSeed = (p) => {
      if (!p) return;
      const c = this.cellOf(p.x, p.z);
      if (c >= 0) seeds.push(c);
    };
    for (const s of this.level.spawns[0]) addSeed(s.position);
    for (const s of this.level.spawns[1]) addSeed(s.position);
    for (const cp of this.level.capturePoints) addSeed(cp.position);
    addSeed(this.level.playerSpawn?.position);
    this.comp = new Int32Array(n).fill(-1);
    this._flood(walk, heights, seeds);

    this.walk = walk;
    this.heights = heights;
    this.gScore = new Float32Array(n);
    this.cameFrom = new Int32Array(n);
    this.mark = new Uint32Array(n);
    this.reachableCount = 0;
    for (let i = 0; i < n; i++) if (walk[i] === 2) this.reachableCount++;
    this.buildTime = performance.now() - t0;
    console.info(`[nav] ${this.w}x${this.h} @ ${this.cell.toFixed(1)}m · ${walkableCount} walkable · ${this.reachableCount} reachable · ${this.buildTime.toFixed(0)}ms`);
    return this;
  }

  _flood(walk, heights, seeds) {
    let compId = -1;
    for (const s of seeds) {
      if (walk[s] !== 1) continue;
      compId++;
      walk[s] = 2;
      this.comp[s] = compId;
      this._grow(walk, heights, s, compId);
    }
  }

  /** BFS one connected component, marking `walk` 2 and `comp` ids. */
  _grow(walk, heights, seed, compId) {
    const q = [seed];
    let head = 0;
    const step = this.cell * 0.7; // max climb per cell ≈ 35% grade
    while (head < q.length) {
      const i = q[head++];
      const x = i % this.w, z = (i / this.w) | 0;
      const y = heights[i];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
          const ni = nz * this.w + nx;
          if (walk[ni] !== 1) continue;
          if (Math.abs(heights[ni] - y) > step) continue;
          walk[ni] = 2;
          this.comp[ni] = compId;
          q.push(ni);
        }
      }
    }
  }

  cellOf(x, z) {
    const cx = Math.floor((x - this.minX) / this.cell);
    const cz = Math.floor((z - this.minZ) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1;
    return cz * this.w + cx;
  }

  worldOf(i, out = new THREE.Vector3()) {
    const x = i % this.w;
    const z = (i / this.w) | 0;
    return out.set(
      this.minX + (x + 0.5) * this.cell,
      (this.heights[i] || 0) + 0.05,
      this.minZ + (z + 0.5) * this.cell,
    );
  }

  walkableAt(x, z) {
    const i = this.cellOf(x, z);
    return i >= 0 && this.walk[i] === 2;
  }

  /**
   * Nearest reachable cell, spiralling out from the requested one. When `y` is given,
   * only accept cells on that level (within `yTol`): a flag under a bridge must not
   * snap to the deck 20 m above it.
   */
  nearestCell(x, z, maxRing = 8, y = null, yTol = 4) {
    const i0 = this.cellOf(x, z);
    if (i0 < 0) return -1;
    const ok = (i) => this.walk[i] === 2 && (y === null || Math.abs(this.heights[i] - y) < yTol);
    if (ok(i0)) return i0;
    const cx = i0 % this.w, cz = (i0 / this.w) | 0;
    for (let r = 1; r <= maxRing; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
          const i = nz * this.w + nx;
          if (ok(i)) return i;
        }
      }
    }
    return -1;
  }

  /** True if a straight walk between two cells never leaves the walkable area. */
  lineWalkable(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.walkableAt(ax + dx * t, az + dz * t)) return false;
    }
    return true;
  }

  /**
   * World-space waypoints from `from` to `to`, simplified by walkable line of sight.
   * Returns [] when no route exists (caller falls back to direct steering).
   */
  findPath(from, to) {
    const start = this.nearestCell(from.x, from.z, 8, from.y ?? null);
    const goal = this.nearestCell(to.x, to.z, 8, to.y ?? null);
    if (start < 0 || goal < 0) return [];
    if (start === goal) return [];
    // Short open-field hops don't need A* at all.
    if (this.lineWalkable(from.x, from.z, to.x, to.z)) return [];
    if (this.walk[start] !== 2 || this.walk[goal] !== 2) return [];
    // Different islands (roofs, elevated roads, the far bank): no walkable route exists.
    if (this.comp[start] !== this.comp[goal]) return [];

    const w = this.w, h = this.h;
    // Two stamps per query (open = gen, closed = gen + 1) so stale marks never alias.
    this.gen += 2;
    const gen = this.gen;
    const g = this.gScore, came = this.cameFrom, mark = this.mark;
    const heap = [];
    const push = (i, f) => {
      heap.push({ i, f });
      let n = heap.length - 1;
      while (n > 0) {
        const p = (n - 1) >> 1;
        if (heap[p].f <= heap[n].f) break;
        [heap[p], heap[n]] = [heap[n], heap[p]];
        n = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length && last) {
        heap[0] = last;
        let n = 0;
        for (;;) {
          const l = n * 2 + 1, r = l + 1;
          let m = n;
          if (l < heap.length && heap[l].f < heap[m].f) m = l;
          if (r < heap.length && heap[r].f < heap[m].f) m = r;
          if (m === n) break;
          [heap[m], heap[n]] = [heap[n], heap[m]];
          n = m;
        }
      }
      return top;
    };
    const hEst = (i) => {
      const dx = Math.abs((i % w) - (goal % w));
      const dz = Math.abs(((i / w) | 0) - ((goal / w) | 0));
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };

    mark[start] = gen;
    g[start] = 0;
    came[start] = -1;
    push(start, hEst(start));
    let found = false;
    let expansions = 0;
    while (heap.length && expansions++ < MAX_EXPANSIONS) {
      const { i } = pop();
      if (mark[i] === gen + 1) continue; // already closed this query
      if (i === goal) { found = true; break; }
      mark[i] = gen + 1;
      const x = i % w, z = (i / w) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const ni = nz * w + nx;
          if (this.walk[ni] !== 2) continue;
          // No corner cutting through two blocked orthogonals.
          if (dx && dz) {
            if (this.walk[z * w + nx] !== 2 || this.walk[nz * w + x] !== 2) continue;
          }
          if (Math.abs(this.heights[ni] - this.heights[i]) > this.cell * 0.8) continue;
          const cost = (dx && dz ? Math.SQRT2 : 1) * this.cell;
          const ng = g[i] + cost;
          if (mark[ni] !== gen && mark[ni] !== gen + 1) {
            mark[ni] = gen;
            g[ni] = ng;
            came[ni] = i;
            push(ni, ng + hEst(ni));
          } else if (mark[ni] === gen && ng < g[ni]) {
            g[ni] = ng;
            came[ni] = i;
            push(ni, ng + hEst(ni));
          }
        }
      }
    }
    this.lastSearch = { expansions, found, start, goal };
    if (!found) return [];

    const cells = [];
    for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.push(i);
    cells.reverse();

    // Simplify: keep only the waypoints needed to stay on walkable ground.
    const out = [];
    let anchorX = from.x, anchorZ = from.z;
    for (let k = 0; k < cells.length; k++) {
      const p = this.worldOf(cells[k], new THREE.Vector3());
      const next = k + 1 < cells.length ? this.worldOf(cells[k + 1], new THREE.Vector3()) : to;
      const far = k + 1 >= cells.length;
      if (far || !this.lineWalkable(anchorX, anchorZ, next.x, next.z)) {
        out.push(p);
        anchorX = p.x;
        anchorZ = p.z;
      }
    }
    return out;
  }
}
