import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export const G = {
  WORLD: 1 << 0,
  PLAYER: 1 << 1,
  BOT: 1 << 2,
  DEBRIS: 1 << 3,
  BULLET: 1 << 4,
};

export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

/**
 * Thin Rapier wrapper: static level colliders, character controllers, ray queries.
 * All gameplay units are metres.
 */
export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.accum = 0;
    this.colliderData = new Map();
    this.dynamicLinks = [];
    this._ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    this._shapePos = { x: 0, y: 0, z: 0 };
    this._shapeRot = { x: 0, y: 0, z: 0, w: 1 };
  }

  step(dt) {
    this.accum += Math.min(dt, 0.1);
    let steps = 0;
    while (this.accum >= this.world.timestep && steps < 4) {
      this.world.step();
      this.accum -= this.world.timestep;
      steps++;
    }
    for (const l of this.dynamicLinks) {
      if (!l.body.isValid()) continue;
      const p = l.body.translation();
      const q = l.body.rotation();
      l.object.position.set(p.x, p.y, p.z);
      l.object.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }

  tag(collider, data) {
    this.colliderData.set(collider.handle, data);
    return collider;
  }
  dataOf(collider) { return this.colliderData.get(collider.handle); }

  addStaticBox(center, half, quat, data = {}, group = G.WORLD) {
    const body = this.world.createRigidBody(
      this.R.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z)
        .setRotation(quat ? { x: quat.x, y: quat.y, z: quat.z, w: quat.w } : { x: 0, y: 0, z: 0, w: 1 }),
    );
    const c = this.world.createCollider(
      this.R.ColliderDesc.cuboid(half.x, half.y, half.z).setCollisionGroups(groups(group, 0xffff)),
      body,
    );
    return this.tag(c, data);
  }

  addStaticCylinder(center, halfHeight, radius, data = {}) {
    const body = this.world.createRigidBody(
      this.R.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z),
    );
    const c = this.world.createCollider(
      this.R.ColliderDesc.cylinder(halfHeight, radius).setCollisionGroups(groups(G.WORLD, 0xffff)),
      body,
    );
    return this.tag(c, data);
  }

  /** Collider matching the world-space OBB of a mesh. */
  addMeshBox(mesh, data = {}) {
    mesh.updateWorldMatrix(true, false);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    mesh.matrixWorld.decompose(pos, quat, scl);
    const localCenter = bb.getCenter(new THREE.Vector3());
    const half = bb.getSize(new THREE.Vector3()).multiply(scl).multiplyScalar(0.5);
    const center = localCenter.multiply(scl).applyQuaternion(quat).add(pos);
    return this.addStaticBox(center, half, quat, data);
  }

  addTrimesh(mesh, data = {}, group = G.WORLD) {
    mesh.updateWorldMatrix(true, false);
    const g = mesh.geometry;
    const posAttr = g.attributes.position;
    const verts = new Float32Array(posAttr.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
      verts[i * 3] = v.x; verts[i * 3 + 1] = v.y; verts[i * 3 + 2] = v.z;
    }
    let idx;
    if (g.index) idx = new Uint32Array(g.index.array);
    else { idx = new Uint32Array(posAttr.count); for (let i = 0; i < idx.length; i++) idx[i] = i; }
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.fixed());
    const c = this.world.createCollider(
      this.R.ColliderDesc.trimesh(verts, idx).setCollisionGroups(groups(group, 0xffff)), body);
    return this.tag(c, data);
  }

  addDynamicBox(object, half, mass = 1, velocity, angVel, group = G.DEBRIS) {
    const body = this.world.createRigidBody(
      this.R.RigidBodyDesc.dynamic()
        .setTranslation(object.position.x, object.position.y, object.position.z)
        .setRotation(object.quaternion)
        .setLinearDamping(0.1).setAngularDamping(0.4)
        .setCcdEnabled(true),
    );
    if (velocity) body.setLinvel(velocity, true);
    if (angVel) body.setAngvel(angVel, true);
    this.world.createCollider(
      this.R.ColliderDesc.cuboid(half.x, half.y, half.z).setMass(mass).setRestitution(0.3).setFriction(0.8)
        .setCollisionGroups(groups(group, G.WORLD | G.DEBRIS)),
      body,
    );
    const link = { body, object, ttl: 20 };
    this.dynamicLinks.push(link);
    return link;
  }

  removeDynamic(link) {
    const i = this.dynamicLinks.indexOf(link);
    if (i >= 0) this.dynamicLinks.splice(i, 1);
    if (link.body.isValid()) this.world.removeRigidBody(link.body);
  }

  raycast(origin, dir, maxDist, mask = G.WORLD, exclude) {
    this._ray.origin = origin;
    this._ray.dir = dir;
    const hit = this.world.castRayAndGetNormal(
      this._ray, maxDist, true, undefined, groups(0xffff, mask), exclude,
    );
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: t,
      collider: hit.collider,
      data: this.dataOf(hit.collider) || {},
    };
  }

  lineOfSight(a, b, mask = G.WORLD) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    return !this.raycast(a, d, len - 0.1, mask);
  }

  /** Ground height under a point (used for bots and prop placement). */
  groundAt(x, z, from = 200) {
    const hit = this.raycast({ x, y: from, z }, { x: 0, y: -1, z: 0 }, from * 2, G.WORLD);
    return hit ? hit.point.y : 0;
  }

  makeCharacter(radius = 0.35, halfHeight = 0.55, footY = 2) {
    const R = this.R;
    const collider = this.world.createCollider(
      R.ColliderDesc.capsule(halfHeight, radius)
        .setTranslation(0, footY, 0)
        .setCollisionGroups(groups(G.PLAYER, G.WORLD | G.PLAYER | G.BOT)),
    );
    const kcc = this.world.createCharacterController(0.02);
    kcc.setUp({ x: 0, y: 1, z: 0 });
    kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    kcc.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    kcc.enableAutostep(0.45, 0.15, false);
    kcc.enableSnapToGround(0.35);
    kcc.setApplyImpulsesToDynamicBodies(true);
    kcc.setCharacterMass(80);
    return { collider, kcc };
  }
}
