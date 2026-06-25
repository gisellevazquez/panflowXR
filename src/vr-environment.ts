import { createSystem, DomeTexture, IBLGradient } from "@iwsdk/core";

/**
 * VREnvironmentSystem — Set up immersive VR environment on level load.
 * Uses custom skybox image for visual depth and warmth, with matching IBL lighting.
 */
export class VREnvironmentSystem extends createSystem({}) {
  init() {
    // Configure background when a level loads (active level changes)
    this.world.activeLevel.subscribe((level) => {
      if (!level) return;

      // Use custom skybox image as equirectangular dome
      level.addComponent(DomeTexture, {
        src: "/textures/Skybox.png",
        intensity: 1.0,
      });

      // Soft warm IBL lighting to match skybox
      level.addComponent(IBLGradient, {
        sky: [0.80, 0.75, 0.70, 1.0],
        equator: [0.82, 0.70, 0.60, 1.0],
        ground: [0.60, 0.55, 0.50, 1.0],
        intensity: 0.9,
      });
    });
  }
}
