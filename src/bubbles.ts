import {
  createComponent,
  createSystem,
  Types,
  AudioSource,
  AudioUtils,
  PlaybackMode,
  Vector3,
  Group,
  Entity,
  Mesh,
  RingGeometry,
  MeshBasicMaterial,
  SphereGeometry,
  MeshStandardMaterial,
  DoubleSide,
  VisibilityState,
} from "@iwsdk/core";

// All singing-bowl recordings. Rename files with "BG" or "SM" in the name
// to automatically route them to big or small bubbles respectively.
const BUBBLE_SRCS = [
  "./audio/bubbles/Kasper - Singing Bowls - 04 Bowl 1 Articulation 1 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 05 Bowl 1 Articulation 1 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 06 Bowl 1 Articulation 2 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 07 Bowl 1 Articulation 2 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 08 Bowl 1 Articulation 3 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 09 Bowl 1 Articulation 3 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 10 Bowl 1 Articulation 4 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 11 Bowl 1 Articulation 4 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 12 Bowl 2 Articulation 1 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 13 Bowl 2 Articulation 1 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 14 Bowl 2 Articulation 2 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 15 Bowl 2 Articulation 2 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 16 Bowl 2 Articulation 3 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 17 Bowl 2 Articulation 3 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 18 Bowl 2 Articulation 4 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 19 Bowl 2 Articulation 4 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 20 Bowl 3 Articulation 1 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 21 Bowl 3 Articulation 1 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 22 Bowl 3 Articulation 2 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 23 Bowl 3 Articulation 2 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 24 Bowl 3 Articulation 3 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 25 Bowl 3 Articulation 3 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 26 Bowl 3 Articulation 4 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 27 Bowl 3 Articulation 4 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 28 Bowl 4 Articulation 1 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 29 Bowl 4 Articulation 1 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 30 Bowl 4 Articulation 2 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 31 Bowl 4 Articulation 2 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 32 Bowl 4 Articulation 3 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 33 Bowl 4 Articulation 3 Microphone 2.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 34 Bowl 4 Articulation 4 Microphone 1.mp3",
  "./audio/bubbles/Kasper - Singing Bowls - 35 Bowl 4 Articulation 4 Microphone 2.mp3",
] as const;

// ── Tuning ────────────────────────────────────────────────────────────────────
const FLOAT_FREQ       = 0.0005;
const BUBBLE_TARGET    = 9;
const SPAWN_RADIUS_MIN = 0.20;
const SPAWN_RADIUS_MAX = 0.50;
const BIG_RATIO        = 0.4;   // 40% of bubbles spawn as BIG

// Physical size ranges in metres
const RADIUS_BIG_MIN = 0.10;
const RADIUS_BIG_MAX = 0.16;
const RADIUS_SM_MIN  = 0.04;
const RADIUS_SM_MAX  = 0.075;

// Pop fires when fingertip is within this fraction of the bubble's radius
const POP_FACTOR = 0.75;

// ── Wave ring pool ────────────────────────────────────────────────────────────
const RINGS_PER_POP  = 3;
const RING_POOL_SIZE = RINGS_PER_POP * 5;
const WAVE_DURATION  = 1.2;
const WAVE_MAX_SCALE = 5.0;

interface WaveRing {
  mesh:      Mesh;
  mat:       MeshBasicMaterial;
  entity:    Entity;
  startSec:  number;
  active:    boolean;
  baseScale: number; // scales ring proportionally to the bubble that popped
}

// ── ECS components ────────────────────────────────────────────────────────────
export const Bubble = createComponent("Bubble", {});

export const BubbleOrigin = createComponent("BubbleOrigin", {
  x:          { type: Types.Float32, default: 0 },
  y:          { type: Types.Float32, default: 0 },
  z:          { type: Types.Float32, default: 0 },
  phase:      { type: Types.Float32, default: 0 },
  soundIndex: { type: Types.Int32,   default: 0 },
  radius:     { type: Types.Float32, default: 0.08 },
});

/** Toggle bubbles on/off from the menu. */
export const bubbleManager = { enabled: true };

