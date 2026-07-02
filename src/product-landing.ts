import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  fetchLatestInstrument,
  fetchInstrumentById,
  fetchLocalInstrumentById,
  fetchLocalLatestInstrument,
  type CustomInstrument,
  type InstrumentSource,
} from "./instrument-loader.js";

// ── Scene setup ──────────────────────────────────────────────────────────
const previewEl = document.getElementById("preview")!;
const loadingEl = document.getElementById("preview-loading")!;
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  38,
  previewEl.clientWidth / previewEl.clientHeight,
  0.1,
  50,
);
camera.position.set(0, 0.2, 2.8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(previewEl.clientWidth, previewEl.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setClearColor(0x000000, 0);
previewEl.appendChild(renderer.domElement);

// ── Lighting ─────────────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0x8899bb, 0.6);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffeedd, 2.5);
keyLight.position.set(2, 1.5, 2);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x6688cc, 1.8);
rimLight.position.set(-1.5, -0.3, -1);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0x8899aa, 0.8);
fillLight.position.set(0, 0.6, 0.5);
scene.add(fillLight);

// ── Load handpan model ──────────────────────────────────────────────────
const modelGroup = new THREE.Group();
scene.add(modelGroup);

const gltfLoader = new GLTFLoader();
const DEFAULT_MODEL_URL = new URL(
  "gltf/handpan/hand_pan.glb",
  document.baseURI,
).href;

let modelLoaded = false;

function hideLoading(): void {
  loadingEl.classList.add("hidden");
}

async function loadModel(url: string): Promise<void> {
  try {
    const gltf = await gltfLoader.loadAsync(url);
    modelGroup.clear();

    const model = gltf.scene;
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const mat of mats) {
          if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            const stdMat = mat as THREE.MeshStandardMaterial;
            stdMat.needsUpdate = true;
          }
        }
      }
    });

    modelGroup.add(model);
    model.position.set(0, -0.15, 0);
    model.rotation.set(-0.35, 0, 0);

    if (!modelLoaded) {
      modelLoaded = true;
      hideLoading();
    }
  } catch (err) {
    console.warn("[product-landing] model load failed:", err);
    if (!modelLoaded) {
      modelLoaded = true;
      hideLoading();
    }
  }
}

// Start loading default model immediately
loadModel(DEFAULT_MODEL_URL);

// ── Render loop ──────────────────────────────────────────────────────────
function animate(): void {
  requestAnimationFrame(animate);
  modelGroup.rotation.y += 0.003;
  renderer.render(scene, camera);
}
animate();

// ── Resize ───────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = previewEl.clientWidth / previewEl.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(previewEl.clientWidth, previewEl.clientHeight);
});

// ── Metadata binding ─────────────────────────────────────────────────────
function parseInstrumentSource(raw: string | null): InstrumentSource {
  return raw === "local" ? "local" : "supabase";
}

const appBase = new URL("./", document.baseURI).href;

function buildAppUrl(
  instrumentId: string | null,
  source: InstrumentSource,
  mode: "ar" | "vr",
): string {
  const params = new URLSearchParams();
  if (source !== "supabase") params.set("source", source);
  if (instrumentId) params.set("instrument", instrumentId);
  params.set("mode", mode);

  const qs = params.toString();
  return qs ? `${appBase}?${qs}` : appBase;
}

function populateSidebar(inst: CustomInstrument): void {
  document.title = `${inst.name} — Panflow`;
  document.getElementById("product-name")!.textContent = inst.name;

  // Badges
  const badgesEl = document.getElementById("badges")!;
  badgesEl.innerHTML = "";
  if (inst.material) {
    const materialBadge = document.createElement("span");
    materialBadge.className = "badge";
    materialBadge.textContent = inst.material.replace(/_/g, " ");
    badgesEl.appendChild(materialBadge);
  }
  if (inst.scale_name) {
    const scaleBadge = document.createElement("span");
    scaleBadge.className = "badge muted";
    scaleBadge.textContent = inst.scale_name;
    badgesEl.appendChild(scaleBadge);
  }
  if (!inst.material && !inst.scale_name) {
    const defaultBadge = document.createElement("span");
    defaultBadge.className = "badge";
    defaultBadge.textContent = "Handpan";
    badgesEl.appendChild(defaultBadge);
  }

  // Specs
  document.getElementById("spec-scale")!.textContent =
    inst.scale_name ?? "Standard";
  document.getElementById("spec-zones")!.textContent =
    String(inst.zone_count);

  // Description (optional)
  if (inst.material) {
    const desc = `This ${inst.material.replace(/_/g, " ")} handpan in ${
      inst.scale_name ?? "standard"
    } scale delivers rich, resonant tones across ${
      inst.zone_count
    } individually tuned zones.`;
    document.getElementById("product-description")!.textContent = desc;
  }

  // Load model from instrument URL if different from default
  const modelUrl = inst.model_url;
  if (modelUrl && modelUrl !== DEFAULT_MODEL_URL) {
    loadModel(modelUrl);
  }
}

function setMissingState(): void {
  document.title = "Product Not Found — Panflow";
  document.getElementById("product-name")!.textContent = "Instrument Not Found";
  document.getElementById("badges")!.innerHTML = "";
  document.getElementById("spec-scale")!.textContent = "—";
  document.getElementById("spec-zones")!.textContent = "—";
  document.getElementById("product-description")!.textContent =
    "This instrument could not be found. Try scanning a different QR code or visiting the main Panflow page.";
  document.getElementById("price")!.textContent = "—";
}

function setCtaLinks(
  instrumentId: string | null,
  source: InstrumentSource,
): void {
  const arBtn = document.getElementById("cta-ar") as HTMLAnchorElement;
  const vrBtn = document.getElementById("cta-vr") as HTMLAnchorElement;

  arBtn.href = buildAppUrl(instrumentId, source, "ar");
  vrBtn.href = buildAppUrl(instrumentId, source, "vr");
}

// ── Boot: fetch instrument and populate ──────────────────────────────────
async function boot(): Promise<void> {
  const urlParams = new URLSearchParams(window.location.search);
  const instrumentId = urlParams.get("instrument");
  const source = parseInstrumentSource(urlParams.get("source"));

  setCtaLinks(instrumentId, source);

  let instrument: CustomInstrument | null = null;

  try {
    if (source === "local") {
      instrument = instrumentId
        ? await fetchLocalInstrumentById(instrumentId)
        : await fetchLocalLatestInstrument();
    } else {
      instrument = instrumentId
        ? await fetchInstrumentById(instrumentId)
        : await fetchLatestInstrument();
    }
  } catch {
    // Fall through to missing state
  }

  if (instrument) {
    populateSidebar(instrument);
  } else {
    setMissingState();
  }
}

boot();
