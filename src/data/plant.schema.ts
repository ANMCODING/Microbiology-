/**
 * Plant schema — type definitions for the 10-plant library.
 *
 * Each plant is stored as a JSON file in `src/data/plants/<id>.json`.
 * The `chemicalSensitivity` map MUST contain a key for every chemical id
 * present in `src/data/chemicals/` — verified at load time.
 */

export type PhotosynthesisPathway = "C3" | "C4" | "CAM";
export type LeafShape =
  | "ovate" | "lanceolate" | "palmate" | "pinnate" | "linear"
  | "cordate" | "serrated" | "lobed" | "compound" | "fronds";
export type Phyllotaxy =
  | "alternate" | "opposite" | "decussate" | "whorled"
  | "rosette" | "basal" | "fronds";
export type Lifecycle = "annual" | "biennial" | "perennial";
export type LifeForm =
  | "herb" | "shrub" | "vine" | "tree" | "aquatic plant" | "non-vascular";

export interface PlantGeometry {
  matureHeightCm: number;
  leafLengthCm: number;
  leafWidthCm: number;
  leafAspectRatio: number;
  leafShape: LeafShape;
  /** number of teeth per leaf side; 0 if smooth/linear */
  serrations: number;
  cupping: number;            // 0..1
  droop: number;              // 0..1
  gloss: number;              // 0..1
  phyllotaxy: Phyllotaxy;
  internodeSpacingCm: number;
  /** stem diameter / plant height (0..1) */
  stemThicknessRatio: number;
  branchingAngleDeg: number;
  branchingFrequency: number;
  leavesPerNode: number;
  leafColor: string;          // hex
  veinColor: string;          // hex
  stemColor: string;          // hex
  rootDepthCm: number;
  rootBranchingDensity: number;
}

export interface PlantBaselineLcMsPeak {
  mz: number;
  label: string;
  base: number;
  weekFactor: number;
}

/**
 * Per-chemical sensitivity multiplier (0..2):
 *   0.0 = completely resistant (chemical does nothing on this plant)
 *   1.0 = baseline (responds the same as the Coleus reference)
 *   2.0 = hyper-sensitive (effects doubled)
 *
 * Keys must match every `id` in `src/data/chemicals/`.
 */
export type PlantChemicalSensitivity = Record<string, number>;

export interface Plant {
  id: string;
  scientificName: string;
  commonName: string;
  family: string;
  lifeForm: LifeForm;
  lifecycle: Lifecycle;
  nativeClimate?: string;
  isModelOrganism: boolean;
  useCategories: string[];

  morphology: Record<string, unknown>;
  growthRequirements: Record<string, unknown>;
  physiology: {
    photosynthesisPathway: PhotosynthesisPathway;
    [k: string]: unknown;
  };
  stressSensitivity: Record<string, unknown>;
  chemicalUptake: Record<string, unknown>;
  visualStressResponses: Record<string, unknown>;
  molecularTraits: Record<string, unknown>;
  microbiome: Record<string, unknown>;
  timeline: Record<string, unknown>;
  educational: Record<string, unknown>;

  geometry: PlantGeometry;
  chemicalSensitivity: PlantChemicalSensitivity;
  baselineLcMs: PlantBaselineLcMsPeak[];

  /** Optional mortality profile override. When present the simulator uses
   *  these values verbatim; when absent, defaults are derived from
   *  `lifeForm` + `physiology.photosynthesisPathway` in `sim/mortality.ts`. */
  mortality?: {
    /** 0.1..2.0 — daily severity below which plant takes no damage. */
    stressTolerance?: number;
    /** 1..20 — cumulative damage at which the plant dies. */
    lethalDose?: number;
    /** 0..0.5 — damage healed per day below tolerance. */
    recoveryRate?: number;
  };

  sources: string[];
}
