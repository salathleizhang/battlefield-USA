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
        ['gain', new THREE.Uniform(new THREE.Vector3(1.02, 1.0, 0.97))],
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(-0.010, 0.003, 0.014))],
        ['highTint', new THREE.Uniform(new THREE.Vector3(0.020, 0.007, -0.014))],
        ['contrast', new THREE.Uniform(0.28)],
        ['saturation', new THREE.Uniform(0.94)],
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
