import * as THREE from 'three';

/**
 * WebAudio soundscape.
 *
 * Sample library (CC0, see public/assets/audio/CREDITS.md) is layered with a small
 * procedural synthesiser: a gunshot is the recorded report plus a synthesised transient
 * and low punch, so the same recording reads differently up close and at range.
 * Distance drives air absorption, arrival delay, stereo pan and the reverb send.
 */
const SAMPLE_ROOT = '/assets/audio/';

// Mix headroom: at 100% volume a dense firefight peaks near −1 dBFS, so the
// clipper only rounds the loudest stacks instead of shaping the whole mix.
const HEADROOM = 0.7;

const GROUPS = {
  // Battlefield voices: charge shout, bugle, curses and the attack order.
  voice: ['charge-crowd', 'bugle-charge', 'curse-american', 'order-kill-americans'],
  guns: [
    // Recorded Type 38 Arisaka and M1 Garand reports (CC0, see CREDITS.md).
    'type38_player_near_000', 'type38_player_near_001',
    'type38_world_000', 'type38_world_001',
    'type38_enemy_distant_000', 'type38_enemy_distant_001',
    'm1_player_near_000', 'm1_world_000',
    'm1_enemy_distant_000', 'm1_enemy_distant_001',
    'm1_clip_ping_000',
    // Sidearm for the C96; the M1911 was the period counterpart.
    'm1911_player_near', 'm1911_world', 'm1911_enemy_distant',
    // Kept as a fallback if the period recordings above fail to load.
    'awm_player_near', 'awm_world', 'awm_enemy_distant',
    'm24_player_near', 'm24_world', 'm24_enemy_distant',
  ],
  foley: [
    'bolt_back', 'bolt_fwd', 'rifle_boltdrop', 'rifle_rack', 'rifle_dry',
    'rifle_magin', 'rifle_magout', 'switch',
  ],
  steps: [
    'footstep_grass_000', 'footstep_grass_001', 'footstep_grass_002', 'footstep_grass_003', 'footstep_grass_004',
    'footstep_concrete_000', 'footstep_concrete_001', 'footstep_concrete_002', 'footstep_concrete_003', 'footstep_concrete_004',
    'footstep_wood_000', 'footstep_wood_001', 'footstep_wood_002', 'footstep_wood_003', 'footstep_wood_004',
    'footstep_carpet_000', 'footstep_carpet_001', 'footstep_carpet_002',
  ],
  impacts: [
    // Bullet-specific impacts recorded for each material.
    'impact_bullet_concrete_000', 'impact_bullet_concrete_001', 'impact_bullet_concrete_002',
    'impact_bullet_metal_000', 'impact_bullet_metal_001', 'impact_bullet_metal_002',
    'impact_bullet_wood_000', 'impact_bullet_wood_001',
    'impact_bullet_glass_000', 'impact_bullet_glass_001',
    'impact_bullet_dirt_000', 'impact_bullet_dirt_001',
    'impact_bullet_water_000', 'impact_bullet_water_001',
    'impact_flesh_000', 'impact_flesh_001', 'impact_flesh_002', 'impact_flesh_003',
    'impact_flesh_heavy_000', 'impact_flesh_heavy_001',
    'bullet_whiz_000', 'bullet_whiz_001',
    'impact_generic_light_000', 'impact_generic_light_001', 'impact_generic_light_002', 'impact_generic_light_003', 'impact_generic_light_004',
    'impact_metal_light_000', 'impact_metal_light_001', 'impact_metal_light_002', 'impact_metal_light_003', 'impact_metal_light_004',
    'impact_metal_medium_000', 'impact_metal_medium_001', 'impact_metal_medium_002', 'impact_metal_medium_003',
    'impact_metal_heavy_000', 'impact_metal_heavy_001', 'impact_metal_heavy_002',
    'impact_plank_medium_000', 'impact_plank_medium_001', 'impact_plank_medium_002',
    'impact_plate_light_000', 'impact_plate_light_001', 'impact_plate_light_002',
    'impact_mining_000', 'impact_mining_001', 'impact_mining_002',
    'impact_glass_light_000', 'impact_glass_light_001', 'impact_glass_light_002',
  ],
  explosion: [
    'explosionCrunch_000', 'explosionCrunch_001', 'explosionCrunch_002', 'explosionCrunch_003',
    'lowFrequency_explosion_000', 'lowFrequency_explosion_001',
  ],
  ui: [
    'click_001', 'select_001', 'select_002', 'tick_001', 'tick_002', 'confirmation_001',
    'hitmarker_000', 'hitmarker_001',
  ],
};

