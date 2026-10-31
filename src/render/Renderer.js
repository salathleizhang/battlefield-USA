import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, ToneMappingEffect,
  ToneMappingMode, VignetteEffect, ChromaticAberrationEffect, NoiseEffect, BlendFunction, GodRaysEffect,
  KernelSize,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import {
  GradeEffect, LensEffect, SharpenEffect, EpicLensEffect, BloodLensEffect, lensDirtTexture, bloodSplatTexture,
} from './PostFX.js';

const _lodPos = new THREE.Vector3();

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // push to far plane
}`;

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uSunDisc;
uniform vec3 uSun;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uCloud;
uniform float uCloudiness;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p = p * 2.03 + vec3(9.1, 5.7, 3.3);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.015, 0.30, h));

  float sd = max(dot(dir, normalize(uSun)), 0.0);
  col += uSunColor * pow(sd, 900.0) * 1.05 * uSunDisc;
  col += uSunColor * pow(sd, 40.0) * 0.09;
  col += uSunColor * pow(sd, 14.0) * 0.16;
  col += uSunColor * pow(sd, 3.0) * 0.045;

  if (h > 0.002) {
    float t = uTime * 0.0022;
    vec3 q = dir * 3.4 + vec3(t * 1.2, t * 0.2, t * 0.7);
    float n1 = fbm3(q);
    float n2 = fbm3(q * 2.15 + vec3(4.0, t * 0.8, 1.0));
    float c = smoothstep(0.46, 0.74, n1 * 0.72 + n2 * 0.38);
    c *= smoothstep(0.0, 0.14, h);
    vec3 cc = mix(uCloud * 0.62, uCloud * 1.2, smoothstep(0.2, 0.8, n2));
    cc += uSunColor * pow(sd, 10.0) * 0.14;
    col = mix(col, cc, c * (0.05 + 0.75 * uCloudiness));
  }

  col = mix(col, uHorizon * 1.06, smoothstep(0.12, -0.02, h) * 0.8);
  col = mix(col, uGround, smoothstep(0.0, -0.18, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Quality presets: one table drives every graphics cost. */
export const QUALITY_PRESETS = [
  { name: '低', ao: null, aoHalf: true, godRays: 0, bloom: true, bloomLevels: 4, lens: true, shadow: 1024, pr: 1.0, sharpen: false },
  { name: '中', ao: 'Low', aoHalf: true, godRays: 24, bloom: true, bloomLevels: 5, lens: true, shadow: 2048, pr: 1.25, sharpen: true },
  { name: '高', ao: 'Medium', aoHalf: true, godRays: 40, bloom: true, bloomLevels: 7, lens: true, shadow: 3072, pr: 1.5, sharpen: true },
  { name: '极致', ao: 'High', aoHalf: false, godRays: 48, bloom: true, bloomLevels: 7, lens: true, shadow: 4096, pr: 1.75, sharpen: true },
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.06, 1600);
    this.scene.add(this.camera);

    // Separate first-person layer so the weapon never clips into world geometry.
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 12);
    this.viewScene.add(this.viewCamera);

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true,
    });
    // `?dpr=` pins the render resolution (testing / low-end machines); otherwise
    // the quality preset chooses it and adaptive resolution trims it.
    this.dprOverride = Number(new URLSearchParams(location.search).get('dpr') || 0);
    this.renderScale = 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Tonemapping and colour grading run in the post stack, on HDR.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = false;

    this.fog = new THREE.FogExp2(0x9a9789, 0.0024);
    this.scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight(0xffe2b8, 2.35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(3072, 3072);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    sc.near = 1; sc.far = 420;
    this.sun.shadow.bias = -0.0007;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xb6c2cc, 0x5f5342, 1.55);
    this.scene.add(this.hemi);
    this.fill = new THREE.AmbientLight(0x7b8490, 0.32);
    this.scene.add(this.fill);

    this.skyUniforms = {
      uTime: { value: 0 },
      uSunDisc: { value: 1 },
      uSun: { value: new THREE.Vector3(-0.45, 0.24, -0.86).normalize() },
      uTop: { value: new THREE.Color(0x3d4a5a) },
      uHorizon: { value: new THREE.Color(0xc9a97e) },
      uGround: { value: new THREE.Color(0x6d6252) },
      uSunColor: { value: new THREE.Color(0xffd9a0) },
      uCloud: { value: new THREE.Color(0x4e5257) },
      uCloudiness: { value: 0.55 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 32, 20),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    this.sky = sky;
    this.scene.add(sky);

    // Weapon-layer lighting (matches world direction closely enough).
    const vSun = new THREE.DirectionalLight(0xffe6c4, 2.4);
    vSun.position.set(3, 2.5, 3.5);
    this.viewScene.add(vSun);
    const vFill = new THREE.DirectionalLight(0xbcc8d4, 1.1);
    vFill.position.set(-2.5, 1.2, 1.5);
    this.viewScene.add(vFill);
    const vRim = new THREE.DirectionalLight(0xffd8a8, 1.3);
    vRim.position.set(-1, 2, -3.5);
    this.viewScene.add(vRim);
    this.viewScene.add(new THREE.HemisphereLight(0xb9c2c9, 0x40382c, 0.9));
    this.viewScene.add(new THREE.AmbientLight(0xffffff, 0.22));

    this.settings = {
      quality: 2, adaptiveRes: true, fxBloom: true, fxGodRays: true, fxLens: true, fxEpic: true, fxBlood: true,
      fxCA: true, fxGrain: true, fxAO: true,
    };
    this.features = QUALITY_PRESETS[2];
    this.damagePulse = 0;
    this.ads = 0;
    this._v = new THREE.Vector3();

    this._buildPost();
    this._createEnvironment();
    this.applyQuality(2);
    this.resize();

    addEventListener('resize', () => this.resize());
  }

  /* ------------------------------------------------------------------ post */
  _buildPost() {
    const r = this.renderer;
    this.composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });

    this.worldPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.worldPass);

    // Screen-space ambient occlusion: the single biggest "the reference looks solid" upgrade.
    this.aoPass = new N8AOPostPass(this.scene, this.camera, 1, 1);
    Object.assign(this.aoPass.configuration, {
      aoRadius: 2.4, distanceFalloff: 0.18, intensity: 3.6, halfRes: true, depthAwareUpsampling: true,
      gammaCorrection: false, color: new THREE.Color(0x0d0a08),
    });
    this.aoPass.setQualityMode('Medium');
    this.composer.addPass(this.aoPass);

    // HDR stage: god rays from the sun, tight bloom, lens smudges.
    this.bloom = new BloomEffect({
      intensity: 0.50, luminanceThreshold: 1.05, luminanceSmoothing: 0.35, mipmapBlur: true, radius: 0.68, levels: 7,
    });
    this.sunSource = new THREE.Mesh(
      new THREE.SphereGeometry(18, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc890, transparent: true, depthWrite: false, fog: false }),
    );
    this.sunDir = null;
    this.godRays = new GodRaysEffect(this.camera, this.sunSource, {
      resolutionScale: 0.5, kernelSize: KernelSize.SMALL, density: 0.94, decay: 0.93, weight: 0.22, exposure: 0.50,
      samples: 40, clampMax: 1.0, blur: true,
    });
    this.lens = new LensEffect(this.bloom, lensDirtTexture());
    this.epic = new EpicLensEffect(this.bloom);
    this.hdrPass = new EffectPass(this.camera, this.godRays, this.bloom, this.lens, this.epic);
    this.composer.addPass(this.hdrPass);

    // Viewmodel after the depth-reading HDR effects (the pass clears depth, so the sun cannot shine through walls).
    this.viewPass = new RenderPass(this.viewScene, this.viewCamera);
    this.viewPass.clearPass.setClearFlags(false, true, false);
    this.viewPass.ignoreBackground = true;
    this.viewPass.skipShadowMapUpdate = true;
    this.composer.addPass(this.viewPass);

    // Display stage.
    this.toneMap = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.grade = new GradeEffect();
    this.chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.45 });
    this.vignette = new VignetteEffect({ offset: 0.4, darkness: 0.28 });
    this.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    this.noise.blendMode.opacity.value = 0.022;
    this.blood = new BloodLensEffect(bloodSplatTexture({ seed: 91 }), bloodSplatTexture({ seed: 407 }));
    this.gradePass = new EffectPass(
      this.camera, this.toneMap, this.grade, this.blood, this.vignette, this.chroma, this.noise,
    );
    this.composer.addPass(this.gradePass);

    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.aaPass = new EffectPass(this.camera, this.smaa);
    this.composer.addPass(this.aaPass);

    this.sharpen = new SharpenEffect(0.5);
    this.sharpenPass = new EffectPass(this.camera, this.sharpen);
    this.composer.addPass(this.sharpenPass);

    this.composer.autoRenderToScreen = false;
    this._route();

    // Effects whose blend is "off" must also skip their internal passes.
    for (const e of [this.godRays, this.bloom, this.lens, this.epic, this.blood]) {
      const u = e.update.bind(e);
      e._blendOn = e.blendMode.blendFunction;
      e.update = (...a) => { if (e._active !== false) u(...a); };
    }
  }

  _route() {
    const passes = this.composer.passes;
    let last = null;
    for (const p of passes) if (p.enabled) last = p;
    for (const p of passes) {
      const want = p === last;
      if (p.renderToScreen !== want) p.renderToScreen = want;
    }
  }

  _setEffectActive(e, on) {
    if ((e._active !== false) === on) return;
    e._active = on;
    e.blendMode.blendFunction = on ? e._blendOn : BlendFunction.SKIP;
  }

  /* ------------------------------------------------------------- settings */
  applySettings(s) {
    this.settings = { ...this.settings, ...(s || {}) };
    this.applyQuality(this.settings.quality ?? 2);
    this.applyToggles();
  }

  applyToggles() {
    const s = this.settings;
    const on = (k) => s[k] !== false;
    this._setEffectActive(this.bloom, on('fxBloom'));
    this._setEffectActive(this.godRays, this.features.godRays > 0 && on('fxGodRays'));
    this.lensOn = on('fxLens');
    this._setEffectActive(this.lens, this.lensOn || on('fxBloom'));
    this._setEffectActive(this.epic, on('fxEpic'));
    this._setEffectActive(this.blood, on('fxBlood'));
    this.caOn = on('fxCA');
    this.noise.blendMode.opacity.value = on('fxGrain') ? 0.022 : 0;
    this.aoPass.enabled = !!this.features.ao && on('fxAO');
    this.sharpenPass.enabled = !!this.features.sharpen;
    this._route();
  }

  /**
   * Render resolution, as a fraction of the quality preset's pixel ratio.
   *
   * Frame cost here is almost entirely fill: AO, god rays, bloom and SMAA all
   * scale with the number of shaded pixels, and on a Retina panel the preset's
   * 1.5x means 2.3 MP of them. Dropping the scale is the only lever that buys
   * frame time without touching what is on screen — it just costs sharpness,
   * which is why "适配" keeps it as high as the frame budget allows.
   */
  setRenderScale(s, { silent = false } = {}) {
    this.renderScale = THREE.MathUtils.clamp(s, 0.5, 1);
    this._applyPixelRatio();
    this._applyBudget();
    if (!silent) this.onRenderScale?.(this.renderScale);
  }

  /**
   * Tie the two expensive passes to the same budget the resolution follows.
   *
   * Measured on an M-class laptop at 1512x982: ambient occlusion is the single
   * largest post cost (23.2 ms -> 17.4 ms with it off), shadows next (3 ms).
   * When the adaptive scaler has already given up pixels, it means the machine
   * cannot afford the full preset; dropping AO to its low mode and the cascade
   * to 2048 buys back more than the pixels cost, and at a reduced resolution the
   * difference is not visible.
   */
  _applyBudget() {
    const tight = (this.renderScale ?? 1) < 0.9;
    // On a tight budget the cascades refresh every other frame. The sun is
    // static, so the only thing that can lag is a moving character's shadow by
    // one displayed frame — invisible at 40+ fps, and it halves a pass that
    // measured 3 ms at 1512x982.
    this._shadowEvery = tight ? 2 : 1;
    const f = this.features;
    if (this.aoPass && f?.ao) {
      const mode = tight ? 'Low' : f.ao;
      if (this._aoMode !== mode) {
        this._aoMode = mode;
        this.aoPass.setQualityMode(mode);
      }
      const half = tight ? true : !!f.aoHalf;
      if (this.aoPass.configuration.halfRes !== half) {
        this.aoPass.configuration.halfRes = half;
        this.aoPass.setSize?.(this.composer?._width ?? innerWidth, this.composer?._height ?? innerHeight);
      }
    }
    if (f?.shadow) {
      const want = tight ? Math.min(f.shadow, 2048) : f.shadow;
      this.scene.traverse((o) => {
        if (!o.isDirectionalLight || !o.castShadow) return;
        if (o.shadow.mapSize.x !== want) {
          o.shadow.mapSize.set(want, want);
          o.shadow.map?.dispose();
          o.shadow.map = null;
        }
      });
    }
  }

  _applyPixelRatio() {
    const base = Math.min(devicePixelRatio || 1, this.features?.pr ?? 1);
    const forced = Number(this.dprOverride || 0);
    const pr = forced > 0 ? forced : Math.max(0.5, base * (this.renderScale ?? 1));
    this.renderer.setPixelRatio(pr);
    this.composer?.setPixelRatio?.(pr);
    this.resize();
  }

  /**
   * Adaptive resolution: hold a frame budget instead of a fixed ratio.
   *
   * Sampled as an exponential average of real frame time, adjusted at most once
   * every 45 frames, with a wide dead band (13-20 ms) so it settles rather than
   * hunting. Never kicks in under `?capture=1`, where a stable resolution is the
   * entire point of the harness.
   */
  _adaptiveResolution(dt) {
    if (window.__CAPTURE__ || this.dprOverride > 0 || this.settings.adaptiveRes === false) return;
    const ms = dt * 1000;
    if (!(ms > 0 && ms < 200)) return;      // ignore tab-switch spikes
    this._ftAvg = this._ftAvg ? this._ftAvg * 0.88 + ms * 0.12 : ms;
    this._rsTick = (this._rsTick || 0) + 1;

    const TARGET = 16.7;   // 60 fps
    const HI = 18.5;       // above this, give up pixels
    const LO = 14.5;       // below this, reclaim them
    const avg = this._ftAvg;
    const far = avg > HI * 1.35;
    // Converge fast when the frame is far over budget, settle slowly near it.
    if (this._rsTick < (far ? 20 : 60)) return;

    const scale = this.renderScale ?? 1;
    let next = scale;
    if (avg > HI) {
      // Time scales with pixel count, so scale ~ sqrt(target / actual).
      const want = Math.sqrt(TARGET / avg);
      next = Math.min(scale - 0.02, scale * want);
    } else if (avg < LO && scale < 1) {
      next = scale + 0.04;
    } else {
      this._rsTick = 0;
      return;
    }
    next = THREE.MathUtils.clamp(next, 0.55, 1);
    if (Math.abs(next - scale) < 0.005) { this._rsTick = 0; return; }
    this._rsTick = 0;
    // The average describes the old resolution; start measuring the new one fresh.
    this._ftAvg = 0;
    this.setRenderScale(next);
  }

  applyQuality(q) {
    q = THREE.MathUtils.clamp(Math.round(q ?? 2), 0, 3);
    this.settings.quality = q;
    const f = this.features = QUALITY_PRESETS[q];
    this.aoPass.enabled = !!f.ao;
    if (f.ao) {
      this.aoPass.setQualityMode(f.ao);
      this.aoPass.configuration.halfRes = !!f.aoHalf;
    }
    if (this.bloom.mipmapBlurPass.levels !== f.bloomLevels) this.bloom.mipmapBlurPass.levels = f.bloomLevels;
    this.godRays.samples = f.godRays;
    this.sharp = 0.5;
    this.sharpen.uniforms.get('sharpness').value = this.sharp;
    // Sun shadow-map size.
    this.scene.traverse((o) => {
      if (!o.isDirectionalLight || !o.castShadow) return;
      if (f.shadow > 0 && o.shadow.mapSize.x !== f.shadow) o.shadow.mapSize.set(f.shadow, f.shadow);
    });
    this._applyPixelRatio();
    this.applyToggles();
    this.onQuality?.(q);
  }

  /* ------------------------------------------------------------ environment */
  _createEnvironment() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#56657a');
    g.addColorStop(0.42, '#9aa4a6');
    g.addColorStop(0.54, '#cdbfa2');
    g.addColorStop(0.7, '#7d7260');
    g.addColorStop(1, '#3d382e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
    const sun = ctx.createRadialGradient(64, 58, 1, 64, 58, 46);
    sun.addColorStop(0, 'rgba(255,240,210,0.95)');
    sun.addColorStop(0.25, 'rgba(255,215,160,0.45)');
    sun.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, 200, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this._setEnvironmentMap(tex, 0.7, 0);
    this._usingHDRI = false;
  }

  _setEnvironmentMap(tex, intensity, rotation) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromEquirectangular(tex);
    this._envRT?.dispose();
    this._envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = intensity;
    this.scene.environmentRotation.y = rotation;
    this.viewScene.environment = rt.texture;
    this.viewScene.environmentIntensity = Math.min(1.25, intensity + 0.2);
    this.viewScene.environmentRotation.y = rotation;
    pmrem.dispose();
  }

  /**
   * Reflect the actual procedural sky into the IBL. Puddles and wet asphalt mirror this environment,
   * so they pick up the real horizon/sun tint of each campaign instead of a flat gradient.
   */
  captureSkyEnvironment({ intensity = 0.82, rotation = 0 } = {}) {
    if (!this.sky) return;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(this.sky.geometry, this.sky.material);
    sky.frustumCulled = false;
    envScene.add(sky);
    const prevDisc = this.skyUniforms.uSunDisc.value;
    this.skyUniforms.uSunDisc.value = 0;
    let rt;
    try {
      rt = pmrem.fromScene(envScene, 0.02, 0.1, 3000);
    } finally {
      this.skyUniforms.uSunDisc.value = prevDisc;
    }
    this._envRT?.dispose();
    this._envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = intensity;
    this.scene.environmentRotation.y = rotation;
    this.viewScene.environment = rt.texture;
    this.viewScene.environmentIntensity = Math.min(1.2, intensity + 0.15);
    this.viewScene.environmentRotation.y = rotation;
    pmrem.dispose();
    this._usingHDRI = false;
  }

  setHDRI(texture, { intensity = 0.95, rotation = 0 } = {}) {
    if (!texture) return false;
    this._setEnvironmentMap(texture, intensity, rotation);
    this._usingHDRI = true;
    return true;
  }

  /* ---------------------------------------------------------------- sun/lens */
  setSun(dir, color) {
    if (!dir) return;
    this.sunDir = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    if (color !== undefined && color !== null) {
      const c = new THREE.Color(color);
      this.sunSource.material.color.copy(c);
      this.lens.uniforms.get('sunColor').value.copy(c);
    }
  }

  _updateSun() {
    const cam = this.camera, lu = this.lens.uniforms;
    if (!this.sunDir) { lu.get('sunOn').value = 0; return; }
    cam.updateMatrixWorld();
    this.sunSource.position.copy(cam.position).addScaledVector(this.sunDir, 900);
    this.sunSource.updateMatrixWorld();
    const v = this._v.copy(this.sunSource.position).project(cam);
    const facing = cam.getWorldDirection(new THREE.Vector3()).dot(this.sunDir);
    const onScreen = v.z < 1 && Math.abs(v.x) < 1.3 && Math.abs(v.y) < 1.3 && facing > 0;
    lu.get('sunUV').value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    lu.get('sunOn').value = onScreen && this.lensOn ? THREE.MathUtils.smoothstep(facing, 0.4, 0.9) : 0;
    lu.get('dirtK').value = this.lensOn && this.bloom._active !== false ? 0.5 : 0;
  }

  /* -------------------------------------------------------------- public api */
  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    if (this.lens) this.lens.uniforms.get('aspect').value = w / h;
    if (this.epic) this.epic.uniforms.get('epicAspect').value = w / h;
    if (this.blood) this.blood.uniforms.get('bloodAspect').value = w / h;
  }

  setEnvironment({
    fogColor, fog, fogDensity, sunColor, sun, sunIntensity, sunDir, sunDisc, godRayWeight,
    skyTop, skyHorizon, cloudiness, cloudColor, groundColor, ground, hemiIntensity, hemiColor, hemiGround,
  }) {
    // Campaigns use both naming conventions (`fog`/`fogColor`, `sun`/`sunColor`, …).
    if (fogColor === undefined) fogColor = fog;
    if (sunColor === undefined) sunColor = sun;
    if (groundColor === undefined) groundColor = ground;
    if (fogColor !== undefined) this.fog.color.set(fogColor);
    if (fogDensity !== undefined) this.fog.density = fogDensity;
    if (sunColor !== undefined) this.sun.color.set(sunColor);
    if (sunIntensity !== undefined) this.sun.intensity = sunIntensity;
    // These are written on every mission, not only when a campaign overrides
    // them: the renderer survives a campaign switch, and a fog map's dimmer sun
    // or brighter ambient must not leak into the next mission.
    this.hemi.intensity = hemiIntensity ?? 1.55;
    this.hemi.color.set(hemiColor ?? 0xb6c2cc);
    this.hemi.groundColor.set(hemiGround ?? 0x5f5342);
    if (sunDir) {
      this.sun.position.copy(sunDir).normalize().multiplyScalar(160);
      this.skyUniforms.uSun.value.copy(sunDir).normalize();
      this.setSun(sunDir, sunColor ?? 0xffd9a0);
    }
    // Dense weather diffuses the sun: the disc and the shafts both soften
    // without disabling the sun source the lens and god rays read from.
    this.skyUniforms.uSunDisc.value = sunDisc ?? 1;
    this.godRays.weight = godRayWeight ?? 0.18;
    if (skyTop !== undefined) this.skyUniforms.uTop.value.set(skyTop);
    if (skyHorizon !== undefined) this.skyUniforms.uHorizon.value.set(skyHorizon);
    if (cloudiness !== undefined) this.skyUniforms.uCloudiness.value = cloudiness;
    if (groundColor !== undefined) this.skyUniforms.uGround.value.set(groundColor);
    this.skyUniforms.uCloud.value.set(cloudColor ?? 0x4e5257);
    this.skyUniforms.uSunColor.value.set(sunColor ?? 0xffd9a0);
    // Rebuild the IBL from the new sky so wet surfaces and puddles reflect it.
    this.captureSkyEnvironment({ intensity: 0.95 });
  }

  setDamage(amount) { this.damagePulse = Math.min(1, this.damagePulse + amount); }

  /**
   * Throw blood on the lens. `amount` is 0..1 and lands as film opacity; the
   * effect itself decides placement, mirroring and drip phase so repeated hits
   * from the same direction still look like separate splashes.
   */
  splatter(amount = 0.5) {
    if (this.settings.fxBlood === false) return;
    this.blood?.splat(amount);
  }

  clearSplatter() { this.blood?.clear(); }

  update(dt, playerPos) {
    this.skyUniforms.uTime.value += dt;
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    if (playerPos) {
      // Keep the shadow frustum centred ahead of the player.
      this.sun.target.position.set(playerPos.x, 0, playerPos.z);
      this.sun.position.copy(this.sun.target.position).add(
        this.skyUniforms.uSun.value.clone().multiplyScalar(150),
      );
      this.sun.target.updateMatrixWorld();
    }
    this._shadowLod();
    this._adaptiveResolution(dt);
  }

  /**
   * Shadow-caster LOD.
   *
   * Every visible mesh is submitted twice — once into the cascade, once into the
   * frame — so a prop that covers four pixels of shadow still costs a draw call
   * and its vertices. Small objects (props, soldier gear, debris) stop casting
   * once their shadow is smaller than a cascade texel, and geometry under ~12 cm
   * never casts at all: at any distance the cascades resolve, that silhouette is
   * noise.
   *
   * The candidate list is rebuilt every 120 frames rather than every frame, since
   * the scene only changes when something spawns or is torn down.
   */
  _shadowLod() {
    this._frameCount = (this._frameCount || 0) + 1;
    if (!this._casters || this._frameCount - this._castersFrame >= 120) {
      this._castersFrame = this._frameCount;
      this._casters = [];
      this.scene.traverse((o) => {
        if (!o.isMesh && !o.isInstancedMesh) return;
        if (o.userData.noShadowLod) return;
        const g = o.geometry;
        if (!g) return;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const radius = g.boundingSphere?.radius ?? 1;
        if (radius > 4) return; // big set-pieces earn their shadow
        this._casters.push({ mesh: o, radius, base: o.castShadow });
      });
    }
    const cam = this.camera.position;
    for (const c of this._casters) {
      const m = c.mesh;
      if (!m.parent) continue;
      // Range scales with size: a 3 m palm canopy throws dappled shade across the
      // beach at 80 m and must keep casting, while a 0.4 m crate at that range
      // covers a couple of texels.
      const range = 30 + c.radius * 45;
      const want = c.base && c.radius >= 0.12
        && m.getWorldPosition(_lodPos).distanceToSquared(cam) < range * range;
      if (m.castShadow !== want) m.castShadow = want;
    }
  }

  render(dt = 0) {
    const r = this.renderer;
    this.damagePulse = Math.max(0, this.damagePulse - dt * 1.8);
    const ca = this.caOn ? this.damagePulse * 0.006 : 0;
    this.chroma.offset.set(ca, ca * 0.6);
    const adsT = this.camera.fov < 60 ? 1 : 0;
    this.ads += (adsT - this.ads) * Math.min(1, dt * 8);
    this.vignette.darkness = 0.24 + this.ads * 0.12 + this.damagePulse * 0.25;
    this.grade.uniforms.get('saturation').value = 0.95 - this.damagePulse * 0.22;
    this.blood.tick(dt);
    this._updateSun();
    r.info.reset();
    const every = this._shadowEvery || 1;
    r.shadowMap.needsUpdate = every === 1 || (this._frameCount % every === 0);
    this.composer.render(dt);
  }
}
