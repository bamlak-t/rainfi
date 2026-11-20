import * as Tone from 'tone';
import type { GameEvent } from './game';

const COL_NOTES = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6'];
const COMBO_NOTES = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7'];
const CHORDS = [
  ['F3', 'A3', 'C4', 'E4'],
  ['E3', 'G3', 'B3', 'D4'],
  ['D3', 'F3', 'A3', 'C4'],
  ['C3', 'E3', 'G3', 'B3'],
];
const BASS = ['F1', 'E1', 'D1', 'C1'];

/** Lo-fi soundtrack + sfx. The game clock is the master; audio is triggered as events arrive. */
export class Audio {
  ready = false;
  musicOn = true;
  sfxOn = true;
  private music!: Tone.Gain;
  private sfx!: Tone.Gain;
  private rain!: Tone.Gain;
  private pad!: Tone.PolySynth;
  private bass!: Tone.MonoSynth;
  private kick!: Tone.MembraneSynth;
  private snare!: Tone.NoiseSynth;
  private hat!: Tone.NoiseSynth;
  private pluck!: Tone.PolySynth<Tone.FMSynth>;
  private chime!: Tone.PolySynth;
  private crunch!: Tone.NoiseSynth;
  private crunchFilter!: Tone.Filter;
  private thump!: Tone.MembraneSynth;
  private thunderN!: Tone.NoiseSynth;
  private crackN!: Tone.NoiseSynth;
  private boingS!: Tone.Synth;
  private tick!: Tone.Synth;
  private recent: number[] = [];
  private lastTick = 0;

