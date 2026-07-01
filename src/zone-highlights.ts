import {
  createSystem,
  Entity,
  Mesh,
  CircleGeometry,
  MeshBasicMaterial,
  DoubleSide,
} from "@iwsdk/core";

import { Handpan, ZONE_OFFSETS } from "./handpan.js";

export type HighlightStyle = "tutorial" | "guide" | "success" | "wrong" | "idle";

const C_IDLE     = 0x6b52a8; // dim lavender
const C_TUTORIAL = 0x8b7ec8; // soft lavender
const C_GUIDE    = 0xffd700; // gold — next note in song
const C_SUCCESS  = 0x4ade80; // green
const C_WRONG    = 0xff6b6b; // red

const STYLE_COLORS: Record<Exclude<HighlightStyle, "idle">, number> = {
  tutorial: C_TUTORIAL,
  guide:    C_GUIDE,
  success:  C_SUCCESS,
  wrong:    C_WRONG,
};

const PULSE_STYLES: Set<HighlightStyle> = new Set(["guide", "tutorial"]);

export const zoneHighlightManager = {
  highlightZone(_index: number, _style: HighlightStyle): void {},
  highlightAll(_visible: boolean): void {},
  pulseZone(_index: number, _durationMs = 0): void {},
};

export class ZoneHighlightSystem extends createSystem({
  handpans: { required: [Handpan] },
}) {
  private indicators: Mesh[] = [];
  private mats: MeshBasicMaterial[] = [];
  private setupDone = false;
  private pendingEntity: Entity | null = null;
  private handpanEntity: Entity | null = null;

  // Pulse state
  private pulsingZone = -1;
  private pulseTime = 0;
  private pulseDurationSec = 0; // 0 = indefinite

  init() {
    zoneHighlightManager.highlightZone = (index, style) => this._highlight(index, style);
    zoneHighlightManager.highlightAll = (visible) => this._showAll(visible);
    zoneHighlightManager.pulseZone = (index, durationMs = 0) => this._setPulse(index, durationMs);

    this.queries.handpans.subscribe("qualify", (entity: Entity) => {
      if (!this.pendingEntity) this.pendingEntity = entity;
      if (!this.handpanEntity) this.handpanEntity = entity;
    });
  }

  update(delta: number, _time: number) {
    if (!this.setupDone) {
      if (!this.pendingEntity) return;
      this._buildIndicators(this.pendingEntity);
      this.setupDone = true;
    }

    // Sync local offsets if ZONE_OFFSETS were edited at runtime
    if (this.handpanEntity?.object3D) {
      for (let i = 0; i < ZONE_OFFSETS.length; i++) {
        const [ox, oy, oz] = ZONE_OFFSETS[i];
        this.indicators[i].position.set(ox, oy + 0.04, oz);
      }
    }

    if (this.pulsingZone < 0) return;

    this.pulseTime += delta;
    if (this.pulseDurationSec > 0 && this.pulseTime >= this.pulseDurationSec) {
      this.pulsingZone = -1;
      return;
    }

    const pulse = 0.75 + 0.25 * Math.sin(this.pulseTime * 4);
    this.mats[this.pulsingZone].opacity = pulse;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _buildIndicators(entity: Entity): void {
    const mesh = entity.object3D!;

    for (let i = 0; i < ZONE_OFFSETS.length; i++) {
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
      mesh.add(ring);
      this.indicators.push(ring);
      this.mats.push(mat);
    }
  }

  private _highlight(index: number, style: HighlightStyle): void {
    if (style === "idle") {
      if (index >= 0 && index < this.mats.length) {
        this.mats[index].opacity = 0;
        if (this.pulsingZone === index) this.pulsingZone = -1;
      }
      return;
    }

    const color = STYLE_COLORS[style];
    for (let i = 0; i < this.mats.length; i++) {
      this.mats[i].color.setHex(i === index ? color : C_IDLE);
      this.mats[i].opacity = i === index ? 0.85 : 0.10;
    }

    if (PULSE_STYLES.has(style)) {
      this.pulsingZone = index;
      this.pulseTime = 0;
      this.pulseDurationSec = 0;
    } else if (this.pulsingZone === index) {
      this.pulsingZone = -1;
    }
  }

  private _showAll(visible: boolean): void {
    this.indicators.forEach((ind, i) => {
      ind.visible = visible;
      if (visible) {
        this.mats[i].color.setHex(C_IDLE);
        this.mats[i].opacity = 0.12;
      } else {
        this.mats[i].opacity = 0;
      }
    });
    if (!visible) {
      this.pulsingZone = -1;
    }
  }

  private _setPulse(index: number, durationMs: number): void {
    if (index < 0 || index >= this.mats.length) return;
    this.pulsingZone = index;
    this.pulseTime = 0;
    this.pulseDurationSec = durationMs > 0 ? durationMs / 1000 : 0;
    this.mats[index].opacity = 0.85;
  }
}
