import * as THREE from 'three';
import { FOG } from './Particles.js';

const NOISE = /* glsl */`
  float a_hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float a_vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a_hash12(i), a_hash12(i + vec2(1.0, 0.0)), u.x), mix(a_hash12(i + vec2(0.0, 1.0)), a_hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float a_fbm(vec2 p) {
    float f = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { f += a * a_vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return f;
  }
`;

/**
 * Procedural flame on cylindrical (Y-axis) billboards. Instanced: iBase = flame root (world),
 * iSize = (width, height, intensity, seed). Domain-warped fbm scrolled upward, shaped by a soft
 * teardrop envelope and thresholded into separate tongues; black-body colour ramp; additive.
 * Used as the low-quality / no-atlas fallback for the flipbook fire.
 */
export function makeFlameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, wind: { value: new THREE.Vector3() },
      fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, fogScale: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute vec3 iBase; attribute vec4 iSize;
      uniform float time; uniform vec3 wind;
      varying vec2 vUv; varying float vInt; varying float vSeed; varying float vDepth;
      void main() {
        vec3 toCam = cameraPosition - iBase; toCam.y = 0.0;
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5));
        float h = iSize.y * (0.92 + 0.08 * sin(time * 2.7 + iSize.w * 7.0) + 0.05 * sin(time * 7.3 + iSize.w));
        vec3 p = iBase + right * position.x * iSize.x + vec3(0.0, position.y * h, 0.0);
        float k = position.y * position.y;
        p.xz += wind.xz * k * h * 0.1 + vec2(sin(time * 3.1 + iSize.w), cos(time * 2.3 + iSize.w * 3.0)) * k * 0.06 * h;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vUv = uv; vInt = iSize.z; vSeed = iSize.w; vDepth = -mv.z;
      }`,
    fragmentShader: /* glsl */`
      uniform float time;
      ${NOISE}
      ${FOG}
      varying vec2 vUv; varying float vInt; varying float vSeed; varying float vDepth;
      void main() {
        float x = vUv.x - 0.5, y = vUv.y;
        float s = vSeed * 3.17;
        vec2 q = vec2(x, y * 1.55 - 0.22);
        float T = time * 2.4;
        float n = a_fbm(vec2(q.x * 3.2 + s, q.y * 2.2 - T)) * 0.85 + a_fbm(vec2(q.x * 7.0 - s, q.y * 5.0 - T * 1.7)) * 0.32;
        float c = 1.0 - 16.0 * pow(max(0.0, length(q * vec2(1.8 + q.y * 1.5, 0.75)) - n * max(0.0, q.y + 0.25)), 1.2);
        float c1 = clamp(n * c * (1.5 - pow(1.25 * y, 4.0)), 0.0, 1.0);
        vec3 col = vec3(1.5 * c1, 1.5 * c1 * c1 * c1, c1 * c1 * c1 * c1 * c1 * c1);
        col = col * vec3(1.0, 0.82, 0.7) + vec3(0.06, 0.01, 0.0) * c;
        float a = clamp(c * (1.0 - pow(y, 3.0)), 0.0, 1.0);
        col *= vInt * 1.35;
        a *= (1.0 - a_fog(vDepth)) * smoothstep(0.0, 0.05, y);
        if (a < 0.004) discard;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
