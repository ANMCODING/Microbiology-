import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ColeusPlant } from "../geometry/coleusPlant";
import { VARIETIES } from "../constants/theme";
import { varietyFromPlant } from "../geometry/varietyFromPlant";
import { getPlant } from "../data/loader";
import { computePlantMorph } from "../sim/growth";
import { computeArmStress } from "../sim/treatments";
import { computeMetaboliteIntensity } from "../sim/molecular";
import { computePlantHealth, mortalityProfileFor } from "../sim/mortality";
import {
  computeAnomaly, applyAnomaly,
  computePlantNoise, applyPlantNoise,
} from "../sim/anomalies";
import { activeArm, weekOf } from "../types";
import type { ExperimentArm, SimulationState, VarietyConfig, VarietyId } from "../types";

/** Resolve which `VarietyConfig` to render the bench's plants with.
 *  Non-Coleus species use a synthesized variety from their JSON geometry;
 *  Coleus benches keep the original cultivar dropdown ("Wizard", "Black
 *  Dragon", "Lime Delight") for back-compatibility. */
function resolveVariety(arm: ExperimentArm): VarietyConfig {
  if (arm.plantId && arm.plantId !== "coleus") {
    const p = getPlant(arm.plantId);
    if (p) return varietyFromPlant(p);
  }
  return VARIETIES[arm.variety as VarietyId];
}

interface PlantSlot {
  plantIndex: number;
  plant: ColeusPlant;
  pad: THREE.Mesh;
  /** world position, used when laying out a fresh grid */
  position: THREE.Vector3;
}

const SPACING_TIGHT = 1.5;   // for >9 plants
const SPACING_WIDE  = 2.0;   // for ≤9 plants

/**
 * The 3D bench for a *single* experiment arm.
 *
 * `setActiveArm(arm)` rebuilds plants only when variety or count changes.
 * `update(state)` is called every frame and just animates the existing slots.
 */
export class GreenhouseScene {
  public scene = new THREE.Scene();
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public canvas: HTMLCanvasElement;

  private slots: PlantSlot[] = [];
  private currentArm: ExperimentArm | null = null;
  private isMolecular = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;  // softer than PCFSoft
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ACES Filmic tone mapping + slight exposure bump makes dark greens and
    // the anthocyanin magentas read much closer to real photographs under
    // the same lighting rig.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(0x07090d);
    this.scene.fog = new THREE.Fog(0x07090d, 16, 38);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(7.5, 6.5, 9.0);
    this.camera.lookAt(0, 1.4, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 26;
    this.controls.target.set(0, 1.4, 0);

    this.setupLights();
    this.buildGround();
  }

