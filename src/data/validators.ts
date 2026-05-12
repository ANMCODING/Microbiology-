/**
 * Runtime validators for the chemical & plant JSON files.
 *
 * Goals:
 *  - Catch malformed authoring early (missing fields, bad ranges).
 *  - Tolerate "extra" descriptive fields (the JSONs are richer than the
 *    minimum the simulator needs).
 *  - Throw with a precise path so a typo in `meta.json` is obvious.
 */

import type { Chemical, ChemicalSimulationVector } from "./chemical.schema";
import type { Plant } from "./plant.schema";

// ──────────────────────────────────────────────────────────────────────────
// helpers

function fail(path: string, msg: string): never {
  throw new Error(`[data/validate] ${path}: ${msg}`);
}

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isStr = (v: unknown): v is string => typeof v === "string";

const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

const HEX = /^#[0-9a-fA-F]{6}$/;

// ──────────────────────────────────────────────────────────────────────────
// chemicals

const SIM_AXES: (keyof ChemicalSimulationVector)[] = [
  "heightSuppress", "necrosis", "curl", "stomatalClose",
  "pigmentation", "chlorosis", "defenseProteins", "wilting",
];

const VALID_PHASES = new Set(["liquid", "gas", "solid", "aerosol"]);
const VALID_DELIVERY = new Set([
  "liquid", "gas", "soil", "foliar_spray", "root_drench", "fumigation",
]);

function validateSimVector(
  axes: unknown,
  path: string,
): ChemicalSimulationVector {
  if (!axes || typeof axes !== "object") fail(path, "must be an object");
  const v = axes as Record<string, unknown>;
  for (const axis of SIM_AXES) {
    const x = v[axis];
    if (!isNum(x)) fail(`${path}.${axis}`, "must be a number");
    const cap = axis === "pigmentation" ? 2 : 1;
    if (!inRange(x, 0, cap)) fail(`${path}.${axis}`, `must be in [0, ${cap}]`);
  }
  return v as unknown as ChemicalSimulationVector;
}

export function validateChemical(raw: unknown, file: string): Chemical {
  if (!raw || typeof raw !== "object") fail(file, "root must be an object");
  const r = raw as Record<string, unknown>;

  if (!isStr(r.id)) fail(`${file}.id`, "missing or not a string");
  if (!isStr(r.commonName)) fail(`${file}.commonName`, "missing");
  if (!isStr(r.formula)) fail(`${file}.formula`, "missing");
  if (!isNum(r.molecularWeight))
    fail(`${file}.molecularWeight`, "must be a number (no units)");
  if (!isStr(r.phase) || !VALID_PHASES.has(r.phase))
    fail(`${file}.phase`, `must be one of ${[...VALID_PHASES].join(", ")}`);
  if (!Array.isArray(r.deliveryMethods) || r.deliveryMethods.length === 0)
    fail(`${file}.deliveryMethods`, "must be a non-empty array");
  for (const d of r.deliveryMethods)
    if (!isStr(d) || !VALID_DELIVERY.has(d))
      fail(`${file}.deliveryMethods`, `invalid value: ${String(d)}`);
  if (!isStr(r.color) || !HEX.test(r.color))
    fail(`${file}.color`, "must be a 6-digit hex like #RRGGBB");
  if (!isStr(r.category)) fail(`${file}.category`, "missing");

  validateSimVector(r.simulationVector, `${file}.simulationVector`);

  if (!Array.isArray(r.lcMsPeaks))
    fail(`${file}.lcMsPeaks`, "must be an array");
  for (let i = 0; i < r.lcMsPeaks.length; i++) {
    const p = r.lcMsPeaks[i] as Record<string, unknown>;
    const path = `${file}.lcMsPeaks[${i}]`;
    if (!p || typeof p !== "object") fail(path, "must be an object");
    if (!isNum(p.mz)) fail(`${path}.mz`, "must be a number");
    if (!isStr(p.label)) fail(`${path}.label`, "missing");
    if (!isNum(p.base) || !inRange(p.base, 0, 100))
      fail(`${path}.base`, "must be a number in [0, 100]");
    if (!isNum(p.weekFactor) || !inRange(p.weekFactor, 0, 2))
      fail(`${path}.weekFactor`, "must be a number in [0, 2]");
  }

  if (r.doseResponse) {
    const dr = r.doseResponse as Record<string, unknown>;
    if (dr.lowDose)
      validateSimVector(
        (dr.lowDose as Record<string, unknown>).simulationVector,
        `${file}.doseResponse.lowDose.simulationVector`,
      );
    if (dr.highDose)
      validateSimVector(
        (dr.highDose as Record<string, unknown>).simulationVector,
        `${file}.doseResponse.highDose.simulationVector`,
      );
  }

  if (!Array.isArray(r.sources) || r.sources.length === 0)
    fail(`${file}.sources`, "must be a non-empty array");

  return raw as Chemical;
}

// ──────────────────────────────────────────────────────────────────────────
// plants

const VALID_PATHWAYS = new Set(["C3", "C4", "CAM"]);

