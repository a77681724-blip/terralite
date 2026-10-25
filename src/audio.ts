// src/audio.ts — procedural music + SFX engine (Web Audio API).
// Tracks: menu (calm), day (bright adventure), night (eerie), boss (intense).

export type MusicTrack = "menu" | "day" | "night" | "boss" | "none";

export type SfxName =
  | "mine"
  | "mineStone"
  | "break"
  | "place"
  | "jump"
  | "land"
  | "hurt"
  | "swing"
  | "hitEnemy"
  | "enemyDie"
  | "slime"
  | "pickup"
  | "craft"
  | "levelup"
  | "torch"
  | "bossSpawn"
  | "gameOver"
  | "victory"
  | "click";

const DAY_BARS = [
  { bass: 130.81, pad: [261.63, 329.63, 392.0], arp: [392, 523.25, 659.25, 523.25, 392, 523.25, 659.25, 783.99] },
  { bass: 98.0, pad: [196.0, 246.94, 293.66], arp: [293.66, 392, 493.88, 392, 293.66, 392, 493.88, 587.33] },
  { bass: 110.0, pad: [220.0, 261.63, 329.63], arp: [329.63, 440, 523.25, 440, 329.63, 440, 523.25, 659.25] },
  { bass: 146.83, pad: [293.66, 349.23, 440.0], arp: [440, 587.33, 698.46, 587.33, 440, 587.33, 698.46, 880] },
];

const NIGHT_BARS = [
  { bass: 55.0, pad: [220.0, 261.63, 329.63], arp: [220, 261.63, 329.63, 261.63, 220, 196, 220, 261.63] },
  { bass: 49.0, pad: [196.0, 233.08, 293.66], arp: [196, 233.08, 293.66, 233.08, 196, 174.61, 196, 233.08] },
  { bass: 65.41, pad: [261.63, 311.13, 392.0], arp: [261.63, 311.13, 392, 311.13, 261.63, 233.08, 261.63, 311.13] },
  { bass: 58.27, pad: [233.08, 277.18, 349.23], arp: [233.08, 277.18, 349.23, 277.18, 233.08, 207.65, 233.08, 277.18] },
];

