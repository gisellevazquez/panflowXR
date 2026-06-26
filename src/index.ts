import {
  AssetManifest,
  AssetType,
  AssetManager,
  World,
  SessionMode,
  OneHandGrabbable,
  CylinderGeometry,
  MeshStandardMaterial,
  Mesh,
  Object3D,
} from "@iwsdk/core";

import { Handpan, HandpanSystem, handpanLockManager, setCustomAudioUrls } from "./handpan.js";
import { fetchLatestInstrument } from "./instrument-loader.js";
import { BubbleSystem }           from "./bubbles.js";
import { reverbManager }          from "./reverb.js";
import { ambientManager }         from "./ambient.js";
import { MenuSystem }             from "./ui.js";
import { ProductInfoSystem }      from "./product-info.js";
import { MelodySystem }           from "./melody.js";
import { RecordingSystem, recordingManager } from "./recording-system.js";
import { LauncherSystem }         from "./launcher.js";
import { VREnvironmentSystem }    from "./vr-environment.js";

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

  // ── Bubble pop sounds — 16 singing-bowl recordings (BG = big, SM = small) ──
  bowl_00: { url: "./audio/bubbles/Kasper - Singing Bowls - 04 Bowl 1 Articulation 1 Microphone 1 BG.mp3", type: AssetType.Audio, priority: "background" },
  bowl_01: { url: "./audio/bubbles/Kasper - Singing Bowls - 06 Bowl 1 Articulation 2 Microphone 1 BG.mp3", type: AssetType.Audio, priority: "background" },
  bowl_02: { url: "./audio/bubbles/Kasper - Singing Bowls - 08 Bowl 1 Articulation 3 Microphone 1 SM.mp3", type: AssetType.Audio, priority: "background" },
  bowl_03: { url: "./audio/bubbles/Kasper - Singing Bowls - 10 Bowl 1 Articulation 4 Microphone 1 BG.mp3", type: AssetType.Audio, priority: "background" },
  bowl_04: { url: "./audio/bubbles/Kasper - Singing Bowls - 12 Bowl 2 Articulation 1 Microphone 1 SM.mp3", type: AssetType.Audio, priority: "background" },
  bowl_05: { url: "./audio/bubbles/Kasper - Singing Bowls - 14 Bowl 2 Articulation 2 Microphone 1 SM.mp3", type: AssetType.Audio, priority: "background" },
  bowl_06: { url: "./audio/bubbles/Kasper - Singing Bowls - 16 Bowl 2 Articulation 3 Microphone 1 SM.mp3", type: AssetType.Audio, priority: "background" },
  bowl_07: { url: "./audio/bubbles/Kasper - Singing Bowls - 18 Bowl 2 Articulation 4 Microphone 1 SM.mp3", type: AssetType.Audio, priority: "background" },
  bowl_08: { url: "./audio/bubbles/Kasper - Singing Bowls - 20 Bowl 3 Articulation 1 Microphone 1 SM.mp3", type: AssetType.Audio, priority: "background" },
  bowl_09: { url: "./audio/bubbles/Kasper - Singing Bowls - 22 Bowl 3 Articulation 2 Microphone 1 SM.mp3", type: AssetType.Audio, priority: "background" },
  bowl_10: { url: "./audio/bubbles/Kasper - Singing Bowls - 24 Bowl 3 Articulation 3 Microphone 1 SM.mp3", type: AssetType.Audio, priority: "background" },
  bowl_11: { url: "./audio/bubbles/Kasper - Singing Bowls - 26 Bowl 3 Articulation 4 Microphone 1 sm.mp3", type: AssetType.Audio, priority: "background" },
  bowl_12: { url: "./audio/bubbles/Kasper - Singing Bowls - 28 Bowl 4 Articulation 1 Microphone 1 BG.mp3", type: AssetType.Audio, priority: "background" },
  bowl_13: { url: "./audio/bubbles/Kasper - Singing Bowls - 30 Bowl 4 Articulation 2 Microphone 1 BG.mp3", type: AssetType.Audio, priority: "background" },
  bowl_14: { url: "./audio/bubbles/Kasper - Singing Bowls - 32 Bowl 4 Articulation 3 Microphone 1 SM.mp3", type: AssetType.Audio, priority: "background" },
  bowl_15: { url: "./audio/bubbles/Kasper - Singing Bowls - 34 Bowl 4 Articulation 4 Microphone 1 BG.mp3", type: AssetType.Audio, priority: "background" },
};

