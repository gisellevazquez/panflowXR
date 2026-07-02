import {
  createSystem,
  Entity,
  Mesh,
  CircleGeometry,
  SphereGeometry,
  MeshBasicMaterial,
  DoubleSide,
} from "@iwsdk/core";

import { Handpan, ZONE_OFFSETS, ZONE_RADII, ZONE_TILTS, DING_ZONE_INDEX, applyZoneDiscTilt } from "./handpan.js";

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
  showColliderDebug(_visible: boolean): void {},
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

  // Pending state — applied once indicator meshes are built
  private pendingHighlight: { index: number; style: HighlightStyle } | null = null;
  private pendingShowAll: boolean | null = null;

  // Collider debug discs
  private colliderRings: Mesh[] = [];
  private colliderMats: MeshBasicMaterial[] = [];
  private colliderVisible = false;
  private pendingColliderDebug: boolean | null = null;

  init() {
    zoneHighlightManager.highlightZone = (index, style) => this._highlight(index, style);
    zoneHighlightManager.highlightAll = (visible) => this._showAll(visible);
    zoneHighlightManager.pulseZone = (index, durationMs = 0) => this._setPulse(index, durationMs);
    zoneHighlightManager.showColliderDebug = (visible) => this._showColliderDebug(visible);

    // Console toggles for collider debug visualization
    (window as any).__showColliders = () => this._showColliderDebug(true);
    (window as any).__hideColliders = () => this._showColliderDebug(false);

    // Auto-enable on Quest/desktop without console: ?debug=colliders
    if (new URLSearchParams(window.location.search).get("debug") === "colliders") {
      this.pendingColliderDebug = true;
    }

    this.queries.handpans.subscribe("qualify", (entity: Entity) => {
      if (!this.pendingEntity) this.pendingEntity = entity;
      if (!this.handpanEntity) this.handpanEntity = entity;
    });

    // Handpan entity is created before systems register — pick it up immediately
    for (const entity of this.queries.handpans.entities) {
      if (!this.pendingEntity) this.pendingEntity = entity;
      if (!this.handpanEntity) this.handpanEntity = entity;
    }
  }

  update(delta: number, _time: number) {
    if (!this.setupDone) {
      if (!this.pendingEntity) return;
      this._buildIndicators(this.pendingEntity);
      this.setupDone = true;
      if (this.pendingShowAll !== null) {
        this._showAll(this.pendingShowAll);
        this.pendingShowAll = null;
      }
      if (this.pendingHighlight) {
        const { index, style } = this.pendingHighlight;
        this.pendingHighlight = null;
        this._highlight(index, style);
      }
      if (this.pendingColliderDebug !== null) {
        this._showColliderDebug(this.pendingColliderDebug);
        this.pendingColliderDebug = null;
      }
    }

    // Keep collider discs aligned with zone offsets
    if (this.handpanEntity?.object3D) {
      for (let i = 0; i < ZONE_OFFSETS.length; i++) {
        const [ox, oy, oz] = ZONE_OFFSETS[i];
        if (this.indicators[i]) {
          this.indicators[i].position.set(ox, oy + 0.04, oz);
        }
        if (this.colliderRings[i]) {
          this.colliderRings[i].position.set(ox, oy + 0.05, oz);
          if (i !== DING_ZONE_INDEX) {
            applyZoneDiscTilt(this.colliderRings[i], ZONE_TILTS[i] ?? [0, 0, 0]);
          }
        }
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
    const colors = [0xFF3333, 0x33FF33, 0x3366FF, 0xFFCC00, 0xFF66FF, 0x00CCFF, 0xFF8800, 0x88FF00, 0xCC44FF];

    for (let i = 0; i < ZONE_OFFSETS.length; i++) {
      // ── Zone highlight circle (existing) ───────────────────────────
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
      ring.renderOrder = 10;
      mesh.add(ring);
      this.indicators.push(ring);
      this.mats.push(mat);

      // ── Collider debug shape (sphere for Ding, tilted disc for outer zones) ──
      const r = ZONE_RADII[i] ?? 0.15;
      const tilt = ZONE_TILTS[i] ?? [0, 0, 0];
      const cGeo = i === DING_ZONE_INDEX
        ? new SphereGeometry(r, 16, 12)
        : new CircleGeometry(r, 32);
      const cMat = new MeshBasicMaterial({
        color:       colors[i % colors.length],
        transparent: true,
        opacity:     0,
        depthWrite:  false,
        side:        DoubleSide,
        wireframe:   i === DING_ZONE_INDEX,
      });
      const cRing = new Mesh(cGeo, cMat);
      cRing.name = `zone-collider-${i}`;
      cRing.position.set(ox, oy + 0.05, oz);
      if (i !== DING_ZONE_INDEX) {
        applyZoneDiscTilt(cRing, tilt);
      }
      cRing.visible = false;
      cRing.renderOrder = 20;
      mesh.add(cRing);
      this.colliderRings.push(cRing);
      this.colliderMats.push(cMat);
    }

    console.log(`[zone-highlights] built ${this.indicators.length} highlight circles + ${this.colliderRings.length} collider rings`);
  }

  private _highlight(index: number, style: HighlightStyle): void {
    if (!this.setupDone) {
      this.pendingHighlight = { index, style };
      return;
    }

    if (style === "idle") {
      if (index >= 0 && index < this.mats.length) {
        this.indicators[index].visible = false;
        this.mats[index].opacity = 0;
        if (this.pulsingZone === index) this.pulsingZone = -1;
      }
      return;
    }

    const color = STYLE_COLORS[style];
    for (let i = 0; i < this.mats.length; i++) {
      this.indicators[i].visible = true;
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
    if (!this.setupDone) {
      this.pendingShowAll = visible;
      return;
    }

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
    if (!this.setupDone || index < 0 || index >= this.mats.length) return;
    this.indicators[index].visible = true;
    this.pulsingZone = index;
    this.pulseTime = 0;
    this.pulseDurationSec = durationMs > 0 ? durationMs / 1000 : 0;
    this.mats[index].opacity = 0.85;
  }

  private _showColliderDebug(visible: boolean): void {
    if (!this.setupDone) {
      this.pendingColliderDebug = visible;
      return;
    }

    this.colliderVisible = visible;
    this.colliderRings.forEach((disc, i) => {
      disc.visible = visible;
      this.colliderMats[i].opacity = visible ? 0.75 : 0;
    });
    console.log(`[zone-highlights] collider debug ${visible ? "ON" : "OFF"}`);
  }
}