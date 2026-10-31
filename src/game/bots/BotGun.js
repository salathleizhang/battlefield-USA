import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clamp, damp } from '../../core/MathUtil.js';

/**
 * Third-person weapon for the bots, ported from the reference project's
 * `Character.attachWeapon` / `_placeWeapon` / `_twoBoneIK`.
 *
 * The player's first-person rigs (`models/fp/<id>.glb`) contain the gun **and** gloved arms. For a bot
 * only `Gun_<id>` is kept. It is mounted on the **character root**, not in the hand: every frame the
 * stock is seated in the right shoulder pocket, the bore laid on the aim line, and both hands are
 * two-bone IK'd onto the pistol grip / handguard. That is what keeps the rifle pointing where the bot
 * looks instead of inheriting the wrist's idle angle.
 *
 * Axis convention: the wrapper's origin is the primary grip, the bore runs down local **-Z**, local
 * +Y is up and local +Z is the butt, so an `Euler(pitch, yaw, roll, 'YXZ')` aims it directly.
 */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

/** Real-world length (muzzle to butt, metres) used to normalise each model. */
const LENGTH = { m4a1: 0.84, ak47: 0.88, scarl: 0.89, mp5a5: 0.52, vss: 0.89, m24: 1.10, awm: 1.24, shotgun: 0.98, p226: 0.20, m1911: 0.22 };

/** Shoulder-pocket height trim (m): bore sits a little under the eye. */
const POCKET_Y = 0.10;
/** Sprint carry engages above this ground speed (m/s). */
const CARRY_SPEED = 4.2;

const UP = new THREE.Vector3(0, 1, 0);

/** Build one normalised gun template: grip at the origin, bore -Z, stock +Z. */
async function buildTemplate(id) {
  const gltf = await loader.loadAsync(`/assets/models/fp/${id}.glb`);
  const root = gltf.scene.getObjectByName(`FP_${id}`) || gltf.scene;
  const gunSrc = root.getObjectByName(`Gun_${id}`) || root;
  root.updateMatrixWorld(true);

  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const local = (o) => (o ? o.getWorldPosition(new THREE.Vector3()).applyMatrix4(invRoot) : null);
  const gripP = local(root.getObjectByName('GripR'));
  const supportP = local(root.getObjectByName('GripL'));
  const muzzleP = local(root.getObjectByName('MuzzleSocket'))
    || local(root.getObjectByName('MuzzleDeviceTip'))
    || local(root.getObjectByName('MuzzleDevice'));

  // Gun source -> character-root rotation. The FP guns are authored bore -Z; measure it instead of
  // trusting that (a wrong `setFromUnitVectors` on opposite vectors used to stand the rifle upright).
  if (!gripP || !muzzleP) throw new Error(`${id}: no GripR/Muzzle marker`);
  const bore = muzzleP.clone().sub(gripP).normalize();
  const zAxis = bore.clone().negate();
  const yAxis = UP.clone().addScaledVector(zAxis, -UP.dot(zAxis));
  if (yAxis.lengthSq() < 1e-5) yAxis.set(0, 0, 1); // vertical bore: any perpendicular will do
  yAxis.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis); // gun-local -> root
  const qGunToRoot = new THREE.Quaternion().setFromRotationMatrix(basis);
  const qRootToGun = qGunToRoot.clone().invert();

  // Keep the authored transform (quantized GLBs carry their dequantisation scale on the node); only
  // wrap it, never reset it.
  const gun = gunSrc.clone(true);
  gun.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) if (m) m.envMapIntensity = 0.8;
  });

  const holder = new THREE.Group();
  holder.add(gun);
  const wrap = new THREE.Group();
  wrap.name = `bot_${id}`;
  wrap.add(holder);
  wrap.updateMatrixWorld(true);

  const raw = new THREE.Box3().setFromObject(wrap);
  const rawLen = Math.max(0.01, raw.max.z - raw.min.z);
  const s = (LENGTH[id] || 0.85) / rawLen;

  // Grip at the wrap origin: p_wrap = s * qRootToGun * (p_root - grip).
  const gripInGun = gripP.clone().applyQuaternion(qRootToGun);
  holder.quaternion.copy(qRootToGun);
  holder.scale.setScalar(s);
  holder.position.copy(gripInGun).multiplyScalar(-s);
  wrap.updateMatrixWorld(true);

  const bb = new THREE.Box3().setFromObject(wrap);
  const muzzlePos = muzzleP.clone().sub(gripP).applyQuaternion(qRootToGun).multiplyScalar(s);
  const muzzleMarker = new THREE.Object3D();
  muzzleMarker.name = 'muzzle';
  muzzleMarker.position.copy(muzzlePos);
  wrap.add(muzzleMarker);

  const support = supportP
    ? supportP.clone().sub(gripP).applyQuaternion(qRootToGun).multiplyScalar(s)
    : new THREE.Vector3(0, -0.02, -0.25).multiplyScalar(s);
  // Butt plate sits ~3 cm below the bore (stock drop at heel), at the rear of the stock.
  const butt = new THREE.Vector3(0, Math.min(muzzlePos.y, bb.max.y - 0.03) - 0.03, bb.max.z - 0.015);

  return {
    template: wrap,
    length: LENGTH[id] || 0.85,
    support,
    butt,
    muzzle: muzzlePos.clone(),
  };
}

