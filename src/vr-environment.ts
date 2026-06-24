import { createSystem, DomeGradient, IBLGradient } from "@iwsdk/core";

/**
 * VREnvironmentSystem — Set up cozy minimalista VR background on level load.
 * AR uses realistic lighting; VR gets warm, soft, meditative atmosphere.
 */
export class VREnvironmentSystem extends createSystem({}) {
  init() {
    // Configure background when a level loads (active level changes)
    this.world.activeLevel.subscribe((level) => {
      if (!level) return;

      // Cozy warm gradient — soft cream sky, warm horizon, tan ground
      level.addComponent(DomeGradient, {
        sky: [0.85, 0.80, 0.75, 1.0], // Soft warm cream
        equator: [0.88, 0.75, 0.65, 1.0], // Warm peach
        ground: [0.65, 0.60, 0.55, 1.0], // Warm tan
        intensity: 0.9,
      });

      // Matching warm IBL for soft lighting
      level.addComponent(IBLGradient, {
        sky: [0.80, 0.75, 0.70, 1.0],
        equator: [0.82, 0.70, 0.60, 1.0],
        ground: [0.60, 0.55, 0.50, 1.0],
        intensity: 0.95,
      });
    });
  }
}
