import {
  createSystem,
  Group,
  Entity,
  InputComponent,
  PanelUI,
  PanelDocument,
  PokeInteractable,
  RayInteractable,
  Follower,
  FollowBehavior,
  UIKitDocument,
  VisibilityState,
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

    // Must be parented to sceneEntity so the input system can route events to it
    this.panelEntity = this.world.createTransformEntity(group, { parent: this.world.sceneEntity });

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

    // Add PokeInteractable only once the XR session is active so InputSystem's
    // multiPointers are fully initialised before we enable touch routing.
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.Visible && this.panelEntity) {
            if (!this.panelEntity.hasComponent(PokeInteractable)) {
            this.panelEntity.addComponent(PokeInteractable);
          }
          if (!this.panelEntity.hasComponent(RayInteractable)) {
            this.panelEntity.addComponent(RayInteractable);
          }
        }
      }),
    );

    // Wire up UI events once PanelUISystem finishes loading the document.
    // Use PanelDocument.data.document[entity.index] — the IWSDK-internal
    // direct data access used in all framework examples.
    this.queries.configuredPanels.subscribe("qualify", (entity: Entity) => {
      if (entity !== this.panelEntity || this.documentWiredUp) return;
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (doc) {
        this._wirePanel(doc);
      } else {
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

    if (this.panelVisible) {
      // Freeze panel in place — remove Follower so it stops tracking the wrist.
      // The panel stays at the position it was in when opened (= wrist position).
      if (this.panelEntity?.hasComponent(Follower)) {
        this.panelEntity.removeComponent(Follower);
      }
    } else {
      // Re-attach Follower while hidden so it tracks the wrist again, ready for
      // next open. The jump to wrist position is invisible because visible=false.
      const target = this.player.gripSpaces?.left;
      if (this.panelEntity && !this.panelEntity.hasComponent(Follower) && target) {
        this.panelEntity.addComponent(Follower, {
          target,
          offsetPosition: [0, 0.20, 0.05] as [number, number, number],
          behavior:       FollowBehavior.PivotY,
          speed:          8,
          tolerance:      0.06,
        });
      }
    }
  }

  private _pollForDocument(entity: Entity): void {
    const check = () => {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
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

    // Make panel double-sided so it shows from behind too.
    // UIKit builds its mesh geometry asynchronously — wait one frame before traversing.
    setTimeout(() => {
      this.panelEntity?.object3D?.traverse((obj: any) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: any) => { m.side = 2; }); // 2 = THREE.DoubleSide
        }
      });
    }, 200);

    // ─ Close button ────────────────────────────────────────────────────────
    doc.getElementById("close-btn")?.addEventListener("click", () => {
      // _toggle handles visibility + re-attaches Follower to track wrist again
      this._toggle();
    });

    // ─ Reverb controls ─────────────────────────────────────────────────────
    const display = doc.getElementById("reverb-display");

    const updateDisplay = () => {
      const pct = Math.round(reverbManager.wet * 100);
      if (display) (display as any).setProperties({ text: `${pct}%` });
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
          btn.setProperties({ backgroundColor: 0x1e3a5f, borderColor: 0x3b82f6, color: 0x93c5fd });
        } else {
          btn.setProperties({ backgroundColor: 0x18181b, borderColor: 0x27272a, color: 0xa1a1aa });
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
      if (btn) {
        btn.setProperties({
          text:            isLocked ? "Unlock Position" : "Lock Position",
          backgroundColor: isLocked ? 0x1e3a5f : 0x18181b,
          borderColor:     isLocked ? 0x3b82f6 : 0x27272a,
          color:           isLocked ? 0x93c5fd : 0xa1a1aa,
        });
      }
    });
  }
}
