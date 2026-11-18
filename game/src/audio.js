// Procedural sound — every effect is synthesized live with the Web Audio
// API, so the game ships no audio files: a sawtooth engine hum that follows
// speed, a two-tone siren, gunshots, punches, cash and mission jingles.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
  }

  // Created on the first user gesture (the Play button), as browsers require.
  init() {
    if (this.ctx) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    this.ctx = new AudioCtor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngineLoop();
    this.startSirenLoop();
  }

  // Engine: a low sawtooth through a lowpass filter, pitch follows speed.
  startEngineLoop() {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
  }

  // Siren: a triangle wave whose pitch an LFO flips between two tones.
  startSirenLoop() {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 1.4;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    lfo.start();
    this.sirenOsc = osc;
    this.sirenGain = gain;
  }

  resume() {
    this.ctx?.resume?.();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  setEngine(speed01, running) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const volume = running ? 0.1 + speed01 * 0.08 : 0;
    this.engineGain.gain.setTargetAtTime(volume, now, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, now, 0.1);
  }

  setSiren(on) {
    if (!this.ctx || on === this.sirenOn) return;
    this.sirenOn = on;
    this.sirenGain.gain.setTargetAtTime(on ? 0.06 : 0, this.ctx.currentTime, 0.2);
  }

  // A burst of decaying white noise through a filter — impacts and shots.
  noiseBurst(duration, filterFreq, volume, filterType = 'lowpass') {
    if (!this.ctx) return;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
  }

  // A single oscillator tone, optionally sliding down in pitch.
  tone(freq, duration, volume, type = 'sine', slideTo = null) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(now + duration);
  }

  gunshot() {
    this.noiseBurst(0.12, 1800, 0.5);
    this.tone(160, 0.08, 0.3, 'square', 60);
  }

  punch() {
    this.noiseBurst(0.08, 500, 0.4);
    this.tone(90, 0.1, 0.35, 'sine', 45);
  }

  pickup() {
    this.tone(880, 0.1, 0.25);
    setTimeout(() => this.tone(1320, 0.15, 0.25), 90);
  }

  cash() {
    this.tone(1046, 0.09, 0.22);
    setTimeout(() => this.tone(1568, 0.14, 0.22), 80);
  }

  doorSlam() {
    this.noiseBurst(0.07, 300, 0.5);
  }

  crash() {
    this.noiseBurst(0.25, 900, 0.5);
    this.tone(70, 0.2, 0.4, 'sawtooth', 35);
  }

  missionComplete() {
    [523, 659, 784, 1046].forEach((freq, i) => {
      setTimeout(() => this.tone(freq, 0.22, 0.25), i * 120);
    });
  }

  missionFail() {
    this.tone(392, 0.25, 0.25);
    setTimeout(() => this.tone(262, 0.4, 0.25), 200);
  }

  wantedUp() {
    this.tone(220, 0.12, 0.25, 'square');
    setTimeout(() => this.tone(220, 0.12, 0.25, 'square'), 150);
  }

  horn() {
    this.tone(370, 0.18, 0.2, 'sawtooth');
    this.tone(466, 0.18, 0.15, 'sawtooth');
  }
}
