import {
  createSystem,
  Entity,
  Mesh,
  CircleGeometry,
  MeshBasicMaterial,
  DoubleSide,
} from "@iwsdk/core";

import { Handpan, ZONE_OFFSETS, handpanAudio } from "./handpan.js";

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

const C_IDLE    = 0x6b52a8; // dim lavender
const C_ACTIVE  = 0xffffff; // bright white
const C_CORRECT = 0x4ade80; // green
const C_WRONG   = 0xff6b6b; // red

export const melodyManager = {
  playing: false,
  mode: "free" as MelodyMode,
};

export class MelodySystem extends createSystem({
  handpans: { required: [Handpan] },
}) {
  private indicators:    Mesh[]                = [];
  private mats:          MeshBasicMaterial[]   = [];
  private setupDone                            = false;

  // Shared playback state
  private active        = false;
  private elapsed       = 0;
  private noteIndex     = 0;
  private pulseTime     = 0;

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
    this.queries.handpans.subscribe("qualify", (entity: Entity) => {
      if (!this.setupDone) {
        this._buildIndicators(entity);
        this.setupDone = true;
      }
    });

    document.addEventListener("handpan-note", this.onNote);
    this.cleanupFuncs.push(() => {
      document.removeEventListener("handpan-note", this.onNote);
    });
  }

  update(delta: number, _time: number) {
    if (!this.setupDone) return;

    if (melodyManager.playing && !this.active) {
      this._start();
    } else if (!melodyManager.playing && this.active) {
      this._stop();
      return;
    }

    if (!this.active) return;

    this.elapsed   += delta;
    this.pulseTime += delta;

    if (melodyManager.mode === "free") {
      this._tickFree();
    } else {
      this._tickGuided(delta);
    }

    this._pulse();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _buildIndicators(entity: Entity): void {
    for (let i = 0; i < ZONE_OFFSETS.length; i++) {
      // Each mesh gets its own geometry — never share geometry across meshes
      const geo = new CircleGeometry(0.30, 32);
      const mat = new MeshBasicMaterial({
        color:       C_IDLE,
        transparent: true,
        opacity:     0,
        depthWrite:  false,
        side:        DoubleSide,
      });
      const ring = new Mesh(geo, mat);
      const [ox, oy, oz] = ZONE_OFFSETS[i];
      ring.position.set(ox, oy + 0.04, oz);
      ring.rotation.x = -Math.PI / 2;
      ring.visible    = false;

      // Use createTransformEntity so the ring is properly registered in the
      // IWSDK scene graph — raw mesh.add() bypasses the ECS and can cause
      // undefined behaviour with the framework's transform system.
      this.world.createTransformEntity(ring, { parent: entity });

      this.indicators.push(ring);
      this.mats.push(mat);
    }
  }

  private _start(): void {
    this.active        = true;
    this.elapsed       = 0;
    this.noteIndex     = 0;
    this.pulseTime     = 0;
    this.guidedStep    = 0;
    this.waitingTouch  = false;
    this.feedbackTimer = 0;
    this.advanceTimer  = 0;

    this.indicators.forEach((ind, i) => {
      ind.visible          = true;
      this.mats[i].color.setHex(C_IDLE);
      this.mats[i].opacity = 0.12;
    });

    if (melodyManager.mode === "guided") {
      this._highlight(MELODY[0].zone, C_ACTIVE);
      this.waitingTouch = true;
    }
  }

  private _stop(): void {
    this.active = false;
    this.indicators.forEach((ind, i) => {
      ind.visible          = false;
      this.mats[i].opacity = 0;
    });
  }

  private _tickFree(): void {
    while (
      this.noteIndex < MELODY.length &&
      this.elapsed >= MELODY[this.noteIndex].time
    ) {
      const { zone } = MELODY[this.noteIndex];
      handpanAudio.play(zone, 0.75);
      this._highlight(zone, C_ACTIVE);
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
        this._highlight(MELODY[this.guidedStep].zone, C_ACTIVE);
        this.waitingTouch = true;
      }
    }

    if (this.advanceTimer > 0) {
      this.advanceTimer -= delta;
      if (this.advanceTimer <= 0 && this.guidedStep < MELODY.length) {
        this._highlight(MELODY[this.guidedStep].zone, C_ACTIVE);
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
      this._highlight(zone, C_CORRECT);
      this.guidedStep++;

      if (this.guidedStep >= MELODY.length) {
        // Last note hit — let it ring briefly then stop
        this.advanceTimer = 1.8;
        window.dispatchEvent(new Event("melody-ended"));
        setTimeout(() => { melodyManager.playing = false; }, 1800);
      } else {
        this.advanceTimer = 0.5;
      }
    } else {
      this._dimAll();
      this.mats[zone].color.setHex(C_WRONG);
      this.mats[zone].opacity = 0.75;
      this.feedbackTimer = 0.9;
    }
  }

  private _highlight(zone: number, color: number): void {
    for (let i = 0; i < this.mats.length; i++) {
      this.mats[i].color.setHex(i === zone ? color : C_IDLE);
      this.mats[i].opacity = i === zone ? 0.85 : 0.10;
    }
  }

  private _dimAll(): void {
    this.mats.forEach(m => { m.color.setHex(C_IDLE); m.opacity = 0.10; });
  }

  private _pulse(): void {
    const activeZone = melodyManager.mode === "free"
      ? (this.noteIndex > 0 ? MELODY[this.noteIndex - 1].zone : -1)
      : (this.guidedStep < MELODY.length ? MELODY[this.guidedStep].zone : -1);

    // In guided mode only pulse while waiting for user input
    if (activeZone < 0 || (melodyManager.mode === "guided" && !this.waitingTouch)) return;

    const pulse = 0.75 + 0.25 * Math.sin(this.pulseTime * 4);
    this.mats[activeZone].opacity = pulse;
  }
}
