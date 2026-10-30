/**
 * Fully procedural WebAudio soundscape — no external audio files.
 * 1940s battlefield: sharp Type 38 cracks, deep Garand reports, distant artillery,
 * wind, surf, bullet whizzes and UI stings.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.volume = 0.7;
    this._noise = null;
    this._ambient = null;
    this._artTimer = 0;
    this._nextArt = 8;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this._noise = this._makeNoise(2.5);
    this._startAmbient();
    this.ready = true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _makeNoise(seconds) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  _srcNoise(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.loop = loop;
    return s;
  }

  _gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  _env(param, t0, attack, decay, peak) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    param.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  /** Distance falloff + simple stereo placement. */
  _out(dist = 0, pan = 0, bus = null) {
    const g = this._gain(1 / (1 + dist / 45));
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(bus || this.master);
    } else g.connect(bus || this.master);
    return g;
  }

  _startAmbient() {
    const t = this.ctx.currentTime;
    // Wind.
    const wind = this._srcNoise(true);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.5;
    const wg = this._gain(0.05);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = this._gain(0.03);
    lfo.connect(lfoG); lfoG.connect(wg.gain);
    wind.connect(lp); lp.connect(wg); wg.connect(this.master);
    wind.start(t); lfo.start(t);
    // Surf bed.
    const surf = this._srcNoise(true);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.4;
    const sg = this._gain(0.032);
    const slfo = this.ctx.createOscillator();
    slfo.frequency.value = 0.11;
    const slg = this._gain(0.022);
    slfo.connect(slg); slg.connect(sg.gain);
    surf.connect(bp); bp.connect(sg); sg.connect(this.master);
    surf.start(t); slfo.start(t);
    this._ambient = { wind, surf, wg, sg };
  }

  setAmbience(kind) {
    if (!this.ready || !this._ambient) return;
    const t = this.ctx.currentTime;
    const { wg, sg } = this._ambient;
    const wind = kind === 'bridge' ? 0.09 : 0.05;
    const surf = kind === 'river' ? 0.045 : kind === 'city' ? 0.012 : 0.032;
    wg.gain.cancelScheduledValues(t); wg.gain.linearRampToValueAtTime(wind, t + 2);
    sg.gain.cancelScheduledValues(t); sg.gain.linearRampToValueAtTime(surf, t + 2);
  }

  shot(kind = 'type38', { dist = 0, pan = 0, suppressed = false } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(dist, pan);
    const sharp = kind === 'type38' || kind === 'm1';
    // Crack.
    const src = this._srcNoise();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = suppressed ? 700 : sharp ? 2400 : 1500;
    bp.Q.value = sharp ? 0.9 : 0.7;
    const g = this._gain(0.0001);
    src.connect(bp); bp.connect(g); g.connect(out);
    const peak = (dist > 60 ? 0.5 : 0.95) * (suppressed ? 0.4 : 1);
    this._env(g.gain, t, 0.002, sharp ? 0.13 : 0.2, peak);
    src.start(t); src.stop(t + 0.4);
    // Body thump.
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(sharp ? 140 : 95, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    const og = this._gain(0.0001);
    osc.connect(og); og.connect(out);
    this._env(og.gain, t, 0.003, sharp ? 0.15 : 0.24, dist > 60 ? 0.25 : 0.7);
    osc.start(t); osc.stop(t + 0.4);
    // Distant tail.
    if (dist > 25) {
      const tail = this._srcNoise();
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
      const tg = this._gain(0.0001);
      tail.connect(lp); lp.connect(tg); tg.connect(out);
      this._env(tg.gain, t + 0.02, 0.03, 0.55, 0.18);
      tail.start(t); tail.stop(t + 0.8);
    }
  }

  bolt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0, -0.1, null);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.085;
      const src = this._srcNoise();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2600 + i * 700; bp.Q.value = 2.5;
      const g = this._gain(0.0001);
      src.connect(bp); bp.connect(g); g.connect(out);
      this._env(g.gain, tt, 0.001, 0.045, 0.35);
      src.start(tt); src.stop(tt + 0.08);
    }
  }

  reload(stage = 'clip') {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0, 0, null);
    const src = this._srcNoise();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = stage === 'clip' ? 1800 : 3000; bp.Q.value = 3;
    const g = this._gain(0.0001);
    src.connect(bp); bp.connect(g); g.connect(out);
    this._env(g.gain, t, 0.002, 0.09, 0.4);
    src.start(t); src.stop(t + 0.12);
  }

  step(surface = 'dirt') {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this._srcNoise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = surface === 'wood' ? 700 : surface === 'metal' ? 1400 : 480;
    const g = this._gain(0.0001);
    src.connect(f); f.connect(g); g.connect(this.master);
    this._env(g.gain, t, 0.004, 0.09, surface === 'metal' ? 0.18 : 0.12);
    src.start(t); src.stop(t + 0.2);
  }

  impact(surface = 'dirt', dist = 0, pan = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(dist, pan);
    const src = this._srcNoise();
    const f = this.ctx.createBiquadFilter();
    f.type = surface === 'metal' ? 'bandpass' : 'lowpass';
    f.frequency.value = surface === 'metal' ? 3000 : 1200;
    const g = this._gain(0.0001);
    src.connect(f); f.connect(g); g.connect(out);
    this._env(g.gain, t, 0.001, 0.07, 0.25);
    src.start(t); src.stop(t + 0.15);
  }

  explosion(dist = 0, pan = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(dist * 0.6, pan);
    const src = this._srcNoise();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.7);
    const g = this._gain(0.0001);
    src.connect(lp); lp.connect(g); g.connect(out);
    this._env(g.gain, t, 0.005, 1.1, 1.0);
    src.start(t); src.stop(t + 1.4);
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const sg = this._gain(0.0001);
    sub.connect(sg); sg.connect(out);
    this._env(sg.gain, t, 0.004, 0.8, 0.9);
    sub.start(t); sub.stop(t + 1.0);
  }

  whiz(pan = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this._srcNoise();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    const g = this._gain(0.0001);
    src.connect(bp); bp.connect(g); g.connect(this._out(0, pan));
    this._env(g.gain, t, 0.004, 0.16, 0.22);
    src.start(t); src.stop(t + 0.25);
  }

  hitmark() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 1400;
    const g = this._gain(0.0001);
    o.connect(g); g.connect(this.master);
    this._env(g.gain, t, 0.001, 0.045, 0.09);
    o.start(t); o.stop(t + 0.06);
  }

  capture() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f;
      const g = this._gain(0.0001);
      o.connect(g); g.connect(this.master);
      this._env(g.gain, t + i * 0.12, 0.01, 0.5, 0.12);
      o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.6);
    });
  }

  ui(kind = 'click') {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = kind === 'back' ? 320 : 660;
    const g = this._gain(0.0001);
    o.connect(g); g.connect(this.master);
    this._env(g.gain, t, 0.002, 0.08, 0.05);
    o.start(t); o.stop(t + 0.12);
  }

  hurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this._srcNoise();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = this._gain(0.0001);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    this._env(g.gain, t, 0.01, 0.25, 0.35);
    src.start(t); src.stop(t + 0.4);
  }

  /** Occasional distant artillery rumble for scale. */
  update(dt) {
    if (!this.ready) return;
    this._artTimer += dt;
    if (this._artTimer > this._nextArt) {
      this._artTimer = 0;
      this._nextArt = 6 + Math.random() * 12;
      const pan = Math.random() * 2 - 1;
      this.explosion(120 + Math.random() * 80, pan);
    }
  }
}
