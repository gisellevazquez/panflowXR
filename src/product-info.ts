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

export const productInfoManager = { enabled: false };

const PROXIMITY_DIST = 1.5;  // metres — panel only shows within this range
const PANEL_OFFSET_X = 0.55; // world-right offset from handpan centre

export class ProductInfoSystem extends createSystem({
  handpans:         { required: [Handpan] },
  configuredPanels: { required: [PanelUI, PanelDocument] },
}) {
  private panelEntity:     Entity        | null = null;
  private panelDoc:        UIKitDocument | null = null;
  private documentWiredUp                = false;
  private prevVisible                    = false;

  // Pre-allocated — never allocate in update()
  private handpanPos = new Vector3();
  private headPos    = new Vector3();
  private lookTarget = new Vector3();

  init() {
    const group   = new Group();
    group.visible = false;

    this.panelEntity = this.world.createTransformEntity(group, { parent: this.world.sceneEntity });
    this.panelEntity.addComponent(PanelUI, {
      config:    "./ui/product-info.json",
      maxWidth:  0.45,
      maxHeight: 0.50,
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

    // Wire document once PanelUI has loaded its config
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

  update(_delta: number, _time: number) {
    if (!this.panelEntity) return;

    // Single handpan — grab first match without spreading
    let handpanEntity: Entity | undefined;
    for (const e of this.queries.handpans.entities) { handpanEntity = e; break; }
    if (!handpanEntity) return;

    handpanEntity.object3D!.getWorldPosition(this.handpanPos);
    this.player.head.getWorldPosition(this.headPos);

    const dist       = this.headPos.distanceTo(this.handpanPos);
    const shouldShow = productInfoManager.enabled && dist < PROXIMITY_DIST;

    if (shouldShow) {
      // Float to the right of the handpan, slightly raised
      const obj = this.panelEntity.object3D!;
      obj.position.set(
        this.handpanPos.x + PANEL_OFFSET_X,
        this.handpanPos.y + 0.05,
        this.handpanPos.z,
      );
      // Face the player — Y-axis only so panel stays upright
      this.lookTarget.copy(this.headPos);
      this.lookTarget.y = obj.position.y;
      obj.lookAt(this.lookTarget);
    }

    if (shouldShow !== this.prevVisible) {
      this.prevVisible = shouldShow;
      this._setVisible(shouldShow);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

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

    // Switch to UIKit display management (Group stays visible=true)
    if (this.panelEntity?.object3D) {
      this.panelEntity.object3D.visible = true;
    }
    (doc.rootElement as any).setProperties({ display: "none" });

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