/** Load (and cache) one bot gun template. */
export function loadBotGun(id) {
  if (cache.has(id)) return cache.get(id);
  const p = buildTemplate(id).catch((e) => {
    console.warn(`[botgun] ${id} failed`, e?.message || e);
    return null;
  });
  cache.set(id, p);
  return p;
}

/** Bones the gun rig drives. Cached per soldier instance (each one owns a skeleton clone). */
function bonesOf(model) {
  const r = model.root;
  const find = (n) => r.getObjectByName(n);
  return {
    pelvis: find('pelvis'),
    spine1: find('spine_01'),
    spine2: find('spine_02'),
    spine3: find('spine_03'),
    clavR: find('clavicle_r'),
    clavL: find('clavicle_l'),
    upperR: find('upperarm_r'),
    lowerR: find('lowerarm_r'),
    handR: find('hand_r'),
    upperL: find('upperarm_l'),
    lowerL: find('lowerarm_l'),
    handL: find('hand_l'),
    reachL: 0,
    // Bones whose world matrices the rig reads, in hierarchy order (see updateBotGun).
    chain: null,
  };
}

/**
 * Give a bot the reference gun. Hides the character's own low-poly rifle and returns the mounted
 * model (or null if the asset is missing).
 */
export async function equipBotGun(model, id) {
  if (!model?.group) return null;
  const tpl = await loadBotGun(id);
  if (!tpl) return null;

  if (model.weapon) model.weapon.visible = false;
  if (model._botGun) model._botGun.removeFromParent();

  const gun = tpl.template.clone(true);
  gun.userData.butt = tpl.butt.clone();
  gun.userData.support = tpl.support.clone();
  gun.userData.length = tpl.length;
  model.group.add(gun);
  model._botGun = gun;
  model.muzzle = gun.getObjectByName('muzzle') || model.muzzle;
  const b = bonesOf(model);
  b.chain = [b.pelvis, b.spine1, b.spine2, b.spine3, b.clavR, b.upperR, b.lowerR, b.handR,
    b.clavL, b.upperL, b.lowerL, b.handL];
  model._gunBones = b;
  model._gunState = {
    readyW: 1, // bots spawn in low ready
    carryW: 0,
    reloadW: 0,
    settle: 0,
    errR: 0,
    errL: 0,
    handRelR: null,
    handRelL: null,
    rc: { pitch: { x: 0, v: 0 }, yaw: { x: 0, v: 0 }, back: { x: 0, v: 0 } },
  };
  return gun;
}

/** Hand the rifle to the corpse: it rides the firing hand through the death clip. */
export function dropBotGun(model) {
  const gun = model?._botGun;
  if (gun && model.handR && gun.parent !== model.handR) model.handR.attach(gun);
}

/* ------------------------------------------------------------------ maths */
const _e1 = new THREE.Euler();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();

const _wv = new THREE.Vector3();
const _ws = new THREE.Vector3();
const wpos = (o, out) => out.setFromMatrixPosition(o.matrixWorld);
/** Recompose just this object's world matrix (its parent is already current). */
function refreshWorld(o) {
  o.updateMatrix();
  o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
  return o;
}
const wquat = (o, out) => { o.matrixWorld.decompose(_wv, out, _ws); return out; };

/** Critically damped spring, exact integration (reference `springDamperExact`). */
function spring(s, goal, halflife, dt) {
  const y = (4 * Math.LN2) / (halflife + 1e-5) / 2;
  const j0 = s.x - goal;
  const j1 = s.v + j0 * y;
  const e = Math.exp(-y * dt);
  s.x = e * (j0 + j1 * dt) + goal;
  s.v = e * (s.v - j1 * y * dt);
}

