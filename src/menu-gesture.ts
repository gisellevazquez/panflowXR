import {
  createSystem,
  InputComponent,
} from "@iwsdk/core";

const GESTURE_HOLD_SEC = 0.8;

/**
 * MenuGestureSystem — right-pinch hold toggles the launcher dock.
 *
 * Works with both controllers and hand-tracking. Left pinch is reserved for
 * the settings panel (MenuSystem). Does nothing while the tutorial is active.
 */
export class MenuGestureSystem extends createSystem({}) {
  private pinchHeldSec = 0;
  private gestureEnabled = false;

  init() {
    const enableGesture = () => { this.gestureEnabled = true; };
    const disableGesture = () => { this.gestureEnabled = false; };

    window.addEventListener("panflow-tutorial-ended", enableGesture);
    window.addEventListener("panflow-tutorial-started", disableGesture);

    this.cleanupFuncs.push(() => {
      window.removeEventListener("panflow-tutorial-ended", enableGesture);
      window.removeEventListener("panflow-tutorial-started", disableGesture);
    });
  }

  update(delta: number) {
    if (!this.gestureEnabled) return;

    const pinching = this.input.gamepads.right?.getButtonPressed(InputComponent.Trigger) ?? false;
    if (pinching) {
      this.pinchHeldSec += delta;
      if (this.pinchHeldSec >= GESTURE_HOLD_SEC) {
        this.pinchHeldSec = 0;
        window.dispatchEvent(new Event("panflow-toggle-launcher"));
      }
    } else {
      this.pinchHeldSec = 0;
    }
  }
}
