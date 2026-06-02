import {
  createSystem,
  Group,
  PanelUI,
  PanelDocument,
  PokeInteractable,
  RayInteractable,
  UIKitDocument,
  VisibilityState,
  Vector3,
} from "@iwsdk/core";

import { Handpan } from "./handpan.js";
import { productInfoManager } from "./product-info.js";

// Launcher sits this many metres below the handpan centre
const LAUNCHER_Y_BELOW = 0.18;

export class LauncherSystem extends createSystem({
  handpans: { required: [Handpan] },
}) {
  private panelEntity: ReturnType<typeof this.world.createTransformEntity> | null = null;
  private _hasHandpan = false;

  // Pre-allocated scratch vectors — never allocate in update()
  private _hpPos!:   Vector3;
  private _headPos!: Vector3;

  init() {
    this._hpPos   = new Vector3();
    this._headPos = new Vector3();

    const group   = new Group();
    group.visible = true;

    this.panelEntity = this.world.createTransformEntity(group, { parent: this.world.sceneEntity });

    this.panelEntity.addComponent(PanelUI, {
      config:    "./ui/launcher.json",
      maxWidth:  0.15,
      maxHeight: 0.45,
    });

    // Add interactables once XR is active
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

    // Poll for panel document (no PanelDocument query in this system)
    const pollDoc = () => {
      if (!this.panelEntity) return;
      const doc = PanelDocument.data.document[this.panelEntity.index] as UIKitDocument | undefined;
      if (doc) {
        this._wirePanel(doc);
      } else {
        setTimeout(pollDoc, 100);
      }
    };
    setTimeout(pollDoc, 300);
  }

  update(_delta: number, _time: number) {
    if (!this.panelEntity?.object3D || !this.player.head) return;

    // Track the handpan's current world position every frame
    this._hasHandpan = false;
    for (const e of this.queries.handpans.entities) {
      e.object3D!.getWorldPosition(this._hpPos);
      this._hasHandpan = true;
      break;
    }
    if (!this._hasHandpan) return;

    // Stick to the bottom-centre of the handpan
    const obj = this.panelEntity.object3D;
    obj.position.set(this._hpPos.x, this._hpPos.y - LAUNCHER_Y_BELOW, this._hpPos.z);

    // Always face the player (Y-axis lock keeps panel upright)
    this.player.head.getWorldPosition(this._headPos);
    this._headPos.y = obj.position.y;
    obj.lookAt(this._headPos);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _wirePanel(doc: UIKitDocument): void {
    // Make panel double-sided
    setTimeout(() => {
      this.panelEntity?.object3D?.traverse((obj: any) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: any) => { m.side = 2; });
        }
      });
    }, 200);

    doc.getElementById("launcher-product")?.addEventListener("click", () => {
      productInfoManager.enabled = true;
      window.dispatchEvent(new Event("panflow-open-product"));
    });

    doc.getElementById("launcher-settings")?.addEventListener("click", () => {
      window.dispatchEvent(new Event("panflow-open-settings"));
    });
  }
}