// Read XR mode from URL query param or localStorage (default: AR)
const urlParams = new URLSearchParams(window.location.search);
const xrMode = (urlParams.get("mode") as "ar" | "vr" | null) ?? (localStorage.getItem("xr-mode") as "ar" | "vr" | null) ?? "ar";
const isVrMode = xrMode === "vr";
localStorage.setItem("xr-mode", xrMode);

// Fetch custom instrument in background — does not block world creation
const instrumentPromise = fetchLatestInstrument();

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets,
  render: { stencil: true },
  xr: {
    sessionMode: isVrMode ? SessionMode.ImmersiveVR : SessionMode.ImmersiveAR,
    offer: "none",
    features: isVrMode
      ? { handTracking: { required: true }, layers: true }
      : {
          handTracking:   { required: true },
          anchors:        true,
          hitTest:        false,
          planeDetection: true,
          meshDetection:  false,
          layers:         true,
        },
  },
  features: {
    locomotion:          isVrMode,
    grabbing:            true,
    physics:             isVrMode,
    sceneUnderstanding:  !isVrMode,
    environmentRaycast:  false,
  },
}).then((world) => {

  // ── Reverb & ambient ─────────────────────────────────────────────────────
  const initAudio = () => {
    if (reverbManager.audioContext) return;
    const ok = reverbManager.init();
    if (ok) {
      ambientManager.init(
        reverbManager.audioContext,
        (node) => node.connect(reverbManager.audioContext.destination),
      );
    }
  };

  world.renderer.xr.addEventListener("sessionstart", initAudio);
  world.renderer.xr.addEventListener("sessionstart", () => {
    window.dispatchEvent(new Event("panflow-xr-started"));
  });

  // Set panflowEnterXR immediately — custom instrument loads in background
  (window as any).panflowEnterXR = () => world.launchXR();
  (window as any).panflowXRMode   = xrMode; // lets landing.ts know which mode was loaded
  (window as any).panflowRecording = recordingManager;

  // ── Handpan (default) ────────────────────────────────────────────────────
  const gltf = AssetManager.getGLTF("handpan");
  let handpanMesh: Object3D;

  if (gltf) {
    handpanMesh = gltf.scene.clone();
  } else {
    const geo = new CylinderGeometry(0.28, 0.28, 0.06, 48);
    const mat = new MeshStandardMaterial({ color: 0x3a3530, metalness: 0.8, roughness: 0.3 });
    handpanMesh = new Mesh(geo, mat);
  }

  handpanMesh.position.set(0, 0.85, -0.35);
  handpanMesh.scale.setScalar(0.35);

  const handpanEntity = world
    .createTransformEntity(handpanMesh, { parent: world.sceneEntity })
    .addComponent(Handpan)
    .addComponent(OneHandGrabbable, { rotate: true, translate: true });

  handpanLockManager.entity = handpanEntity;

  document.addEventListener("handpan-note", (e: Event) => {
    const { index } = (e as CustomEvent).detail;
    console.log(`Handpan zone ${index} triggered`);
  });

  // Apply custom audio URLs once instrument fetch resolves
  instrumentPromise.then((instrument) => {
    if (instrument?.audio_urls) {
      setCustomAudioUrls(instrument.audio_urls);
    }
  });

  // ── Systems ───────────────────────────────────────────────────────────────
  world.registerSystem(HandpanSystem);
  world.registerSystem(BubbleSystem);
  world.registerSystem(MenuSystem);
  world.registerSystem(ProductInfoSystem);
  world.registerSystem(MelodySystem);
  world.registerSystem(RecordingSystem);
  world.registerSystem(LauncherSystem);

  if (isVrMode) {
    world.registerSystem(VREnvironmentSystem);
  }
});
