import {
  createSystem,
  DomeGradient,
  IBLGradient,
  Mesh,
  SphereGeometry,
  CylinderGeometry,
  ConeGeometry,
  MeshStandardMaterial,
  Group,
} from "@iwsdk/core";

/**
 * VREnvironmentSystem — Set up cozy minimalista VR background on level load.
 * Adds warm dome gradient, IBL lighting, and simple 3D objects (stacked stones,
 * distant palm trees) to create a meditative space with depth.
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

      // Add simple 3D objects for depth
      this._addEnvironmentObjects(level);
    });
  }

  private _addEnvironmentObjects(levelEntity: any): void {
    const mat = new MeshStandardMaterial({
      color: 0x8b7d6b,
      roughness: 0.7,
      metalness: 0.1,
    });

    // ── Stacked stones (left) ──────────────────────────────────────────
    const stoneStack = new Group();
    stoneStack.position.set(-4, 0.5, -8);
    for (let i = 0; i < 4; i++) {
      const r = 0.3 - i * 0.05; // Slightly smaller each level
      const stone = new Mesh(new SphereGeometry(r, 16, 12), mat.clone());
      stone.position.y = i * (r * 1.8);
      stoneStack.add(stone);
    }
    levelEntity.object3D?.add(stoneStack);

    // ── Palm tree (far right) ──────────────────────────────────────────
    const palmGroup = new Group();
    palmGroup.position.set(5, 0, -10);

    // Trunk (tapered cylinder)
    const trunkMat = new MeshStandardMaterial({
      color: 0x7a6d5f,
      roughness: 0.8,
      metalness: 0,
    });
    const trunk = new Mesh(new CylinderGeometry(0.25, 0.35, 2.5, 8), trunkMat);
    trunk.position.y = 1.25;
    palmGroup.add(trunk);

    // Fronds (cone-like group)
    const frondMat = new MeshStandardMaterial({
      color: 0x6b9d5a,
      roughness: 0.6,
      metalness: 0,
    });
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const frond = new Mesh(new ConeGeometry(0.6, 1.4, 16), frondMat.clone());
      frond.position.set(
        Math.cos(angle) * 0.4,
        2.8 + Math.sin(angle * 1.5) * 0.2,
        Math.sin(angle) * 0.4,
      );
      frond.rotation.z = angle;
      palmGroup.add(frond);
    }

    levelEntity.object3D?.add(palmGroup);

    // ── Distant rocks (far back) ───────────────────────────────────────
    const rockField = new Group();
    rockField.position.set(0, 0.2, -12);
    for (let i = 0; i < 3; i++) {
      const rock = new Mesh(
        new SphereGeometry(0.4 + Math.random() * 0.2, 12, 10),
        mat.clone(),
      );
      rock.position.set(
        (Math.random() - 0.5) * 6,
        0,
        (Math.random() - 0.5) * 3,
      );
      rock.castShadow = false;
      rockField.add(rock);
    }
    levelEntity.object3D?.add(rockField);
  }
}
