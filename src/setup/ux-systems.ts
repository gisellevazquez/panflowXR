import type { World } from "@iwsdk/core";

import { MenuSystem }             from "../ui.js";
import { ProductInfoSystem }      from "../product-info.js";
import { ZoneHighlightSystem }    from "../zone-highlights.js";
import { MelodySystem }           from "../melody.js";
import { TutorialSystem }         from "../tutorial-system.js";
import { RecordingSystem }        from "../recording-system.js";
import { LauncherSystem }         from "../launcher.js";
import { MenuGestureSystem }      from "../menu-gesture.js";

/** Register UX-facing systems (highlights, tutorial, menus, launcher). */
export function registerUxSystems(world: World): void {
  world.registerSystem(ZoneHighlightSystem);
  world.registerSystem(MenuSystem);
  world.registerSystem(ProductInfoSystem);
  world.registerSystem(MelodySystem);
  world.registerSystem(TutorialSystem);
  world.registerSystem(RecordingSystem);
  world.registerSystem(LauncherSystem);
  world.registerSystem(MenuGestureSystem);
}
