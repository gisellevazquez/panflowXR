import {
  createComponent,
  createSystem,
  AudioSource,
  AudioUtils,
  PlaybackMode,
  Vector3,
  Group,
  Entity,
  DistanceGrabbable,
  MovementMode,
} from "@iwsdk/core";

// World-space offsets from the handpan centre for each of the 9 tone fields.
// Zone 8 is interpolated between zones 7 & 1 — fine-tune in zone-editor.
const ZONE_OFFSETS: [number, number, number][] = [
  [ 0.60,  0.457,  0.031], // 0 Ding (centre)
  [ 0.723, 0.188,  0.223], // 1 right
  [ 0.423, 0.199,  0.601], // 2 right-back
  [-0.075, 0.218,  0.689], // 3 back
  [-0.565, 0.244,  0.276], // 4 left-back
  [-0.533, 0.246, -0.329], // 5 left
  [-0.062, 0.211, -0.685], // 6 left-front
  [ 0.434, 0.182, -0.616], // 7 right-front
  [ -0.066,  0.229, 0.675], // 8 right (between 7 & 1) — adjust in zone-editor
];

// 9 handpan tone-field recordings
const NOTE_SRCS = [
  "./audio/handpan/a-clean-dry-audio-recordi-aqnsnowb.wav", // zone 0 – Ding
  "./audio/handpan/a-clean-dry-audio-recordi-j7w6oyqr.wav", // zone 1
  "./audio/handpan/a-clean-dry-audio-recordi-2sve7t35.wav", // zone 2
  "./audio/handpan/a-clean-dry-audio-recordi-g3ulhlw2.wav", // zone 3
  "./audio/handpan/a-clean-dry-audio-recordi-kanmttwa.wav", // zone 4
  "./audio/handpan/a-clean-dry-audio-recordi-7punn5mk.wav", // zone 5
  "./audio/handpan/a-clean-dry-audio-recordi-kihqnnq7.wav", // zone 6
  "./audio/handpan/a-clean-dry-audio-recordi-6okq6qif.wav", // zone 7
  "./audio/handpan/a-clean-dry-audio-recordi-yyfcncyj.wav", // zone 8 – front
];

const ZONE_RADIUS = 0.10;  // metres — hand within this distance triggers the zone
const COOLDOWN_MS = 600;   // minimum ms between re-triggers of the same zone

export const Handpan = createComponent("Handpan", {});

export class HandpanSystem extends createSystem({
  handpan: { required: [Handpan] },
}) {
  // Pre-allocated work vectors — zero allocations in update()
  private zoneWorldPos: Vector3[] = Array.from({ length: 9 }, () => new Vector3());
  private tipLeft  = new Vector3();
  private tipRight = new Vector3();

  private lastPlayed: number[]  = new Array(9).fill(0);
  private zoneActive: boolean[] = new Array(9).fill(false);

  // One invisible audio entity per note, created in init()
  private noteEntities: Entity[] = [];

  init() {
    for (const src of NOTE_SRCS) {
      const entity = this.world.createTransformEntity(new Group());
      entity.addComponent(AudioSource, {
        src,
        positional: false,  // omnidirectional — instrument floats in front of user
        volume: 0.8,
        playbackMode: PlaybackMode.Overlap, // notes can ring together
      });
      this.noteEntities.push(entity);
    }
  }

  update(_delta: number, _time: number) {
    // Hand tracking: use index fingertips. Controller fallback: use grip origin.
    // (indexTipSpaces is undefined in controller mode — guard to avoid crash)
    const tips = this.player.indexTipSpaces as typeof this.player.indexTipSpaces | undefined;
    if (tips?.left)  tips.left.getWorldPosition(this.tipLeft);
    else             this.player.gripSpaces?.left?.getWorldPosition(this.tipLeft);
    if (tips?.right) tips.right.getWorldPosition(this.tipRight);
    else             this.player.gripSpaces?.right?.getWorldPosition(this.tipRight);

    const now = Date.now();

    for (const entity of this.queries.handpan.entities) {
      const { x: mx, y: my, z: mz } = entity.object3D!.position;

      // Compute absolute world positions for all 9 tone zones
      for (let i = 0; i < 9; i++) {
        const [ox, oy, oz] = ZONE_OFFSETS[i];
        this.zoneWorldPos[i].set(mx + ox, my + oy, mz + oz);
      }

      for (let i = 0; i < 9; i++) {
        const zp = this.zoneWorldPos[i];
        const inRange =
          this.tipLeft.distanceTo(zp)  < ZONE_RADIUS ||
          this.tipRight.distanceTo(zp) < ZONE_RADIUS;

        // Rising-edge trigger with cooldown
        if (inRange && !this.zoneActive[i] && now - this.lastPlayed[i] > COOLDOWN_MS) {
          this.lastPlayed[i] = now;
          AudioUtils.play(this.noteEntities[i]);
          document.dispatchEvent(
            new CustomEvent("handpan-note", { detail: { index: i } }),
          );
        }

        this.zoneActive[i] = inRange;
      }
    }
  }
}

/**
 * Shared singleton for toggling handpan grab lock.
 * Set `entity` from index.ts after the entity is created.
 * Call `toggle()` from MenuSystem when the lock button is pressed.
 */
export const handpanLockManager = {
  entity: null as Entity | null,
  locked: false,

  toggle(): boolean {
    if (!this.entity) return this.locked;
    this.locked = !this.locked;
    if (this.locked) {
      this.entity.removeComponent(DistanceGrabbable);
    } else {
      this.entity.addComponent(DistanceGrabbable, {
        movementMode: MovementMode.MoveAtSource,
        rotate:    true,
        translate: true,
        scale:     false,
      });
    }
    return this.locked;
  },
};
