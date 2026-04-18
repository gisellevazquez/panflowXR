import * as THREE from 'three';

// ── Palettes ──────────────────────────────────────────────────────────────────
const palettes = {
  A: { bgTop:'#eaf2f8', bgBot:'#9cb8d0', fog:'#c8d4e0', accent:'#a8c0d8', accentSoft:'#f4e8d0', rim:'#f8eac8', bubbleA:'#c8d8e8', bubbleB:'#e8d8c0', bubbleC:'#d8c8e0', exposure:1.18 },
  B: { bgTop:'#dbeaf2', bgBot:'#7a9cb8', fog:'#b4c4d4', accent:'#6a8aa8', accentSoft:'#e8ddc0', rim:'#f0dfb8', bubbleA:'#b8ccdc', bubbleB:'#dcc8b0', bubbleC:'#c8b8d8', exposure:1.15 },
  C: { bgTop:'#e4ecf4', bgBot:'#c8b8c8', fog:'#d0c8d4', accent:'#b8a8c0', accentSoft:'#f8e0c8', rim:'#f8d4b0', bubbleA:'#c0d0e0', bubbleB:'#e8c8b8', bubbleC:'#d8c8e0', exposure:1.2 },
};
type PaletteKey = keyof typeof palettes;

const BUBBLE_COUNT = 50;
const CYCLE_MS     = 800;

// ── Scene setup ───────────────────────────────────────────────────────────────
const container = document.getElementById('landing-scene')!;
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

