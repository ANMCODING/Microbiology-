export type VarietyId = "wizard" | "blackDragon" | "limeDelight";

/** Any chemical id from the JSON library (`src/data/chemicals/*.json`).
 *  Kept as `string` so the lab can target the full 40-chemical library
 *  rather than the original 4 hard-coded VOCs. The original ids
 *  ("ethylene", "meja", "mesa", "linalool") remain valid by design. */
export type VocId = string;
export type ChemicalId = string;

/** Any plant id from the JSON library (`src/data/plants/*.json`). */
export type PlantId = string;

/** Top-level screens: optional guide → picker → lab. */
export type ScreenMode = "guide" | "entrance" | "lab";

/** How a multi-VOC mixture is distributed:
 *  - liquid: soil drench / foliar spray
 *  - gas:    fumigation / vapor headspace
 *  - both:   mixed delivery (no extra delivery shaping)
 *  Single-VOC arms still respect this choice (mono-liquid vs mono-gas). */
export type PolyDelivery = "liquid" | "gas" | "both";

export type ViewMode = "macro" | "micro" | "molecular";

export type MicroRegion = "phyllosphere" | "rhizosphere";

/** Hard caps for the experiment builder UI. */
export const DAY_MAX = 365;
export const MAX_TABS = 6;
export const MAX_PLANTS_PER_ARM = 20;
export const MIN_PLANTS_PER_ARM = 1;

/**
 * One experiment "arm" — what the user configures in a single tab.
 *
 * The whole simulation is just a list of arms with one of them marked
 * `active`. All readouts and the 3D bench show the active arm; the
 * Analytics panel can also compare arms side by side.
 */
export interface ExperimentArm {
  id: string;            // stable id; used for anomaly seeding + UI keys
  label: string;         // user-editable tab name
  color: string;         // hex color for the tab + plant pads + chart series
  variety: VarietyId;
  /** Which plant species (from `src/data/plants/*.json`) this bench is
   *  growing. Defaults to "coleus" (the original lab species). */
  plantId: PlantId;
  plantCount: number;    // 1..MAX_PLANTS_PER_ARM
  /** chemicals applied to this arm; empty array = pure control (no VOCs) */
  activeVocs: ChemicalId[];
  /** delivery route — only meaningful when activeVocs.length > 0 */
  delivery: PolyDelivery;

  /** per-arm environment — each tab is its own bench */
  vocConcentration: number; // mg/L 0..10
  waterDosage: number;      // mL    0..200
  temperature: number;      // °C    15..35
  humidity: number;         // %     20..95
}

export interface SimulationState {
  /** which top-level screen: guide (how it works) → entrance (picker) → lab */
  screen: ScreenMode;

  /** continuous day 0..365 (1-year experiment) — shared across tabs */
  day: number;
  playing: boolean;

  /** all configured experiment arms (1..MAX_TABS) */
  arms: ExperimentArm[];
  /** id of the currently visible / inspected arm */
  activeArmId: string;

  view: ViewMode;
  microRegion: MicroRegion;

  /** random per-plant anomalies on/off (deterministic per (seed, arm, day, plant)) */
  randomErrors: boolean;
  /** RNG seed so a given seed reproduces identical anomalies */
  runSeed: number;

  /**
   * Index of the plant currently in focus for per-plant readouts (LC-MS
   * spectrum, analytics row highlight, …). null = bench-mean view.
   * Always refers to the *active* arm. Reset to null when the active arm
   * changes or the plant count shrinks below the index.
   */
  selectedPlantIndex: number | null;

  /** Per-category on/off for the auto-generated weekly recap. */
  recapPrefs: RecapPrefs;
  /** Last generated recap (one per category, only populated for enabled
   *  categories). The RecapPanel reads from here and re-renders. */
  lastRecap: WeeklyRecap | null;
}

/** The 4 recap categories. Each can be toggled independently. */
export type RecapCategory = "macro" | "micro" | "molecular" | "overall";

export interface RecapPrefs {
  macro: boolean;
  micro: boolean;
  molecular: boolean;
  overall: boolean;
}

