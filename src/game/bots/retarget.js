import * as THREE from 'three';

/**
 * Clip retargeting: Mixamo-named (Ironline `soldier.glb`) → Quaternius rig (our soldiers).
 *
 * Copying local quaternions is not enough: the two rigs' bone frames are rotated differently, so
 * elbows fold the wrong way. What transfers between any two humanoids is the world-space rotation
 * *relative to the bind pose*:
 *
 *     W_dst(t) = W_dst_rest · (W_src_rest⁻¹ · W_src(t))
 *     q_dst(t) = W_dst_parent(t)⁻¹ · W_dst(t)
 *
 * The clip is resampled on a fixed 30 Hz grid and walked in hierarchy order, then written back as
 * local quaternion tracks on the destination bones. Hips translation is a local delta rescaled by
 * the two rigs' rest hip heights (the Bamen rig is authored in centimetres).
 */
const MAP = {
  Hips: 'pelvis',
  Spine: 'spine_01',
  Spine1: 'spine_02',
  Spine2: 'spine_03',
  Neck: 'neck_01',
  Head: 'Head',
  LeftShoulder: 'clavicle_l',
  LeftArm: 'upperarm_l',
  LeftForeArm: 'lowerarm_l',
  LeftHand: 'hand_l',
  RightShoulder: 'clavicle_r',
  RightArm: 'upperarm_r',
  RightForeArm: 'lowerarm_r',
  RightHand: 'hand_r',
  LeftUpLeg: 'thigh_l',
  LeftLeg: 'calf_l',
  LeftFoot: 'foot_l',
  LeftToeBase: 'ball_l',
  RightUpLeg: 'thigh_r',
  RightLeg: 'calf_r',
  RightFoot: 'foot_r',
  RightToeBase: 'ball_r',
};

const FPS = 30;

