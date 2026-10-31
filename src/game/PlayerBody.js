import * as THREE from 'three';

/**
 * First-person body: the same soldier rig the bots use, placed under the camera so
 * looking down shows legs, hips and belly — and, because only the *colour* materials
 * are clipped, the shadow pass still casts a complete, correctly animated silhouette.
 *
 * The upper chest is discarded per fragment by world height, so the camera never sits
 * inside the head. Crouching/sliding/mantling hides the body: the shared rig has no
 * crouch pose, and straight legs while crouched read worse than no body at all.
 */
export class PlayerBody {
  constructor(game) {
    this.game = game;
    this.model = game.characters?.ready ? game.characters.create(0, 0) : null;
    this.clipY = { value: 1e9 };
    this._patched = new Map();
    this._materials = [];
    if (!this.model) return;

    const body = this.model;
    // The viewmodel owns the rifle; the body's own copy would poke through the chest cut.
    if (body.weapon) body.weapon.visible = false;

    body.group.traverse((o) => {
      // The cap's star is a billboard sprite: it can't take the per-fragment cut.
      if (o.isSprite) { o.visible = false; return; }
      if (!o.isMesh) return;
      // It's right under the camera: never cull it, and keep the shadow.
      o.frustumCulled = false;
      o.castShadow = true;
      o.receiveShadow = true;
      const patch = (m) => this._patchMaterial(m);
      o.material = Array.isArray(o.material) ? o.material.map(patch) : patch(o.material);
    });

    game.worldGroup.add(body.group);
    this.group = body.group;
    this.time = 0;
  }

  _patchMaterial(source) {
    if (!source) return source;
    if (this._patched.has(source)) return this._patched.get(source);
    const clipY = this.clipY;
    const mat = source.clone();
    const prev = source.onBeforeCompile;
    const prevKey = source.customProgramCacheKey?.bind(source);
    mat.onBeforeCompile = (shader, renderer) => {
      prev?.call(mat, shader, renderer);
      shader.uniforms.pbClipY = clipY;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vPBWorldY;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\n  vPBWorldY = (modelMatrix * vec4(transformed, 1.0)).y;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float pbClipY; varying float vPBWorldY;')
        .replace('void main() {', 'void main() {\n  if (vPBWorldY > pbClipY) discard;');
    };
    mat.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|pbclip`;
    this._patched.set(source, mat);
    this._materials.push(mat);
    return mat;
  }

  update(dt) {
    if (!this.model) return;
    const g = this.game;
    const p = g.player;
    const visible = !!(p?.alive && g.started && g.match?.state !== 'ended'
      && !p.crouching && !p.sliding && !p.mantle);
    this.group.visible = visible;
    if (!visible) return;

    this.time += dt;
    // Stand the body a hair behind the eye so looking straight down frames the feet.
    const back = 0.1;
    const x = p.position.x + Math.sin(p.yaw) * back;
    const z = p.position.z + Math.cos(p.yaw) * back;
    this.model.setPosition(x, p.position.y, z, p.yaw);

    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    this.model.update(dt, speed, false, true);

    // Cut just below the collarbones, following crouch/slide eye height.
    this.clipY.value = p.position.y + p.eyeHeight - 0.48;
  }

  dispose() {
    this.model?.dispose?.();
    if (this.group) this.group.removeFromParent();
    for (const m of this._materials) m.dispose?.();
    this._materials.length = 0;
    this._patched.clear();
    this.model = null;
    this.group = null;
  }
}
