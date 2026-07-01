import {
  createSystem,
  Entity,
  Group,
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

import { Handpan } from "./handpan.js";
import { ambientManager } from "./ambient.js";
import { melodyManager } from "./melody.js";
import { zoneHighlightManager } from "./zone-highlights.js";

export const TUTORIAL_DONE_KEY = "panflow-tutorial-done";

interface TutorialStep {
  message: string;
  autoAdvanceSec: number;
}

const STEPS: TutorialStep[] = [
  { message: "Welcome. Take a breath and explore your handpan.", autoAdvanceSec: 6 },
  { message: "Touch the glowing tone fields with your fingertips.", autoAdvanceSec: 30 },
  { message: "Open settings from the dock below, or hold left pinch.", autoAdvanceSec: 25 },
  { message: "Grab and move the handpan to find your perfect position.", autoAdvanceSec: 25 },
  { message: "You're ready — explore freely.", autoAdvanceSec: 4 },
];

const GRAB_MOVE_THRESHOLD = 0.08; // metres

export const tutorialManager = {
  active: false,
  start: (): void => {},
  skip: (): void => {},
};

export class TutorialSystem extends createSystem({
  handpans: { required: [Handpan] },
}) {
  private panelEntity: Entity | null = null;
  private panelDoc: UIKitDocument | null = null;
  private documentWiredUp = false;

  private stepIndex = 0;
  private stepTimer = 0;

  // Step 2 — touch zones 0 then 4
  private touchPhase = 0;

  // Step 4 — detect handpan movement
  private readonly grabRefPos = new Vector3();
  private readonly grabCheckPos = new Vector3();
  private grabTracking = false;

  // Ambient duck during step 1
  private savedAmbientVolume = 0.15;

  init() {
    tutorialManager.start = () => this._start();
    tutorialManager.skip  = () => this._finish(true);

    const group = new Group();
    group.visible = false;

    this.panelEntity = this.world.createTransformEntity(group, { parent: this.world.sceneEntity });
    this.panelEntity.addComponent(PanelUI, {
      config:    "./ui/tutorial.json",
      maxWidth:  0.42,
      maxHeight: 0.35,
    });
    this.panelEntity.addComponent(Follower, {
      target:         this.player.head,
      offsetPosition: [0, -0.12, -0.42] as [number, number, number],
      behavior:       FollowBehavior.PivotY,
      speed:          10,
      tolerance:      0.04,
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

    this.queries.handpans.subscribe("qualify", () => {
      if (!this.documentWiredUp && this.panelEntity) {
        this._pollForDocument(this.panelEntity);
      }
    });

    const onNote = (e: Event) => {
      if (!tutorialManager.active || this.stepIndex !== 1) return;
      const zone = (e as CustomEvent<{ index: number }>).detail.index;
      if (this.touchPhase === 0 && zone === 0) {
        zoneHighlightManager.highlightZone(0, "success");
        this.touchPhase = 1;
        zoneHighlightManager.pulseZone(4, 0);
        zoneHighlightManager.highlightZone(4, "tutorial");
      } else if (this.touchPhase === 1 && zone === 4) {
        zoneHighlightManager.highlightZone(4, "success");
        this._advance();
      }
    };

    const onSettingsOpen = () => {
      if (!tutorialManager.active || this.stepIndex !== 2) return;
      this._advance();
    };

    const onRestart = () => {
      localStorage.removeItem(TUTORIAL_DONE_KEY);
      this._start();
    };

    const onXrStarted = () => {
      if (localStorage.getItem(TUTORIAL_DONE_KEY) === "1") return;
      this._start();
    };

    document.addEventListener("handpan-note", onNote);
    window.addEventListener("panflow-open-settings", onSettingsOpen);
    window.addEventListener("panflow-restart-tutorial", onRestart);
    window.addEventListener("panflow-xr-started", onXrStarted);

    this.cleanupFuncs.push(() => {
      document.removeEventListener("handpan-note", onNote);
      window.removeEventListener("panflow-open-settings", onSettingsOpen);
      window.removeEventListener("panflow-restart-tutorial", onRestart);
      window.removeEventListener("panflow-xr-started", onXrStarted);
    });
  }

  update(delta: number, _time: number) {
    if (!tutorialManager.active) return;

    this.stepTimer += delta;
    const step = STEPS[this.stepIndex];
    if (this.stepTimer >= step.autoAdvanceSec) {
      this._advance();
      return;
    }

    // Step 4 — advance when handpan moves enough
    if (this.stepIndex === 3 && this.grabTracking) {
      for (const e of this.queries.handpans.entities) {
        e.object3D!.getWorldPosition(this.grabCheckPos);
        if (this.grabRefPos.distanceTo(this.grabCheckPos) >= GRAB_MOVE_THRESHOLD) {
          this._advance();
        }
        break;
      }
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

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
    (doc.rootElement as any).setProperties({ display: "none" });

    doc.getElementById("tutorial-skip")?.addEventListener("click", () => {
      tutorialManager.skip();
    });
  }

  private _start(): void {
    if (tutorialManager.active) return;

    tutorialManager.active = true;
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.touchPhase = 0;
    this.grabTracking = false;

    melodyManager.playing = false;

    this._showPanel(true);
    this._enterStep(0);
  }

  private _advance(): void {
    this.stepIndex++;
    this.stepTimer = 0;

    if (this.stepIndex >= STEPS.length) {
      this._finish(false);
      return;
    }

    this._enterStep(this.stepIndex);
  }

  private _enterStep(index: number): void {
    const step = STEPS[index];
    this._setMessage(step.message);

    zoneHighlightManager.highlightAll(false);
    window.dispatchEvent(new CustomEvent("panflow-tutorial-highlight-launcher", {
      detail: { active: false },
    }));

    switch (index) {
      case 0:
        this.savedAmbientVolume = ambientManager.volume;
        ambientManager.setVolume(this.savedAmbientVolume * 0.35);
        break;

      case 1:
        ambientManager.setVolume(this.savedAmbientVolume);
        this.touchPhase = 0;
        zoneHighlightManager.pulseZone(0, 0);
        zoneHighlightManager.highlightZone(0, "tutorial");
        break;

      case 2:
        window.dispatchEvent(new CustomEvent("panflow-tutorial-highlight-launcher", {
          detail: { active: true },
        }));
        break;

      case 3:
        for (const e of this.queries.handpans.entities) {
          e.object3D!.getWorldPosition(this.grabRefPos);
          break;
        }
        this.grabTracking = true;
        zoneHighlightManager.highlightAll(true);
        zoneHighlightManager.pulseZone(0, 0);
        zoneHighlightManager.highlightZone(0, "tutorial");
        break;

      case 4:
        zoneHighlightManager.highlightAll(false);
        break;
    }
  }

  private _finish(skipped: boolean): void {
    tutorialManager.active = false;
    ambientManager.setVolume(this.savedAmbientVolume);
    zoneHighlightManager.highlightAll(false);
    window.dispatchEvent(new CustomEvent("panflow-tutorial-highlight-launcher", {
      detail: { active: false },
    }));

    localStorage.setItem(TUTORIAL_DONE_KEY, "1");
    this._showPanel(false);

    window.dispatchEvent(new CustomEvent("panflow-tutorial-ended", {
      detail: { skipped },
    }));
  }

  private _setMessage(text: string): void {
    const el = this.panelDoc?.getElementById("tutorial-message") as any;
    el?.setProperties({ text });
  }

  private _showPanel(visible: boolean): void {
    if (this.panelDoc) {
      (this.panelDoc.rootElement as any).setProperties({
        display: visible ? "flex" : "none",
      });
    } else if (this.panelEntity?.object3D) {
      this.panelEntity.object3D.visible = visible;
    }
  }
}
