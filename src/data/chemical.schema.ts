/**
 * Chemical schema — type definitions for the 40-chemical library.
 *
 * Each chemical is stored as a JSON file in `src/data/chemicals/<id>.json`
 * and validated at load time against this schema. Extra fields (beyond
 * what's typed here) are tolerated — see validator.ts.
 *
 * Authored by an external research AI; documented as narrative coefficients
 * for visualization, NOT empirical biology. Tunable.
 */

/** All 8 stress / morphology axes consumed by the renderer.
 *  Same shape as `StressVector` in src/types.ts (kept in sync intentionally). */
export interface ChemicalSimulationVector {
  heightSuppress: number;     // 0..1
  necrosis: number;           // 0..1
  curl: number;               // 0..1
  stomatalClose: number;      // 0..1
  pigmentation: number;       // 0..2 (>1 = hyper-pigmentation glow)
  chlorosis: number;          // 0..1
  defenseProteins: number;    // 0..1
  wilting: number;            // 0..1
}

export interface ChemicalLcMsPeak {
  mz: number;
  label: string;
  /** baseline relative intensity 0..100 */
  base: number;
  /** scales with normalized week 0..1 */
  weekFactor: number;
}

export interface ChemicalDoseStage {
  range: string;
  description: string;
  simulationVector: ChemicalSimulationVector;
}

export type ChemicalPhase = "liquid" | "gas" | "solid" | "aerosol";
export type ChemicalDeliveryMethod =
  | "liquid"
  | "gas"
  | "soil"
  | "foliar_spray"
  | "root_drench"
  | "fumigation";

/**
 * One chemical definition. Many fields are descriptive (used by the
 * encyclopedia/info panel) and only the simulator-driving fields
 * (`simulationVector`, `lcMsPeaks`, `deliveryMethods`, `phase`,
 * `microbiomeEffects`) need to be exact.
 */
export interface Chemical {
  id: string;
  commonName: string;
  iupacName?: string | null;
  formula: string;
  molecularWeight: number;
  phase: ChemicalPhase;
  deliveryMethods: ChemicalDeliveryMethod[];
  /** hex color used as the chemical's chip + plot series color */
  color: string;
  /** broad category (voc, heavy_metal, fertilizer, …) */
  category: string;
  subCategory?: string;

  boilingPoint?: string | null;
  vaporPressure?: string | null;
  waterSolubility?: string | null;
  odor?: string | null;
  environmentalPersistence?: string | null;
  bioaccumulates?: boolean;

  absorptionRoutes?: string[];
  primaryUptakeMedium?: string;
  tissuesAffected?: string[];
  systemicMovement?: boolean;

  /** narrative low/high dose stages — high is what `simulationVector` uses */
  doseResponse?: {
    lowDose: ChemicalDoseStage;
    highDose: ChemicalDoseStage;
  };

  /** the per-unit-dose intent vector at week 6 — primary simulator input */
  simulationVector: ChemicalSimulationVector;

  lcMsPeaks: ChemicalLcMsPeak[];

  morphologicalEffects?: Record<string, string>;
  physiologyEffects?: Record<string, string | boolean>;
  molecularEffects?: Record<string, unknown>;
  microbiomeEffects?: Record<string, unknown>;
  temporalDynamics?: Record<string, unknown>;
  visualSimulation?: Record<string, unknown>;

  synergies?: {
    synergizesWith?: string[];
    synergyNote?: string;
    antagonizesWith?: string[];
    antagonismNote?: string;
    amplifiesOxidativeStressOf?: string[];
    protectsAgainst?: string[];
  };

  educationalContext?: Record<string, string>;

  sources: string[];
}
