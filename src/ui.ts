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
import { bubbleManager }      from "./bubbles.js";
import { productInfoManager } from "./product-info.js";

// Reverb preset values (wet mix 0–1)
const REVERB_PRESETS: Record<string, number> = {
  "preset-room":      0.20,
  "preset-hall":      0.40,
  "preset-cathedral": 0.65,
  "preset-cavern":    0.90,
};

// Max fill width in UIKITML units for the decorative reverb slider.
// Track flex-grows to ~33 units inside the slider-row; thumb is 2.2.
const REVERB_FILL_MAX = 30;

/**
 * MenuSystem — floating settings panel anchored above the left wrist.
 *
 * Open / close:
 *   - Emulator / controller:  Y button (left controller)
 *   - Headset hand-tracking:  hold left pinch (Trigger) for 1.5 s
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
    const group = new Group();
    group.visible = false;

    this.panelEntity = this.world.createTransformEntity(group, { parent: this.world.sceneEntity });

    this.panelEntity.addComponent(PanelUI, {
      config:    "./ui/settings.json",
      maxWidth:  0.45,
      maxHeight: 1.0,
    });

    this.panelEntity.addComponent(Follower, {
      target:          this.player.gripSpaces.left,
      offsetPosition:  [0, 0.20, 0.05] as [number, number, number],
      behavior:        FollowBehavior.PivotY,
      speed:           8,
      tolerance:       0.06,
    });

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
    if (this.input.gamepads.left?.getButtonDown(InputComponent.Y_Button)) {
      this._toggle();
      return;
    }

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
      (this.panelDoc.rootElement as any).setProperties({
        display: this.panelVisible ? "flex" : "none",
      });
    } else {
      if (this.panelEntity?.object3D) {
        this.panelEntity.object3D.visible = this.panelVisible;
      }
    }

    if (this.panelVisible) {
      if (this.panelEntity?.hasComponent(Follower)) {
        this.panelEntity.removeComponent(Follower);
      }
      const obj = this.panelEntity?.object3D;
      if (obj && this.player.head) {
        const headPos = new Vector3();
        this.player.head.getWorldPosition(headPos);
        headPos.y = obj.getWorldPosition(new Vector3()).y;
        obj.lookAt(headPos);
      }
    } else {
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

    if (this.panelEntity?.object3D) {
      this.panelEntity.object3D.visible = true;
    }
    (doc.rootElement as any).setProperties({ display: "none" });

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

    // ─ Reverb — decorative slider + preset buttons ─────────────────────────
    const reverbDisplay = doc.getElementById("reverb-display") as any;
    const reverbFill    = doc.getElementById("reverb-fill")    as any;

    const updateReverbUI = (wet: number) => {
      reverbDisplay?.setProperties({ text: `${Math.round(wet * 100)}%` });
      reverbFill?.setProperties({ width: Math.round(wet * REVERB_FILL_MAX) });
    };

    updateReverbUI(reverbManager.wet);

    const setActivePreset = (activeId: string | null) => {
      for (const id of Object.keys(REVERB_PRESETS)) {
        const btn = doc.getElementById(id) as any;
        if (!btn) continue;
        if (id === activeId) {
          btn.setProperties({ backgroundColor: 0x1e1b4b, borderColor: 0x6366f1, color: 0xa5b4fc });
        } else {
          btn.setProperties({ backgroundColor: 0x18181b, borderColor: 0x27272a, color: 0x6b7280 });
        }
      }
    };

    for (const [id, wet] of Object.entries(REVERB_PRESETS)) {
      doc.getElementById(id)?.addEventListener("click", () => {
        reverbManager.setWet(wet);
        updateReverbUI(wet);
        setActivePreset(id);
      });
    }

    // ─ Ambient volume — segmented interactive bar ──────────────────────────
    const volDisplay = doc.getElementById("ambient-vol-display") as any;
    const SEG_COUNT  = 10;

    const updateAmbientVolUI = () => {
      const pct = Math.round(ambientManager.volume * 100);
      volDisplay?.setProperties({ text: `${pct}%` });
      for (let i = 1; i <= SEG_COUNT; i++) {
        const seg = doc.getElementById(`seg-${i * 10}`) as any;
        if (!seg) continue;
        seg.setProperties({ backgroundColor: (i * 10) <= pct ? 0x22c55e : 0x27272a });
      }
    };

    updateAmbientVolUI();

    for (let i = 1; i <= SEG_COUNT; i++) {
      const value = i / SEG_COUNT;
      doc.getElementById(`seg-${i * 10}`)?.addEventListener("click", () => {
        ambientManager.setVolume(value);
        updateAmbientVolUI();
      });
    }

    // ─ Ambient type buttons ────────────────────────────────────────────────
    const AMBIENT_TYPES: AmbientType[] = ["none", "rain", "forest", "ocean", "wind"];

    const setAmbientActive = (active: AmbientType) => {
      for (const t of AMBIENT_TYPES) {
        const btn = doc.getElementById(`ambient-${t}`) as any;
        if (!btn) continue;
        if (t === active) {
          btn.setProperties({ backgroundColor: 0x052e16, borderColor: 0x22c55e, color: 0x4ade80 });
        } else {
          btn.setProperties({ backgroundColor: 0x18181b, borderColor: 0x27272a, color: 0x6b7280 });
        }
      }
    };

    for (const type of AMBIENT_TYPES) {
      doc.getElementById(`ambient-${type}`)?.addEventListener("click", () => {
        ambientManager.setType(type);
        setAmbientActive(type);
      });
    }

    // ─ Bubble toggle ──────────────────────────────────────────────────────
    const bubblePill  = doc.getElementById("bubble-toggle") as any;
    const bubbleKnob  = doc.getElementById("bubble-knob")   as any;
    const bubbleSpace = doc.getElementById("bubble-space")  as any;

    const setBubbleToggle = (on: boolean) => {
      bubblePill?.setProperties ({ backgroundColor: on ? 0x14532d : 0x27272a });
      bubbleKnob?.setProperties ({ backgroundColor: on ? 0x4ade80 : 0x52525b });
      bubbleSpace?.setProperties({ flexGrow: on ? 1 : 0 });
    };

    setBubbleToggle(bubbleManager.enabled);

    doc.getElementById("bubble-toggle")?.addEventListener("click", () => {
      bubbleManager.enabled = !bubbleManager.enabled;
      setBubbleToggle(bubbleManager.enabled);
    });

    // ─ Product info toggle ────────────────────────────────────────────────
    const productPill  = doc.getElementById("product-info-toggle") as any;
    const productKnob  = doc.getElementById("product-knob")        as any;
    const productSpace = doc.getElementById("product-space")       as any;

    const setProductToggle = (on: boolean) => {
      productPill?.setProperties ({ backgroundColor: on ? 0x14532d : 0x27272a });
      productKnob?.setProperties ({ backgroundColor: on ? 0x4ade80 : 0x52525b });
      productSpace?.setProperties({ flexGrow: on ? 1 : 0 });
    };

    setProductToggle(productInfoManager.enabled);

    doc.getElementById("product-info-toggle")?.addEventListener("click", () => {
      productInfoManager.enabled = !productInfoManager.enabled;
      setProductToggle(productInfoManager.enabled);
    });
  }
}