  private setupLights(): void {
    // Hemisphere light = warm sky + cool ground, gives more volumetric
    // ambient than a flat AmbientLight. Cheap replacement for an IBL.
    const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x1a0e07, 0.7);
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight(0x2a3a4a, 0.20);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff4d8, 1.15);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 4;   // softer VSM penumbra
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x80cfff, 0.30);
    fill.position.set(-5, 6, -4);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0x4fd1c5, 0.5, 18, 2);
    rim.position.set(0, 5, -6);
    this.scene.add(rim);
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({
        color: 0x10141c, roughness: 0.95, metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(20, 20, 0x1f2a3a, 0x141a25);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    this.scene.add(grid);
  }

  /** Lay plants out as a near-square grid of plantCount cells. */
  private gridFor(plantCount: number): { cols: number; rows: number; spacing: number } {
    const cols = Math.max(1, Math.ceil(Math.sqrt(plantCount)));
    const rows = Math.max(1, Math.ceil(plantCount / cols));
    const spacing = plantCount > 9 ? SPACING_TIGHT : SPACING_WIDE;
    return { cols, rows, spacing };
  }

  private clearSlots(): void {
    for (const s of this.slots) {
      this.scene.remove(s.plant.root);
      s.plant.dispose();
      this.scene.remove(s.pad);
      (s.pad.geometry as THREE.BufferGeometry).dispose();
      (s.pad.material as THREE.Material).dispose();
    }
    this.slots = [];
  }

  /**
   * Switch to (or refresh) the given arm. Rebuilds the 3D plants only when
   * variety or plant count changed; cheap when only chemistry sliders moved.
   */
  setActiveArm(arm: ExperimentArm): void {
    const sameStructure =
      this.currentArm &&
      this.currentArm.variety === arm.variety &&
      this.currentArm.plantId === arm.plantId &&
      this.currentArm.plantCount === arm.plantCount;

    // always update color of pads (cheap)
    if (sameStructure) {
      this.currentArm = arm;
      this.recolorPads(arm.color);
      return;
    }

    this.clearSlots();
    this.currentArm = arm;

    const variety = resolveVariety(arm);
    const { cols, rows, spacing } = this.gridFor(arm.plantCount);

    for (let i = 0; i < arm.plantCount; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = (c - (cols - 1) / 2) * spacing;
      const z = (r - (rows - 1) / 2) * spacing;

      const plant = new ColeusPlant(variety, { plantIndex: i, armId: arm.id });
      plant.root.position.set(x, 0, z);
      this.scene.add(plant.root);

      const pad = new THREE.Mesh(
        new THREE.RingGeometry(spacing > SPACING_TIGHT ? 0.5 : 0.4, spacing > SPACING_TIGHT ? 0.62 : 0.5, 32),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(arm.color),
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(x, 0.011, z);
      this.scene.add(pad);

      this.slots.push({ plantIndex: i, plant, pad, position: new THREE.Vector3(x, 0, z) });
    }

    if (this.isMolecular) this.setMolecularMode(true);
  }

  private recolorPads(hex: string): void {
    const c = new THREE.Color(hex);
    for (const s of this.slots) {
      (s.pad.material as THREE.MeshBasicMaterial).color.copy(c);
    }
  }

  setMolecularMode(on: boolean): void {
    this.isMolecular = on;
    for (const s of this.slots) s.plant.setMolecularMode(on);
  }

  update(state: SimulationState, dt = 0): void {
    const arm = activeArm(state);
    if (!arm) return;

    if (
      !this.currentArm ||
      this.currentArm.id !== arm.id ||
      this.currentArm.variety !== arm.variety ||
      this.currentArm.plantId !== arm.plantId ||
      this.currentArm.plantCount !== arm.plantCount ||
      this.currentArm.color !== arm.color
    ) {
      this.setActiveArm(arm);
    }

    const week = weekOf(state.day);
    const baseStress = computeArmStress(arm, state.day);
    const metab = computeMetaboliteIntensity(arm, state.day);
    const phototropism = Math.min(0.26, state.day / 60 * 0.26);

    const profile = mortalityProfileFor(arm.plantId);

    for (const s of this.slots) {
      const noise   = computePlantNoise(state, arm, s.plantIndex);
      const anomaly = computeAnomaly(state, arm, s.plantIndex);

      // Per-plant mortality state (deterministic from arm config + day)
      const health = computePlantHealth(arm, s.plantIndex, state.day, state);

      let stress = applyPlantNoise(baseStress, noise);
      if (anomaly.kind !== "none") stress = applyAnomaly(stress, anomaly);

      // Dead plants: freeze growth at the moment of death and amplify
      // necrosis/chlorosis to a max so the renderer paints them fully
      // brown. We compute a "frozen" morph evaluated at the death week.
      const evalWeek = health.alive ? week : weekOf(health.deathDay);
      // amplify stress on dead plants so the greying is unmistakable
      if (!health.alive) {
        stress = {
          ...stress,
          necrosis: 1.0,
          chlorosis: 1.0,
          wilting: 1.0,
          curl: Math.max(stress.curl, 0.7),
          stomatalClose: 1.0,
          heightSuppress: Math.max(stress.heightSuppress, 0.4),
        };
      }
      const morph = computePlantMorph(evalWeek, stress);
      morph.height    *= noise.vigor;
      morph.leafScale *= 1 + (noise.vigor - 1) * 0.5;
      morph.leafPairs  = Math.max(0, morph.leafPairs + noise.leafBias);
      morph.dropPairs  = Math.min(morph.leafPairs, morph.dropPairs);

      if (!health.alive) {
        morph.dead = true;
        // Dead plants drop most of their leaves but keep a few skeletal
        // ones at the top (more visually informative than a bare stick).
        morph.dropPairs = Math.max(0, morph.leafPairs - 2);
      } else if (health.damage > 0) {
        // Alive but damaged: progressive leaf drop based on accumulated
        // damage as a fraction of the lethal dose. ≥80% damage = lose
        // half the leaves, near-death plants look ratty before they go.
        const damageFrac = Math.min(1, health.damage / Math.max(0.01, profile.lethalDose));
        const extraDrop = Math.round(morph.leafPairs * 0.5 * Math.max(0, damageFrac - 0.4));
        morph.dropPairs = Math.min(morph.leafPairs, morph.dropPairs + extraDrop);
      }

      const isFocused = state.selectedPlantIndex === s.plantIndex;
      const padMat = s.pad.material as THREE.MeshBasicMaterial;
      padMat.opacity = isFocused
        ? 0.85 + 0.15 * Math.sin(performance.now() / 220)
        : 0.7;
      // Dead-plant pad: dim it so the bench tells you visually
      if (!health.alive) padMat.opacity *= 0.35;

      s.plant.update(morph, stress, metab, phototropism, anomaly, dt);
    }
  }

  /**
   * Map a click on the canvas to the nearest plant slot, or null.
   *
   * Strategy: intersect the pick ray with the ground plane (y=0) and pick
   * the slot whose (x, z) pad position is closest to the hit point, as long
   * as it's within a generous radius. This is reliable regardless of the
   * plant's current height / canopy shape.
   *
   * Fallback: if the ray doesn't hit the ground plane (camera looking up),
   * try a tall capsule around each slot.
   */
  pickPlantAt(clientX: number, clientY: number): number | null {
    if (!this.slots.length) return null;

    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width)  *  2 - 1,
      ((clientY - rect.top)  / rect.height) * -2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);

    // generous selection radius around each pot — bigger grids cluster pots
    // closer together so use half the spacing.
    const spacing = this.slots.length > 9 ? SPACING_TIGHT : SPACING_WIDE;
    const pickRadius = spacing * 0.6;

    // 1) Ground-plane pick — fast and works for the typical overhead view
    const groundHit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (ray.ray.intersectPlane(plane, groundHit)) {
      let bestIdx: number | null = null;
      let bestDist = Infinity;
      for (const s of this.slots) {
        const dx = groundHit.x - s.position.x;
        const dz = groundHit.z - s.position.z;
        const d = Math.hypot(dx, dz);
        if (d < bestDist) { bestDist = d; bestIdx = s.plantIndex; }
      }
      if (bestIdx !== null && bestDist <= pickRadius) return bestIdx;
    }

    // 2) Fallback: tall bounding sphere per plant (handles extreme angles)
    let fbIdx: number | null = null;
    let fbDist = Infinity;
    for (const s of this.slots) {
      const center = s.position.clone().add(new THREE.Vector3(0, 1.8, 0));
      const hit = ray.ray.intersectSphere(new THREE.Sphere(center, 2.0), new THREE.Vector3());
      if (hit) {
        const d = hit.distanceTo(this.camera.position);
        if (d < fbDist) { fbDist = d; fbIdx = s.plantIndex; }
      }
    }
    return fbIdx;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
