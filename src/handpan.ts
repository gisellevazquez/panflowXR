import {
  createComponent,
  createSystem,
  Vector3,
  Entity,
  DistanceGrabbable,
} from "@iwsdk/core";

import { reverbManager } from "./reverb.js";

// World-space offsets from the handpan centre for each of the 8 tone fields.
const ZONE_OFFSETS: [number, number, number][] = [
  [ 0.076 , 0.457 , 0.009 ], // 0 Dong centre
  [ -0.557 , 0.248 , 0.278], // 1 right
  [ -0.522 , 0.249 , -0.339], // 2 right-back
  [ -0.080 , 0.217 , 0.690], // 3 back
  [ -0.053 , 0.209 , -0.690], // 4 left-back
  [ 0.448 , 0.192 , 0.597], // 5 left
  [ 0.409 , 0.193 , -0.616], // 6 left-front
  [ 0.752 , 0.165 , 0.228], // 7 front
  [ 0.738 , 0.175 , -0.226], // 8 right (between 7 & 1) — adjust in zone-editor
];

// 9 handpan tone-field recordings (zone number → zone number, direct 1:1)
const NOTE_SRCS = [
  "./audio/handpan/0.mp3", // zone 0 – Dong
  "./audio/handpan/1.mp3", // zone 1
  "./audio/handpan/2.mp3", // zone 2
  "./audio/handpan/3.mp3", // zone 3
  "./audio/handpan/4.mp3", // zone 4
  "./audio/handpan/5.mp3", // zone 5
  "./audio/handpan/6.mp3", // zone 6
  "./audio/handpan/7.mp3", // zone 7
  "./audio/handpan/8.mp3", // zone 8
];

// Per-zone trigger radius in metres — zone 0 (Ding) gets a larger target
const ZONE_RADII: number[] = [
  0.18, // 0 Ding — larger
  0.15, // 1
  0.15, // 2
  0.15, // 3
  0.15, // 4
  0.15, // 5
  0.15, // 6
  0.15, // 7
  0.15, // 8
];
const COOLDOWN_MS = 600;   // minimum ms between re-triggers of the same zone

export const Handpan = createComponent("Handpan", {});

export class HandpanSystem extends createSystem({
  handpan: { required: [Handpan] },
}) {
  // Pre-allocated work vectors — zero allocations in update()
  private zoneWorldPos: Vector3[] = Array.from({ length: ZONE_OFFSETS.length }, () => new Vector3());
  private tipLeft  = new Vector3();
  private tipRight = new Vector3();

  private lastPlayed: number[]  = new Array(ZONE_OFFSETS.length).fill(0);
  private zoneActive: boolean[] = new Array(ZONE_OFFSETS.length).fill(false);

  // AudioBuffers loaded from reverbManager's AudioContext so notes play through reverb.
  private noteBuffers: (AudioBuffer | null)[] = new Array(NOTE_SRCS.length).fill(null);
  private loadingStarted = false;

  init() {
    // No IWSDK AudioSource entities needed — notes play via reverbManager.playOneShot()
  }

  update(_delta: number, _time: number) {
    // Lazy-load buffers once the reverb AudioContext is ready (after sessionstart)
    if (!this.loadingStarted && reverbManager.audioContext) {
      this.loadingStarted = true;
      this._loadBuffers();
    }

    // Hand tracking: use index fingertips. Controller fallback: use grip origin.
    const tips = this.player.indexTipSpaces as typeof this.player.indexTipSpaces | undefined;
    if (tips?.left)  tips.left.getWorldPosition(this.tipLeft);
    else             this.player.gripSpaces?.left?.getWorldPosition(this.tipLeft);
    if (tips?.right) tips.right.getWorldPosition(this.tipRight);
    else             this.player.gripSpaces?.right?.getWorldPosition(this.tipRight);

    const now = Date.now();

    for (const entity of this.queries.handpan.entities) {
      const mesh = entity.object3D!;

      // Transform zone offsets from LOCAL → world space (accounts for position, rotation, scale)
      for (let i = 0; i < ZONE_OFFSETS.length; i++) {
        const [ox, oy, oz] = ZONE_OFFSETS[i];
        this.zoneWorldPos[i].set(ox, oy, oz);
        mesh.localToWorld(this.zoneWorldPos[i]);
      }

      for (let i = 0; i < ZONE_OFFSETS.length; i++) {
        const zp = this.zoneWorldPos[i];
        const radius = ZONE_RADII[i] ?? 0.15;
        const inRange =
          this.tipLeft.distanceTo(zp)  < radius ||
          this.tipRight.distanceTo(zp) < radius;

        // Rising-edge trigger with cooldown
        if (inRange && !this.zoneActive[i] && now - this.lastPlayed[i] > COOLDOWN_MS) {
          this.lastPlayed[i] = now;
          const buf = this.noteBuffers[i];
          if (buf) {
            reverbManager.playOneShot(buf, 0.8);
          }
          document.dispatchEvent(
            new CustomEvent("handpan-note", { detail: { index: i } }),
          );
        }

        this.zoneActive[i] = inRange;
      }
    }
  }

  private _loadBuffers(): void {
    NOTE_SRCS.forEach((src, i) => {
      reverbManager.loadBuffer(src).then((buf) => {
        this.noteBuffers[i] = buf;
      });
    });
  }
}

/**
 * Shared singleton for toggling handpan grab lock.
 */
export const handpanLockManager = {
  entity: null as Entity | null,
  locked: false,

  toggle(): boolean {
    if (!this.entity) return this.locked;
    this.locked = !this.locked;
    this.entity.setValue(DistanceGrabbable, "translate", !this.locked);
    this.entity.setValue(DistanceGrabbable, "rotate",    !this.locked);
    return this.locked;
  },
};
