import { createSystem } from "@iwsdk/core";

import { handpanAudio } from "./handpan.js";
import { zoneHighlightManager } from "./zone-highlights.js";

export type MelodyMode = "free" | "guided";

interface MelodyNote {
  zone: number;
  time: number; // seconds from demo start
}

// D Kurd ascending arc — root open, climb to octave, descend to resolve
const MELODY: MelodyNote[] = [
  { zone: 0, time: 0.0 },
  { zone: 4, time: 1.0 },
  { zone: 5, time: 1.7 },
  { zone: 7, time: 2.4 },
  { zone: 8, time: 3.3 },
  { zone: 5, time: 4.2 },
  { zone: 4, time: 4.9 },
  { zone: 1, time: 5.8 },
  { zone: 3, time: 6.5 },
  { zone: 0, time: 7.5 },
];

const TOTAL_DURATION = 9.5; // seconds until auto-stop after last note

export const melodyManager = {
  playing: false,
  mode: "free" as MelodyMode,
};

export class MelodySystem extends createSystem({}) {
  // Shared playback state
  private active        = false;
  private elapsed       = 0;
  private noteIndex     = 0;

  // Guided-mode state
  private guidedStep    = 0;
  private waitingTouch  = false;
  private feedbackTimer = 0;
  private advanceTimer  = 0;

  private readonly onNote = (e: Event) => {
    if (!this.active || melodyManager.mode !== "guided") return;
    this._handleTouch((e as CustomEvent<{ index: number }>).detail.index);
  };

  init() {
    document.addEventListener("handpan-note", this.onNote);
    this.cleanupFuncs.push(() => {
      document.removeEventListener("handpan-note", this.onNote);
    });
  }

  update(delta: number, _time: number) {
    if (melodyManager.playing && !this.active) {
      this._start();
    } else if (!melodyManager.playing && this.active) {
      this._stop();
      return;
    }

    if (!this.active) return;

    this.elapsed += delta;

    if (melodyManager.mode === "free") {
      this._tickFree();
    } else {
      this._tickGuided(delta);
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _start(): void {
    this.active        = true;
    this.elapsed       = 0;
    this.noteIndex     = 0;
    this.guidedStep    = 0;
    this.waitingTouch  = false;
    this.feedbackTimer = 0;
    this.advanceTimer  = 0;

    zoneHighlightManager.highlightAll(true);

    if (melodyManager.mode === "guided") {
      zoneHighlightManager.highlightZone(MELODY[0].zone, "guide");
      this.waitingTouch = true;
    }
  }

  private _stop(): void {
    this.active = false;
    zoneHighlightManager.highlightAll(false);
  }

  private _tickFree(): void {
    while (
      this.noteIndex < MELODY.length &&
      this.elapsed >= MELODY[this.noteIndex].time
    ) {
      const { zone } = MELODY[this.noteIndex];
      handpanAudio.play(zone, 0.75);
      zoneHighlightManager.highlightZone(zone, "guide");
      this.noteIndex++;
    }

    if (this.elapsed >= TOTAL_DURATION) {
      melodyManager.playing = false;
      window.dispatchEvent(new Event("melody-ended"));
    }
  }

  private _tickGuided(delta: number): void {
    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= delta;
      if (this.feedbackTimer <= 0 && this.guidedStep < MELODY.length) {
        zoneHighlightManager.highlightZone(MELODY[this.guidedStep].zone, "guide");
        this.waitingTouch = true;
      }
    }

    if (this.advanceTimer > 0) {
      this.advanceTimer -= delta;
      if (this.advanceTimer <= 0 && this.guidedStep < MELODY.length) {
        zoneHighlightManager.highlightZone(MELODY[this.guidedStep].zone, "guide");
        this.waitingTouch = true;
      }
    }
  }

  private _handleTouch(zone: number): void {
    if (!this.waitingTouch || this.guidedStep >= MELODY.length) return;

    const expected    = MELODY[this.guidedStep].zone;
    this.waitingTouch = false;

    if (zone === expected) {
      handpanAudio.play(zone, 0.85);
      zoneHighlightManager.highlightZone(zone, "success");
      this.guidedStep++;

      if (this.guidedStep >= MELODY.length) {
        this.advanceTimer = 1.8;
        window.dispatchEvent(new Event("melody-ended"));
        setTimeout(() => { melodyManager.playing = false; }, 1800);
      } else {
        this.advanceTimer = 0.5;
      }
    } else {
      zoneHighlightManager.highlightZone(zone, "wrong");
      this.feedbackTimer = 0.9;
    }
  }
}
