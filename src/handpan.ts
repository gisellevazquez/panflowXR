import {
  createComponent,
  createSystem,
  Vector3,
  Entity,
  OneHandGrabbable,
} from "@iwsdk/core";

import { reverbManager } from "./reverb.js";

// World-space offsets from the handpan centre for each of the 8 tone fields.
export const ZONE_OFFSETS: [number, number, number][] = [
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

// Per-zone trigger radius in metres — zone 0 (Dong) gets a larger target
const ZONE_RADII: number[] = [
  0.18, // 0 Ding — larger
  0.15, // 1
  0.15, // 2
  0.11, // 3
  0.15, // 4
  0.11, // 5
  0.15, // 6
  0.11, // 7
  0.09, // 8
];
const COOLDOWN_MS = 150;   // minimum ms between re-triggers of the same zone — allows rapid tapping
const DISC_DEPTH_THRESHOLD = 0.08; // max perpendicular distance from disc plane (metres)

/** Per-hand hit probe source — fingertip preferred, then ray tip, then grip. */
type HitSource = "fingertip" | "ray" | "grip" | "none";

// Overridden at runtime when a store owner has uploaded a custom instrument
let _customAudioUrls: (string | null)[] = [];
export function setCustomAudioUrls(urls: (string | null)[]): void {
  _customAudioUrls = urls;
}
export function getAudioSrcs(): string[] {
  return NOTE_SRCS.map((defaultUrl, i) => _customAudioUrls[i] ?? defaultUrl);
}

export const Handpan = createComponent("Handpan", {});

/** Shared note player — populated by HandpanSystem once buffers are loaded. */
export const handpanAudio = {
  buffers: new Array(NOTE_SRCS.length).fill(null) as (AudioBuffer | null)[],
  play(index: number, volume = 0.8): void {
    const buf = this.buffers[index];
    if (buf) reverbManager.playOneShot(buf, volume);
  },
};

export class HandpanSystem extends createSystem({
  handpan: { required: [Handpan] },
}) {
  // Pre-allocated work vectors — zero allocations in update()
  private zoneWorldPos: Vector3[] = Array.from({ length: ZONE_OFFSETS.length }, () => new Vector3());
  private zoneNormal = new Vector3(); // handpan world-space up direction
  private tipLeft  = new Vector3();
  private tipRight = new Vector3();

  private lastPlayed: number[]  = new Array(ZONE_OFFSETS.length).fill(0);
  private zoneActive: boolean[] = new Array(ZONE_OFFSETS.length).fill(false);

  // AudioBuffers loaded from reverbManager's AudioContext so notes play through reverb.
  private noteBuffers: (AudioBuffer | null)[] = new Array(NOTE_SRCS.length).fill(null);
  private loadingStarted = false;

  private hitSourceLeft: HitSource = "none";
  private hitSourceRight: HitSource = "none";

  init() {
    // No IWSDK AudioSource entities needed — notes play via reverbManager.playOneShot()
  }

  /**
   * Resolve per-hand hit probe position with explicit priority:
   * 1. Hand tracking → indexTipSpaces (IWSDK joint fingertip)
   * 2. Controller → indexTipSpaces (IWSDK copies raySpaces pointer tip)
   * 3. Last resort → gripSpaces origin
   */
  private resolveHitSource(handedness: "left" | "right", out: Vector3): HitSource {
    const tipSpace = this.player.indexTipSpaces[handedness];

    if (this.input.isPrimary("hand", handedness)) {
      tipSpace.getWorldPosition(out);
      return "fingertip";
    }

    if (this.input.isPrimary("controller", handedness)) {
      tipSpace.getWorldPosition(out);
      return "ray";
    }

    const grip = this.player.gripSpaces[handedness];
    if (grip) {
      grip.getWorldPosition(out);
      return "grip";
    }

    return "none";
  }

  private logHitSourceIfChanged(left: HitSource, right: HitSource): void {
    if (left === this.hitSourceLeft && right === this.hitSourceRight) return;
    if (left === "none" && right === "none") return;

    this.hitSourceLeft = left;
    this.hitSourceRight = right;
    console.log(`[play-feel] hit input — left: ${left}, right: ${right}`);
  }

  update(_delta: number, _time: number) {
    // Lazy-load buffers once the reverb AudioContext is ready (after sessionstart)
    if (!this.loadingStarted && reverbManager.audioContext) {
      this.loadingStarted = true;
      this._loadBuffers();
    }

    // Hand tracking: indexTipSpaces fingertip. Controller: indexTipSpaces ray tip. Else grip.
    const leftSource = this.resolveHitSource("left", this.tipLeft);
    const rightSource = this.resolveHitSource("right", this.tipRight);
    this.logHitSourceIfChanged(leftSource, rightSource);
    const leftActive = leftSource !== "none";
    const rightActive = rightSource !== "none";

    const now = Date.now();

    for (const entity of this.queries.handpan.entities) {
      const mesh = entity.object3D!;

      // Transform zone offsets from LOCAL → world space (accounts for position, rotation, scale)
      for (let i = 0; i < ZONE_OFFSETS.length; i++) {
        const [ox, oy, oz] = ZONE_OFFSETS[i];
        this.zoneWorldPos[i].set(ox, oy, oz);
        mesh.localToWorld(this.zoneWorldPos[i]);
      }

      // Handpan world-space up direction (local Y axis after rotation)
      const m = mesh.matrixWorld.elements;
      this.zoneNormal.set(m[4], m[5], m[6]).normalize();
      const nx = this.zoneNormal.x;
      const ny = this.zoneNormal.y;
      const nz = this.zoneNormal.z;

      for (let i = 0; i < ZONE_OFFSETS.length; i++) {
        const zp = this.zoneWorldPos[i];
        const radius = ZONE_RADII[i] ?? 0.15;
        const radiusSq = radius * radius;

        // Oriented-disc hit test for left fingertip
        const dxL = this.tipLeft.x - zp.x;
        const dyL = this.tipLeft.y - zp.y;
        const dzL = this.tipLeft.z - zp.z;
        const distSqL = dxL * dxL + dyL * dyL + dzL * dzL;
        const depthL = dxL * nx + dyL * ny + dzL * nz;
        const inPlaneSqL = Math.max(0, distSqL - depthL * depthL);
        const leftHit = leftActive && Math.abs(depthL) <= DISC_DEPTH_THRESHOLD && inPlaneSqL <= radiusSq;

        // Oriented-disc hit test for right fingertip
        const dxR = this.tipRight.x - zp.x;
        const dyR = this.tipRight.y - zp.y;
        const dzR = this.tipRight.z - zp.z;
        const distSqR = dxR * dxR + dyR * dyR + dzR * dzR;
        const depthR = dxR * nx + dyR * ny + dzR * nz;
        const inPlaneSqR = Math.max(0, distSqR - depthR * depthR);
        const rightHit = rightActive && Math.abs(depthR) <= DISC_DEPTH_THRESHOLD && inPlaneSqR <= radiusSq;

        const inRange = leftHit || rightHit;

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
    getAudioSrcs().forEach((src, i) => {
      reverbManager.loadBuffer(src).then((buf) => {
        this.noteBuffers[i] = buf;
        handpanAudio.buffers[i] = buf;
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
    this.entity.setValue(OneHandGrabbable, "translate", !this.locked);
    this.entity.setValue(OneHandGrabbable, "rotate",    !this.locked);
    return this.locked;
  },
};
