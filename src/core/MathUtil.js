export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/** Frame-rate independent exponential smoothing. */
export const damp = (current, target, lambda, dt) => target + (current - target) * Math.exp(-lambda * dt);

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Critically damped spring used for recoil / camera feel. */
export class Spring {
  constructor(stiffness = 180, damping = 1, value = 0) {
    this.k = stiffness;
    this.d = damping;
    this.x = value;
    this.target = value;
    this.v = 0;
  }
  update(dt) {
    const a = -this.k * (this.x - this.target) - 2 * this.d * Math.sqrt(this.k) * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  impulse(v) { this.v += v; }
  snap(v) { this.x = this.target = v; this.v = 0; }
}

/** Small deterministic value-noise helper (JS side, for scatter). */
export function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function pulse(t, freq, phase = 0) {
  return 0.5 + 0.5 * Math.sin(t * freq * Math.PI * 2 + phase);
}
