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
} from "@iwsdk/core";

// World-space offsets from the handpan centre for each of the 9 tone fields.
// Zone 8 is interpolated between zones 7 & 1 — fine-tune in zone-editor.
const ZONE_OFFSETS: [number, number, number][] = [
  [ 0.077 , 0.457 , -0.002 ], // 0 Ding centre
  [ -0.514 , 0.253 , -0.339], // 1 right
  [ -0.052 , 0.205 , -0.697], // 2 right-back
  [ 0.415 , 0.201 , -0.600], // 3 back
  [ 0.737 , 0.172 , -0.238], // 4 left-back
  [ 0.754 , 0.157 , 0.252], // 5 left
  [ 0.449 , 0.183 , 0.609], // 6 left-front
  [ -0.567 , 0.248 , 0.255], // 8 right (between 7 & 1) — adjust in zone-editor
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
  // Zone count is derived from ZONE_OFFSETS so array size always matches.
  private zoneWorldPos: Vector3[] = Array.from({ length: ZONE_OFFSETS.length }, () => new Vector3());
  private tipLeft  = new Vector3();
  private tipRight = new Vector3();

  private lastPlayed: number[]  = new Array(ZONE_OFFSETS.length).fill(0);
  private zoneActive: boolean[] = new Array(ZONE_OFFSETS.length).fill(false);

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
      const mesh = entity.object3D!;

      // Transform zone offsets from the handpan's LOCAL space → world space.
      // localToWorld accounts for position, rotation AND scale — so zones
      // always stay glued to the correct spot on the model regardless of how
      // the user has moved, rotated, or resized the handpan.
      for (let i = 0; i < ZONE_OFFSETS.length; i++) {
        const [ox, oy, oz] = ZONE_OFFSETS[i];
        this.zoneWorldPos[i].set(ox, oy, oz);
        mesh.localToWorld(this.zoneWorldPos[i]);
      }

      for (let i = 0; i < ZONE_OFFSETS.length; i++) {
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
    // Disable/enable movement via field values — avoids GrabSystem edge cases
    // that occur when removing/re-adding the component mid-grab.
    this.entity.setValue(DistanceGrabbable, "translate", !this.locked);
    this.entity.setValue(DistanceGrabbable, "rotate",    !this.locked);
    return this.locked;
  },
};
