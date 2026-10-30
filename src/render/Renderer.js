import * as THREE from 'three';

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
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.52));

  float sd = max(dot(dir, normalize(uSun)), 0.0);
  col += uSunColor * pow(sd, 420.0) * 1.8;
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
    col = mix(col, cc, c * (0.5 + 0.38 * uCloudiness));
  }

  col = mix(col, uHorizon * 1.06, smoothstep(0.12, -0.02, h) * 0.8);
  col = mix(col, uGround, smoothstep(0.0, -0.18, h));
  gl_FragColor = vec4(col, 1.0);
}`;

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
      canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.fog = new THREE.FogExp2(0x9a9789, 0.0024);
    this.scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight(0xffe2b8, 2.35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
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
    this._createEnvironment();

    this.skyUniforms = {
      uTime: { value: 0 },
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

    addEventListener('resize', () => this.resize());
  }

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
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromEquirectangular(tex);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.62;
    this.viewScene.environment = rt.texture;
    this.viewScene.environmentIntensity = 0.85;
    tex.dispose();
    pmrem.dispose();
  }

  /**
   * Replaces the placeholder sky-gradient IBL with a real HDR environment.
   * Called once per mission with the campaign's HDRI.
   */
  setHDRI(texture, { intensity = 0.95, rotation = 0 } = {}) {
    if (!texture) return false;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromEquirectangular(texture);
    this._envRT?.dispose();
    this._envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = intensity;
    this.scene.environmentRotation.y = rotation;
    this.viewScene.environment = rt.texture;
    this.viewScene.environmentIntensity = Math.min(1.25, intensity + 0.2);
    this.viewScene.environmentRotation.y = rotation;
    pmrem.dispose();
    return true;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setEnvironment({ fogColor, fogDensity, sunColor, sunIntensity, sunDir, skyTop, skyHorizon, cloudiness, cloudColor, groundColor }) {
    if (fogColor !== undefined) this.fog.color.set(fogColor);
    if (fogDensity !== undefined) this.fog.density = fogDensity;
    if (sunColor !== undefined) this.sun.color.set(sunColor);
    if (sunIntensity !== undefined) this.sun.intensity = sunIntensity;
    if (sunDir) {
      this.sun.position.copy(sunDir).normalize().multiplyScalar(160);
      this.skyUniforms.uSun.value.copy(sunDir).normalize();
    }
    if (skyTop !== undefined) this.skyUniforms.uTop.value.set(skyTop);
    if (skyHorizon !== undefined) this.skyUniforms.uHorizon.value.set(skyHorizon);
    if (cloudiness !== undefined) this.skyUniforms.uCloudiness.value = cloudiness;
    if (groundColor !== undefined) this.skyUniforms.uGround.value.set(groundColor);
    this.skyUniforms.uCloud.value.set(cloudColor ?? 0x4e5257);
    this.skyUniforms.uSunColor.value.set(sunColor ?? 0xffd9a0);
  }

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
  }

  render() {
    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.autoClear = false;
    r.render(this.viewScene, this.viewCamera);
    r.autoClear = true;
  }
}
