import type { ChemicalId, ExperimentArm, StressVector } from "../types";
import { weekOf } from "../types";
import { combineVocs, chemicalBaseVector } from "./vocCombine";
import { getPlant } from "../data/loader";

const ZERO: StressVector = {
  heightSuppress: 0, necrosis: 0, curl: 0, stomatalClose: 0,
  pigmentation: 0, chlorosis: 0, defenseProteins: 0, wilting: 0,
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * Compute the stress vector for one arm at a given simulation day.
 *
 * Pipeline:
 *  1. If arm.activeVocs is empty → control: ZERO + water-driven wilting only.
 *  2. Combine VOC base vectors via combineVocs() (synergy rules).
 *  3. Time ramp (treatment saturates by ~week 5).
 *  4. Concentration scaler (mg/L → 0..1.2).
 *  5. Apply delivery shaping (liquid / gas / both).
 *  6. Environmental modifiers (temperature & humidity).
 *  7. Final clamp + wilt blend.
 */
export function computeArmStress(arm: ExperimentArm, day: number): StressVector {
  const week = weekOf(day);

  // baseline wilting from this arm's water dosage + humidity
  const wilt =
    clamp(1 - arm.waterDosage / 80) * 0.6 +
    clamp(1 - arm.humidity / 90) * 0.15;

  if (arm.activeVocs.length === 0) {
    return { ...ZERO, wilting: clamp(wilt, 0, 1) };
  }

  // Apply this plant's per-chemical sensitivity multipliers BEFORE combining.
  // Each species reacts differently to the same chemical: e.g. lettuce is
  // hyper-sensitive to cadmium (1.75×) while soybean is glyphosate-sensitive
  // (1.6× wild-type) but resistant to its own ozone exposure context.
  const base = combineVocs(arm.activeVocs);
  const sensScaled = applyPlantSensitivity(arm.plantId, arm.activeVocs, base);
  // mutate `base` in place so the rest of the pipeline (synergy, delivery,
  // env modifiers) sees plant-shaped values
  Object.assign(base, sensScaled);

  const tRamp = smoothstep(0.5, 5.0, week);
  const cScaler = clamp(arm.vocConcentration / 10, 0, 1) * 1.2;

  // environmental modifiers — same shapes as before but driven by per-arm env
  const tempBoost = 1 + clamp((arm.temperature - 24) / 20, -0.3, 0.4);
  const humLiquidBoost = 1 + clamp((arm.humidity - 60) / 80, -0.2, 0.2);
  const humGasBoost = 1 + clamp((arm.humidity - 60) / 60, -0.35, 0.25);

  // start from the base * time * concentration
  const v: StressVector = { ...base };
  for (const k of Object.keys(v) as (keyof StressVector)[]) {
    v[k] = base[k] * tRamp * cScaler;
  }

  // multi-VOC arms get the synergy boost; single-VOC arms skip it
  const isMulti = arm.activeVocs.length >= 2;
  if (isMulti) {
    v.pigmentation = Math.min(2, v.pigmentation * 1.45);
    v.heightSuppress = Math.min(0.8, v.heightSuppress * 1.25);
    v.defenseProteins *= 1.2;
  }

  // delivery shaping — single arms also pick a route now
  if (arm.delivery === "liquid") {
    applyLiquidShape(v, humLiquidBoost, isMulti ? 0.85 : 1);
  } else if (arm.delivery === "gas") {
    applyGasShape(v, humGasBoost, tempBoost, isMulti ? 0.85 : 1);
  }
  // "both" → no extra shaping (mixed delivery)

  // ethylene + temperature interaction
  if (arm.activeVocs.includes("ethylene")) {
    v.chlorosis = Math.min(1, v.chlorosis * tempBoost);
    v.curl = Math.min(1, v.curl * (1 + 0.2 * (tempBoost - 1)));
  }

  // final clamps
  v.heightSuppress = clamp(v.heightSuppress, 0, 0.85);
  v.necrosis = clamp(v.necrosis, 0, 1);
  v.curl = clamp(v.curl, 0, 1);
  v.stomatalClose = clamp(v.stomatalClose, 0, 1);
  v.pigmentation = clamp(v.pigmentation, 0, 2);
  v.chlorosis = clamp(v.chlorosis, 0, 1);
  v.defenseProteins = clamp(v.defenseProteins, 0, 1);
  v.wilting = clamp(wilt + 0.25 * v.stomatalClose, 0, 1);
  return v;
}

/**
 * "liquid delivery" shaping — soil drench: more necrosis & height suppression,
 * less curl/chlorosis, slightly muted defense response.
 */
function applyLiquidShape(v: StressVector, humLiquidBoost: number, scale = 1): void {
  v.necrosis        *= 1 + (0.6 * humLiquidBoost) * scale;
  v.heightSuppress  *= 1 + (0.3 * humLiquidBoost) * scale;
  v.curl            *= 1 - 0.5 * scale;
  v.chlorosis       *= 1 - 0.3 * scale;
  v.defenseProteins *= 1 - 0.1 * scale;
  v.wilting         *= 1 + 0.15 * scale;
}

/**
 * "gaseous delivery" shaping — fumigation: more leaf curl, stomatal closure
 * and chlorosis (temperature-boosted); less necrosis & height suppression.
 */
/**
 * Bend the combined stress vector by the plant species' chemicalSensitivity
 * matrix. We weight each chemical's contribution to the final vector by the
 * species-specific multiplier (0..2). To avoid double-counting the synergy
 * already baked into `combineVocs`, we compute a scalar weighted average
 * across the active chemicals and rescale every axis uniformly.
 *
 * This keeps the synergy maths intact while letting (e.g.) corn shrug off
 * glyphosate-resistant when the user picks RR corn, or lettuce light up
 * dramatically under cadmium.
 */
function applyPlantSensitivity(
  plantId: string,
  vocs: ChemicalId[],
  base: StressVector,
): StressVector {
  const plant = getPlant(plantId);
  if (!plant || vocs.length === 0) return base;

  let weight = 0;
  let sumBase = 0;
  for (const id of vocs) {
    const sens = plant.chemicalSensitivity[id];
    if (typeof sens !== "number") continue;
    // intensity proxy = mean axis magnitude of this chemical's base vector
    const v = chemicalBaseVector(id);
    const intensity = (v.heightSuppress + v.necrosis + v.curl + v.stomatalClose
      + v.pigmentation * 0.5 + v.chlorosis + v.defenseProteins + v.wilting) / 7.5;
    weight += sens * intensity;
    sumBase += intensity;
  }
  if (sumBase === 0) return base;
  const scale = weight / sumBase; // 0..2 typical
  const out: StressVector = { ...base };
  for (const k of Object.keys(out) as (keyof StressVector)[]) {
    // pigmentation can go up to 2; everything else clamps at 1 later
    out[k] = base[k] * scale;
  }
  return out;
}

function applyGasShape(v: StressVector, humGasBoost: number, tempBoost: number, scale = 1): void {
  v.curl           *= 1 + (0.5 * humGasBoost) * scale;
  v.stomatalClose  *= 1 + (0.4 * humGasBoost) * scale;
  v.chlorosis      *= 1 + (0.3 * tempBoost) * scale;
  v.necrosis       *= 1 - 0.6 * scale;
  v.heightSuppress *= 1 - 0.2 * scale;
}
