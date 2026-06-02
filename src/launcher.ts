import {
  createSystem,
  Group,
  Entity,
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

// Launcher hovers this many metres above the handpan centre
const LAUNCHER_Y_OFFSET = 0.38;

export class LauncherSystem extends createSystem({
  handpans: { required: [Handpan] },
}) {
  private panelEntity: Entity | null = null;
  private positioned  = false;

  // Pre-allocated scratch vectors
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

    // Wire document when loaded
    const q = this.queries as any;
    // Use configuredPanels pattern via a manual poll since we have no PanelDocument query
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

    // Position above handpan when XR session starts
    const positionOnStart = () => {
      if (this.positioned) return;
      for (const e of this.queries.handpans.entities) {
        e.object3D!.getWorldPosition(this._hpPos);
        this.panelEntity?.object3D?.position.set(
          this._hpPos.x,
          this._hpPos.y + LAUNCHER_Y_OFFSET,
          this._hpPos.z,
        );
        this.positioned = true;
        break;
      }
    };
    window.addEventListener("panflow-xr-started", positionOnStart);
    this.cleanupFuncs.push(() => window.removeEventListener("panflow-xr-started", positionOnStart));
  }

  update(_delta: number, _time: number) {
    if (!this.positioned || !this.panelEntity?.object3D || !this.player.head) return;
    // Always face the player
    this.player.head.getWorldPosition(this._headPos);
    this._headPos.y = this.panelEntity.object3D.position.y;
    this.panelEntity.object3D.lookAt(this._headPos);
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

    // Product Info button — force-show the info panel
    doc.getElementById("launcher-product")?.addEventListener("click", () => {
      productInfoManager.enabled = true;
      window.dispatchEvent(new Event("panflow-open-product"));
    });

    // Settings button — open the settings panel
    doc.getElementById("launcher-settings")?.addEventListener("click", () => {
      window.dispatchEvent(new Event("panflow-open-settings"));
    });
  }
}
