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

// All 32 singing-bowl recordings used for random bubble pops
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

export const BUBBLE_SOUND_COUNT = BUBBLE_SRCS.length;

// ── Tuning ────────────────────────────────────────────────────────────────────
const POP_DISTANCE     = 0.08;   // metres — index tip within this radius pops bubble
const FLOAT_FREQ       = 0.0005;
const BUBBLE_TARGET    = 9;      // keep this many bubbles alive at once
const SPAWN_RADIUS_MIN = 0.20;   // metres from user head (min)
const SPAWN_RADIUS_MAX = 0.50;   // metres from user head (max)

// ── Wave ring pool ────────────────────────────────────────────────────────────
const RINGS_PER_POP  = 3;
const RING_POOL_SIZE = RINGS_PER_POP * 5; // supports 5 simultaneous pops
const WAVE_DURATION  = 1.2;               // seconds
const WAVE_MAX_SCALE = 5.0;

interface WaveRing {
  mesh:     Mesh;
  mat:      MeshBasicMaterial;
  entity:   Entity;
  startSec: number;
  active:   boolean;
}

// ── ECS components ────────────────────────────────────────────────────────────
export const Bubble = createComponent("Bubble", {});

export const BubbleOrigin = createComponent("BubbleOrigin", {
  x:          { type: Types.Float32, default: 0 },
  y:          { type: Types.Float32, default: 0 },
  z:          { type: Types.Float32, default: 0 },
  phase:      { type: Types.Float32, default: 0 },
  soundIndex: { type: Types.Int32,   default: 0 },
});

// ── System ────────────────────────────────────────────────────────────────────
export class BubbleSystem extends createSystem({
  bubbles: { required: [Bubble, BubbleOrigin] },
}) {
  private tipLeft      = new Vector3();
  private tipRight     = new Vector3();
  private headWorldPos = new Vector3();

  private soundEntities: Entity[]  = [];
  private wavePool:      WaveRing[] = [];
  private respawnTimers: number[]   = []; // epoch-ms timestamps

  init() {
    // ─ Sound entities ──────────────────────────────────────────────────────
    for (const src of BUBBLE_SRCS) {
      const e = this.world.createTransformEntity(new Group());
      e.addComponent(AudioSource, {
        src,
        positional:   false,
        volume:       0.7,
        playbackMode: PlaybackMode.Overlap,
      });
      this.soundEntities.push(e);
    }

    // ─ Pre-allocate wave ring pool ─────────────────────────────────────────
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
      this.wavePool.push({ mesh, mat, entity, startSec: 0, active: false });
    }

    // ─ Initial bubbles — wait for XR session so player.head has a real position
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

    // Uniform random point on sphere
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = SPAWN_RADIUS_MIN + Math.random() * (SPAWN_RADIUS_MAX - SPAWN_RADIUS_MIN);

    const ox = this.headWorldPos.x + r * Math.sin(phi) * Math.cos(theta);
    const oy = this.headWorldPos.y + r * Math.cos(phi);
    const oz = this.headWorldPos.z + r * Math.sin(phi) * Math.sin(theta);

    const geo  = new SphereGeometry(0.08, 16, 16);
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
      .addComponent(BubbleOrigin, {
        x: ox, y: oy, z: oz,
        phase:      Math.random() * Math.PI * 2,
        soundIndex: Math.floor(Math.random() * BUBBLE_SOUND_COUNT),
      });
  }

  private triggerWave(pos: Vector3, nowSec: number): void {
    let started = 0;
    for (const ring of this.wavePool) {
      if (ring.active || started >= RINGS_PER_POP) continue;
      ring.active      = true;
      ring.startSec    = nowSec + started * 0.18; // stagger between rings
      ring.mesh.position.copy(pos);
      ring.mesh.lookAt(pos.x, pos.y + 1, pos.z);
      ring.mesh.visible = true;
      ring.mesh.scale.setScalar(1);
      ring.mat.opacity  = 0.7;
      started++;
    }
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(_delta: number, _time: number) {
    const nowMs  = Date.now();
    const nowSec = performance.now() / 1000;
    const now    = performance.now();

    this.player.indexTipSpaces.left.getWorldPosition(this.tipLeft);
    this.player.indexTipSpaces.right.getWorldPosition(this.tipRight);

    // ─ Respawn queue ────────────────────────────────────────────────────
    for (let i = this.respawnTimers.length - 1; i >= 0; i--) {
      if (nowMs >= this.respawnTimers[i]) {
        this.spawnBubble();
        this.respawnTimers.splice(i, 1);
      }
    }

    // ─ Animate wave rings ────────────────────────────────────────────────
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
        ring.mesh.scale.setScalar(1 + t * (WAVE_MAX_SCALE - 1));
        ring.mat.opacity = 0.7 * (1 - t * t); // quadratic ease-out
      }
    }

    // ─ Bubble float + pop detection ──────────────────────────────────────
    this.queries.bubbles.entities.forEach((entity) => {
      const mesh  = entity.object3D!;
      const ox    = entity.getValue(BubbleOrigin, "x")     as number;
      const oy    = entity.getValue(BubbleOrigin, "y")     as number;
      const oz    = entity.getValue(BubbleOrigin, "z")     as number;
      const phase = entity.getValue(BubbleOrigin, "phase") as number;

      // Gentle drift — no allocations
      mesh.position.x = ox + Math.cos(now * FLOAT_FREQ * 0.7 + phase) * 0.02;
      mesh.position.y = oy + Math.sin(now * FLOAT_FREQ       + phase) * 0.06;
      mesh.position.z = oz;

      if (
        this.tipLeft.distanceTo(mesh.position)  < POP_DISTANCE ||
        this.tipRight.distanceTo(mesh.position) < POP_DISTANCE
      ) {
        const si = entity.getValue(BubbleOrigin, "soundIndex") as number;
        AudioUtils.play(this.soundEntities[si]);
        this.triggerWave(mesh.position, nowSec);
        document.dispatchEvent(
          new CustomEvent("bubble-pop", { detail: { position: mesh.position.clone() } }),
        );
        entity.dispose();
      }
    });
  }
}
