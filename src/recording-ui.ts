import {
  createSystem,
  Group,
  Entity,
  PanelUI,
  PanelDocument,
  PokeInteractable,
  RayInteractable,
  UIKitDocument,
  Vector3,
} from "@iwsdk/core";

import { Handpan } from "./handpan.js";
import { recordingManager } from "./recording-system.js";

const PROXIMITY_DIST = 1.5; // metres — same threshold as product-info panel
const PANEL_OFFSET_Y = -0.28; // below the handpan centre

type RecState = "idle-empty" | "idle-has-take" | "recording" | "playing";

export class RecordingUISystem extends createSystem({
  handpans:         { required: [Handpan] },
  configuredPanels: { required: [PanelUI, PanelDocument] },
}) {
  private panelEntity:     Entity        | null = null;
  private panelDoc:        UIKitDocument | null = null;
  private documentWiredUp                = false;
  private prevVisible                    = false;
  private prevState: RecState            = "idle-empty";

  // Pre-allocated — no heap allocations in update()
  private handpanPos = new Vector3();
  private headPos    = new Vector3();
  private lookTarget = new Vector3();

  init() {
    const group   = new Group();
    group.visible = false;

    this.panelEntity = this.world.createTransformEntity(group, { parent: this.world.sceneEntity });
    this.panelEntity.addComponent(PanelUI, {
      config:    "./ui/recording.json",
      maxWidth:  0.40,
      maxHeight: 0.25,
    });
    // Add interactables immediately — don't defer to XR start.
    // Proximity-shown panels need the collision registered before they become visible.
    this.panelEntity.addComponent(PokeInteractable);
    this.panelEntity.addComponent(RayInteractable);

    this.queries.configuredPanels.subscribe("qualify", (entity: Entity) => {
      console.log("[REC-UI] qualify fired, entity match:", entity === this.panelEntity, "wiredUp:", this.documentWiredUp);
      if (entity !== this.panelEntity || this.documentWiredUp) return;
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      console.log("[REC-UI] doc available:", !!doc);
      if (doc) {
        this._wirePanel(doc);
      } else {
        this._pollForDocument(entity);
      }
    });
  }

  update(_delta: number, _time: number) {
    if (!this.panelEntity) return;

    let handpanEntity: Entity | undefined;
    for (const e of this.queries.handpans.entities) { handpanEntity = e; break; }
    if (!handpanEntity) return;

    handpanEntity.object3D!.getWorldPosition(this.handpanPos);
    this.player.head.getWorldPosition(this.headPos);

    const dist       = this.headPos.distanceTo(this.handpanPos);
    const shouldShow = dist < PROXIMITY_DIST;

    if (shouldShow) {
      const obj = this.panelEntity.object3D!;
      obj.position.set(
        this.handpanPos.x,
        this.handpanPos.y + PANEL_OFFSET_Y,
        this.handpanPos.z,
      );
      this.lookTarget.copy(this.headPos);
      this.lookTarget.y = obj.position.y;
      obj.lookAt(this.lookTarget);
    }

    if (shouldShow !== this.prevVisible) {
      this.prevVisible = shouldShow;
      this._setVisible(shouldShow);
    }

    // Update button states whenever recordingManager state changes
    const nextState = this._resolveState();
    if (nextState !== this.prevState) {
      this.prevState = nextState;
      this._applyState(nextState);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _resolveState(): RecState {
    if (recordingManager.isRecording) return "recording";
    if (recordingManager.isPlaying)   return "playing";
    if (recordingManager.hasRecording) return "idle-has-take";
    return "idle-empty";
  }

  private _applyState(state: RecState): void {
    if (!this.panelDoc) return;

    const recBtn    = this.panelDoc.getElementById("rec-btn")   as any;
    const playBtn   = this.panelDoc.getElementById("play-btn")  as any;
    const statusEl  = this.panelDoc.getElementById("rec-status") as any;

    switch (state) {
      case "idle-empty":
        recBtn?.setProperties({ text: "Record",     backgroundColor: 0x18181b, borderColor: 0x4b1c1c, color: 0xf87171 });
        playBtn?.setProperties({ text: "Play",       backgroundColor: 0x18181b, borderColor: 0x27272a, color: 0x3f3f46 });
        statusEl?.setProperties({ text: "Ready", color: 0x3f3f46 });
        break;
      case "recording":
        recBtn?.setProperties({ text: "■  Stop",    backgroundColor: 0x3f1d1d, borderColor: 0xf87171, color: 0xfca5a5 });
        playBtn?.setProperties({ text: "Play",       backgroundColor: 0x18181b, borderColor: 0x27272a, color: 0x3f3f46 });
        statusEl?.setProperties({ text: "Recording...", color: 0xf87171 });
        break;
      case "idle-has-take":
        recBtn?.setProperties({ text: "Record",     backgroundColor: 0x18181b, borderColor: 0x4b1c1c, color: 0xf87171 });
        playBtn?.setProperties({ text: "Play",       backgroundColor: 0x1e1b4b, borderColor: 0x6366f1, color: 0xa5b4fc });
        statusEl?.setProperties({ text: "Take saved", color: 0xa5b4fc });
        break;
      case "playing":
        recBtn?.setProperties({ text: "Record",     backgroundColor: 0x18181b, borderColor: 0x27272a, color: 0x3f3f46 });
        playBtn?.setProperties({ text: "■  Stop",    backgroundColor: 0x052e16, borderColor: 0x22c55e, color: 0x4ade80 });
        statusEl?.setProperties({ text: "Playing...", color: 0x4ade80 });
        break;
    }
  }

  private _setVisible(visible: boolean): void {
    if (this.panelDoc) {
      (this.panelDoc.rootElement as any).setProperties({
        display: visible ? "flex" : "none",
      });
    } else if (this.panelEntity?.object3D) {
      this.panelEntity.object3D.visible = visible;
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
    this.panelDoc        = doc;

    console.log("[REC-UI] _wirePanel called");

    if (this.panelEntity?.object3D) {
      this.panelEntity.object3D.visible = true;
    }
    (doc.rootElement as any).setProperties({ display: this.prevVisible ? "flex" : "none" });

    // Apply initial button states
    this._applyState(this.prevState);

    const recBtnEl = doc.getElementById("rec-btn");
    const playBtnEl = doc.getElementById("play-btn");
    console.log("[REC-UI] rec-btn found:", !!recBtnEl, "play-btn found:", !!playBtnEl);

    recBtnEl?.addEventListener("click", () => {
      console.log("[REC-UI] Record button clicked, isRecording:", recordingManager.isRecording);
      recordingManager.toggleRecording();
    });

    playBtnEl?.addEventListener("click", () => {
      console.log("[REC-UI] Play button clicked, isPlaying:", recordingManager.isPlaying);
      if (recordingManager.isPlaying) {
        recordingManager.stopPlayback();
      } else {
        recordingManager.playRecording();
      }
    });

    // Make panel double-sided (UIKit builds geometry async)
    setTimeout(() => {
      this.panelEntity?.object3D?.traverse((obj: any) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: any) => { m.side = 2; });
        }
      });
    }, 200);
  }
}
