import * as THREE from 'three';

/**
 * Tank audio: a synthesized diesel/gasoline drone plus track clank. There is no
 * engine sample in the CC0 library (see public/assets/audio/CREDITS.md), so the
 * loop is built from oscillators and filtered noise; the gun and impacts use the
 * recorded samples.
 *
 * The drone is deliberately simple: two detuned saws through a low-pass, fired
 * at a rate tied to speed, and a noise floor for the exhaust. It is mixed by
 * distance and panned by the listener's right vector, because a tank engine is
 * a localisation cue before it is a sound.
 */
export class VehicleAudio {
  constructor(game, tank) {
    this.game = game;
    this.tank = tank;
    this.audio = game.audio;
    this.nodes = null;
    this.clankT = 0;
    this._dist = 0;
    this._pan = 0;
  }

  ensure() {
    if (this.nodes) return true;
    const a = this.audio;
    if (!a?.ready || !a.ctx) return false;
    const ctx = a.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(a.sfx);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.6;
    lp.connect(out);

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 36;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 18;
    const oaGain = ctx.createGain(); oaGain.gain.value = 0.2;
    const obGain = ctx.createGain(); obGain.gain.value = 0.12;
    oscA.connect(oaGain); oaGain.connect(lp);
    oscB.connect(obGain); obGain.connect(lp);

    // Exhaust / intake noise.
    const noise = ctx.createBufferSource();
    noise.buffer = a._noise;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 260;
    nf.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.12;
    noise.connect(nf); nf.connect(ng); ng.connect(lp);

    // Turret traverse servo: a small whine, only audible up close.
    const servo = ctx.createOscillator();
    servo.type = 'triangle';
    servo.frequency.value = 120;
    const servoGain = ctx.createGain(); servoGain.gain.value = 0;
    servo.connect(servoGain); servoGain.connect(out);

    oscA.start(); oscB.start(); noise.start(); servo.start();
    this.nodes = { out, lp, oscA, oscB, oaGain, obGain, noise, nf, ng, servo, servoGain };
    return true;
  }

  update(dt, { speed = 0, throttle = 0, turretRate = 0, inside = false, alive = true } = {}) {
    if (!alive) { this.stop(); return; }
    if (!this.ensure()) return;
    const n = this.nodes;
    const a = this.audio;
    const t = a.ctx.currentTime;
    const tankPos = this.tank.position;
    const listener = a.listener.pos;
    const dx = tankPos.x - listener.x;
    const dy = tankPos.y - listener.y;
    const dz = tankPos.z - listener.z;
    const dist = Math.hypot(dx, dy, dz);
    this._dist = dist;
    this._pan = dist > 0.01
      ? THREE.MathUtils.clamp((a.listener.right.x * dx + a.listener.right.z * dz) / dist, -1, 1)
      : 0;

    // Distance law: a tank is audible across the map but never loud at range.
    const near = Math.pow(Math.max(0, 1 - dist / 150), 1.7);
    const driving = Math.min(1, Math.abs(speed) / 4 + Math.abs(throttle) * 0.55);
    const volume = inside ? 0.16 + driving * 0.1 : near * (0.16 + driving * 0.7);
    n.out.gain.setTargetAtTime(volume, t, 0.08);

    const rpm = 26 + Math.abs(speed) * 3.4 + Math.abs(throttle) * 16 + (inside ? 6 : 0);
    n.oscA.frequency.setTargetAtTime(rpm, t, 0.12);
    n.oscB.frequency.setTargetAtTime(rpm * 0.5, t, 0.12);
    n.lp.frequency.setTargetAtTime(240 + Math.abs(speed) * 90 + Math.abs(throttle) * 120, t, 0.15);
    n.servo.frequency.setTargetAtTime(90 + turretRate * 90, t, 0.1);
    n.servoGain.gain.setTargetAtTime(inside ? Math.min(0.05, Math.abs(turretRate) * 0.02) : 0, t, 0.08);

    // Track clank: a metal tick each time a shoe goes over the sprocket.
    this.clankT -= dt;
    if (Math.abs(speed) > 0.6 && this.clankT <= 0) {
      this.clankT = 0.32 + Math.random() * 0.18;
      const vol = inside ? 0.18 : near * 0.5;
      if (vol > 0.02) {
        a.play('impact_metal_light', {
          dist, pan: this._pan, volume: vol, pitch: 0.72 + Math.random() * 0.12, pitchVar: 0.12, reverb: 0.3,
        });
      }
    }
  }

  /** Turret / gun servicing sounds while idle, so a parked tank is not silent. */
  idleTick() {
    if (!this.audio?.ready) return;
    if (this._dist > 25) return;
    this.audio.play('impact_metal_light', {
      dist: this._dist, pan: this._pan, volume: 0.05, pitch: 1.4, pitchVar: 0.2, reverb: 0.4,
    });
  }

  stop() {
    if (!this.nodes) return;
    const t = this.audio.ctx.currentTime;
    this.nodes.out.gain.setTargetAtTime(0, t, 0.08);
  }

  dispose() {
    if (!this.nodes) return;
    for (const key of ['oscA', 'oscB', 'noise', 'servo']) {
      try { this.nodes[key].stop(); } catch { /* already stopped */ }
    }
    this.nodes.out.disconnect();
    this.nodes = null;
  }
}