export function makeRetargeter(srcRoot, dstRoot) {
  srcRoot.updateMatrixWorld(true);
  dstRoot.updateMatrixWorld(true);

  const depth = (o) => {
    let d = 0;
    for (let p = o.parent; p; p = p.parent) d++;
    return d;
  };

  const nodes = [];
  for (const [srcKey, dstName] of Object.entries(MAP)) {
    const src = srcRoot.getObjectByName('mixamorig' + srcKey);
    const dst = dstRoot.getObjectByName(dstName);
    if (!src || !dst) continue;
    nodes.push({ srcKey, src, dst, dstName, depth: depth(src) });
  }
  if (!nodes.length) return { retarget: () => null, pairs: [] };
  nodes.sort((a, b) => a.depth - b.depth);

  const bySrc = new Map(nodes.map((n) => [n.src, n]));
  for (const n of nodes) {
    n.srcRest = n.src.getWorldQuaternion(new THREE.Quaternion());
    n.dstRest = n.dst.getWorldQuaternion(new THREE.Quaternion());
    n.srcRestLocal = n.src.quaternion.clone();
    n.parent = null;
    for (let p = n.src.parent; p; p = p.parent) {
      const hit = bySrc.get(p);
      if (hit) { n.parent = hit; break; }
    }
  }

  // Everything is expressed relative to each rig's own root, so a constant root difference
  // (the Bamen armature carries an X rotation) never leaks into the pose.
  const srcRootQ = srcRoot.getWorldQuaternion(new THREE.Quaternion());
  const dstRootQ = dstRoot.getWorldQuaternion(new THREE.Quaternion());
  for (const n of nodes) {
    n.srcRestRel = srcRootQ.clone().invert().multiply(n.srcRest);
    n.dstRestRel = dstRootQ.clone().invert().multiply(n.dstRest);
    // Top of the mapped chain (hips): keep the un-mapped parent's bind orientation, otherwise the
    // armature's own axis conversion leaks out and the whole body lies down.
    n.srcParentRel = n.parent ? null
      : srcRootQ.clone().invert().multiply(n.src.parent.getWorldQuaternion(new THREE.Quaternion()));
    n.dstParentWorld = n.parent ? null
      : n.dst.parent.getWorldQuaternion(new THREE.Quaternion());
  }

  // Limb bones: aim the destination bone at the direction its source counterpart points, instead of
  // replaying the source's world delta. The two bind poses differ (Mixamo T-pose vs an A-pose), and a
  // pure delta carries that difference straight into the arms.
  for (const n of nodes) {
    const child = nodes.find((c) => c.parent === n);
    // Clavicles are short and nearly collinear with the spine; alignment there is noise, so those
    // (and the neck) keep the world-delta path.
    n.child = /Shoulder|Neck/.test(n.srcKey) ? null : (child || null);
    if (!child) continue;
    const dS = child.src.getWorldPosition(new THREE.Vector3())
      .sub(n.src.getWorldPosition(new THREE.Vector3())).normalize();
    const dD = child.dst.getWorldPosition(new THREE.Vector3())
      .sub(n.dst.getWorldPosition(new THREE.Vector3())).normalize();
    n.axisSrc = dS.clone().applyQuaternion(n.srcRest.clone().invert());  // bone-local axis (source)
    n.dirDstRest = dD.clone().applyQuaternion(dstRootQ.clone().invert()); // root space (destination)
  }

  const hips = nodes.find((n) => n.srcKey === 'Hips');
  const k = hips ? hips.dst.position.y / hips.src.position.y : 1;

  const _dir = new THREE.Vector3();
  const _align = new THREE.Quaternion();
  const _ql = new THREE.Quaternion();
  const _ws = new THREE.Quaternion();
  const _wt = new THREE.Quaternion();
  const _inv = new THREE.Quaternion();

  function retarget(clip, name = clip.name) {
    const byBone = new Map();
    for (const t of clip.tracks) {
      const dot = t.name.lastIndexOf('.');
      if (dot < 0) continue;
      byBone.set(t.name.slice(0, dot) + '|' + t.name.slice(dot + 1), t);
    }
    const samplers = new Map();
    for (const n of nodes) {
      const tr = byBone.get(n.src.name + '|quaternion');
      samplers.set(n, tr ? new THREE.QuaternionLinearInterpolant(tr.times, tr.values, 4) : null);
    }
    const hipsTrack = hips ? byBone.get(hips.src.name + '|position') : null;
    const posInterp = hipsTrack ? new THREE.LinearInterpolant(hipsTrack.times, hipsTrack.values, 3) : null;

    const steps = Math.max(2, Math.ceil(clip.duration * FPS));
    const times = new Float32Array(steps + 1);
    const quats = new Map(nodes.map((n) => [n, new Float32Array((steps + 1) * 4)]));
    const hipsOut = posInterp ? new Float32Array((steps + 1) * 3) : null;
    const srcWorld = new Map();
    const dstWorld = new Map();

    for (let i = 0; i <= steps; i++) {
      const t = (clip.duration * i) / steps;
      times[i] = t;
      for (const n of nodes) {
        const s = samplers.get(n);
        if (s) {
          s.evaluate(t);
          _ql.fromArray(s.resultBuffer, 0);
        } else {
          _ql.copy(n.srcRestLocal);
        }
        // Root-relative source rotation at this frame.
        const wsParent = n.parent ? srcWorld.get(n.parent) : n.srcParentRel;
        _ws.copy(wsParent || IDENTITY).multiply(_ql);
        srcWorld.set(n, _ws.clone());

        if (n.child) {
          // Aim: rotate the destination's rest bone axis onto where the source bone points now.
          const dir = _dir.copy(n.axisSrc).applyQuaternion(_ws).normalize();
          const align = _align.setFromUnitVectors(n.dirDstRest, dir);
          _wt.copy(align).multiply(n.dstRestRel).premultiply(dstRootQ);
        } else {
          // Leaf (hand / toe): replay the world delta on top of the parent's aim.
          _inv.copy(n.srcRestRel).invert();
          _wt.copy(n.dstRestRel).multiply(_inv).multiply(_ws);
          _wt.premultiply(dstRootQ);
        }

        const wtParent = n.parent ? dstWorld.get(n.parent) : n.dstParentWorld;
        const local = new THREE.Quaternion()
          .copy(wtParent || dstRootQ)
          .invert()
          .multiply(_wt)
          .normalize();

        dstWorld.set(n, _wt.clone());
        local.toArray(quats.get(n), i * 4);
      }

      if (hipsOut && posInterp) {
        posInterp.evaluate(t);
        hipsOut[i * 3] = hips.dst.position.x + (posInterp.resultBuffer[0] - hips.src.position.x) * k;
        hipsOut[i * 3 + 1] = hips.dst.position.y + (posInterp.resultBuffer[1] - hips.src.position.y) * k;
        hipsOut[i * 3 + 2] = hips.dst.position.z + (posInterp.resultBuffer[2] - hips.src.position.z) * k;
      }
    }

    const tracks = [];
    for (const n of nodes) {
      tracks.push(new THREE.QuaternionKeyframeTrack(n.dstName + '.quaternion', times.slice(), quats.get(n)));
    }
    if (hipsOut) tracks.push(new THREE.VectorKeyframeTrack(hips.dstName + '.position', times.slice(), hipsOut));
    return new THREE.AnimationClip(name, clip.duration, tracks);
  }

  return { retarget, pairs: nodes };
}

const IDENTITY = new THREE.Quaternion();

export { MAP as RETARGET_BONES };
