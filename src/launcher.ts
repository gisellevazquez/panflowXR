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
import { melodyManager } from "./melody.js";
import { tutorialManager } from "./tutorial-system.js";
import { handpanPlacementManager } from "./handpan-placement.js";

// Launcher sits this many metres below the handpan centre
const LAUNCHER_Y_BELOW = 0.48;
const LAUNCHER_Y_TUTORIAL = 0.65;

export class LauncherSystem extends createSystem({
  handpans: { required: [Handpan] },
}) {
  private panelEntity: ReturnType<typeof this.world.createTransformEntity> | null = null;
  private panelDoc: UIKitDocument | null = null;
  private _hasHandpan = false;
  private settingsBtn: any = null;
  private settingsHighlighted = false;
  private highlightPhase = 0;
  private launcherRevealed = false;
  private tutorialUiLocked = true;
  private tutorialShowLauncher = false;
  private lockLbl: any = null;
  private lockBtn: any = null;

  // Pre-allocated scratch vectors — never allocate in update()
  private _hpPos!:   Vector3;
  private _headPos!: Vector3;

  init() {
    this._hpPos   = new Vector3();
    this._headPos = new Vector3();

    const group   = new Group();
    group.visible = false;

    this.panelEntity = this.world.createTransformEntity(group, { parent: this.world.sceneEntity });

    this.panelEntity.addComponent(PanelUI, {
      config:    "./ui/launcher.json",
      maxWidth:  0.50,
      maxHeight: 0.25,
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

    const onLauncherHighlight = (e: Event) => {
      this.settingsHighlighted = (e as CustomEvent<{ active: boolean }>).detail.active;
      this.highlightPhase = 0;
      if (!this.settingsHighlighted && this.settingsBtn) {
        this.settingsBtn.setProperties({
          backgroundColor: 0x221e2b,
          borderColor: 0x2d2a35,
        });
      }
    };
    window.addEventListener("panflow-tutorial-highlight-launcher", onLauncherHighlight);

    const onTutorialStarted = () => {
      this.tutorialUiLocked = true;
      this.tutorialShowLauncher = false;
      this._setLauncherVisible(false);
    };
    const onTutorialEnded = () => {
      this.tutorialUiLocked = false;
      this.tutorialShowLauncher = false;
      this._setLauncherVisible(true);
    };
    const onXrStarted = () => {
      this.tutorialUiLocked = true;
      this.tutorialShowLauncher = false;
      this._setLauncherVisible(false);
    };
    const onTutorialShowLauncher = (e: Event) => {
      const show = (e as CustomEvent<{ show: boolean }>).detail.show;
      this.tutorialShowLauncher = show;
      this._setLauncherVisible(show);
    };
    const onToggleLauncher = () => {
      if (this.tutorialUiLocked) return;
      this._setLauncherVisible(!this.launcherRevealed);
    };

    window.addEventListener("panflow-tutorial-started", onTutorialStarted);
    window.addEventListener("panflow-tutorial-ended", onTutorialEnded);
    window.addEventListener("panflow-xr-started", onXrStarted);
    window.addEventListener("panflow-tutorial-show-launcher", onTutorialShowLauncher);
    window.addEventListener("panflow-toggle-launcher", onToggleLauncher);

    this.cleanupFuncs.push(() => {
      window.removeEventListener("panflow-tutorial-highlight-launcher", onLauncherHighlight);
      window.removeEventListener("panflow-tutorial-started", onTutorialStarted);
      window.removeEventListener("panflow-tutorial-ended", onTutorialEnded);
      window.removeEventListener("panflow-xr-started", onXrStarted);
      window.removeEventListener("panflow-tutorial-show-launcher", onTutorialShowLauncher);
      window.removeEventListener("panflow-toggle-launcher", onToggleLauncher);
    });
  }

  update(delta: number, _time: number) {
    if ((this.tutorialUiLocked && !this.tutorialShowLauncher) || !this.launcherRevealed || !this.panelEntity?.object3D || !this.player.head) return;

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
    const yOffset = this.tutorialShowLauncher ? LAUNCHER_Y_TUTORIAL : LAUNCHER_Y_BELOW;
    obj.position.set(this._hpPos.x, this._hpPos.y - yOffset, this._hpPos.z);

    // Always face the player (Y-axis lock keeps panel upright)
    this.player.head.getWorldPosition(this._headPos);
    this._headPos.y = obj.position.y;
    obj.lookAt(this._headPos);

    if (this.settingsHighlighted && this.settingsBtn) {
      this.highlightPhase += delta;
      const pulse = 0.5 + 0.5 * Math.sin(this.highlightPhase * 5);
      this.settingsBtn.setProperties({
        backgroundColor: pulse > 0.5 ? 0x3d3252 : 0x221e2b,
        borderColor: 0x9e87ce,
      });
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _setLauncherVisible(visible: boolean): void {
    this.launcherRevealed = visible;
    if (this.panelEntity?.object3D) {
      this.panelEntity.object3D.visible = visible;
    }
    if (this.panelDoc) {
      (this.panelDoc.rootElement as any).setProperties({
        display: visible ? "flex" : "none",
      });
    }
  }

  private _wirePanel(doc: UIKitDocument): void {
    this.panelDoc = doc;
    this._setLauncherVisible(this.launcherRevealed);

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

    this.settingsBtn = doc.getElementById("launcher-settings") as any;

    doc.getElementById("launcher-song")?.addEventListener("click", () => {
      if (tutorialManager.active) return;
      melodyManager.mode = "guided";
      melodyManager.playing = true;
    });

    // ── Lock button ──────────────────────────────────────────
    this.lockLbl = doc.getElementById("launcher-lock-lbl") as any;
    this.lockBtn = doc.getElementById("launcher-lock") as any;

    doc.getElementById("launcher-lock")?.addEventListener("click", () => {
      handpanPlacementManager.toggle();
      this._syncLockButton();
    });

    this._syncLockButton();

    const onLockChanged = () => { this._syncLockButton(); };
    window.addEventListener("panflow-handpan-lock-changed", onLockChanged);
    this.cleanupFuncs.push(() => {
      window.removeEventListener("panflow-handpan-lock-changed", onLockChanged);
    });
  }

  // ── Private (continued) ────────────────────────────────────

  private _syncLockButton(): void {
    const locked = handpanPlacementManager.locked;
    this.lockLbl?.setProperties({ text: locked ? "Unlock" : "Lock" });
    this.lockBtn?.setProperties({
      borderColor: locked ? 0x9e87ce : 0x2d2a35,
    });
  }
}
