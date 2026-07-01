import {
  createSystem,
  Entity,
  Mesh,
  CircleGeometry,
  MeshBasicMaterial,
  DoubleSide,
} from "@iwsdk/core";

import { Handpan, ZONE_OFFSETS } from "./handpan.js";

export type HighlightStyle = "tutorial" | "guide" | "success" | "wrong";

const C_IDLE     = 0x6b52a8; // dim lavender
const C_TUTORIAL = 0x8b7ec8; // soft lavender
const C_GUIDE    = 0xffffff; // bright white
const C_SUCCESS  = 0x4ade80; // green
const C_WRONG    = 0xff6b6b; // red

const STYLE_COLORS: Record<HighlightStyle, number> = {
  tutorial: C_TUTORIAL,
  guide:    C_GUIDE,
  success:  C_SUCCESS,
  wrong:    C_WRONG,
};

export const zoneHighlightManager = {
  highlightZone(_index: number, _style: HighlightStyle): void {},
  highlightAll(_visible: boolean): void {},
  pulseZone(_index: number, _enabled: boolean): void {},
};

export class ZoneHighlightSystem extends createSystem({
  handpans: { required: [Handpan] },
}) {
  private indicators: Mesh[] = [];
  private mats: MeshBasicMaterial[] = [];
  private setupDone = false;
  private pendingEntity: Entity | null = null;

  // Pulse state
  private pulsingZone = -1;
  private pulseTime = 0;

  init() {
    zoneHighlightManager.highlightZone = (index, style) => this._highlight(index, style);
    zoneHighlightManager.highlightAll = (visible) => this._showAll(visible);
    zoneHighlightManager.pulseZone = (index, enabled) => this._setPulse(index, enabled);

    this.queries.handpans.subscribe("qualify", (entity: Entity) => {
      if (!this.pendingEntity) this.pendingEntity = entity;
    });
  }

  update(delta: number, _time: number) {
    // Build indicators on the first safe frame after the handpan qualifies
    if (!this.setupDone) {
      if (!this.pendingEntity) return;
      this._buildIndicators(this.pendingEntity);
      this.setupDone = true;
    }

    // Pulse animation — oscillates opacity of the pulsing zone
    if (this.pulsingZone >= 0) {
      this.pulseTime += delta;
      const pulse = 0.75 + 0.25 * Math.sin(this.pulseTime * 4);
      this.mats[this.pulsingZone].opacity = pulse;
    }
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
    const color = STYLE_COLORS[style];
    for (let i = 0; i < this.mats.length; i++) {
      this.mats[i].color.setHex(i === index ? color : C_IDLE);
      this.mats[i].opacity = i === index ? 0.85 : 0.10;
    }
    // Auto-pulse for guided/tutorial styles
    this.pulsingZone = (style === "guide" || style === "tutorial") ? index : -1;
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

  private _setPulse(index: number, enabled: boolean): void {
    this.pulsingZone = enabled ? index : -1;
    this.pulseTime = 0;
  }
}
