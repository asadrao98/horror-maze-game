/**
 * AudioManager - All sound is synthesized at runtime via the Web Audio API
 * so the project ships with zero external audio assets.
 *
 * Channels we expose:
 *   - Ambient drone (low rumble, always playing once started)
 *   - Heartbeat (intensity scaled by monster proximity / chase state)
 *   - Growl / breathing (triggered by MonsterAI on transitions)
 *   - Pickup chime (key vs. battery variants)
 *   - Jumpscare sting
 *   - Win cue
 *
 * The AudioContext is only created on the first user gesture (game start),
 * because browsers block autoplay.
 */
export class AudioManager {
  constructor(camera) {
    this.camera = camera;
    this.ctx = null;
    this.master = null;
    this.ambientNodes = null;
    this.heartbeatNodes = null;
    this.monsterProximity = 100;
    this.heartbeatIntensity = 0;
    this._heartbeatScheduler = null;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
  }

  dispose() {
    try {
      this.ctx?.close();
    } catch (e) { /* noop */ }
  }

  // --- Ambient -------------------------------------------------------------

  startAmbient() {
    if (!this.ctx || this.ambientNodes) return;
    const ctx = this.ctx;

    // Low drone — two detuned saws through a heavy lowpass
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 42;
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = 56;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    o1.connect(filter); o2.connect(filter);
    filter.connect(gain).connect(this.master);
    o1.start(); o2.start();

    // Wind/noise layer
    const noiseBuf = this.createNoiseBuffer(4);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 400;
    noiseFilter.Q.value = 0.6;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.025;
    noiseSrc.connect(noiseFilter).connect(noiseGain).connect(this.master);
    noiseSrc.start();

    this.ambientNodes = { o1, o2, filter, gain, noiseSrc, noiseGain };

    // Distant random thuds for atmosphere
    this.scheduleDistantThumps();

    // Start the heartbeat scheduler (silent until intensity > 0)
    this.scheduleHeartbeat();
  }

  scheduleDistantThumps() {
    if (!this.ctx) return;
    const fire = () => {
      if (!this.ctx) return;
      this.playDistantThump();
      setTimeout(fire, 8000 + Math.random() * 18000);
    };
    setTimeout(fire, 5000 + Math.random() * 5000);
  }

  playDistantThump() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.7);
  }

  // --- Heartbeat -----------------------------------------------------------

  setMonsterProximity(d) { this.monsterProximity = d; }
  setHeartbeatIntensity(v) { this.heartbeatIntensity = Math.max(0, Math.min(1, v)); }

  scheduleHeartbeat() {
    const tick = () => {
      if (!this.ctx) return;
      if (this.heartbeatIntensity > 0.02) {
        this.playHeartbeat();
      }
      // Rate scales with intensity (60–140 bpm)
      const bpm = 60 + this.heartbeatIntensity * 80;
      const interval = 60000 / bpm;
      this._heartbeatScheduler = setTimeout(tick, interval);
    };
    tick();
  }

  playHeartbeat() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = 0.18 * this.heartbeatIntensity;
    // First thud
    this.heartThud(t, vol);
    // Second thud, slightly weaker
    this.heartThud(t + 0.15, vol * 0.7);
  }

  heartThud(when, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, when);
    o.frequency.exponentialRampToValueAtTime(40, when + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    o.connect(g).connect(this.master);
    o.start(when);
    o.stop(when + 0.25);
  }

  // --- Monster vocalizations ----------------------------------------------

  playGrowl(aggressive) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = aggressive ? 1.0 : 1.5;

    // Filtered noise base
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(dur + 0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(aggressive ? 350 : 220, t);
    bp.frequency.exponentialRampToValueAtTime(aggressive ? 180 : 120, t + dur);
    bp.Q.value = 4;

    // Low sub oscillator
    const sub = ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(aggressive ? 80 : 55, t);
    sub.frequency.linearRampToValueAtTime(aggressive ? 60 : 40, t + dur);

    const g = ctx.createGain();
    const peakVol = aggressive ? 0.35 : 0.18;
    // Proximity attenuation
    const distAtten = Math.max(0.1, 1 - this.monsterProximity / 18);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peakVol * distAtten, t + 0.15);
    g.gain.linearRampToValueAtTime(peakVol * distAtten * 0.7, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(bp).connect(g);
    sub.connect(g);
    g.connect(this.master);

    noise.start(t);
    noise.stop(t + dur + 0.05);
    sub.start(t);
    sub.stop(t + dur + 0.05);
  }

  // --- Pickup / interaction -----------------------------------------------

  playPickup(isKey) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const baseFreq = isKey ? 880 : 520;
    const o = ctx.createOscillator();
    o.type = isKey ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(baseFreq, t);
    o.frequency.exponentialRampToValueAtTime(baseFreq * 1.6, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.4);
  }

  // --- Jumpscare -----------------------------------------------------------

  playJumpscare() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // High-frequency scream
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1200, t);
    o.frequency.linearRampToValueAtTime(400, t + 0.5);

    // Noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer(0.6);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    o.connect(g).connect(this.master);
    noise.connect(noiseGain).connect(this.master);

    o.start(t);
    o.stop(t + 0.55);
    noise.start(t);
    noise.stop(t + 0.6);

    // Followed by a low impact
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, t + 0.05);
    sub.frequency.exponentialRampToValueAtTime(25, t + 0.5);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.6, t + 0.05);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    sub.connect(sg).connect(this.master);
    sub.start(t + 0.05);
    sub.stop(t + 0.7);
  }

  playWin() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const freqs = [330, 415, 494, 660];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.2);
      g.gain.linearRampToValueAtTime(0.18, t + i * 0.2 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.7);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.2);
      o.stop(t + i * 0.2 + 0.75);
    });
  }

  // --- Utilities -----------------------------------------------------------

  createNoiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}