const GROUP_DIR = {
  voice: 'voice/', guns: 'guns/', foley: 'foley/', steps: 'steps/',
  impacts: 'impacts/', explosion: 'explosion/', ui: 'ui/',
};

const GUN_PROFILES = {
  type38: { clip: 'type38', fallback: 'awm', pitch: 0.98, volume: 0.9, synth: 1 },
  m1: { clip: 'm1', fallback: 'm24', pitch: 1.0, volume: 0.85, synth: 1 },
  // The pistol is a lighter report: a dedicated sidearm recording at near-unity
  // pitch, with the synthesised thump pulled back so it does not read as a rifle.
  c96: { clip: 'm1911', fallback: 'type38', pitch: 1.12, volume: 0.62, synth: 0.55, sharp: true },
};

const IMPACT_GROUPS = {
  metal: 'impact_bullet_metal', steel: 'impact_bullet_metal', car: 'impact_bullet_metal',
  wood: 'impact_bullet_wood', plank: 'impact_bullet_wood',
  concrete: 'impact_bullet_concrete', stucco: 'impact_bullet_concrete',
  stone: 'impact_bullet_concrete', rubble: 'impact_bullet_concrete',
  glass: 'impact_bullet_glass', dirt: 'impact_bullet_dirt', sand: 'impact_bullet_dirt',
  water: 'impact_bullet_water', flesh: 'impact_flesh', flesh_heavy: 'impact_flesh_heavy',
};

// Kenney material hits, used only when a bullet recording is unavailable.
const IMPACT_FALLBACK = {
  metal: 'impact_metal_medium', steel: 'impact_metal_light', car: 'impact_metal_light',
  wood: 'impact_plank_medium', plank: 'impact_plank_medium',
  concrete: 'impact_plate_light', stucco: 'impact_plate_light',
  stone: 'impact_plate_light', rubble: 'impact_mining',
  glass: 'impact_glass_light', dirt: 'impact_generic_light', sand: 'impact_generic_light',
  water: 'impact_generic_light', flesh: 'impact_generic_light', flesh_heavy: 'impact_generic_light',
};

