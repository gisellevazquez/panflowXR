import type { World } from "@iwsdk/core";

import { HandpanPlacementSystem } from "../handpan-placement.js";

/** Register play-feel systems (placement, strike dynamics, etc.). */
export function registerPlaySystems(world: World): void {
  world.registerSystem(HandpanPlacementSystem, { priority: 10 });
}