export function validatePlant(
  raw: unknown,
  file: string,
  knownChemicalIds: Set<string>,
): Plant {
  if (!raw || typeof raw !== "object") fail(file, "root must be an object");
  const r = raw as Record<string, unknown>;

  if (!isStr(r.id)) fail(`${file}.id`, "missing");
  if (!isStr(r.scientificName)) fail(`${file}.scientificName`, "missing");
  if (!isStr(r.commonName)) fail(`${file}.commonName`, "missing");
  if (!isStr(r.family)) fail(`${file}.family`, "missing");
  if (typeof r.isModelOrganism !== "boolean")
    fail(`${file}.isModelOrganism`, "must be boolean");

  // physiology.photosynthesisPathway is the one strictly-typed inner field
  const phys = r.physiology as Record<string, unknown> | undefined;
  if (!phys || !isStr(phys.photosynthesisPathway) ||
      !VALID_PATHWAYS.has(phys.photosynthesisPathway))
    fail(`${file}.physiology.photosynthesisPathway`,
      `must be one of ${[...VALID_PATHWAYS].join(", ")}`);

  // geometry — full shape check
  const g = r.geometry as Record<string, unknown> | undefined;
  if (!g) fail(`${file}.geometry`, "missing");
  const reqGeom = [
    "matureHeightCm", "leafLengthCm", "leafWidthCm", "leafAspectRatio",
    "serrations", "cupping", "droop", "gloss", "internodeSpacingCm",
    "stemThicknessRatio", "branchingAngleDeg", "branchingFrequency",
    "leavesPerNode", "rootDepthCm", "rootBranchingDensity",
  ];
  for (const k of reqGeom)
    if (!isNum((g as any)[k]))
      fail(`${file}.geometry.${k}`, "must be a number");
  for (const k of ["leafColor", "veinColor", "stemColor"]) {
    const c = (g as any)[k];
    if (!isStr(c) || !HEX.test(c))
      fail(`${file}.geometry.${k}`, "must be a 6-digit hex like #RRGGBB");
  }
  if (!isStr((g as any).leafShape))
    fail(`${file}.geometry.leafShape`, "missing");
  if (!isStr((g as any).phyllotaxy))
    fail(`${file}.geometry.phyllotaxy`, "missing");

  // chemicalSensitivity — must contain every known chemical id
  const cs = r.chemicalSensitivity as Record<string, unknown> | undefined;
  if (!cs || typeof cs !== "object")
    fail(`${file}.chemicalSensitivity`, "missing or not an object");
  if (knownChemicalIds.size > 0) {
    const missing: string[] = [];
    for (const id of knownChemicalIds) if (!(id in cs!)) missing.push(id);
    if (missing.length)
      fail(`${file}.chemicalSensitivity`,
        `missing keys for known chemicals: ${missing.slice(0, 6).join(", ")}` +
        (missing.length > 6 ? ` (+${missing.length - 6} more)` : ""));
  }
  for (const [k, v] of Object.entries(cs!)) {
    if (!isNum(v) || !inRange(v, 0, 2))
      fail(`${file}.chemicalSensitivity.${k}`, "must be a number in [0, 2]");
  }

  if (!Array.isArray(r.baselineLcMs))
    fail(`${file}.baselineLcMs`, "must be an array");
  for (let i = 0; i < r.baselineLcMs.length; i++) {
    const p = r.baselineLcMs[i] as Record<string, unknown>;
    const path = `${file}.baselineLcMs[${i}]`;
    if (!isNum(p.mz)) fail(`${path}.mz`, "must be a number");
    if (!isStr(p.label)) fail(`${path}.label`, "missing");
    if (!isNum(p.base) || !inRange(p.base, 0, 100))
      fail(`${path}.base`, "must be a number in [0, 100]");
    if (!isNum(p.weekFactor) || !inRange(p.weekFactor, 0, 2))
      fail(`${path}.weekFactor`, "must be a number in [0, 2]");
  }

  if (!Array.isArray(r.sources) || r.sources.length === 0)
    fail(`${file}.sources`, "must be a non-empty array");

  // Optional mortality block — overrides defaults derived from lifeForm.
  if (r.mortality !== undefined) {
    const m = r.mortality as Record<string, unknown>;
    if (m.stressTolerance !== undefined &&
        (!isNum(m.stressTolerance) || !inRange(m.stressTolerance as number, 0.1, 2.0)))
      fail(`${file}.mortality.stressTolerance`, "must be a number in [0.1, 2.0]");
    if (m.lethalDose !== undefined &&
        (!isNum(m.lethalDose) || !inRange(m.lethalDose as number, 1.0, 20.0)))
      fail(`${file}.mortality.lethalDose`, "must be a number in [1, 20]");
    if (m.recoveryRate !== undefined &&
        (!isNum(m.recoveryRate) || !inRange(m.recoveryRate as number, 0.0, 0.5)))
      fail(`${file}.mortality.recoveryRate`, "must be a number in [0, 0.5]");
  }

  return raw as Plant;
}
