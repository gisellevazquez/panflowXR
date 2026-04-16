import {
  AssetManifest,
  AssetType,
  AssetManager,
  World,
  SessionMode,
  DistanceGrabbable,
  MovementMode,
  RayInteractable,
  CylinderGeometry,
  MeshStandardMaterial,
  Mesh,
  Object3D,
} from "@iwsdk/core";

import { Handpan, HandpanSystem, handpanLockManager } from "./handpan.js";
import { BubbleSystem }           from "./bubbles.js";
import { reverbManager }          from "./reverb.js";
import { ambientManager }         from "./ambient.js";
import { MenuSystem }             from "./ui.js";

const assets: AssetManifest = {
  handpan: { url: "./gltf/handpan/hand_pan.glb", type: AssetType.GLTF, priority: "critical" },

  // ── Handpan tone fields (9 zones, 0–8) ────────────────────────────────────
  hp_0: { url: "./audio/handpan/0.mp3", type: AssetType.Audio, priority: "background" },
  hp_1: { url: "./audio/handpan/1.mp3", type: AssetType.Audio, priority: "background" },
  hp_2: { url: "./audio/handpan/2.mp3", type: AssetType.Audio, priority: "background" },
  hp_3: { url: "./audio/handpan/3.mp3", type: AssetType.Audio, priority: "background" },
  hp_4: { url: "./audio/handpan/4.mp3", type: AssetType.Audio, priority: "background" },
  hp_5: { url: "./audio/handpan/5.mp3", type: AssetType.Audio, priority: "background" },
  hp_6: { url: "./audio/handpan/6.mp3", type: AssetType.Audio, priority: "background" },
  hp_7: { url: "./audio/handpan/7.mp3", type: AssetType.Audio, priority: "background" },
  hp_8: { url: "./audio/handpan/8.mp3", type: AssetType.Audio, priority: "background" },

  // ── Bubble pop sounds — 32 singing-bowl recordings ────────────────────────
  bowl_00: { url: "./audio/bubbles/Kasper - Singing Bowls - 04 Bowl 1 Articulation 1 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_01: { url: "./audio/bubbles/Kasper - Singing Bowls - 05 Bowl 1 Articulation 1 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_02: { url: "./audio/bubbles/Kasper - Singing Bowls - 06 Bowl 1 Articulation 2 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_03: { url: "./audio/bubbles/Kasper - Singing Bowls - 07 Bowl 1 Articulation 2 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_04: { url: "./audio/bubbles/Kasper - Singing Bowls - 08 Bowl 1 Articulation 3 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_05: { url: "./audio/bubbles/Kasper - Singing Bowls - 09 Bowl 1 Articulation 3 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_06: { url: "./audio/bubbles/Kasper - Singing Bowls - 10 Bowl 1 Articulation 4 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_07: { url: "./audio/bubbles/Kasper - Singing Bowls - 11 Bowl 1 Articulation 4 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_08: { url: "./audio/bubbles/Kasper - Singing Bowls - 12 Bowl 2 Articulation 1 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_09: { url: "./audio/bubbles/Kasper - Singing Bowls - 13 Bowl 2 Articulation 1 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_10: { url: "./audio/bubbles/Kasper - Singing Bowls - 14 Bowl 2 Articulation 2 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_11: { url: "./audio/bubbles/Kasper - Singing Bowls - 15 Bowl 2 Articulation 2 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_12: { url: "./audio/bubbles/Kasper - Singing Bowls - 16 Bowl 2 Articulation 3 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_13: { url: "./audio/bubbles/Kasper - Singing Bowls - 17 Bowl 2 Articulation 3 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_14: { url: "./audio/bubbles/Kasper - Singing Bowls - 18 Bowl 2 Articulation 4 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_15: { url: "./audio/bubbles/Kasper - Singing Bowls - 19 Bowl 2 Articulation 4 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_16: { url: "./audio/bubbles/Kasper - Singing Bowls - 20 Bowl 3 Articulation 1 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_17: { url: "./audio/bubbles/Kasper - Singing Bowls - 21 Bowl 3 Articulation 1 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_18: { url: "./audio/bubbles/Kasper - Singing Bowls - 22 Bowl 3 Articulation 2 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_19: { url: "./audio/bubbles/Kasper - Singing Bowls - 23 Bowl 3 Articulation 2 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_20: { url: "./audio/bubbles/Kasper - Singing Bowls - 24 Bowl 3 Articulation 3 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_21: { url: "./audio/bubbles/Kasper - Singing Bowls - 25 Bowl 3 Articulation 3 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_22: { url: "./audio/bubbles/Kasper - Singing Bowls - 26 Bowl 3 Articulation 4 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_23: { url: "./audio/bubbles/Kasper - Singing Bowls - 27 Bowl 3 Articulation 4 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_24: { url: "./audio/bubbles/Kasper - Singing Bowls - 28 Bowl 4 Articulation 1 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_25: { url: "./audio/bubbles/Kasper - Singing Bowls - 29 Bowl 4 Articulation 1 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_26: { url: "./audio/bubbles/Kasper - Singing Bowls - 30 Bowl 4 Articulation 2 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_27: { url: "./audio/bubbles/Kasper - Singing Bowls - 31 Bowl 4 Articulation 2 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_28: { url: "./audio/bubbles/Kasper - Singing Bowls - 32 Bowl 4 Articulation 3 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_29: { url: "./audio/bubbles/Kasper - Singing Bowls - 33 Bowl 4 Articulation 3 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
  bowl_30: { url: "./audio/bubbles/Kasper - Singing Bowls - 34 Bowl 4 Articulation 4 Microphone 1.mp3", type: AssetType.Audio, priority: "background" },
  bowl_31: { url: "./audio/bubbles/Kasper - Singing Bowls - 35 Bowl 4 Articulation 4 Microphone 2.mp3", type: AssetType.Audio, priority: "background" },
};

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    offer: "always",
    features: {
      handTracking:   { required: true },
      anchors:        true,
      hitTest:        false,
      planeDetection: true,
      meshDetection:  false,
      layers:         true,
    },
  },
  features: {
    locomotion:          false,
    grabbing:            true,
    physics:             false,
    sceneUnderstanding:  true,
    environmentRaycast:  false,
  },
}).then((world) => {

  // ── Reverb & ambient ───────────────────────────────────────────────────────
  // AudioContext requires a user gesture — XR sessionstart guarantees one.
  const initAudio = () => {
    if (reverbManager.audioContext) return;
    const ok = reverbManager.init();
    if (ok) {
      // Ambient goes directly to destination — reverb is reserved for handpan notes
      ambientManager.init(
        reverbManager.audioContext,
        (node) => node.connect(reverbManager.audioContext.destination),
      );
    }
  };

  world.renderer.xr.addEventListener("sessionstart", initAudio);

  // ── Handpan ───────────────────────────────────────────────────────────────
  const gltf = AssetManager.getGLTF("handpan");
  let handpanMesh: Object3D;

  if (gltf) {
    // Clone so IWSDK's asset cache doesn't share the same scene reference
    handpanMesh = gltf.scene.clone();
  } else {
    const geo = new CylinderGeometry(0.28, 0.28, 0.06, 48);
    const mat = new MeshStandardMaterial({ color: 0x3a3530, metalness: 0.8, roughness: 0.3 });
    handpanMesh = new Mesh(geo, mat);
  }

  // Hip height, ~35 cm in front — start at a manageable size
  handpanMesh.position.set(0, 0.85, -0.35);
  handpanMesh.scale.setScalar(0.35);

  // Explicit world.sceneEntity parent — anchors in world space, not player rig
  const handpanEntity = world
    .createTransformEntity(handpanMesh, { parent: world.sceneEntity })
    .addComponent(Handpan)
    .addComponent(RayInteractable)
    .addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveAtSource, // moves WITH hand, stays at distance
      rotate:    true,
      translate: true,
      scale:     false,
    });

  handpanLockManager.entity = handpanEntity;

  document.addEventListener("handpan-note", (e: Event) => {
    const { index } = (e as CustomEvent).detail;
    console.log(`Handpan zone ${index} triggered`);
  });

  // ── Systems ───────────────────────────────────────────────────────────────
  world.registerSystem(HandpanSystem);
  world.registerSystem(BubbleSystem);
  world.registerSystem(MenuSystem);
});
