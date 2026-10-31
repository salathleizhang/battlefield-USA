/* Page-side half of tools/botgun-check.mjs: measures the six acceptance criteria on a running build. */
(async () => {
  const g = window.__game;
  if (!g.started) { window.__START__('miami-beach'); window.__PUMP__(6); }
  const V = g.renderer.camera.position.constructor;
  const Q = g.renderer.camera.quaternion.constructor;
  const { Bot } = await import('/src/game/bots/Bot.js');
  const { updateBotGun } = await import('/src/game/bots/BotGun.js');
  const DEG = 180 / Math.PI;
  const round = (v, n = 4) => +v.toFixed(n);
  const out = { criteria: {} };
  const realRender = g.renderer.render;
  g.renderer.render = () => {}; // rendering does not feed the simulation

  // ---------- 6. per-frame simulation cost, 26 bots on one screen ----------
  {
    const run = (n) => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) g.update(1 / 60);
      return (performance.now() - t0) / n;
    };
    const guns = g.bots.map((b) => [b.model, b.model?._botGun]);
    run(60); // warm up
    // Isolated: the rig's own per-frame cost, free of physics/AI noise in the sample.
    const t0 = performance.now();
    for (let k = 0; k < 60; k++) for (const b of g.bots) updateBotGun(b, 1 / 60);
    const rigMs = (performance.now() - t0) / 60;
    const on = [], off = [], deltas = [];
    for (let k = 0; k < 3; k++) {
      const a = run(120); on.push(a);
      for (const [m] of guns) m._botGun = null;
      const b = run(120); off.push(b);
      for (const [m, gun] of guns) m._botGun = gun;
      deltas.push(a - b);
    }
    const med = (xs) => xs.slice().sort((p, q) => p - q)[1];
    out.criteria.perf = {
      bots: g.bots.length,
      rigMs: round(rigMs, 3),
      rigUsPerBot: round((rigMs * 1000) / g.bots.length, 2),
      framesPerSample: 120,
      samples: 3,
      onMs: on.map((v) => round(v, 3)),
      offMs: off.map((v) => round(v, 3)),
      abDeltaMs: round(med(deltas), 3),
      abDeltas: deltas.map((v) => round(v, 3)),
    };
  }

  // ---------- stage: three controlled riflemen ----------
  for (const b of g.bots) b.dispose();
  g.bots.length = 0;
  g.renderer.applySettings({ quality: 0, fxEpic: false, fxBlood: false });
  const sp = g.level.spawns[0][0].position.clone();
  g.player.spawn(new V(sp.x, sp.y + 0.2, sp.z + 60), 0);
  const bots = [];
  for (let i = 0; i < 3; i++) {
    const bot = new Bot(g, 0, sp.clone().add(new V((i % 2) * 0.35, 0, (i - 1) * 2.2)), 0, null, i);
    g.bots.push(bot);
    bots.push(bot);
  }
  const dummy = { alive: true, team: 1, isPlayer: false, position: new V(sp.x, sp.y + 0.2, sp.z - 24) };
  for (let i = 0; i < 60 && bots.some((b) => !b.model._botGun); i++) await new Promise((r) => setTimeout(r, 150));
  // Stray rounds from the 26-bot battle above are still in the air and can drop a test subject
  // mid-sample; the measurement is about the rig, not about surviving the landing zone.
  for (const b of bots) b.damage = () => {};
  const aimAll = () => {
    for (const b of bots) { b.target = dummy; b.targetSeenAt = 1e9; b.fireTimer = 1e9; b.aiming = true; }
  };
  const arm = (b) => {
    const gun = b.model._botGun;
    const dir = new V(0, 0, -1).applyQuaternion(gun.getWorldQuaternion(new Q()));
    const grip = gun.getWorldPosition(new V());
    const support = gun.userData.support.clone().applyMatrix4(gun.matrixWorld);
    const hR = b.model.root.getObjectByName('hand_r').getWorldPosition(new V());
    const hL = b.model.root.getObjectByName('hand_l').getWorldPosition(new V());
    const eye = new V(b.position.x, b.position.y + 1.55, b.position.z);
    const want = b.aimPoint(new V()).sub(eye).normalize();
    return {
      errR: hR.distanceTo(grip),
      errL: hL.distanceTo(support),
      dot: dir.dot(want),
      downDeg: -Math.asin(dir.y) * DEG,
      dir,
    };
  };
  const armAll = () => bots.map(arm);

  // Live sample: the bots run their real AI update (they drift while strafing, so this is a sanity
  // check only; the pass/fail numbers below use pinned riflemen).
  aimAll();
  window.__PUMP__(40);
  aimAll();
  window.__PUMP__(6);
  out.criteria.liveAim = {
    perBot: armAll().map((a, i) => ({ bot: i, errR: round(a.errR), errL: round(a.errL), dot: round(a.dot, 5) })),
  };

  // Pin them: exactly the tail of Bot.update (pose + gun rig), with an explicit aim state. The AI
  // otherwise strafes them into the surf inside a few seconds and the death pose invalidates a sample.
  for (const b of bots) {
    b._poseSpeed = 0;
    const i = bots.indexOf(b);
    b.position.copy(sp).add(new V((i % 2) * 0.35, 0.2, (i - 1) * 2.2));
    b.model.setPosition(b.position.x, b.position.y, b.position.z, b.yaw);
    b.update = function (dt) {
      this.model.setPosition(this.position.x, this.position.y, this.position.z, this.yaw);
      this.model.update(dt, this._poseSpeed, this.aiming, true);
      updateBotGun(this, dt);
    };
  }

  // ---------- 1/2/3. steady aim: wrist on grip, wrist on handguard, bore on target ----------
  aimAll();
  window.__PUMP__(100);
  aimAll();
  window.__PUMP__(20);
  const aim = armAll();
  out.criteria.aim = {
    perBot: aim.map((a, i) => ({ bot: i, errR: round(a.errR), errL: round(a.errL), dot: round(a.dot, 5) })),
    maxErrR: round(Math.max(...aim.map((a) => a.errR))),
    maxErrL: round(Math.max(...aim.map((a) => a.errL))),
    minDot: round(Math.min(...aim.map((a) => a.dot)), 5),
    handRelCaptured: bots.map((b) => !!b.model._gunState.handRelR),
  };

  // ---------- 4. low ready, sprint carry, transition time ----------
  for (const b of bots) { b.target = null; b.aiming = false; }
  window.__PUMP__(60);
  const low = armAll();
  out.criteria.lowReady = {
    downDeg: low.map((a) => round(a.downDeg, 2)),
    meanDeg: round(low.reduce((s, a) => s + a.downDeg, 0) / low.length, 2),
    state: bots.map((b) => {
      const s = b.model._gunState;
      return { readyW: round(s.readyW, 3), carryW: round(s.carryW, 3), reloadW: round(s.reloadW, 3), speed: b.model.speed, aiming: b.aiming, target: !!b.target };
    }),
  };

  // Aim <-> low ready, frame by frame (1/60 s), time to cover 90 % of the swing.
  const trace = (setState, frames = 24) => {
    const series = [];
    setState();
    for (let i = 0; i < frames; i++) {
      window.__PUMP__(1);
      series.push(arm(bots[1]).downDeg);
    }
    return series;
  };
  const lowState = () => { for (const b of bots) { b.target = null; b.aiming = false; b._poseSpeed = 0; } };
  const toAim = trace(aimAll, 24);
  const t90 = (series) => {
    const a = series[0], b = series[series.length - 1];
    const i = series.findIndex((d) => Math.abs(d - b) <= Math.abs(a - b) * 0.1);
    return i < 0 ? null : round((i + 1) / 60, 3);
  };
  const toLow = trace(lowState, 24);
  out.criteria.transition = {
    toAim90s: t90(toAim),
    toLowReady90s: t90(toLow),
    toAimTrace: toAim.map((d) => round(d, 1)),
    toLowTrace: toLow.map((d) => round(d, 1)),
  };

  // Sprint carry: the bot AI tops out at 3.5 m/s, so the model speed is forced to 6 m/s here.
  {
    for (const b of bots) { b._poseSpeed = 6; b.target = null; b.aiming = false; }
    window.__PUMP__(45);
    const carry = arm(bots[1]);
    const bodyFwd = new V(-Math.sin(bots[1].yaw), 0, -Math.cos(bots[1].yaw));
    const flat = new V(carry.dir.x, 0, carry.dir.z).normalize();
    const st = bots[1].model._gunState;
    out.criteria.carry = {
      downDeg: round(carry.downDeg, 2),
      acrossDeg: round(Math.acos(Math.max(-1, Math.min(1, flat.dot(bodyFwd)))) * DEG, 1),
      carryW: round(st.carryW, 3),
      speed: bots[1].model.speed,
    };
  }

  // ---------- 5. recoil: back on target inside 0.15 s, arms follow ----------
  {
    aimAll();
    for (const b of bots) b._poseSpeed = 0;
    window.__PUMP__(40);
    aimAll();
    const b = bots[1];
    const gun = b.model._botGun;
    const toLocal = (obj) => {
      const m = obj.matrixWorld.clone().invert();
      return gun.getWorldPosition(new V()).applyMatrix4(m);
    };
    const p0 = new V();
    for (let i = 0; i < 4; i++) { window.__PUMP__(1); p0.add(toLocal(b.model.group)); }
    p0.multiplyScalar(0.25);
    const backDir = new V(0, 0, 1).applyQuaternion(gun.getWorldQuaternion(new Q()));
    const st = b.model._gunState;
    b.shoot(); // the real fire path: model.shoot() + botGunFire()
    const frame = [];
    for (let i = 0; i < 20; i++) {
      window.__PUMP__(1);
      frame.push({
        t: (i + 1) / 60,
        back: st.rc.back.x,
        pitch: st.rc.pitch.x,
        disp: toLocal(b.model.group).sub(p0).dot(backDir),
        errR: arm(b).errR,
      });
    }
    const peak = (key) => Math.max(...frame.map((f) => Math.abs(f[key])));
    const peakBack = peak('back'), peakPitch = peak('pitch'), peakDisp = peak('disp');
    const t95 = (key, p) => {
      const hit = frame.find((f) => Math.abs(f[key]) <= p * 0.05);
      return hit ? round(hit.t, 3) : null;
    };
    out.criteria.recoil = {
      peakBackM: round(peakBack, 4),
      peakPitchDeg: round(peakPitch * DEG, 2),
      peakGunDispM: round(peakDisp, 4),
      back95s: t95('back', peakBack),
      pitch95s: t95('pitch', peakPitch),
      backAt150ms: round(frame.reduce((best, f) => (Math.abs(f.t - 0.15) < Math.abs(best.t - 0.15) ? f : best), frame[0]).back, 4),
      maxWristErrDuringRecoil: round(Math.max(...frame.map((f) => f.errR))),
      traceBack: frame.map((f) => round(f.back, 4)),
    };
  }

  out.meta = {
    seed: window.__CAPTURE__?.seed,
    dt: window.__CAPTURE__?.dt,
    characters: !!g.characters?.ready,
    gunLength: bots.map((b) => b.model._botGun?.userData.length),
    reachL: bots.map((b) => round(b.model._gunBones.reachL, 3)),
    supportFromGrip: bots.map((b) => round(b.model._botGun.userData.support.length(), 3)),
  };

  // ---------- posed screenshot: three riflemen in profile ----------
  for (const b of bots) { b._poseSpeed = 0; b.aiming = true; b.target = dummy; }
  window.__PUMP__(30);
  const c = bots[1].position.clone();
  const eye = [c.x + 6.6, c.y + 1.62, c.z + 0.2];
  const look = [c.x, c.y + 1.22, c.z];
  g.renderer.render = realRender;
  window.__SHOT__([eye[0], eye[1], eye[2], look[0], look[1], look[2]]);
  const cam = g.renderer.camera;
  cam.fov = 40;
  cam.updateProjectionMatrix();
  window.__PUMP__(1);
  out.shot = { eye, look };

  return out;
})();
