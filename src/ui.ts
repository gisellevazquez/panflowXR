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
import { melodyManager, MelodyMode } from "./melody.js";
import { Handpan } from "./handpan.js";
import { recordingManager } from "./recording-system.js";

const SETTINGS_PANEL_OFFSET_X = 0.55; // mirrors product info offset, on opposite side

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
  handpans:         { required: [Handpan] },
}) {
  private panelEntity:        Entity        | null = null;
  private panelDoc:           UIKitDocument | null = null;
  private panelVisible                      = false;
  private documentWiredUp                   = false;
  private pinchHeldSec                      = 0;
  private readonly TOGGLE_HOLD_SEC          = 1.5;
  private _openedFromHandpan                = false;

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

    const openHandler = () => {
      this._openedFromHandpan = true;
      if (!this.panelVisible) this._toggle();
    };
    window.addEventListener("panflow-open-settings", openHandler);
    this.cleanupFuncs.push(() => window.removeEventListener("panflow-open-settings", openHandler));
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
        if (this._openedFromHandpan) {
          // Position to the left of the handpan, mirroring the product info panel
          for (const e of this.queries.handpans.entities) {
            const hpPos = new Vector3();
            e.object3D!.getWorldPosition(hpPos);
            obj.position.set(hpPos.x - SETTINGS_PANEL_OFFSET_X, hpPos.y + 0.05, hpPos.z);
            break;
          }
        }
        // Always face the player (Y-axis lock keeps panel upright)
        const headPos = new Vector3();
        this.player.head.getWorldPosition(headPos);
        headPos.y = obj.getWorldPosition(new Vector3()).y;
        obj.lookAt(headPos);
      }
    } else {
      this._openedFromHandpan = false;
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
    const closeBtn = doc.getElementById("close-btn") as any;
    closeBtn?.setProperties({ text: "X", color: 0xa0a0a0 });
    closeBtn?.addEventListener("click", () => {
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

    // ─ Ambient volume — fill+thumb slider (tap fill=down, tap empty=up) ──────
    const volDisplay  = doc.getElementById("ambient-vol-display") as any;
    const ambientFill = doc.getElementById("ambient-vol-fill")    as any;
    const AMBIENT_FILL_MAX = 30;

    const updateAmbientVolUI = () => {
      const pct = Math.round(ambientManager.volume * 100);
      volDisplay?.setProperties({ text: `${pct}%` });
      ambientFill?.setProperties({ width: Math.round(ambientManager.volume * AMBIENT_FILL_MAX) });
    };

    updateAmbientVolUI();

    doc.getElementById("ambient-vol-down")?.addEventListener("click", () => {
      ambientManager.setVolume(Math.max(0, ambientManager.volume - 0.10));
      updateAmbientVolUI();
    });

    doc.getElementById("ambient-vol-up")?.addEventListener("click", () => {
      ambientManager.setVolume(Math.min(1, ambientManager.volume + 0.10));
      updateAmbientVolUI();
    });

    // ─ Ambient type buttons ────────────────────────────────────────────────
    const AMBIENT_TYPES: AmbientType[] = ["none", "rain", "forest", "ocean", "wind"];

    const setAmbientActive = (active: AmbientType) => {
      for (const t of AMBIENT_TYPES) {
        const btn = doc.getElementById(`ambient-${t}`) as any;
        if (!btn) continue;
        if (t === active) {
          btn.setProperties({ backgroundColor: 0x122620, borderColor: 0x6eb89a, color: 0x6eb89a });
        } else {
          btn.setProperties({ backgroundColor: 0x221e2b, borderColor: 0x2d2a35, color: 0x858585 });
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
      bubblePill?.setProperties ({ backgroundColor: on ? 0x3d1428 : 0x27272a, borderColor: on ? 0xe89ab4 : 0x27272a });
      bubbleKnob?.setProperties ({ backgroundColor: on ? 0xf5f5f5 : 0x52525b });
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
      productPill?.setProperties ({ backgroundColor: on ? 0x261e3a : 0x27272a, borderColor: on ? 0x9e87ce : 0x27272a });
      productKnob?.setProperties ({ backgroundColor: on ? 0xf5f5f5 : 0x52525b });
      productSpace?.setProperties({ flexGrow: on ? 1 : 0 });
    };

    setProductToggle(productInfoManager.enabled);

    doc.getElementById("product-info-toggle")?.addEventListener("click", () => {
      productInfoManager.enabled = !productInfoManager.enabled;
      setProductToggle(productInfoManager.enabled);
    });

    // ─ Demo mode pills ────────────────────────────────────────────────────
    // TEMPORARILY DISABLED: Melody system is not working yet
    /*
    const setDemoMode = (mode: MelodyMode) => {
      melodyManager.mode = mode;
      const freeBtn    = doc.getElementById("demo-mode-free")    as any;
      const guidedBtn  = doc.getElementById("demo-mode-guided")  as any;
      freeBtn?.setProperties(mode === "free"
        ? { backgroundColor: 0x38253a, borderColor: 0xe89ab4, color: 0xe89ab4 }
        : { backgroundColor: 0x1e1828, borderColor: 0x2d2a35, color: 0x858585 });
      guidedBtn?.setProperties(mode === "guided"
        ? { backgroundColor: 0x38253a, borderColor: 0xe89ab4, color: 0xe89ab4 }
        : { backgroundColor: 0x1e1828, borderColor: 0x2d2a35, color: 0x858585 });
    };

    setDemoMode("free"); // default

    doc.getElementById("demo-mode-free")?.addEventListener("click", () => setDemoMode("free"));
    doc.getElementById("demo-mode-guided")?.addEventListener("click", () => setDemoMode("guided"));

    // ─ Demo play / stop ───────────────────────────────────────────────────
    const demoPlayBtn = doc.getElementById("demo-play") as any;

    const setDemoBtn = (playing: boolean) => {
      demoPlayBtn?.setProperties(playing
        ? { text: "■  Stop", backgroundColor: 0x3d1428, borderColor: 0xe89ab4, color: 0xe89ab4 }
        : { text: "▶  Play Demo", backgroundColor: 0xe89ab4, borderColor: 0xe89ab4, color: 0x2a1820 });
    };

    doc.getElementById("demo-play")?.addEventListener("click", () => {
      melodyManager.playing = !melodyManager.playing;
      setDemoBtn(melodyManager.playing);
    });

    window.addEventListener("melody-ended", () => {
      melodyManager.playing = false;
      setDemoBtn(false);
    });
    */

    // ─ Recording controls ─────────────────────────────────────────────────
    const recRecordBtn = doc.getElementById("rec-record") as any;
    const recPlayBtn   = doc.getElementById("rec-play")   as any;
    const recStatusLbl = doc.getElementById("rec-status") as any;

    const updateRecUI = () => {
      const isRec  = recordingManager.isRecording;
      const isPlay = recordingManager.isPlaying;
      const hasRec = recordingManager.hasRecording;

      recRecordBtn?.setProperties(isRec
        ? { text: "■ Stop Rec",  backgroundColor: 0x3f1d1d, borderColor: 0xf87171, color: 0xfca5a5 }
        : { text: "● Record",   backgroundColor: 0x18181b, borderColor: 0x27272a, color: 0x6b7280 });

      if (isPlay) {
        recPlayBtn?.setProperties({ text: "■ Stop",  backgroundColor: 0x14532d, borderColor: 0x4ade80, color: 0x86efac });
      } else if (hasRec) {
        recPlayBtn?.setProperties({ text: "▶ Play",  backgroundColor: 0x1e1b4b, borderColor: 0x6366f1, color: 0xa5b4fc });
      } else {
        recPlayBtn?.setProperties({ text: "▶ Play",  backgroundColor: 0x18181b, borderColor: 0x27272a, color: 0x3f3f46 });
      }

      const statusText  = isRec ? "Recording..." : isPlay ? "Playing..." : hasRec ? "Take saved" : "Ready";
      const statusColor = isRec ? 0xf87171 : isPlay ? 0x4ade80 : hasRec ? 0xa5b4fc : 0x52525b;
      recStatusLbl?.setProperties({ text: statusText, color: statusColor });
    };

    updateRecUI();

    recRecordBtn?.addEventListener("click", () => {
      recordingManager.toggleRecording();
      updateRecUI();
    });

    recPlayBtn?.addEventListener("click", () => {
      if (recordingManager.isPlaying) {
        recordingManager.stopPlayback();
      } else {
        recordingManager.playRecording();
      }
      updateRecUI();
    });

    window.addEventListener("recording-playback-ended", () => {
      updateRecUI();
    });
  }
}
