import * as THREE from 'three';
import { Effect, EffectAttribute, BlendFunction } from 'postprocessing';

/**
 * Custom post effects, ported from the reference project's renderer.
 *
 * The display stage is what makes the reference read as one photograph: ACES tonemap, split-toned
 * grade (warm highlights / cool shadows), a barely-there vignette, damage-driven chromatic
 * aberration and 2% fine grain, then SMAA and a contrast-adaptive sharpen pass.
 */

/** Contrast-adaptive sharpening (after AMD FidelityFX CAS): restores the crispness lost to SMAA. */
export class SharpenEffect extends Effect {
  constructor(amount = 0.55) {
    super('SharpenEffect', /* glsl */`
      uniform float sharpness;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 b = texture2D(inputBuffer, uv + vec2(0.0, -texelSize.y)).rgb;
        vec3 d = texture2D(inputBuffer, uv + vec2(-texelSize.x, 0.0)).rgb;
        vec3 e = inputColor.rgb;
        vec3 f = texture2D(inputBuffer, uv + vec2(texelSize.x, 0.0)).rgb;
        vec3 h = texture2D(inputBuffer, uv + vec2(0.0, texelSize.y)).rgb;
        vec3 mn = min(e, min(min(b, d), min(f, h)));
        vec3 mx = max(e, max(max(b, d), max(f, h)));
        vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
        vec3 w = -amp / mix(8.0, 5.0, sharpness);
        vec3 c = (e + (b + d + f + h) * w) / (1.0 + 4.0 * w);
        outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
      }`, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([['sharpness', new THREE.Uniform(amount)]]),
    });
  }
}