export interface WeeklyRecap {
  week: number;
  day: number;
  headlineLabel: string;
  headlineColor: string;
  /** Populated only if `recapPrefs.macro` was on when the recap was built. */
  macro?: string;
  micro?: string;
  molecular?: string;
  overall?: string;
}

/** Convenience: many models still think in "weeks" — derive from day. */
export function weekOf(day: number): number {
  return day / 7;
}

export interface VarietyConfig {
  label: string;
  /** primary leaf color */
  leafColor: number;
  /** vein / variegation accent */
  accentColor: number;
  stemColor: number;
  /** number of serration teeth on each side of leaf shape */
  serrations: number;
  /** leaf aspect ratio (length / width) */
  aspect: number;
  /** baseline saturation boost factor */
  saturation: number;
  /** 0..1 — how strongly the leaf sides curve up (lateral cup channel) */
  cupping: number;
  /** 0..1 — how much the leaf tip droops downward under its own weight */
  droop: number;
  /** 0.6..1.4 — per-variety leaf size multiplier (Lime Delight has finer leaves, etc.) */
  leafSize: number;
  /** 0..1 — surface glossiness proxy (lower roughness = glossier) */
  gloss: number;

  // ── Plant-architecture knobs (added for non-Coleus species) ──

  /** 1 = monocot grasses / single leaf per node (corn, rice).
   *  2 = decussate / opposite-leaved dicots (Coleus, mint, soybean).
   *  Defaults to 2 if absent. */
  leavesPerNode?: number;
  /**
   *  Phyllotaxy:
   *   - "decussate": every other pair rotated 90° (Lamiaceae)
   *   - "alternate": ~137° golden-angle spiral (most monocots)
   *   - "rosette": all leaves spiraling out at the base (aloe, lettuce)
   *   - "fronds": single tuft of leaves at the apex (fern)
   *  Defaults to "decussate" if absent.
   */
  phyllotaxy?: "decussate" | "alternate" | "rosette" | "fronds";
  /** Optional override for plant mature height in scene units (≈ meters).
   *  When unset the renderer keeps Coleus's ~1m unit height. */
  matureHeightUnits?: number;
}

/** Normalized stress / morphology vector applied to a single plant.
 *  Each axis is 0..1 (or signed where noted) and is consumed by the renderer.
 */
export interface StressVector {
  /** 0..1 — multiplicative growth suppression on height/mass */
  heightSuppress: number;
  /** 0..1 — additional darkening / necrosis on stem base & roots */
  necrosis: number;
  /** 0..1 — leaf curl amount (downward droop) */
  curl: number;
  /** 0..1 — stomatal closure (visualized as leaf surface dullness) */
  stomatalClose: number;
  /** 0..2 — pigmentation gain (>1 = hyper-pigmentation glow) */
  pigmentation: number;
  /** 0..1 — chlorosis (yellowing) magnitude */
  chlorosis: number;
  /** 0..1 — defense protein accumulation (used for micro overlays) */
  defenseProteins: number;
  /** 0..1 — wilting / loss of turgor (water-driven) */
  wilting: number;
}

export type AnomalyKind =
  | "none"
  | "scorch"           // sudden chlorosis spike
  | "necrosisSpot"     // local necrosis flare
  | "anthocyaninFlare" // pigment burst (UV-like)
  | "wiltEvent"        // turgor crash
  | "leafDrop";        // accelerated senescence

export interface PlantAnomaly {
  kind: AnomalyKind;
  /** anomaly contribution added on top of the arm stress vector */
  delta: Partial<StressVector>;
  /** how many leaf pairs to drop from the bottom (0 = none) */
  dropPairs: number;
}

export interface VocPeak {
  mz: number;
  label: string;
  /** baseline relative intensity 0..100 contribution from this VOC */
  base: number;
  /** scales with week (0..6 -> 0..1) */
  weekFactor: number;
}

/** Helper used everywhere that needs the active arm. */
export function activeArm(s: SimulationState): ExperimentArm {
  return s.arms.find((a) => a.id === s.activeArmId) ?? s.arms[0];
}
