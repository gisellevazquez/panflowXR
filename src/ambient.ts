/**
 * AmbientSoundManager — procedural ambient sound synthesis via Web Audio API.
 * All sound is routed through the ReverbManager's chain.
 *
 * Presets:
 *   none   — silence
 *   rain   — white noise + low-pass filter
 *   forest — pink noise (gentle organic texture)
 *   ocean  — bandpass noise + slow LFO modulation
 *   wind   — bandpass noise + sweeping LFO on frequency
 */

export type AmbientType = "none" | "rain" | "forest" | "ocean" | "wind";

export const AMBIENT_LABELS: Record<AmbientType, string> = {
  none:   "None",
  rain:   "Rain",
  forest: "Forest",
  ocean:  "Ocean",
  wind:   "Wind",
};

export class AmbientSoundManager {
  private ctx!:     AudioContext;
  private out!:     GainNode;    // connects to reverbManager.masterIn
  private nodes:    AudioNode[]  = [];
  private current:  AmbientType = "none";
  readonly volume = 0.25;

  /**
   * @param ctx        AudioContext from ReverbManager
   * @param connectFn  Call this with the output GainNode to route into reverb chain
   */
  init(ctx: AudioContext, connectFn: (n: AudioNode) => void): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    connectFn(this.out);
  }

  setType(type: AmbientType): void {
    if (!this.ctx) return;
    if (this.current === type) return;
    this._stopAll();
    this.current = type;
    if (type !== "none") this._start(type);
  }

  get currentType(): AmbientType { return this.current; }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _stopAll(): void {
    this.nodes.forEach(n => {
      try { (n as AudioBufferSourceNode | OscillatorNode).stop?.(); } catch {}
      try { n.disconnect(); } catch {}
    });
    this.nodes = [];
  }

  private _start(type: AmbientType): void {
    switch (type) {
      case "rain":   this._makeRain();   break;
      case "forest": this._makeForest(); break;
      case "ocean":  this._makeOcean();  break;
      case "wind":   this._makeWind();   break;
    }
  }

  // ── White noise, low-passed → rain ───────────────────────────────────────
  private _makeRain(): void {
    const src = this._noiseSource(2);
    const lpf = this.ctx.createBiquadFilter();
    lpf.type            = "lowpass";
    lpf.frequency.value = 1800;
    lpf.Q.value         = 0.4;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.55;

    src.connect(lpf);  lpf.connect(gain);  gain.connect(this.out);
    src.start();
    this.nodes.push(src, lpf, gain);
  }

  // ── Pink noise → forest ───────────────────────────────────────────────────
  private _makeForest(): void {
    const src = this._pinkNoiseSource(4);
    const lpf = this.ctx.createBiquadFilter();
    lpf.type            = "lowpass";
    lpf.frequency.value = 3000;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.45;

    src.connect(lpf);  lpf.connect(gain);  gain.connect(this.out);
    src.start();
    this.nodes.push(src, lpf, gain);
  }

  // ── Noise + slow volume LFO → ocean waves ─────────────────────────────────
  private _makeOcean(): void {
    const src = this._noiseSource(8);
    const lpf = this.ctx.createBiquadFilter();
    lpf.type            = "lowpass";
    lpf.frequency.value = 500;

    const lfo     = this.ctx.createOscillator();
    lfo.frequency.value = 0.12; // slow wave rhythm
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value  = 0.35;
    lfo.connect(lfoGain);

    const masterGain = this.ctx.createGain();
    masterGain.gain.value = 0.35;
    lfoGain.connect(masterGain.gain); // LFO modulates output volume

    src.connect(lpf);
    lpf.connect(masterGain);
    masterGain.connect(this.out);
    src.start();
    lfo.start();
    this.nodes.push(src, lpf, lfo, lfoGain, masterGain);
  }

  // ── Band-pass noise with sweeping frequency → wind ────────────────────────
  private _makeWind(): void {
    const src = this._noiseSource(2);
    const bpf = this.ctx.createBiquadFilter();
    bpf.type            = "bandpass";
    bpf.frequency.value = 700;
    bpf.Q.value         = 0.6;

    // LFO sweeps the filter frequency for gusting effect
    const lfo     = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value  = 300; // ±300 Hz sweep
    lfo.connect(lfoGain);
    lfoGain.connect(bpf.frequency);

    const gain = this.ctx.createGain();
    gain.gain.value = 0.4;

    src.connect(bpf);  bpf.connect(gain);  gain.connect(this.out);
    src.start();
    lfo.start();
    this.nodes.push(src, bpf, lfo, lfoGain, gain);
  }

  // ── Buffer generators ─────────────────────────────────────────────────────

  /** White noise buffer source (looping). */
  private _noiseSource(seconds: number): AudioBufferSourceNode {
    const buf  = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src  = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;
    return src;
  }

  /** Approximate pink noise buffer (Paul Kellet's method). */
  private _pinkNoiseSource(seconds: number): AudioBufferSourceNode {
    const buf  = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    const src  = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;
    return src;
  }
}

export const ambientManager = new AmbientSoundManager();