const STEP_GROUPS = {
  dirt: 'footstep_grass', sand: 'footstep_grass', grass: 'footstep_grass',
  concrete: 'footstep_concrete', stone: 'footstep_concrete', metal: 'footstep_concrete',
  wood: 'footstep_wood', carpet: 'footstep_carpet',
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.volume = 0.7;
    this.buffers = new Map();
    this._noise = null;
    this._ambient = null;
    this._artTimer = 0;
    this._nextArt = 8;
    this.listener = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0) };
    this._loadState = 0;
    this._failed = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    // The only dynamics stage. A DynamicsCompressor used to sit here, but its gain
    // rode the explosion sub-bass: on a close blast it raised the 3–8 kHz share of
    // the output from 0.1% to 1.6% (audible crackle), and 200 m away it added
    // +2 dB, flattening the distance cues the mixer works to build. A soft clipper
    // cannot pump: it is linear to −1.9 dBFS and only rounds the last 1.5 dB.
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = '4x';

    // Low-pass used for distance and explosion concussion.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.4;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume * HEADROOM;
    // Everything below ~35 Hz is inaudible on most speakers but still drives the
    // cone (and used to modulate the compressor), so cut it once here.
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'highpass';
    this.rumbleFilter.frequency.value = 35;
    this.rumbleFilter.Q.value = 0.707;
    this.master.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.muffle);
    this.muffle.connect(clip);
    clip.connect(ctx.destination);
    this.clipper = clip;

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.0, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.4;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);

    this._noise = this._makeNoise(2.5);
    this._startAmbient();
    this.ready = true;
    this._loadSamples();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v * HEADROOM; }

  /* ------------------------------------------------------------ sample loading */

  async _loadSamples() {
    if (this._loadState) return;
    this._loadState = 1;
    const ctx = this.ctx;
    const queue = [];
    for (const [group, names] of Object.entries(GROUPS)) {
      for (const name of names) queue.push([group, name]);
    }
    // Decode 6 at a time: 141 files would otherwise spike the main thread.
    let i = 0;
    const work = async () => {
      while (i < queue.length) {
        const [group, name] = queue[i++];
        try {
          const res = await fetch(`${SAMPLE_ROOT}${GROUP_DIR[group]}${name}.ogg`);
          if (!res.ok) throw new Error(res.status);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          const key = name.replace(/_\d{3}$/, '');
          if (!this.buffers.has(key)) this.buffers.set(key, []);
          this.buffers.get(key).push(buf);
        } catch (e) {
          this._failed++;
          if (this._failed < 4) console.warn('[audio] sample unavailable', name, e?.message || e);
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, work));
    this._loadState = 2;
  }

  _makeNoise(seconds) {
    const sr = this.ctx.sampleRate;
    const fade = Math.floor(sr * 0.05);
    const n = Math.floor(sr * seconds);
    const raw = new Float32Array(n + fade);
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      raw[i] = last * 3.2;
    }
    // The wind and surf buses loop this buffer; without a seam the wrap-around
    // is a step discontinuity, i.e. a tick every 2.5 s. Crossfade the tail into
    // the head and loop only the head, so the last sample flows into the first.
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    d.set(raw.subarray(0, n));
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[i] = raw[i] * t + raw[n + i] * (1 - t);
    }
    return buf;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return b;
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

  _startAmbient() {
    const t = this.ctx.currentTime;
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

  /* ------------------------------------------------------------ mixer plumbing */

  /** Distance/pan bus. dist in metres, pan -1..1, extra low-pass for concussive events. */
  _out(dist = 0, pan = 0, { reverb = 0.22, muffle = 0 } = {}) {
    const g = this._gain(1);
    let node = g;
    if (dist > 0.5) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(700, 19000 - dist * 320);
      g.connect(lp);
      node = lp;
    }
    if (muffle > 0) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(320, 12000 * (1 - muffle));
      node.connect(lp);
      node = lp;
    }
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      node = p;
    }
    // One distance law for both the dry path and the reverb send; `_out` used to
    // hard-code its own copy, which silently ignored changes to rollout().
    const rolloff = rollout(dist);
    node.connect(this.sfx);
    if (reverb > 0) {
      const rg = this._gain(reverb * (0.55 + rollout(dist) * 0.6));
      node.connect(rg);
      rg.connect(this.reverbSend);
    }
    g.gain.value = rolloff;
    return g;
  }

  /** One recorded sample with random variant + slight pitch spread. */
  play(name, { dist = 0, pan = 0, volume = 1, pitch = 1, pitchVar = 0.04, reverb = 0.22, when = 0, muffle = 0 } = {}) {
    if (!this.ready) return null;
    const list = this.buffers.get(name);
    if (!list || !list.length) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = list[(Math.random() * list.length) | 0];
    src.playbackRate.value = pitch * (1 + (Math.random() * 2 - 1) * pitchVar);
    const g = this._gain(volume);
    src.connect(g);
    g.connect(this._out(dist, pan, { reverb, muffle }));
    src.start(this.ctx.currentTime + when);
    return src;
  }

  has(name) { return !!this.buffers.get(name)?.length; }

  /**
   * Voice line: a recorded shout with a little stereo width, used for the
   * opening charge and for squad barks while the player sprints forward.
   */
  voice(name, { dist = 0, pan = 0, volume = 1, reverb = 0.4, when = 0, spread = 0 } = {}) {
    if (!this.ready || !this.has(name)) return null;
    if (spread > 0) {
      this.play(name, { dist, pan: pan - spread, volume: volume * 0.72, reverb, when, pitchVar: 0.01 });
      return this.play(name, { dist, pan: pan + spread, volume: volume * 0.72, reverb, when: when + 0.015, pitchVar: 0.01 });
    }
    return this.play(name, { dist, pan, volume, reverb, when, pitchVar: 0.01 });
  }

  /* ------------------------------------------------------------ weapons */

  shot(kind = 'type38', { dist = 0, pan = 0, suppressed = false, pos = null, empty = false } = {}) {
    if (!this.ready) return;
    if (pos) {
      const rel = pos.clone().sub(this.listener.pos);
      dist = rel.length();
      if (dist > 0.01) pan = THREE.MathUtils.clamp(rel.normalize().dot(this.listener.right), -1, 1);
    }
    const t = this.ctx.currentTime;
    const near = dist < 4;
    const profile = GUN_PROFILES[kind] || GUN_PROFILES.type38;
    const base = this.has(`${profile.clip}_player_near`) ? profile.clip : profile.fallback;
    const clip = near ? `${base}_player_near` : dist > 55 ? `${base}_enemy_distant` : `${base}_world`;
    const sampleVol = (near ? 1 : dist > 55 ? 0.7 : 0.9) * profile.volume;
    if (this.has(clip)) {
      this.play(clip, {
        dist, pan, volume: sampleVol * (suppressed ? 0.35 : 1),
        pitch: profile.pitch, pitchVar: 0.035,
        reverb: suppressed ? 0.12 : 0.6,
      });
    }
    // Layer: sharp transient + low punch, quieter for distant reports and for
    // lighter weapons (the profile scales the synth, not just the sample).
    const synth = (near ? 0.35 : 0.2) * (profile.synth ?? 1);
    const out = this._out(dist, pan, { reverb: suppressed ? 0.1 : 0.5 });
    const sharp = kind === 'type38' || kind === 'm1' || !!profile.sharp;
    const src = this._srcNoise();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = suppressed ? 700 : sharp ? 2400 : 1500;
    bp.Q.value = sharp ? 0.9 : 0.7;
    const g = this._gain(0.0001);
    src.connect(bp); bp.connect(g); g.connect(out);
    const peak = (dist > 60 ? 0.5 : 0.95) * (suppressed ? 0.4 : 1) * synth;
    this._env(g.gain, t, 0.002, sharp ? 0.13 : 0.2, peak);
    src.start(t); src.stop(t + 0.4);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(sharp ? 140 : 95, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    const og = this._gain(0.0001);
    osc.connect(og); og.connect(out);
    this._env(og.gain, t, 0.003, sharp ? 0.15 : 0.24, (dist > 60 ? 0.25 : 0.7) * synth);
    osc.start(t); osc.stop(t + 0.4);

    if (dist > 25) {
      const tail = this._srcNoise();
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
      const tg = this._gain(0.0001);
      tail.connect(lp); lp.connect(tg); tg.connect(out);
      this._env(tg.gain, t + 0.02, 0.03, 0.55, 0.18);
      tail.start(t); tail.stop(t + 0.8);
    }
    // Semiautomatic Garand: the en-bloc clip ping when the clip empties.
    if (kind === 'm1' && empty) this._ping(t + 0.10);
  }

  _ping(t) {
    const when = Math.max(0, t - this.ctx.currentTime);
    if (this.has('m1_clip_ping')) {
      return void this.play('m1_clip_ping', {
        volume: 0.65, reverb: 0.35, when, pitchVar: 0.05,
      });
    }
    for (const [f, a] of [[2600, 0.05], [4100, 0.03], [5300, 0.02]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * (0.98 + Math.random() * 0.04);
      const g = this._gain(0.0001);
      o.connect(g); g.connect(this.sfx);
      this._env(g.gain, t, 0.001, 0.25, a);
      o.start(t); o.stop(t + 0.3);
    }
  }

  /** Bolt cycle: recorded back/fwd with the mechanical synth underneath. */
  bolt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (this.has('bolt_back')) this.play('bolt_back', { volume: 0.75, reverb: 0.08, pitchVar: 0.02 });
    if (this.has('bolt_fwd')) this.play('bolt_fwd', { volume: 0.8, reverb: 0.08, when: 0.17, pitchVar: 0.02 });
    const out = this._out(0, -0.1, { reverb: 0.06 });
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.085;
      const src = this._srcNoise();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2600 + i * 700; bp.Q.value = 2.5;
      const g = this._gain(0.0001);
      src.connect(bp); bp.connect(g); g.connect(out);
      this._env(g.gain, tt, 0.001, 0.045, this.has('bolt_back') ? 0.18 : 0.35);
      src.start(tt); src.stop(tt + 0.08);
    }
  }

  reload(stage = 'clip') {
    if (!this.ready) return;
    if (stage === 'clip') {
      if (this.has('rifle_magin')) return void this.play('rifle_magin', { volume: 0.85, reverb: 0.1 });
    } else if (stage === 'rack') {
      if (this.has('rifle_rack')) return void this.play('rifle_rack', { volume: 0.85, reverb: 0.1 });
    } else if (stage === 'drop') {
      if (this.has('rifle_boltdrop')) return void this.play('rifle_boltdrop', { volume: 0.75, reverb: 0.1 });
    }
    const t = this.ctx.currentTime;
    const out = this._out(0, 0, { reverb: 0.06 });
    const src = this._srcNoise();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = stage === 'clip' ? 1800 : 3000; bp.Q.value = 3;
    const g = this._gain(0.0001);
    src.connect(bp); bp.connect(g); g.connect(out);
    this._env(g.gain, t, 0.002, 0.09, 0.4);
    src.start(t); src.stop(t + 0.12);
  }

  /* ------------------------------------------------------------ world */

  step(surface = 'dirt') {
    if (!this.ready) return;
    const group = STEP_GROUPS[surface] || 'footstep_grass';
    if (this.has(group)) {
      const pitch = surface === 'metal' ? 1.3 : surface === 'sand' ? 0.82 : surface === 'wood' ? 1.0 : 0.95;
      return void this.play(group, { volume: surface === 'metal' ? 0.55 : 0.4, pitch, reverb: 0.1, pitchVar: 0.08 });
    }
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
    const group = IMPACT_GROUPS[surface] || 'impact_generic_light';
    const pick = this.has(group) ? group : (IMPACT_FALLBACK[surface] || 'impact_generic_light');
    if (this.has(pick)) {
      const volume = surface === 'metal' ? 0.8 : surface === 'flesh' ? 0.8 : surface === 'flesh_heavy' ? 0.9 : 0.72;
      return void this.play(pick, {
        dist, pan, volume,
        pitch: surface === 'dirt' || surface === 'sand' || surface === 'flesh' || surface === 'flesh_heavy' ? 0.88 : 1,
        reverb: 0.18, pitchVar: 0.09,
      });
    }
    const t = this.ctx.currentTime;
    const out = this._out(dist, pan, { reverb: 0.12 });
    const src = this._srcNoise();
    const f = this.ctx.createBiquadFilter();
    f.type = surface === 'metal' ? 'bandpass' : 'lowpass';
    f.frequency.value = surface === 'metal' ? 3000 : 1200;
    const g = this._gain(0.0001);
    src.connect(f); f.connect(g); g.connect(out);
    this._env(g.gain, t, 0.001, 0.07, surface === 'flesh' ? 0.2 : 0.25);
    src.start(t); src.stop(t + 0.15);
  }

  explosion(dist = 0, pan = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(dist * 0.6, pan, { reverb: 0.7 });
    if (this.has('explosionCrunch')) {
      this.play('explosionCrunch', { dist: dist * 0.6, pan, volume: 1.15, reverb: 0.7, pitchVar: 0.06 });
    }
    if (this.has('lowFrequency_explosion')) {
      this.play('lowFrequency_explosion', { dist: dist * 0.6, pan, volume: 1.0, reverb: 0.5, pitchVar: 0.05 });
    }
    const src = this._srcNoise();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.7);
    const g = this._gain(0.0001);
    src.connect(lp); lp.connect(g); g.connect(out);
    this._env(g.gain, t, 0.005, 1.1, this.has('explosionCrunch') ? 0.45 : 1.0);
    src.start(t); src.stop(t + 1.4);
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(70, t);
    sub.frequency.exponentialRampToValueAtTime(36, t + 0.6);
    const sg = this._gain(0.0001);
    sub.connect(sg); sg.connect(out);
    this._env(sg.gain, t, 0.004, 0.8, 0.55);
    sub.start(t); sub.stop(t + 1.0);
  }

  /**
   * Tank cannon: a hard muzzle crack, a low-frequency pressure body and a long
   * tail on top of the recorded explosion, so a 75 mm round reads as a gun and
   * not as a grenade.
   */
  cannon(dist = 0, pan = 0, caliber = 75) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const weight = caliber >= 70 ? 1 : 0.72;
    const out = this._out(dist * 0.5, pan, { reverb: 0.65 });
    if (this.has('explosionCrunch')) {
      this.play('explosionCrunch', {
        dist: dist * 0.5, pan, volume: 0.72 * weight, reverb: 0.6, pitch: 1.4, pitchVar: 0.05,
      });
    }
    const crack = this._srcNoise();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const cg = this._gain(0.0001);
    crack.connect(hp); hp.connect(cg); cg.connect(out);
    this._env(cg.gain, t, 0.001, 0.12, 0.5 * weight);
    crack.start(t); crack.stop(t + 0.3);

    const thump = this.ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.42);
    const tg = this._gain(0.0001);
    thump.connect(tg); tg.connect(out);
    this._env(tg.gain, t, 0.002, 0.55, 0.7 * weight);
    thump.start(t); thump.stop(t + 0.8);

    const tail = this._srcNoise();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 1.2);
    const tg2 = this._gain(0.0001);
    tail.connect(lp); lp.connect(tg2); tg2.connect(out);
    this._env(tg2.gain, t + 0.02, 0.03, 1.4, 0.2);
    tail.start(t); tail.stop(t + 1.6);
  }

  whiz(pan = 0) {
    if (!this.ready) return;
    if (this.has('bullet_whiz')) {
      return void this.play('bullet_whiz', {
        pan, volume: 0.5, pitch: 0.9 + Math.random() * 0.2, pitchVar: 0.12, reverb: 0.05,
      });
    }
    const t = this.ctx.currentTime;
    const src = this._srcNoise();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    const g = this._gain(0.0001);
    src.connect(bp); bp.connect(g); g.connect(this._out(0, pan, { reverb: 0.05 }));
    this._env(g.gain, t, 0.004, 0.16, 0.22);
    src.start(t); src.stop(t + 0.25);
  }

  hitmark(kill = false) {
    if (!this.ready) return;
    if (this.has('hitmarker')) {
      return void this.play('hitmarker', {
        volume: kill ? 0.75 : 0.55,
        pitch: kill ? 1.24 : 1,
        reverb: 0, pitchVar: 0.01,
      });
    }
    if (this.has('tick_001')) return void this.play('tick_001', { volume: 0.5, pitch: 1.6, reverb: 0, pitchVar: 0 });
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
    if (this.has('confirmation_001')) return void this.play('confirmation_001', { volume: 0.6, reverb: 0.15 });
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
    if (this.has('click_001')) {
      return void this.play(kind === 'back' ? 'tick_001' : 'click_001', {
        volume: 0.35, pitch: kind === 'back' ? 0.8 : 1, pitchVar: 0.02, reverb: 0,
      });
    }
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

  /** Camera position, so positional sounds pan/attenuate correctly. */
  updateListener(camera) {
    if (!this.ready) return;
    camera.getWorldPosition(this.listener.pos);
    this.listener.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
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

function rollout(dist) { return 1 / Math.pow(1 + dist / 30, 1.3); }

/**
 * Output transfer curve: linear to 0.8 (−1.9 dBFS), then a tanh knee that matches
 * the linear slope at the knee and settles at 0.945, leaving room for reconstruction
 * overshoot at 4× oversampling. Inputs past full scale clamp to that ceiling.
 */
function softClipCurve(points = 4096) {
  const knee = 0.8;
  const top = 0.98;
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    // tanh(k) with no extra slope term: value and first derivative both match the
    // linear segment at the knee, so the curve never expands before it compresses.
    const y = a <= knee
      ? a
      : knee + (top - knee) * Math.tanh((a - knee) / (top - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
