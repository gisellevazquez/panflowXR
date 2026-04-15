import { Object3D } from "@iwsdk/core";

/**
 * ReverbManager — inserts a Web Audio convolution reverb into IWSDK's audio chain.
 *
 * Architecture:
 *   AudioListener.gain  ─┐
 *   AmbientSource ────────┼→ masterIn ─┬→ dryGain ─────────→ AudioContext.destination
 *                         │            └→ convolver → wetGain → AudioContext.destination
 *
 * Call init() once after World.create() resolves.
 * Use connectSource() to route additional nodes (ambient) through the same chain.
 * Use setWet(0..1) to control dry/wet mix from the UI slider.
 */
export class ReverbManager {
  private ctx!:      AudioContext;
  private masterIn!: GainNode;
  private convolver!: ConvolverNode;
  private wetGain!:  GainNode;
  private dryGain!:  GainNode;
  private _wet = 0;

  /** Wire up the reverb chain by intercepting the Three.js AudioListener output. */
  init(playerHead: Object3D): boolean {
    let found = false;

    const tryWire = (obj: any) => {
      if (found || !obj.isAudioListener) return;
      found = true;

      this.ctx           = obj.context as AudioContext;
      const listenerGain = obj.gain as GainNode;

      // Create nodes
      this.masterIn  = this.ctx.createGain();
      this.dryGain   = this.ctx.createGain();
      this.wetGain   = this.ctx.createGain();
      this.convolver = this.ctx.createConvolver();

      // Generate synthetic impulse response (3 s duration, decay factor 4)
      this.convolver.buffer = this._generateIR(3.0, 4.0);

      // Start fully dry
      this.dryGain.gain.value = 1;
      this.wetGain.gain.value = 0;

      // Reroute: listener.gain was connected to destination — intercept it
      listenerGain.disconnect();
      listenerGain.connect(this.masterIn);

      // masterIn → dry path + wet path
      this.masterIn.connect(this.dryGain);
      this.masterIn.connect(this.convolver);
      this.convolver.connect(this.wetGain);
      this.dryGain.connect(this.ctx.destination);
      this.wetGain.connect(this.ctx.destination);
    };

    // Walk up to scene root so we search the entire graph,
    // not just player.head — IWSDK may attach the AudioListener elsewhere.
    let root: Object3D = playerHead;
    while (root.parent) root = root.parent;
    root.traverse(tryWire);

    if (!found) {
      console.warn("[ReverbManager] AudioListener not found anywhere in scene.");
    }
    return found;
  }

  /** Connect an external AudioNode (e.g. ambient oscillators) into the reverb chain. */
  connectSource(node: AudioNode): void {
    node.connect(this.masterIn);
  }

  /** Expose the AudioContext so ambient system can reuse the same context. */
  get audioContext(): AudioContext {
    return this.ctx;
  }

  /**
   * Set reverb wet amount.
   * @param t 0 = fully dry (room off), 1 = fully wet (cathedral).
   */
  setWet(t: number): void {
    const clamped = Math.min(1, Math.max(0, t));
    this._wet = clamped;
    const now = this.ctx.currentTime;
    // Keep ≥0.3 dry even at maximum reverb to preserve transient clarity
    this.dryGain.gain.setTargetAtTime(1 - clamped * 0.7, now, 0.15);
    this.wetGain.gain.setTargetAtTime(clamped,            now, 0.15);
  }

  get wet(): number { return this._wet; }

  // ── Impulse response synthesis ────────────────────────────────────────────

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