function makeNoise(ctx: AudioContext, s: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * s);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function makeImpulse(ctx: AudioContext, s: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * s);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private reverbIn!: GainNode;
  private convolver!: ConvolverNode;
  private delay!: DelayNode;
  private delayFb!: GainNode;
  private noiseBuf!: AudioBuffer;
  musicOn = true;
  sfxOn = true;
  private track: MusicTrack = "none";
  private bpm = 100;
  private stepDur = 60 / 100 / 2;
  private step = 0;
  private nextNoteTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return true;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(ctx.destination);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.85 : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 0.9 : 0;
      this.sfxGain.connect(this.master);
      this.reverbIn = ctx.createGain();
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = makeImpulse(ctx, 2.2, 2.4);
      const revOut = ctx.createGain();
      revOut.gain.value = 0.85;
      this.reverbIn.connect(this.convolver);
      this.convolver.connect(revOut);
      revOut.connect(this.master);
      this.delay = ctx.createDelay(1.0);
      this.delay.delayTime.value = this.stepDur * 1.5;
      this.delayFb = ctx.createGain();
      this.delayFb.gain.value = 0.3;
      this.delay.connect(this.delayFb);
      this.delayFb.connect(this.delay);
      this.delayFb.connect(this.master);
      this.delayFb.connect(this.reverbIn);
      this.noiseBuf = makeNoise(ctx, 1);
      if (ctx.state === "suspended") void ctx.resume();
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05);
    if (!on) this.stopMusic();
    else if (this.track !== "none" && !this.timer) this.start();
  }
  setSfx(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfxGain.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }
  setTrack(track: MusicTrack) {
    if (track === this.track) return;
    this.track = track;
    if (track === "none") {
      this.stopMusic();
      return;
    }
    this.bpm = track === "boss" ? 150 : track === "night" ? 82 : track === "day" ? 104 : 88;
    this.stepDur = 60 / this.bpm / 2;
    if (this.ctx) this.delay.delayTime.setTargetAtTime(this.stepDur * 1.5, this.ctx.currentTime, 0.1);
    if (this.musicOn) this.start();
  }

  private start() {
    if (!this.ensure() || !this.ctx) return;
    if (this.timer) return;
    this.nextNoteTime = this.ctx.currentTime + 0.12;
    this.timer = setInterval(() => this.scheduler(), 25);
  }
  stopMusic() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduler() {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + 0.13) {
      this.schedule(this.step, this.nextNoteTime);
      this.nextNoteTime += this.stepDur;
      this.step = (this.step + 1) % 32;
    }
  }

  private schedule(step: number, t: number) {
    const bars = this.track === "night" ? NIGHT_BARS : DAY_BARS;
    const bar = Math.floor(step / 8) % 4;
    const s = step % 8;
    const B = bars[bar];
    if (this.track === "menu") {
      if (s === 0) this.pad(B.pad, t, this.stepDur * 8);
      if (s % 2 === 0) this.bell(B.arp[s % 8], t, this.stepDur * 1.6);
      return;
    }
    if (s === 0) this.pad(B.pad, t, this.stepDur * 8);
    if (s % 2 === 0) this.bass(B.bass, t);
    this.bell(B.arp[s], t, this.stepDur * (this.track === "boss" ? 0.9 : 1.3));
    if (this.track === "boss") {
      if (s % 2 === 0) this.kick(t);
      if (s === 4) this.snare(t);
      this.hat(t, 0.03);
    } else if (this.track === "day") {
      if (s === 0 || s === 4) this.kick(t, 0.5);
      if (s === 2 || s === 6) this.hat(t, 0.025);
    } else {
      if (s === 0) this.kick(t, 0.35);
    }
  }

  private osc(freq: number, type: OscillatorType, t: number, dur: number, peak: number, dest: AudioNode, slideTo?: number, filt?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (filt) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = filt;
      o.connect(f);
      f.connect(g);
    } else o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number, peak = 0.7) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.24);
  }
  private snare(t: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.musicGain);
    n.start(t);
    n.stop(t + 0.18);
  }
  private hat(t: number, gain: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 8000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.musicGain);
    n.start(t);
    n.stop(t + 0.05);
  }
  private bass(freq: number, t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    lp.type = "lowpass";
    lp.frequency.value = 320;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + this.stepDur * 1.6);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + this.stepDur * 1.8);
  }
  private bell(freq: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g);
    g.connect(this.musicGain);
    g.connect(this.delay);
    g.connect(this.reverbIn);
    const a = ctx.createOscillator();
    a.type = "triangle";
    a.frequency.value = freq;
    const b = ctx.createOscillator();
    b.type = "sine";
    b.frequency.value = freq * 2;
    const bg = ctx.createGain();
    bg.gain.value = 0.3;
    a.connect(lp);
    b.connect(bg);
    bg.connect(lp);
    a.start(t);
    b.start(t);
    a.stop(t + dur + 0.05);
    b.stop(t + dur + 0.05);
  }
  private pad(freqs: number[], t: number, dur: number) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.6);
    g.gain.linearRampToValueAtTime(0.035, t + dur - 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g);
    g.connect(this.musicGain);
    g.connect(this.reverbIn);
    for (const f of freqs) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  private noiseBurst(t: number, dur: number, peak: number, hp: number, bp = false) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = bp ? "bandpass" : "highpass";
    f.frequency.value = hp;
    f.Q.value = bp ? 1.5 : 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    g.connect(this.reverbIn);
    n.start(t);
    n.stop(t + dur + 0.02);
  }

  playSfx(name: SfxName) {
    if (!this.ensure() || !this.sfxOn || !this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case "mine":
        this.noiseBurst(t, 0.08, 0.18, 1200, true);
        this.osc(180, "square", t, 0.06, 0.08, this.sfxGain, 120);
        break;
      case "mineStone":
        this.noiseBurst(t, 0.1, 0.24, 900, true);
        this.osc(150, "square", t, 0.08, 0.1, this.sfxGain, 100);
        break;
      case "break":
        this.noiseBurst(t, 0.18, 0.22, 700);
        this.osc(220, "triangle", t, 0.14, 0.12, this.sfxGain, 110);
        break;
      case "place":
        this.osc(300, "triangle", t, 0.08, 0.14, this.sfxGain, 360);
        this.noiseBurst(t, 0.05, 0.08, 2000);
        break;
      case "jump":
        this.osc(380, "triangle", t, 0.14, 0.16, this.sfxGain, 640);
        break;
      case "land":
        this.noiseBurst(t, 0.08, 0.16, 500);
        break;
      case "hurt":
        this.osc(240, "sawtooth", t, 0.28, 0.3, this.sfxGain, 70);
        this.noiseBurst(t, 0.16, 0.18, 900);
        break;
      case "swing":
        this.noiseBurst(t, 0.12, 0.16, 2400, true);
        break;
      case "hitEnemy":
        this.osc(320, "square", t, 0.08, 0.16, this.sfxGain, 140);
        this.noiseBurst(t, 0.06, 0.14, 1800, true);
        break;
      case "enemyDie":
        this.osc(260, "sawtooth", t, 0.26, 0.2, this.sfxGain, 60);
        this.noiseBurst(t, 0.24, 0.16, 1200);
        break;
      case "slime":
        this.osc(180, "sine", t, 0.12, 0.14, this.sfxGain, 260);
        break;
      case "pickup":
        this.osc(880, "triangle", t, 0.08, 0.16, this.sfxGain, 1320);
        this.osc(1320, "triangle", t + 0.05, 0.1, 0.12, this.sfxGain, 1760);
        break;
      case "craft":
        this.osc(523, "triangle", t, 0.1, 0.16, this.sfxGain, 784);
        this.osc(784, "triangle", t + 0.08, 0.16, 0.14, this.sfxGain, 1046);
        break;
      case "levelup":
        [523, 659, 784, 1046].forEach((f, i) => this.osc(f, "triangle", t + i * 0.09, 0.3, 0.18, this.sfxGain));
        break;
      case "torch":
        this.noiseBurst(t, 0.1, 0.06, 2600);
        break;
      case "bossSpawn":
        this.osc(110, "sawtooth", t, 0.9, 0.34, this.sfxGain, 50);
        this.noiseBurst(t, 0.6, 0.2, 500);
        break;
      case "gameOver":
        [440, 392, 329, 220].forEach((f, i) => this.osc(f, "sawtooth", t + i * 0.2, 0.5, 0.2, this.sfxGain, f * 0.7));
        break;
      case "victory":
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.osc(f, "triangle", t + i * 0.14, 0.6, 0.2, this.sfxGain));
        break;
      case "click":
        this.osc(620, "triangle", t, 0.05, 0.1, this.sfxGain, 740);
        break;
    }
  }
}

export const audio = new AudioManager();
