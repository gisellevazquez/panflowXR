import {
  createComponent,
  createSystem,
  Vector3,
  Euler,
  Object3D,
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
export const ZONE_RADII: number[] = [
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

/** Zone 0 (Ding) uses a sphere collider; outer zones use tilted discs. */
export const DING_ZONE_INDEX = 0;

/** Per-zone disc tilt (radians) — rotation around handpan local X/Y/Z from surface-up. Ignored for Ding. */
export const ZONE_TILTS: [number, number, number][] = [
  [0, 0, 0], // 0 Ding — sphere, tilt unused
  [0, 0, 0], // 1
  [0, 0, 0], // 2
  [0, 0, 0], // 3
  [0, 0, 0], // 4
  [0, 0, 0], // 5
  [0, 0, 0], // 6
  [0, 0, 0], // 7
  [0, 0, 0], // 8
];

/** Apply editor tilt triplet to a disc collider/mesh rotation in handpan local space. */
export function applyZoneDiscTilt(
  target: { rotation: { x: number; y: number; z: number } },
  tilt: [number, number, number],
): void {
  target.rotation.x = -Math.PI / 2 + tilt[0];
  target.rotation.y = tilt[1];
  target.rotation.z = tilt[2];
}

/** World-space disc normal from tilt triplet (matches editor preview + debug discs). */
export function getZoneDiscWorldNormal(
  tilt: [number, number, number],
  handpanMesh: Object3D,
  out: Vector3,
  euler: Euler,
  localNormal: Vector3,
): void {
  localNormal.set(0, 0, 1);
  euler.set(-Math.PI / 2 + tilt[0], tilt[1], tilt[2]);
  localNormal.applyEuler(euler);
  out.copy(localNormal);
  out.transformDirection(handpanMesh.matrixWorld);
}
const COOLDOWN_MS = 150;   // minimum ms between re-triggers of the same zone — allows rapid tapping
const DISC_DEPTH_THRESHOLD = 0.08; // max perpendicular distance from disc plane (metres)

// Strike dynamics — center hits are louder and brighter than edge hits
const STRIKE_VOL_CENTER = 0.9;
const STRIKE_VOL_EDGE   = 0.55;
const STRIKE_RATE_CENTER = 1.0;  // full playback rate at center
const STRIKE_RATE_EDGE   = 0.92; // slightly duller at edge

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
  private zoneNormal = new Vector3();
  private discEuler = new Euler();
  private discNormalLocal = new Vector3();
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

  /** Map strike distance from zone center (0 = center, 1 = edge) to volume + playback rate. */
  private strikeDynamics(strikeDistSq: number, radius: number): { volume: number; playbackRate: number } {
    const t = Math.min(1, Math.sqrt(strikeDistSq) / radius);
    const centerWeight = 1 - t;
    return {
      volume: STRIKE_VOL_EDGE + (STRIKE_VOL_CENTER - STRIKE_VOL_EDGE) * centerWeight,
      playbackRate: STRIKE_RATE_EDGE + (STRIKE_RATE_CENTER - STRIKE_RATE_EDGE) * centerWeight,
    };
  }

  /** Sphere hit for Ding — 3D distance from zone center. */
  private testSphereHit(
    tipX: number, tipY: number, tipZ: number,
    cx: number, cy: number, cz: number,
    radiusSq: number,
  ): { hit: boolean; strikeDistSq: number } {
    const dx = tipX - cx;
    const dy = tipY - cy;
    const dz = tipZ - cz;
    const distSq = dx * dx + dy * dy + dz * dz;
    return { hit: distSq <= radiusSq, strikeDistSq: distSq };
  }

  /** Tilted disc hit — fingertip projected onto zone plane must fall within radius. */
  private testDiscHit(
    tipX: number, tipY: number, tipZ: number,
    cx: number, cy: number, cz: number,
    nx: number, ny: number, nz: number,
    radiusSq: number,
  ): { hit: boolean; strikeDistSq: number } {
    const dx = tipX - cx;
    const dy = tipY - cy;
    const dz = tipZ - cz;
    const distSq = dx * dx + dy * dy + dz * dz;
    const depth = dx * nx + dy * ny + dz * nz;
    const inPlaneSq = Math.max(0, distSq - depth * depth);
    return {
      hit: Math.abs(depth) <= DISC_DEPTH_THRESHOLD && inPlaneSq <= radiusSq,
      strikeDistSq: inPlaneSq,
    };
  }

  /** Disc normal from [tiltX, tiltY, tiltZ] — same euler as editor preview discs. */
  private zoneDiscNormal(
    tilt: [number, number, number],
    handpanMesh: Object3D,
    out: Vector3,
  ): void {
    getZoneDiscWorldNormal(tilt, handpanMesh, out, this.discEuler, this.discNormalLocal);
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

      for (let i = 0; i < ZONE_OFFSETS.length; i++) {
        const zp = this.zoneWorldPos[i];
        const radius = ZONE_RADII[i] ?? 0.15;
        const radiusSq = radius * radius;
        const isDing = i === DING_ZONE_INDEX;
        const tilt = ZONE_TILTS[i] ?? [0, 0, 0];

        let leftHit = false;
        let rightHit = false;
        let strikeSqL = radiusSq;
        let strikeSqR = radiusSq;

        if (isDing) {
          const l = this.testSphereHit(this.tipLeft.x, this.tipLeft.y, this.tipLeft.z, zp.x, zp.y, zp.z, radiusSq);
          const r = this.testSphereHit(this.tipRight.x, this.tipRight.y, this.tipRight.z, zp.x, zp.y, zp.z, radiusSq);
          leftHit = leftActive && l.hit;
          rightHit = rightActive && r.hit;
          strikeSqL = l.strikeDistSq;
          strikeSqR = r.strikeDistSq;
        } else {
          this.zoneDiscNormal(tilt, mesh, this.zoneNormal);
          const nx = this.zoneNormal.x;
          const ny = this.zoneNormal.y;
          const nz = this.zoneNormal.z;
          const l = this.testDiscHit(this.tipLeft.x, this.tipLeft.y, this.tipLeft.z, zp.x, zp.y, zp.z, nx, ny, nz, radiusSq);
          const r = this.testDiscHit(this.tipRight.x, this.tipRight.y, this.tipRight.z, zp.x, zp.y, zp.z, nx, ny, nz, radiusSq);
          leftHit = leftActive && l.hit;
          rightHit = rightActive && r.hit;
          strikeSqL = l.strikeDistSq;
          strikeSqR = r.strikeDistSq;
        }

        const inRange = leftHit || rightHit;

        // Rising-edge trigger with cooldown
        if (inRange && !this.zoneActive[i] && now - this.lastPlayed[i] > COOLDOWN_MS) {
          this.lastPlayed[i] = now;
          const buf = this.noteBuffers[i];
          if (buf) {
            let strikeSq = radiusSq;
            if (leftHit)  strikeSq = strikeSqL;
            if (rightHit) strikeSq = Math.min(strikeSq, strikeSqR);
            const { volume, playbackRate } = this.strikeDynamics(strikeSq, radius);
            reverbManager.playOneShot(buf, volume, playbackRate);
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