// ── System ────────────────────────────────────────────────────────────────────
export class BubbleSystem extends createSystem({
  bubbles: { required: [Bubble, BubbleOrigin] },
}) {
  private tipLeft      = new Vector3();
  private tipRight     = new Vector3();
  private headWorldPos = new Vector3();

  private soundEntities: Entity[]  = [];
  private wavePool:      WaveRing[] = [];
  private respawnTimers: number[]   = [];

  // Sound index pools split by BG / SM naming convention
  private bigIndices:   number[] = [];
  private smallIndices: number[] = [];

  private prevEnabled = true;

  init() {
    // ─ Sound entities ──────────────────────────────────────────────────────
    BUBBLE_SRCS.forEach((src, i) => {
      const e = this.world.createTransformEntity(new Group());
      e.addComponent(AudioSource, {
        src,
        positional:   false,
        volume:       0.7,
        playbackMode: PlaybackMode.Overlap,
      });
      this.soundEntities.push(e);

      // Route by filename convention
      if (src.includes("BG"))      this.bigIndices.push(i);
      else if (src.includes("SM")) this.smallIndices.push(i);
    });

    // Fallback: if no categorised files yet, use full list for both sizes
    const allIndices = Array.from({ length: BUBBLE_SRCS.length }, (_, i) => i);
    if (this.bigIndices.length === 0)   this.bigIndices   = allIndices;
    if (this.smallIndices.length === 0) this.smallIndices = allIndices;

    // ─ Wave ring pool ──────────────────────────────────────────────────────
    for (let i = 0; i < RING_POOL_SIZE; i++) {
      const geo = new RingGeometry(0.04, 0.058, 32);
      const mat = new MeshBasicMaterial({
        color:       0x88ccff,
        transparent: true,
        opacity:     0,
        side:        DoubleSide,
        depthWrite:  false,
      });
      const mesh   = new Mesh(geo, mat);
      mesh.visible = false;
      const entity = this.world.createTransformEntity(mesh, { parent: this.world.sceneEntity });
      this.wavePool.push({ mesh, mat, entity, startSec: 0, active: false, baseScale: 1 });
    }

    // ─ Initial spawn — wait for XR session so player.head is real ─────────
    const spawnInitial = () => {
      if (this.queries.bubbles.entities.size === 0) {
        for (let i = 0; i < BUBBLE_TARGET; i++) this.spawnBubble();
      }
    };

    if (this.world.visibilityState.peek() === VisibilityState.Visible) {
      spawnInitial();
    } else {
      this.cleanupFuncs.push(
        this.world.visibilityState.subscribe((state) => {
          if (state === VisibilityState.Visible) spawnInitial();
        }),
      );
    }

    // ─ Respawn on pop ──────────────────────────────────────────────────────
    this.queries.bubbles.subscribe("disqualify", () => {
      this.respawnTimers.push(Date.now() + 2000 + Math.random() * 1000);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private spawnBubble(): void {
    this.player.head.getWorldPosition(this.headWorldPos);

    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = SPAWN_RADIUS_MIN + Math.random() * (SPAWN_RADIUS_MAX - SPAWN_RADIUS_MIN);

    const ox = this.headWorldPos.x + r * Math.sin(phi) * Math.cos(theta);
    const oy = Math.max(this.headWorldPos.y + r * Math.cos(phi), 1.0);
    const oz = this.headWorldPos.z + r * Math.sin(phi) * Math.sin(theta);

    // Pick size category and corresponding sound pool
    const isBig  = Math.random() < BIG_RATIO;
    const radius = isBig
      ? RADIUS_BIG_MIN + Math.random() * (RADIUS_BIG_MAX - RADIUS_BIG_MIN)
      : RADIUS_SM_MIN  + Math.random() * (RADIUS_SM_MAX  - RADIUS_SM_MIN);

    const bucket     = isBig ? this.bigIndices : this.smallIndices;
    const soundIndex = bucket[Math.floor(Math.random() * bucket.length)];

    const geo  = new SphereGeometry(radius, 16, 16);
    const mat  = new MeshStandardMaterial({
      color:       0x44aaff,
      transparent: true,
      opacity:     0.6,
      roughness:   0.05,
      metalness:   0.3,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.set(ox, oy, oz);

    this.world
      .createTransformEntity(mesh, { parent: this.world.sceneEntity })
      .addComponent(Bubble)
      .addComponent(BubbleOrigin, { x: ox, y: oy, z: oz, phase: Math.random() * Math.PI * 2, soundIndex, radius });
  }

  private triggerWave(pos: Vector3, nowSec: number, radius: number): void {
    const baseScale = radius / 0.08; // normalize to ring geometry size
    let started = 0;
    for (const ring of this.wavePool) {
      if (ring.active || started >= RINGS_PER_POP) continue;
      ring.active      = true;
      ring.startSec    = nowSec + started * 0.18;
      ring.baseScale   = baseScale;
      ring.mesh.position.copy(pos);
      ring.mesh.lookAt(pos.x, pos.y + 1, pos.z);
      ring.mesh.visible = true;
      ring.mesh.scale.setScalar(baseScale);
      ring.mat.opacity  = 0.7;
      started++;
    }
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(_delta: number, _time: number) {
    // ─ Toggle handling ───────────────────────────────────────────────────
    if (!bubbleManager.enabled) {
      if (this.prevEnabled) {
        // Just disabled — clear everything
        const toDispose = [...this.queries.bubbles.entities];
        toDispose.forEach(e => e.dispose());
        this.respawnTimers.length = 0;
        this.prevEnabled = false;
      }
      return;
    }
    if (!this.prevEnabled) {
      // Just re-enabled — spawn a fresh set
      for (let i = 0; i < BUBBLE_TARGET; i++) this.spawnBubble();
      this.prevEnabled = true;
    }

    const nowMs  = Date.now();
    const nowSec = performance.now() / 1000;
    const now    = performance.now();

    this.player.indexTipSpaces.left.getWorldPosition(this.tipLeft);
    this.player.indexTipSpaces.right.getWorldPosition(this.tipRight);

    // ─ Respawn queue ──────────────────────────────────────────────────────
    for (let i = this.respawnTimers.length - 1; i >= 0; i--) {
      if (nowMs >= this.respawnTimers[i]) {
        this.spawnBubble();
        this.respawnTimers.splice(i, 1);
      }
    }

    // ─ Wave rings ─────────────────────────────────────────────────────────
    for (const ring of this.wavePool) {
      if (!ring.active) continue;
      const elapsed = nowSec - ring.startSec;
      if (elapsed < 0) continue;
      const t = elapsed / WAVE_DURATION;
      if (t >= 1) {
        ring.active       = false;
        ring.mesh.visible = false;
        ring.mat.opacity  = 0;
        ring.mesh.scale.setScalar(1);
      } else {
        ring.mesh.scale.setScalar(ring.baseScale * (1 + t * (WAVE_MAX_SCALE - 1)));
        ring.mat.opacity = 0.7 * (1 - t * t);
      }
    }

    // ─ Bubble float + pop ─────────────────────────────────────────────────
    this.queries.bubbles.entities.forEach((entity) => {
      const mesh      = entity.object3D!;
      const ox        = entity.getValue(BubbleOrigin, "x")          as number;
      const oy        = entity.getValue(BubbleOrigin, "y")          as number;
      const oz        = entity.getValue(BubbleOrigin, "z")          as number;
      const phase     = entity.getValue(BubbleOrigin, "phase")      as number;
      const radius    = entity.getValue(BubbleOrigin, "radius")     as number;
      const popDist   = radius * POP_FACTOR;

      mesh.position.x = ox + Math.cos(now * FLOAT_FREQ * 0.7 + phase) * 0.02;
      mesh.position.y = oy + Math.sin(now * FLOAT_FREQ       + phase) * 0.06;
      mesh.position.z = oz;

      if (
        this.tipLeft.distanceTo(mesh.position)  < popDist ||
        this.tipRight.distanceTo(mesh.position) < popDist
      ) {
        const si = entity.getValue(BubbleOrigin, "soundIndex") as number;
        AudioUtils.play(this.soundEntities[si]);
        this.triggerWave(mesh.position, nowSec, radius);
        document.dispatchEvent(
          new CustomEvent("bubble-pop", { detail: { position: mesh.position.clone() } }),
        );
        entity.dispose();
      }
    });
  }
}
