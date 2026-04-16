/**
 * ReverbManager — standalone Web Audio convolution reverb for ambient sounds.
 *
 * Architecture (independent of IWSDK's audio chain):
 *   AmbientSource ──→ masterIn ─┬→ dryGain ──────────→ AudioContext.destination
 *                               └→ convolver → wetGain → AudioContext.destination
 *
 * Call init() once after the XR session starts (needs user gesture).
 * Use connectSource() to route ambient nodes through the chain.
 * Use setWet(0..1) to control dry/wet mix.
 */
export class ReverbManager {
  private ctx!:       AudioContext;
  private masterIn!:  GainNode;
  private convolver!: ConvolverNode;
  private wetGain!:   GainNode;
  private dryGain!:   GainNode;
  private _wet = 0;

  /** Create our own AudioContext directly — no dependency on IWSDK's audio system. */
  init(): boolean {
    if (this.ctx) return true;
    try {
      this.ctx       = new AudioContext();
      this.masterIn  = this.ctx.createGain();
      this.dryGain   = this.ctx.createGain();
      this.wetGain   = this.ctx.createGain();
      this.convolver = this.ctx.createConvolver();

      this.convolver.buffer = this._generateIR(3.0, 4.0);

      this.dryGain.gain.value = 1;
      this.wetGain.gain.value = 0;

      this.masterIn.connect(this.dryGain);
      this.masterIn.connect(this.convolver);
      this.convolver.connect(this.wetGain);
      this.dryGain.connect(this.ctx.destination);
      this.wetGain.connect(this.ctx.destination);

      // Resume in case browser suspended the context
      this.ctx.resume().catch(() => {});
      return true;
    } catch (e) {
      console.error("[ReverbManager] Failed to create AudioContext:", e);
      return false;
    }
  }

  /** Connect an ambient AudioNode into the reverb chain. */
  connectSource(node: AudioNode): void {
    node.connect(this.masterIn);
  }

  get audioContext(): AudioContext { return this.ctx; }

  /** Load an audio file into an AudioBuffer using this context. */
  async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const res = await fetch(url);
      const raw = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(raw);
    } catch (e) {
      console.warn("[ReverbManager] Failed to load buffer:", url, e);
      return null;
    }
  }

  /** Play a one-shot buffer through the dry/wet reverb chain. */
  playOneShot(buffer: AudioBuffer, volume = 1): void {
    if (!this.ctx) return;
    const src  = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.masterIn);
    src.start();
  }

  setWet(t: number): void {
    if (!this.ctx) return;
    const clamped = Math.min(1, Math.max(0, t));
    this._wet = clamped;
    const now = this.ctx.currentTime;
    // Dry fades out fully; wet boosted 3× so the effect is clearly audible
    this.dryGain.gain.setTargetAtTime(1 - clamped,       now, 0.1);
    this.wetGain.gain.setTargetAtTime(clamped * 3,        now, 0.1);
  }

  get wet(): number { return this._wet; }

  private _generateIR(duration: number, decay: number): AudioBuffer {
    const sr     = this.ctx.sampleRate;
    const length = Math.floor(sr * duration);
    const buf    = this.ctx.createBuffer(2, length, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buf;
  }
}

export const reverbManager = new ReverbManager();