// ── Gradient sky sphere ───────────────────────────────────────────────────────
const bgUniforms = {
  topColor: { value: new THREE.Color() },
  botColor: { value: new THREE.Color() },
  rimColor: { value: new THREE.Color() },
};
const bgMat = new THREE.ShaderMaterial({
  uniforms: bgUniforms,
  side: THREE.BackSide,
  vertexShader: `varying vec3 vWorld; void main(){ vWorld=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform vec3 topColor,botColor,rimColor; varying vec3 vWorld;
    void main(){
      vec3 dir=normalize(vWorld);
      float h=dir.y*.5+.5;
      vec3 col=mix(botColor,topColor,smoothstep(0.,1.,h));
      vec3 sunDir=normalize(vec3(-.35,.5,-.7));
      float glow=pow(max(dot(dir,sunDir),0.),4.);
      col=mix(col,rimColor,glow*.45);
      gl_FragColor=vec4(col,1.);
    }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), bgMat));

// ── Fog ───────────────────────────────────────────────────────────────────────
scene.fog = new THREE.FogExp2(0x000000, 0.035);

// ── Lights ────────────────────────────────────────────────────────────────────
scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x8a98b0, 0.9));
const keyLight = new THREE.DirectionalLight(0xfff4d8, 1.1);
keyLight.position.set(-6, 6, 4);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xffffff, 1.2, 30, 1.4);
rimLight.position.set(-6, 4, -6);
scene.add(rimLight);
const fill = new THREE.DirectionalLight(0xc0d4e8, 0.4);
fill.position.set(6, -2, 6);
scene.add(fill);

// ── Sun disc ──────────────────────────────────────────────────────────────────
const sunGroup = new THREE.Group();
sunGroup.position.set(-7, 3, -14);
scene.add(sunGroup);
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(1.8, 48),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false }),
);
sunGroup.add(sunDisc);
for (let i = 1; i <= 5; i++) {
  const g = new THREE.Mesh(
    new THREE.CircleGeometry(1.8 + i * 1.1, 48),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.14 - i * 0.022, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  g.position.z = -0.01 * i;
  sunGroup.add(g);
}

// ── Bubbles ───────────────────────────────────────────────────────────────────
interface Bubble {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  wobble: number;
  freq: number;
  phase: number;
}

let palette: typeof palettes[PaletteKey] = palettes.B;
const bubbleGroup = new THREE.Group();
scene.add(bubbleGroup);
const bubbles: Bubble[] = [];

function randomTint(): THREE.Color {
  const p = Math.random();
  const c = p < 0.33 ? palette.bubbleA : (p < 0.66 ? palette.bubbleB : palette.bubbleC);
  return new THREE.Color(c);
}

function spawnBubble(): void {
  const r = 0.12 + Math.pow(Math.random(), 1.8) * 0.9;
  const tint = randomTint();
  const mat = new THREE.MeshPhysicalMaterial({
    color: tint, roughness: 0.05, metalness: 0.2, transmission: 0.92,
    transparent: true, opacity: 0.7, ior: 1.25, thickness: 0.6,
    clearcoat: 1.0, clearcoatRoughness: 0.08, iridescence: 1.0,
    iridescenceIOR: 1.35, envMapIntensity: 1.2,
    emissive: tint, emissiveIntensity: 0.04,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat);
  mesh.position.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10, -6 + (Math.random() - 0.5) * 12);
  bubbleGroup.add(mesh);
  bubbles.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.1), wobble: 0.2 + Math.random() * 0.9, freq: 0.15 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2 });
}

for (let i = 0; i < BUBBLE_COUNT; i++) spawnBubble();

// ── Apply palette ─────────────────────────────────────────────────────────────
function applyPaletteDirect(p: typeof palettes[PaletteKey]): void {
  palette = p;
  renderer.toneMappingExposure = p.exposure;
  renderer.setClearColor(new THREE.Color(p.bgBot), 1);
  bgUniforms.topColor.value.set(p.bgTop);
  bgUniforms.botColor.value.set(p.bgBot);
  bgUniforms.rimColor.value.set(p.rim);
  (scene.fog as THREE.FogExp2).color.set(p.fog);
  sunDisc.material.color.set(p.accentSoft);
  sunGroup.children.forEach((c, i) => { if (i > 0) (c as THREE.Mesh<any, THREE.MeshBasicMaterial>).material.color.set(p.accent); });
  rimLight.color.set(p.rim);
}

// ── Cycle ─────────────────────────────────────────────────────────────────────
const cycleOrder: PaletteKey[] = ['A', 'B', 'C'];
let cycleFromIdx = 1; // start at B
let cycleToIdx   = 2;
let cycleT       = 0;

const tmpOut = new THREE.Color();
function lerpColor(a: string, b: string, t: number): THREE.Color {
  return tmpOut.copy(new THREE.Color(a)).lerp(new THREE.Color(b), t);
}

function applyBlended(pA: typeof palettes[PaletteKey], pB: typeof palettes[PaletteKey], t: number): void {
  const e = t * t * (3 - 2 * t);
  bgUniforms.topColor.value.copy(lerpColor(pA.bgTop, pB.bgTop, e));
  bgUniforms.botColor.value.copy(lerpColor(pA.bgBot, pB.bgBot, e));
  renderer.setClearColor(lerpColor(pA.bgBot, pB.bgBot, e).clone(), 1);
  bgUniforms.rimColor.value.copy(lerpColor(pA.rim, pB.rim, e));
  rimLight.color.copy(lerpColor(pA.rim, pB.rim, e));
  (scene.fog as THREE.FogExp2).color.copy(lerpColor(pA.fog, pB.fog, e));
  sunDisc.material.color.copy(lerpColor(pA.accentSoft, pB.accentSoft, e));
  const accentLerp = lerpColor(pA.accent, pB.accent, e).clone();
  sunGroup.children.forEach((c, i) => { if (i > 0) (c as THREE.Mesh<any, THREE.MeshBasicMaterial>).material.color.copy(accentLerp); });
  renderer.toneMappingExposure = pA.exposure * (1 - e) + pB.exposure * e;
}

// ── Mouse parallax ────────────────────────────────────────────────────────────
const mouse       = new THREE.Vector2();
const targetMouse = new THREE.Vector2();
window.addEventListener('pointermove', (e) => {
  targetMouse.x = e.clientX / window.innerWidth - 0.5;
  targetMouse.y = e.clientY / window.innerHeight - 0.5;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Init palette ──────────────────────────────────────────────────────────────
applyPaletteDirect(palettes.B);

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t  = clock.elapsedTime;

  // Parallax
  mouse.x += (targetMouse.x - mouse.x) * 0.04;
  mouse.y += (targetMouse.y - mouse.y) * 0.04;
  camera.position.x = mouse.x * 1.95 + Math.sin(t * 0.15) * 0.13;
  camera.position.y = -mouse.y * 1.3 + Math.cos(t * 0.12) * 0.10;
  camera.lookAt(0, 0, 0);

  // Auto palette cycle
  cycleT += (dt * 1000) / CYCLE_MS;
  while (cycleT >= 1) {
    cycleT -= 1;
    cycleFromIdx = cycleToIdx;
    cycleToIdx   = (cycleToIdx + 1) % cycleOrder.length;
  }
  applyBlended(palettes[cycleOrder[cycleFromIdx]], palettes[cycleOrder[cycleToIdx]], cycleT);

  bubbleGroup.rotation.y = mouse.x * 0.08;
  bubbleGroup.rotation.x = -mouse.y * 0.05;
  sunGroup.rotation.y    = mouse.x * 0.025;
  sunGroup.lookAt(camera.position);

  // Float bubbles
  bubbles.forEach((b) => {
    b.mesh.position.x += b.vel.x * dt + Math.sin(t * b.freq + b.phase) * 0.004 * b.wobble;
    b.mesh.position.y += b.vel.y * dt + Math.cos(t * b.freq * 0.8 + b.phase) * 0.004 * b.wobble;
    b.mesh.position.z += b.vel.z * dt + Math.sin(t * b.freq * 0.6 + b.phase * 1.3) * 0.003 * b.wobble;
    b.mesh.scale.setScalar(1 + Math.sin(t * 0.5 + b.phase) * 0.03);
    const p = b.mesh.position;
    if (p.x >  11) p.x = -11; if (p.x < -11) p.x = 11;
    if (p.y >   7) p.y =  -7; if (p.y <  -7) p.y =  7;
    if (p.z >   4) p.z = -12; if (p.z < -12) p.z =  4;
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ── Button ────────────────────────────────────────────────────────────────────
const enterBtn    = document.getElementById('enterBtn')    as HTMLButtonElement;
const loadingEl   = document.getElementById('landing-loading') as HTMLDivElement;
const landingEl   = document.getElementById('landing-ui')  as HTMLDivElement;
const landingScene = document.getElementById('landing-scene') as HTMLDivElement;

enterBtn.addEventListener('click', () => {
  enterBtn.disabled = true;
  enterBtn.innerHTML = '<span>Entering experience…</span><span class="arrow">◔</span>';
  loadingEl.classList.remove('hidden');

  const tryEnter = () => {
    if (typeof (window as any).panflowEnterXR === 'function') {
      (window as any).panflowEnterXR();
    } else {
      setTimeout(tryEnter, 100);
    }
  };
  tryEnter();
});

// Fade out landing when XR session starts
window.addEventListener('panflow-xr-started', () => {
  landingEl.style.transition    = 'opacity 0.8s';
  landingScene.style.transition = 'opacity 0.8s';
  landingEl.style.opacity    = '0';
  landingScene.style.opacity = '0';
  setTimeout(() => {
    landingEl.style.display    = 'none';
    landingScene.style.display = 'none';
  }, 800);
});

animate();
setTimeout(() => document.getElementById('landing-loading')?.classList.add('hidden'), 400);