  async start() {
    if (this.ready) return;
    Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0.01 }));
    await Tone.start();
    const master = new Tone.Compressor(-16, 3).toDestination();
    const tapeLP = new Tone.Filter(5200, 'lowpass').connect(master);
    const verb = new Tone.Reverb({ decay: 3.2, wet: 1 }).connect(master);
    const send = new Tone.Gain(0.22).connect(verb);

    this.music = new Tone.Gain(this.musicOn ? 0.7 : 0).connect(tapeLP);
    this.music.connect(send);
    this.sfx = new Tone.Gain(this.sfxOn ? 0.85 : 0).connect(tapeLP);
    const sfxSend = new Tone.Gain(0.12).connect(verb);
    this.sfx.connect(sfxSend);

    // pads: wobbly tape chords
    const wobble = new Tone.Vibrato({ frequency: 0.45, depth: 0.12 }).connect(this.music);
    const padLP = new Tone.Filter(950, 'lowpass').connect(wobble);
    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fattriangle', count: 2, spread: 14 },
      envelope: { attack: 0.5, decay: 0.4, sustain: 0.7, release: 1.4 },
      volume: -17,
    }).connect(padLP);
    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'sine' }, filter: { Q: 1, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.8 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.4, baseFrequency: 120, octaves: 2 }, volume: -10,
    }).connect(this.music);

    // drums
    this.kick = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 5, envelope: { attack: 0.001, decay: 0.35, sustain: 0 }, volume: -8 })
      .connect(new Tone.Filter(900, 'lowpass').connect(this.music));
    this.snare = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 }, volume: -20 })
      .connect(new Tone.Filter({ frequency: 1800, type: 'bandpass', Q: 1.2 }).connect(this.music));
    this.hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 }, volume: -30 })
      .connect(new Tone.Filter(7500, 'highpass').connect(this.music));

    // vinyl crackle
    const sr = Tone.getContext().sampleRate, len = sr * 3, data = new Float32Array(len);
    for (let i = 0; i < len; i++) data[i] = (Math.random() < 0.0006 ? Math.random() * 2 - 1 : 0) + (Math.random() * 2 - 1) * 0.015;
    new Tone.Player(Tone.ToneAudioBuffer.fromArray(data)).set({ loop: true, volume: -14 })
      .connect(new Tone.Filter({ frequency: 2600, type: 'bandpass', Q: 0.7 }).connect(this.music)).start();

    // rain bed
    this.rain = new Tone.Gain(0.09).connect(this.sfx);
    new Tone.Noise('pink').connect(new Tone.Filter(1500, 'lowpass').connect(new Tone.Filter(320, 'highpass').connect(this.rain))).start();

    // drips: soft kalimba-ish FM pluck
    this.pluck = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01, modulationIndex: 3,
      oscillator: { type: 'sine' }, modulation: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.7, sustain: 0, release: 0.5 },
      modulationEnvelope: { attack: 0.002, decay: 0.15, sustain: 0, release: 0.2 },
      volume: -16,
    }).connect(new Tone.Filter(3800, 'lowpass').connect(this.sfx));
    this.pluck.maxPolyphony = 48;
    this.chime = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.45, sustain: 0, release: 0.4 }, volume: -15,
    }).connect(this.sfx);
    this.chime.maxPolyphony = 40;

    // breaking
    this.crunchFilter = new Tone.Filter(900, 'lowpass').connect(this.sfx);
    this.crunch = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 }, volume: -6 }).connect(this.crunchFilter);
    this.thump = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 4, envelope: { attack: 0.001, decay: 0.18, sustain: 0 }, volume: -8 }).connect(this.sfx);
    this.thunderN = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.04, decay: 2.4, sustain: 0 }, volume: 0 })
      .connect(new Tone.Filter(280, 'lowpass').connect(this.sfx));
    this.crackN = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 }, volume: -10 })
      .connect(new Tone.Filter(2200, 'highpass').connect(this.sfx));
    this.boingS = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.1 }, volume: -10 }).connect(this.sfx);
    this.tick = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }, volume: -26 }).connect(this.sfx);

    this.ready = true;
  }

  setMusic(on: boolean) { this.musicOn = on; if (this.ready) this.music.gain.rampTo(on ? 0.7 : 0, 0.3); }
  setSfx(on: boolean) { this.sfxOn = on; if (this.ready) this.sfx.gain.rampTo(on ? 0.85 : 0, 0.3); }
  suspend(hidden: boolean) { if (!this.ready) return; const c = Tone.getContext().rawContext as AudioContext; hidden ? c.suspend() : c.resume(); }

  private throttle(max: number, win = 0.12) {
    const now = Tone.now();
    this.recent = this.recent.filter(x => now - x < win);
    if (this.recent.length >= max) return false;
    this.recent.push(now);
    return true;
  }

  moteTick() {
    if (!this.ready) return;
    const now = Tone.now();
    if (now - this.lastTick < 0.035) return;
    this.lastTick = now;
    this.tick.triggerAttackRelease(['E7', 'G7', 'A7', 'C8'][Math.floor(Math.random() * 4)], 0.03, now);
  }

  handle(e: GameEvent, beatLen: number) {
    if (!this.ready) return;
    const now = Tone.now();
    try {
      switch (e.type) {
        case 'beat': {
          const { sub, bar } = e;
          if (sub === 0) {
            const ch = CHORDS[((bar % 4) + 4) % 4];
            this.pad.triggerAttackRelease(ch, beatLen * 3.8, now);
            this.bass.triggerAttackRelease(BASS[((bar % 4) + 4) % 4], beatLen * 1.5, now);
          }
          if (sub === 0 || sub === 10) this.kick.triggerAttackRelease('C1', '8n', now, sub === 10 ? 0.6 : 1);
          if (sub === 4 || sub === 12) this.snare.triggerAttackRelease(0.1, now);
          if (sub % 4 === 2) this.hat.triggerAttackRelease(0.03, now + beatLen * 0.06); // swing
          break;
        }
        case 'drip':
          if (!this.throttle(6)) return;
          this.pluck.triggerAttackRelease(COL_NOTES[e.col], 0.4, now, e.n > 1 ? 0.9 : 0.6);
          if (e.n > 1) this.pluck.triggerAttackRelease(Tone.Frequency(COL_NOTES[e.col]).transpose(-12).toNote(), 0.5, now, 0.5);
          break;
        case 'hit':
          if (e.crit && this.throttle(6)) this.chime.triggerAttackRelease(['E6', 'B6'], 0.15, now, 0.6);
          break;
        case 'break': {
          const tier = e.block.t;
          if (tier >= 0 && !this.throttle(5, 0.1)) return;
          this.crunchFilter.frequency.setValueAtTime(600 + Math.max(0, tier) * 280, now);
          this.crunch.triggerAttackRelease(0.12, now);
          this.thump.triggerAttackRelease(tier < 0 ? 'G1' : ['C2', 'B1', 'A1', 'G1', 'E2', 'F1', 'D1', 'E1', 'C1', 'D2', 'C1'][tier] ?? 'C2', 0.15, now);
          const idx = Math.min(COMBO_NOTES.length - 1, Math.max(0, e.combo - 1));
          this.chime.triggerAttackRelease(COMBO_NOTES[idx], 0.3, now + 0.01, 0.5 + Math.min(0.4, e.combo * 0.03));
          if (tier === 4 || tier === 9) this.chime.triggerAttackRelease('C7', 0.4, now + 0.03, 0.4);
          if (tier < 0) ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => this.chime.triggerAttackRelease(n, 0.4, now + 0.06 * i, 0.6));
          break;
        }
        case 'rowClear':
          this.thump.triggerAttackRelease('C1', 0.4, now);
          ['G5', 'C6', 'E6'].forEach((n, i) => this.pluck.triggerAttackRelease(n, 0.5, now + 0.05 * i, 0.7));
          break;
        case 'lake': if (this.throttle(8)) this.chime.triggerAttackRelease('C7', 0.05, now, 0.15); break;
        case 'bolt':
          this.crackN.triggerAttackRelease(0.1, now);
          if (e.kind !== 'mini') this.thunderN.triggerAttackRelease(1.5, now + 0.12, e.kind === 'player' ? 1 : 0.6);
          break;
        case 'snail':
          this.boingS.triggerAttackRelease('C4', 0.18, now);
          this.boingS.frequency.exponentialRampTo(Tone.Frequency('G5').toFrequency(), 0.15, now);
          break;
        case 'storm': this.rain.gain.rampTo(e.on ? 0.22 : 0.09, 2); break;
        case 'buy': this.chime.triggerAttackRelease(['C5', 'G5'], 0.12, now, 0.5); break;
        case 'unlock': ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.chime.triggerAttackRelease(n, 0.3, now + 0.07 * i, 0.6)); break;
        case 'prestige': ['C4', 'G4', 'C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.pluck.triggerAttackRelease(n, 1.2, now + 0.12 * i, 0.8)); break;
      }
    } catch { /* never let audio errors break the game */ }
  }
}