/** Final colour grade: split toning, lift/gamma/gain, filmic S-curve, saturation. Runs after tonemapping. */
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', /* glsl */`
      uniform vec3 lift; uniform vec3 gammaV; uniform vec3 gain;
      uniform vec3 shadowTint; uniform vec3 highTint;
      uniform float contrast; uniform float saturation; uniform float exposure;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = max(inputColor.rgb * exposure, 0.0);
        c = pow(c, vec3(1.0 / 2.2));                       // grade in display space
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c += shadowTint * (1.0 - smoothstep(0.0, 0.55, l)) + highTint * smoothstep(0.4, 1.0, l);
        c = c * gain + lift * (1.0 - c);
        c = pow(max(c, 0.0), 1.0 / gammaV);
        vec3 s = c * c * (3.0 - 2.0 * c);                  // filmic S-curve
        c = mix(c, s, contrast);
        float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l2), c, saturation);
        outputColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(2.2)), inputColor.a);
      }`, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['lift', new THREE.Uniform(new THREE.Vector3(0.010, 0.014, 0.020))],
        ['gammaV', new THREE.Uniform(new THREE.Vector3(1.0, 1.0, 1.0))],
        ['gain', new THREE.Uniform(new THREE.Vector3(1.06, 1.0, 0.93))],
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(-0.018, 0.004, 0.026))],
        ['highTint', new THREE.Uniform(new THREE.Vector3(0.03, 0.011, -0.02))],
        ['contrast', new THREE.Uniform(0.4)],
        ['saturation', new THREE.Uniform(1.02)],
        ['exposure', new THREE.Uniform(0.98)],
      ]),
    });
  }

  /** Per-campaign grade tweaks: `{ exposure, saturation, shadowTint, highTint, contrast }`. */
  setGrade({ exposure, saturation, shadowTint, highTint, contrast, gain } = {}) {
    const u = this.uniforms;
    if (exposure !== undefined) u.get('exposure').value = exposure;
    if (saturation !== undefined) u.get('saturation').value = saturation;
    if (contrast !== undefined) u.get('contrast').value = contrast;
    if (shadowTint) u.get('shadowTint').value.set(...shadowTint);
    if (highTint) u.get('highTint').value.set(...highTint);
    if (gain) u.get('gain').value.set(...gain);
  }
}

/**
 * Lens: dirt lit by bloom + soft sun glare, only when the sun disc is on screen and unoccluded.
 * HDR, before the viewmodel pass.
 */
export class LensEffect extends Effect {
  constructor(bloom, dirtTex) {
    super('LensEffect', /* glsl */`
      uniform sampler2D tBloom; uniform sampler2D tDirt;
      uniform vec2 sunUV; uniform float sunOn; uniform vec3 sunColor; uniform float dirtK; uniform float aspect;
      float skyAt(vec2 p) { return step(0.9999, readDepth(clamp(p, 0.001, 0.999))); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        vec3 dirt = texture2D(tDirt, uv).rgb;
        vec3 b = texture2D(tBloom, uv).rgb;
        vec3 col = inputColor.rgb + b * dirt * dirtK;
        if (sunOn > 0.0) {
          // Visibility of the sun disc from the depth buffer (9 taps).
          float vis = 0.0;
          for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) vis += skyAt(sunUV + vec2(float(i), float(j)) * vec2(0.012 / aspect, 0.012));
          vis = vis / 9.0 * sunOn;
          vec2 d = (uv - sunUV) * vec2(aspect, 1.0);
          float r = length(d);
          float glow = exp(-r * 5.0) * 0.16 + exp(-r * 18.0) * 0.32;
          float streak = exp(-abs(d.y) * 90.0) * exp(-abs(d.x) * 3.0) * 0.10;
          vec2 g = (uv - (1.0 - sunUV)) * vec2(aspect, 1.0);
          float ghost = smoothstep(0.07, 0.0, abs(length(g) - 0.05)) * 0.018;
          col += sunColor * vis * (glow + streak + ghost + dirt * exp(-r * 1.6) * 0.2);
        }
        outputColor = vec4(col, inputColor.a);
      }`, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['tBloom', new THREE.Uniform(bloom.texture)],
        ['tDirt', new THREE.Uniform(dirtTex)],
        ['sunUV', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['sunOn', new THREE.Uniform(0)],
        ['sunColor', new THREE.Uniform(new THREE.Color(1.0, 0.72, 0.42))],
        ['dirtK', new THREE.Uniform(0.5)],
        ['aspect', new THREE.Uniform(1.6)],
      ]),
    });
    this.bloom = bloom;
  }

  update() { this.uniforms.get('tBloom').value = this.bloom.texture; }
}

/**
 * Anamorphic + halation: the part of the stack that makes a frame read as a
 * film still rather than a render.
 *
 * The streak is a horizontal smear of the frame's own highlights, not of the
 * bloom texture: the bloom mip chain is already blurred round, so stretching it
 * sideways only yields a wide glow. Sampling the scene at 17 taps along the row
 * and keeping only what is above ~0.9 luminance gives the thin, blue-white
 * horizontal flare that an anamorphic front element produces on a sun disc,
 * a muzzle flash or wet specular. Halation is the complement: a warm, soft
 * spill sampled from the (round) bloom texture, which is what red film dye
 * does when light scatters inside the emulsion.
 */
export class EpicLensEffect extends Effect {
  constructor(bloom) {
    super('EpicLensEffect', /* glsl */`
      uniform sampler2D epicBloom;
      uniform float epicStreak; uniform float epicHalo; uniform float epicAspect;
      uniform vec3 epicTint; uniform vec3 epicHaloTint;

      vec3 epicBright(vec2 p) {
        if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec3(0.0);
        vec3 c = texture2D(inputBuffer, p).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        return c * smoothstep(0.90, 2.10, l);
      }

      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 col = inputColor.rgb;

        // 17-tap anamorphic smear, weighted to a soft triangular core.
        vec3 streak = vec3(0.0);
        float wsum = 0.0;
        for (int i = -8; i <= 8; i++) {
          float t = float(i) / 8.0;
          float w = exp(-t * t * 2.7);
          streak += epicBright(uv + vec2(t * 0.32 / epicAspect, 0.0)) * w;
          wsum += w;
        }
        col += epicTint * (streak / wsum) * epicStreak;

        // Halation: a soft, warm halo around anything the bloom pass found hot.
        vec3 halo = texture2D(epicBloom, uv).rgb * 0.62
                  + texture2D(epicBloom, uv + vec2(0.0, 0.010)).rgb * 0.19
                  + texture2D(epicBloom, uv - vec2(0.0, 0.010)).rgb * 0.19;
        col += epicHaloTint * halo * epicHalo;

        outputColor = vec4(col, inputColor.a);
      }`, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['epicBloom', new THREE.Uniform(bloom.texture)],
        ['epicStreak', new THREE.Uniform(0.55)],
        ['epicHalo', new THREE.Uniform(0.22)],
        ['epicAspect', new THREE.Uniform(1.78)],
        ['epicTint', new THREE.Uniform(new THREE.Color(0.42, 0.62, 1.0))],
        ['epicHaloTint', new THREE.Uniform(new THREE.Color(1.0, 0.36, 0.16))],
      ]),
    });
    this.bloom = bloom;
  }

  update() { this.uniforms.get('epicBloom').value = this.bloom.texture; }
}

/**
 * Blood on the lens.
 *
 * Two layers of a procedurally drawn impact splat (see bloodSplatTexture) are
 * composited over the graded frame. A new hit takes over the fainter layer and
 * knocks the other back, so sustained fire builds a messy, overlapping film
 * instead of restarting the same stamp. Each layer is rotated, mirrored and
 * scaled differently on impact, and both creep downwards with their own drip
 * clock, which is what makes a still texture read as liquid.
 */
export class BloodLensEffect extends Effect {
  constructor(texA, texB) {
    super('BloodLensEffect', /* glsl */`
      uniform sampler2D bloodTexA; uniform sampler2D bloodTexB;
      uniform float bloodAmtA; uniform float bloodAmtB;
      uniform vec4 bloodMatA; uniform vec4 bloodMatB;
      uniform vec2 bloodOffA; uniform vec2 bloodOffB;
      uniform float bloodDripA; uniform float bloodDripB;
      uniform float bloodAspect;
      uniform vec3 bloodCore; uniform vec3 bloodThin;

      float bloodMask(sampler2D tex, vec2 uv, vec4 m, vec2 off, float drip) {
        vec2 p = uv - 0.5;
        p.x *= bloodAspect / 1.7778;
        p = mat2(m.x, -m.y, m.y, m.x) * p;   // rotate
        p.x *= m.z;                           // mirror
        p /= max(m.w, 0.001);                 // scale
        p += off;
        // The film runs down the glass: the sampled pattern slides towards the
        // bottom of the screen and stretches while it does.
        p.y += drip * 0.055;
        p.y = (p.y - 0.5) / (1.0 + drip * 0.06) + 0.5;
        if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
        return texture2D(tex, p).a;
      }

      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float a = bloodMask(bloodTexA, uv, bloodMatA, bloodOffA, bloodDripA) * bloodAmtA;
        float b = bloodMask(bloodTexB, uv, bloodMatB, bloodOffB, bloodDripB) * bloodAmtB;
        float m = clamp(max(a, b), 0.0, 1.0);

        // A thin film absorbs light and reddens the picture; the thick core is
        // nearly opaque, with a wet sheen sitting on top of it.
        float thin = smoothstep(0.02, 0.55, m);
        float core = smoothstep(0.40, 0.96, m);
        vec3 col = inputColor.rgb;
        vec3 tint = mix(bloodThin, bloodCore, core);
        col = mix(col, tint + col * 0.14, thin * 0.93);
        col += vec3(0.95, 0.24, 0.10) * pow(core, 3.0) * 0.045;
        outputColor = vec4(col, inputColor.a);
      }`, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['bloodTexA', new THREE.Uniform(texA)],
        ['bloodTexB', new THREE.Uniform(texB)],
        ['bloodAmtA', new THREE.Uniform(0)],
        ['bloodAmtB', new THREE.Uniform(0)],
        ['bloodMatA', new THREE.Uniform(new THREE.Vector4(1, 0, 1, 1))],
        ['bloodMatB', new THREE.Uniform(new THREE.Vector4(1, 0, 1, 1))],
        ['bloodOffA', new THREE.Uniform(new THREE.Vector2(0, 0))],
        ['bloodOffB', new THREE.Uniform(new THREE.Vector2(0, 0))],
        ['bloodDripA', new THREE.Uniform(0)],
        ['bloodDripB', new THREE.Uniform(0)],
        ['bloodAspect', new THREE.Uniform(1.78)],
        ['bloodCore', new THREE.Uniform(new THREE.Color(0.115, 0.010, 0.007))],
        ['bloodThin', new THREE.Uniform(new THREE.Color(0.055, 0.003, 0.002))],
      ]),
    });
    this.layers = [
      { op: 0, rot: 0, mirror: 1, scale: 1, ox: 0, oy: 0, drip: 0 },
      { op: 0, rot: 0, mirror: 1, scale: 1, ox: 0, oy: 0, drip: 0 },
    ];
  }

  /** A hit: paint the fainter layer with a fresh, randomly placed splat. */
  splat(amount = 0.5) {
    const [A, B] = this.layers;
    const L = A.op <= B.op ? A : B;
    const other = L === A ? B : A;
    other.op *= 0.62;
    L.op = Math.min(0.95, Math.max(0.22, amount) + L.op * 0.2);
    // Keep the rotation shallow: the texture's drips are drawn downwards, and
    // a 180-degree instance would send them up the glass.
    L.rot = (Math.random() - 0.5) * 0.7;
    L.mirror = Math.random() < 0.5 ? -1 : 1;
    L.scale = 0.86 + Math.random() * 0.34;
    L.ox = (Math.random() - 0.5) * 0.17;
    L.oy = (Math.random() - 0.5) * 0.13;
    L.drip = 0;
    this._write();
  }

  clear() {
    for (const L of this.layers) { L.op = 0; L.drip = 0; }
    this._write();
  }

  /** Fade + drain. Called once per frame from the renderer, not per pass. */
  tick(dt) {
    let dirty = false;
    for (const L of this.layers) {
      if (L.op <= 0) continue;
      L.op = Math.max(0, L.op - dt * 0.052);
      L.drip = Math.min(1.6, L.drip + dt * 0.22);
      dirty = true;
    }
    if (dirty) this._write();
  }

  _write() {
    const u = this.uniforms;
    const [A, B] = this.layers;
    for (const [L, k] of [[A, 'A'], [B, 'B']]) {
      u.get(`bloodAmt${k}`).value = L.op;
      u.get(`bloodMat${k}`).value.set(Math.cos(L.rot), Math.sin(L.rot), L.mirror, L.scale);
      u.get(`bloodOff${k}`).value.set(L.ox, L.oy);
      u.get(`bloodDrip${k}`).value = L.drip;
    }
  }
}

/**
 * Procedural blood-splat texture for the lens overlay.
 *
 * Coverage lives in the alpha channel only, so the shader can tint it (and the
 * texture never needs a colour space). Each scene is a few impact clusters:
 * an irregular core with narrow radial spikes, satellite droplets thrown along
 * the same directions, a fine spray mist, and gravity drips running down from
 * the lower lobes. `seed` makes the two variants at startup distinct while
 * keeping a capture deterministic.
 */
export function bloodSplatTexture({ w = 1024, h = 576, seed = 7, density = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  let s = seed >>> 0 || 1;
  const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const TAU = Math.PI * 2;

  /** Angular profile: round lobes plus a handful of long, narrow spikes. */
  const profile = (n) => {
    const spikes = [];
    for (let i = 0; i < n; i++) spikes.push({ a: R() * TAU, len: 0.5 + R() * 1.6, w: 0.020 + R() * 0.045 });
    const lobes = 0.55 + R() * 0.5;
    return (a) => {
      let r = 0.62 + 0.38 * Math.pow(0.5 + 0.5 * Math.sin(a * 3 + lobes), 0.8);
      r *= 0.92 + 0.16 * Math.sin(a * 7 + 1.7);
      for (const sp of spikes) {
        const d = Math.atan2(Math.sin(a - sp.a), Math.cos(a - sp.a));
        r += sp.len * Math.exp(-(d * d) / sp.w);
      }
      return r;
    };
  };

  const blob = (cx, cy, rad, alpha) => {
    const prof = profile(9);
    const N = 400;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      pts.push([cx + Math.cos(a) * rad * prof(a), cy + Math.sin(a) * rad * prof(a)]);
    }
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.6);
    rg.addColorStop(0, `rgba(255,255,255,${alpha})`);
    rg.addColorStop(0.42, `rgba(255,255,255,${alpha * 0.9})`);
    rg.addColorStop(0.8, `rgba(255,255,255,${alpha * 0.5})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fill();

    // Satellite droplets thrown out along the spikes.
    const drops = 18 + Math.floor(R() * 16);
    for (let i = 0; i < drops; i++) {
      const a = R() * TAU;
      const d = rad * (0.85 + R() * 1.9);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const rr = rad * (0.012 + R() * 0.055);
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.scale(1 + R() * 1.6, 0.55 + R() * 0.6);
      g.beginPath();
      g.arc(0, 0, rr, 0, TAU);
      g.fillStyle = `rgba(255,255,255,${0.18 + R() * 0.5})`;
      g.fill();
      g.restore();
    }

    // Spray mist: many tiny specks thinning out with distance.
    for (let i = 0; i < 260; i++) {
      const a = R() * TAU;
      const d = rad * (0.2 + Math.pow(R(), 0.55) * 2.6);
      const rr = 0.5 + R() * 2.2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, TAU);
      g.fillStyle = `rgba(255,255,255,${Math.max(0, (0.42 - R() * 0.3) * (1 - d / (rad * 3)))})`;
      g.fill();
    }
  };

  // Main impact, a smaller secondary and a faint accent, kept off-centre so a
  // mirrored/rotated instance still reads as asymmetric.
  const cx = w * (0.44 + (R() - 0.5) * 0.1);
  const cy = h * (0.46 + (R() - 0.5) * 0.1);
  const main = Math.min(w, h) * (0.20 + R() * 0.04) * density;
  blob(cx, cy, main, 0.97);
  blob(cx + w * (0.11 + R() * 0.06), cy + h * (0.10 + R() * 0.08), main * 0.46, 0.9);
  blob(cx - w * (0.12 + R() * 0.05), cy + h * (0.16 + R() * 0.09), main * 0.30, 0.85);

  // Dense wet cores on top of the main lobes.
  for (let i = 0; i < 5; i++) {
    const x = cx + (R() - 0.5) * main * 0.8;
    const y = cy + (R() - 0.5) * main * 0.8;
    const rr = main * (0.12 + R() * 0.22);
    const rg = g.createRadialGradient(x, y, 0, x, y, rr);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.7, 'rgba(255,255,255,0.85)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, rr, 0, TAU);
    g.fill();
  }

  // Gravity: drips falling from the lower lobes, tapering to a bead.
  const drips = 7 + Math.floor(R() * 6);
  for (let i = 0; i < drips; i++) {
    const x = cx + (R() - 0.5) * main * 1.7;
    const y0 = cy + main * (0.25 + R() * 0.55);
    const len = main * (0.35 + R() * 1.15);
    const wid = 1.4 + R() * 4.2;
    const bow = (R() - 0.5) * 14;
    g.beginPath();
    g.moveTo(x - wid * 0.5, y0);
    g.bezierCurveTo(x - wid * 0.35 + bow, y0 + len * 0.5, x - wid * 0.12 + bow, y0 + len * 0.85, x + bow, y0 + len);
    g.lineWidth = wid;
    g.lineCap = 'round';
    g.strokeStyle = `rgba(255,255,255,${0.35 + R() * 0.4})`;
    g.stroke();
    g.beginPath();
    g.arc(x + bow, y0 + len, wid * (0.65 + R() * 0.4), 0, TAU);
    g.fillStyle = `rgba(255,255,255,${0.55 + R() * 0.35})`;
    g.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** Procedural lens-dirt texture: smudges, droplets and faint wipe streaks. */
export function lensDirtTexture(w = 1024, h = 576) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  let s = 1337;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const x = R() * w, y = R() * h, r = 30 + R() * 140, a = 0.03 + R() * 0.07;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,245,230,${a})`);
    gr.addColorStop(1, 'rgba(255,245,230,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 260; i++) {
    const x = R() * w, y = R() * h, r = 1 + R() * 6, a = 0.08 + R() * 0.22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.7, `rgba(255,255,255,${a * 0.5})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(255,250,240,${0.02 + R() * 0.04})`;
    g.lineWidth = 8 + R() * 30;
    const x = R() * w, y = R() * h, l = 120 + R() * 300, a = R() * Math.PI;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 40, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
