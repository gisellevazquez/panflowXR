import {
  createSystem,
  Group,
  Entity,
  InputComponent,
  PanelUI,
  PanelDocument,
  Follower,
  FollowBehavior,
  UIKitDocument,
} from "@iwsdk/core";

import { reverbManager }  from "./reverb.js";
import { ambientManager, AmbientType } from "./ambient.js";
import { handpanLockManager } from "./handpan.js";

// How much reverb changes per button press (0..1 range divided into 10 steps)
const REVERB_STEP = 0.1;

/**
 * MenuSystem — floating settings panel anchored above the left wrist.
 *
 * Open / close:
 *   - Emulator / controller:  Y button (left controller)
 *   - Headset hand-tracking:  same button mapped to secondary input
 *
 * Panel contents (settings.uikitml):
 *   - Close button
 *   - Reverb +/− controls
 *   - Ambient sound selector
 */
export class MenuSystem extends createSystem({
  configuredPanels: { required: [PanelUI, PanelDocument] },
}) {
  private panelEntity:    Entity  | null = null;
  private panelVisible              = false;
  private documentWiredUp           = false;
  private pinchHeldSec              = 0;
  private readonly TOGGLE_HOLD_SEC  = 1.5;

  init() {
    // ─ Create panel entity (hidden at start) ──────────────────────────────
    const group = new Group();
    group.visible = false;

    this.panelEntity = this.world.createTransformEntity(group);

    this.panelEntity.addComponent(PanelUI, {
      config:    "./ui/settings.json",
      maxWidth:  0.45,
      maxHeight: 0.70,
    });

    // Keep panel above the left wrist
    this.panelEntity.addComponent(Follower, {
      target:          this.player.gripSpaces.left,
      offsetPosition:  [0, 0.20, 0.05] as [number, number, number],
      behavior:        FollowBehavior.PivotY,
      speed:           8,
      tolerance:       0.06,
    });

    // Wire up UI events once PanelUISystem finishes loading the document
    this.queries.configuredPanels.subscribe("qualify", (entity: Entity) => {
      if (entity !== this.panelEntity || this.documentWiredUp) return;
      const doc = entity.getValue(PanelDocument, "document") as UIKitDocument | undefined;
      if (doc) {
        this._wirePanel(doc);
      } else {
        // PanelUISystem loads async — poll briefly until document is ready
        this._pollForDocument(entity);
      }
    });
  }

  update(delta: number, _time: number) {
    // Controller / emulator: Y button (instant)
    if (this.input.gamepads.left?.getButtonDown(InputComponent.Y_Button)) {
      this._toggle();
      return;
    }

    // Hand tracking: hold left pinch (Trigger) for 1.5 s to toggle menu
    const pinching = this.input.gamepads.left?.getButtonPressed(InputComponent.Trigger) ?? false;
    if (pinching) {
      this.pinchHeldSec += delta;
      if (this.pinchHeldSec >= this.TOGGLE_HOLD_SEC) {
        this.pinchHeldSec = 0;
        this._toggle();
      }
    } else {
      this.pinchHeldSec = 0;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _toggle(): void {
    this.panelVisible = !this.panelVisible;
    if (this.panelEntity?.object3D) {
      this.panelEntity.object3D.visible = this.panelVisible;
    }
  }

  private _pollForDocument(entity: Entity): void {
    const check = () => {
      const doc = entity.getValue(PanelDocument, "document") as UIKitDocument | undefined;
      if (doc) {
        this._wirePanel(doc);
      } else {
        setTimeout(check, 100);
      }
    };
    setTimeout(check, 100);
  }

  private _wirePanel(doc: UIKitDocument): void {
    this.documentWiredUp = true;

    // ─ Close button ────────────────────────────────────────────────────────
    doc.getElementById("close-btn")?.addEventListener("click", () => {
      this.panelVisible = false;
      if (this.panelEntity?.object3D) {
        this.panelEntity.object3D.visible = false;
      }
    });

    // ─ Reverb controls ─────────────────────────────────────────────────────
    const display = doc.getElementById("reverb-display");

    const updateDisplay = () => {
      const pct = Math.round(reverbManager.wet * 100);
      if (display) (display as any).text = `${pct}%`;
    };

    doc.getElementById("reverb-down")?.addEventListener("click", () => {
      reverbManager.setWet(Math.max(0, reverbManager.wet - REVERB_STEP));
      updateDisplay();
    });

    doc.getElementById("reverb-up")?.addEventListener("click", () => {
      reverbManager.setWet(Math.min(1, reverbManager.wet + REVERB_STEP));
      updateDisplay();
    });

    // ─ Ambient sound buttons ───────────────────────────────────────────────
    const AMBIENT_TYPES: AmbientType[] = ["none", "rain", "forest", "ocean", "wind"];

    const setAmbientActive = (active: AmbientType) => {
      for (const t of AMBIENT_TYPES) {
        const btn = doc.getElementById(`ambient-${t}`) as any;
        if (!btn) continue;
        if (t === active) {
          btn.addClass?.("ambient-active");
        } else {
          btn.removeClass?.("ambient-active");
        }
      }
    };

    for (const type of AMBIENT_TYPES) {
      doc.getElementById(`ambient-${type}`)?.addEventListener("click", () => {
        ambientManager.setType(type);
        setAmbientActive(type);
      });
    }

    // ─ Handpan lock ────────────────────────────────────────────────────────
    doc.getElementById("lock-btn")?.addEventListener("click", () => {
      const isLocked = handpanLockManager.toggle();
      const btn = doc.getElementById("lock-btn") as any;
      if (btn) btn.text = isLocked ? "Unlock Position" : "Lock Position";
    });
  }
}