const _ik = {
  a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), t: new THREE.Vector3(),
  ac: new THREE.Vector3(), ab: new THREE.Vector3(), acN: new THREE.Vector3(), abN: new THREE.Vector3(),
  bcN: new THREE.Vector3(), atN: new THREE.Vector3(), ax0: new THREE.Vector3(), ax1: new THREE.Vector3(),
  tmp: new THREE.Vector3(), qa: new THREE.Quaternion(), qb: new THREE.Quaternion(),
  r0: new THREE.Quaternion(), r1: new THREE.Quaternion(), r2: new THREE.Quaternion(),
};

/** Analytic two-bone IK (Holden): put C's joint on `target`, roll A/B to match. */
function twoBoneIK(A, B, C, target) {
  const a = wpos(A, _ik.a), b = wpos(B, _ik.b), c = wpos(C, _ik.c);
  const t = _ik.t.copy(target);
  const lab = b.distanceTo(a), lcb = c.distanceTo(b);
  const lat = clamp(t.distanceTo(a), 0.01, (lab + lcb) * 0.999);
  const ac = _ik.ac.subVectors(c, a), ab = _ik.ab.subVectors(b, a);
  const acN = _ik.acN.copy(ac).normalize(), abN = _ik.abN.copy(ab).normalize();
  const bcN = _ik.bcN.subVectors(c, b).normalize(), atN = _ik.atN.subVectors(t, a).normalize();
  const ac_ab_0 = Math.acos(clamp(acN.dot(abN), -1, 1));
  const ba_bc_0 = Math.acos(clamp(-abN.dot(bcN), -1, 1));
  const ac_at_0 = Math.acos(clamp(acN.dot(atN), -1, 1));
  const ac_ab_1 = Math.acos(clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1));
  const ba_bc_1 = Math.acos(clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));
  const axis0 = _ik.ax0.crossVectors(ac, ab);
  if (axis0.lengthSq() < 1e-12) return;
  axis0.normalize();
  const axis1 = _ik.ax1.crossVectors(ac, atN);
  const aInv = wquat(A, _ik.qa).invert();
  const bInv = wquat(B, _ik.qb).invert();
  _ik.r0.setFromAxisAngle(_ik.tmp.copy(axis0).applyQuaternion(aInv), ac_ab_1 - ac_ab_0);
  _ik.r1.setFromAxisAngle(_ik.tmp.copy(axis0).applyQuaternion(bInv), ba_bc_1 - ba_bc_0);
  if (axis1.lengthSq() > 1e-12) _ik.r2.setFromAxisAngle(_ik.tmp.copy(axis1).normalize().applyQuaternion(aInv), ac_at_0);
  else _ik.r2.identity();
  A.quaternion.multiply(_ik.r0).multiply(_ik.r2);
  B.quaternion.multiply(_ik.r1);
  A.updateMatrixWorld(true);
}

/** Swing the elbow about the shoulder→wrist axis toward `poleDir`, keeping the wrist fixed. */
function armPole(A, B, C, poleDir, weight) {
  const a = wpos(A, _ik.a), b = wpos(B, _ik.b), c = wpos(C, _ik.c);
  const axis = _ik.ax0.subVectors(c, a);
  if (axis.lengthSq() < 1e-6) return;
  axis.normalize();
  const e = _ik.ab.subVectors(b, a);
  e.addScaledVector(axis, -e.dot(axis));
  const pd = _ik.tmp.copy(poleDir);
  pd.addScaledVector(axis, -pd.dot(axis));
  if (e.lengthSq() < 1e-6 || pd.lengthSq() < 1e-6) return;
  e.normalize(); pd.normalize();
  let ang = Math.acos(clamp(e.dot(pd), -1, 1));
  if (_ik.ax1.crossVectors(e, pd).dot(axis) < 0) ang = -ang;
  _ik.r0.setFromAxisAngle(axis, ang * weight);
  const pq = A.parent.getWorldQuaternion(_ik.qa);
  _ik.qb.copy(pq).invert().multiply(_ik.r0).multiply(pq);
  A.quaternion.premultiply(_ik.qb);
  A.updateMatrixWorld(true);
}

/** Set a hand's world rotation to gun·offset (blended), keeping its authored grip. */
function lockHand(hand, off, gunQ) {
  _q1.copy(gunQ).multiply(off);
  hand.parent.getWorldQuaternion(_q2).invert();
  hand.quaternion.copy(_q2.multiply(_q1));
  hand.updateMatrixWorld(true);
}

/* ------------------------------------------------------------------- state */

