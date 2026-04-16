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
  Vector3,
} from "@iwsdk/core";

import { reverbManager }  from "./reverb.js";
import { ambientManager, AmbientType } from "./ambient.js";

const REVERB_STEP      = 0.1;
const AMBIENT_VOL_STEP = 0.05;

/**
 * MenuSystem — floating settings panel anchored above the left wrist.
 *
 * Open / close:
 *   - Emulator / controller:  Y button (left controller)
 *   - Headset hand-tracking:  hold left pinch (Trigger) for 1.5 s
 *
 * Visibility strategy:
 *   The Three.js Group is ALWAYS visible so raycasting / PokeInteractable
 *   keep working across open/close cycles. Show/hide is done via UIKit's own
 *   display property (display:'flex' | 'none') on the root element, which
 *   makes UIKit hide its meshes without touching Three.js visibility.
 */
export class MenuSystem extends createSystem({
  configuredPanels: { required: [PanelUI, PanelDocument] },
}) {
  private panelEntity:    Entity        | null = null;
  private panelDoc:       UIKitDocument | null = null;
  private panelVisible                  = false;
  private documentWiredUp               = false;
  private pinchHeldSec                  = 0;
  private readonly TOGGLE_HOLD_SEC      = 1.5;

  init() {
    // ─ Create panel entity ────────────────────────────────────────────────
    // Start hidden via Three.js until the UIKitDocument loads; after that
    // we keep object3D.visible = true and use UIKit display:none instead.
    const group = new Group();
    group.visible = false;

    this.panelEntity = this.world.createTransformEntity(group, { parent: this.world.sceneEntity });

    this.panelEntity.addComponent(PanelUI, {
      config:    "./ui/settings.json",
      maxWidth:  0.45,
      maxHeight: 0.70,
    });

    // Keep panel above the left wrist while hidden
    this.panelEntity.addComponent(Follower, {
      target:          this.player.gripSpaces.left,
      offsetPosition:  [0, 0.20, 0.05] as [number, number, number],
      behavior:        FollowBehavior.PivotY,
      speed:           8,
      tolerance:       0.06,
    });

    // Add interactables only once the XR session is active
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

    // Hand tracking: hold left pinch for 1.5 s
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

    if (this.panelDoc) {
      // UIKit display toggle — keeps Three.js Group alive so raycasting
      // and interaction handlers survive across open/close cycles.
      (this.panelDoc.rootElement as any).setProperties({
        display: this.panelVisible ? "flex" : "none",
      });
    } else {
      // Fallback before document loads
      if (this.panelEntity?.object3D) {
        this.panelEntity.object3D.visible = this.panelVisible;
      }
    }

    if (this.panelVisible) {
      // Freeze panel at current (wrist) position
      if (this.panelEntity?.hasComponent(Follower)) {
        this.panelEntity.removeComponent(Follower);
      }
      // Rotate panel to face the player's head (only Y-axis, keeps panel upright)
      const obj = this.panelEntity?.object3D;
      if (obj && this.player.head) {
        const headPos = new Vector3();
        this.player.head.getWorldPosition(headPos);
        headPos.y = obj.getWorldPosition(new Vector3()).y;
        obj.lookAt(headPos);
      }
    } else {
      // Re-attach Follower so panel silently tracks wrist while hidden
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
    this.panelDoc = doc;

    // Switch from Three.js visibility to UIKit display management.
    // Group stays visible=true from now on; content is hidden via display:none.
    if (this.panelEntity?.object3D) {
      this.panelEntity.object3D.visible = true;
    }
    (doc.rootElement as any).setProperties({ display: "none" });

    // Make panel double-sided (UIKit builds geometry async — wait before traversing)
    setTimeout(() => {
      this.panelEntity?.object3D?.traverse((obj: any) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: any) => { m.side = 2; });
        }
      });
    }, 200);

    // ─ Close button ────────────────────────────────────────────────────────
    doc.getElementById("close-btn")?.addEventListener("click", () => {
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

    // ─ Ambient volume ──────────────────────────────────────────────────────
    const volDisplay = doc.getElementById("ambient-vol-display");

    const updateVolDisplay = () => {
      const pct = Math.round(ambientManager.volume * 100);
      if (volDisplay) (volDisplay as any).setProperties({ text: `${pct}%` });
    };

    doc.getElementById("ambient-vol-down")?.addEventListener("click", () => {
      ambientManager.setVolume(Math.max(0, ambientManager.volume - AMBIENT_VOL_STEP));
      updateVolDisplay();
    });

    doc.getElementById("ambient-vol-up")?.addEventListener("click", () => {
      ambientManager.setVolume(Math.min(1, ambientManager.volume + AMBIENT_VOL_STEP));
      updateVolDisplay();
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

  }
}