/**
 * Recoil impulse, called the frame a bot fires (reference `onFire`): the whole rifle drives back into
 * the shoulder and pitches up, and a 32 ms half-life spring brings 95 % of it home in ~0.15 s. The
 * IK'd arms ride along because they re-solve after the gun is placed.
 */
export function botGunFire(bot) {
  const st = bot?.model?._gunState;
  if (!st) return;
  const r = st.rc;
  r.pitch.v += 2.2 + Math.random() * 0.8;
  r.yaw.v += (Math.random() * 2 - 1) * 1.2;
  r.back.v += 1.6;
}

/**
 * Place the gun in the shoulder pocket and IK both arms onto it. Call after `model.update()` so the
 * animation (and its aim overlay) has already posed the skeleton for this frame.
 */
export function updateBotGun(bot, dt = 1 / 60) {
  const model = bot?.model;
  const gun = model?._botGun;
  if (!gun) return;
  const b = model._gunBones;
  const st = model._gunState;
  if (!b?.upperR || !b?.handR || !b?.spine3) return;

  dt = Math.min(0.1, Math.max(1e-3, dt));
  // model.update() refreshed the bones' local matrices, not their world matrices. Refresh only the
  // chains this rig reads: a full group.updateMatrixWorld(true) also walks the three LOD meshes and
  // costs about half the budget for 26 bots.
  model.group.updateWorldMatrix(true, false);
  model.root.updateWorldMatrix(false, false);
  // Depth-first so each bone sees a current parent (three has no dirty flag to skip fresh nodes).
  for (const bone of b.chain) bone?.updateWorldMatrix(false, false);

  // Reach only depends on bone lengths; measure it once per soldier.
  if (!b.reachL) {
    b.reachL = b.upperL
      ? wpos(b.upperL, _v1).distanceTo(wpos(b.lowerL, _v2)) + wpos(b.lowerL, _v2).distanceTo(wpos(b.handL, _v3))
      : 0;
  }
  // A corpse's rifle rides the firing hand (Bot.die re-parents it); respawning puts it back here.
  // attach() compensates for the hand's inherited scale, so restore the unit scale on the way back.
  if (gun.parent !== model.group) { model.group.attach(gun); gun.scale.set(1, 1, 1); }

  // --- alert / low-ready / sprint-carry / reload blends (reference `_placeWeapon`) ---
  const target = bot.target;
  const alert = !!(bot.aiming && target?.alive && target.position);
  const speed = model.speed || 0;
  st.readyW = damp(st.readyW, alert ? 0 : 1, alert ? 12 : 9, dt);
  st.carryW = damp(st.carryW, !alert && speed > CARRY_SPEED ? 1 : 0, 8, dt);
  // `oneShotName` lingers after the clip ends, so require the action to still be running.
  st.reloadW = damp(st.reloadW, model.oneShot && model.oneShotName === 'reload' ? 1 : 0, 9, dt);
  st.settle += dt;
  st.aimT = alert ? (st.aimT || 0) + dt : 0;
  const rw = st.reloadW;
  const low = st.readyW * (1 - st.carryW) * (1 - rw);
  const carry = st.carryW * (1 - rw);

  // Recoil springs (weapon root). Pitch/yaw are radians, back is metres.
  // 95 % of the kick is back home in ~0.15 s (critically damped: x ∝ t·e^(-y t), y = 2·ln2/h).
  spring(st.rc.pitch, 0, 0.032, dt);
  spring(st.rc.yaw, 0, 0.032, dt);
  spring(st.rc.back, 0, 0.032, dt);

  // --- aim line: flat yaw when patrolling, exact bore-to-target when engaging ---
  let aimYaw = bot.yaw;
  let pitch = 0;
  if (alert) {
    const eyeY = bot.position.y + 1.55;
    _v4.set(target.position.x, target.position.y + (target.isPlayer ? 1.35 : 1.25), target.position.z);
    _v4.x -= bot.position.x;
    _v4.y -= eyeY;
    _v4.z -= bot.position.z;
    const d = _v4.length();
    if (d > 1e-3) {
      aimYaw = Math.atan2(-_v4.x, -_v4.z);
      pitch = Math.asin(clamp(_v4.y / d, -1, 1));
    }
  }

  // --- orientation: aim + fire climb, canted/dipped for reload, muzzle down for low ready/carry ---
  _e1.set(
    pitch * (1 - low * 0.5 - carry) + st.rc.pitch.x - rw * 0.32 - low * 0.6 - carry * 0.7,
    aimYaw + st.rc.yaw.x + rw * 0.22 + carry * 0.6,
    rw * 0.5 + carry * 0.3,
    'YXZ',
  );
  _q3.setFromEuler(_e1); // world orientation of the gun wrapper

  // --- position: butt plate in the pocket between the shoulder joint and the sternum ---
  const sinY = Math.sin(aimYaw), cosY = Math.cos(aimYaw);
  _v1.set(-sinY, 0, -cosY); // flat forward
  wpos(b.upperR, _v2);
  wpos(b.spine3, _v5);
  _v2.lerp(_v5, 0.42);
  const shoulderY = wpos(b.upperR, _v5).y; // shoulder joint (its origin does not move with the solve)
  _v2.y = _v2.y * 0.6 + (shoulderY - 0.02) * 0.4 + POCKET_Y;
  _v2.addScaledVector(_v1, 0.03 - rw * 0.05);
  _v2.y -= rw * 0.07 + low * 0.02 + carry * 0.14;
  if (carry > 1e-3) {
    wpos(b.spine1, _v5);
    _v2.lerp(_v5, carry * 0.35);
  }
  // Seat the butt: grip = pocket - q·butt.
  _v5.copy(gun.userData.butt).applyQuaternion(_q3);
  _v2.sub(_v5);
  // Recoil drives the whole gun back along the bore and recovers.
  _v5.set(0, 0, 1).applyQuaternion(_q3).multiplyScalar(clamp(st.rc.back.x, -0.02, 0.06));
  _v2.add(_v5);

  const parent = gun.parent;
  _m1.copy(parent.matrixWorld).invert();
  const invParentQ = parent.getWorldQuaternion(_q1).invert();
  gun.quaternion.copy(invParentQ).multiply(_q3);
  _v6.copy(_v2).applyMatrix4(_m1);
  gun.position.copy(_v6);
  refreshWorld(gun);

  // --- reach guard: slide the whole rifle inboard if the support grip is beyond the left arm ---
  // (reference does the same, otherwise a long gun on a short rig leaves the hand floating).
  if (b.reachL) {
    for (let pass = 0; pass < 2; pass++) {
      wpos(b.upperL, _v5);
      _v6.copy(gun.userData.support).applyMatrix4(gun.matrixWorld);
      const dist = _v6.distanceTo(_v5);
      const lim = b.reachL * 0.955;
      if (dist <= lim) break;
      _v6.sub(_v5).multiplyScalar(-(dist - lim) / dist);
      _v6.applyQuaternion(_q1); // world delta -> body space (parent has no scale)
      gun.position.add(_v6);
      refreshWorld(gun);
    }
  }

  // --- right hand on the pistol grip ---
  gun.getWorldPosition(_v1); // grip == wrapper origin
  _v4.set(cosY * 0.55, -1, -sinY * 0.55); // elbow down and slightly out
  // Solve, swing the elbow down, solve again: the analytic pass is exact for the elbow bend but
  // applies the shoulder swing in one shot, so a tightly folded arm lands a few cm short. The
  // reference re-solves after the pole for the same reason.
  twoBoneIK(b.upperR, b.lowerR, b.handR, _v1);
  armPole(b.upperR, b.lowerR, b.handR, _v4, 0.75);
  twoBoneIK(b.upperR, b.lowerR, b.handR, _v1);
  if (st.handRelR) lockHand(b.handR, st.handRelR, _q3);
  st.errR = wpos(b.handR, _v5).distanceTo(_v1);

  // --- left hand on the handguard ---
  if (b.upperL && b.handL) {
    _v2.copy(gun.userData.support).applyMatrix4(gun.matrixWorld);
    _v4.set(-cosY * 0.35, -1, sinY * 0.35);
    twoBoneIK(b.upperL, b.lowerL, b.handL, _v2);
    armPole(b.upperL, b.lowerL, b.handL, _v4, 0.6);
    twoBoneIK(b.upperL, b.lowerL, b.handL, _v2);
    if (st.handRelL) lockHand(b.handL, st.handRelL, _q3);
    st.errL = wpos(b.handL, _v5).distanceTo(_v2);
  }

  // --- capture the wrist-to-gun offset from a settled two-handed aim ---
  // Doing it from the reference's own rifle at spawn would bake a T-pose wrist roll in; the aim
  // overlay plus IK gives a real grip, and once captured the wrist rides the gun exactly.
  if (!st.handRelR && alert && st.aimT > 0.4 && st.settle > 0.2 && st.errR < 0.03) {
    wquat(b.handR, _q1);
    st.handRelR = _q1.clone().invert().multiply(_q3);
    if (b.handL) {
      wquat(b.handL, _q2);
      st.handRelL = _q2.clone().invert().multiply(_q3);
    }
  }
}
