import type { ExperimentArm } from "../types";
import { weekOf } from "../types";
import { computeArmStress } from "./treatments";
import { getPlant } from "../data/loader";

/**
 * Microbiome scalars used by the canvas particle system to drive
 * spawning / dying / population mix.
 */
export interface MicrobiomeState {
  diversity: number;
  pathogenFrac: number;
  resistome: number;
  beneficialMul: number;
  cullPulse: number;
  recolonizing: boolean;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/**
 * Compute microbiome scalars for one arm at the current day. The "shape"
 * of the response is driven by the arm's delivery mode + whether any VOCs
 * are present (control = baseline community).
 */
export function computeMicrobiome(arm: ExperimentArm, day: number): MicrobiomeState {
  const stress = computeArmStress(arm, day);
  const c = clamp(arm.vocConcentration / 10);
  const t = weekOf(day);

  // ── Plant-specific baseline microbiome (from JSON) ──
  // Falls back to Coleus-like values if the plant doesn't expose them.
  const plant = getPlant(arm.plantId);
  const m = plant?.microbiome as Record<string, unknown> | undefined;
  const plantDiversity = numOr(m?.rhizosphereDiversity, 0.95);
  const plantPathogenBaseline = numOr(m?.baselinePathogenFraction, 0.05);
  const plantStability = numOr(m?.stressStability, 0.6);
  const plantStressPathogenGain = numOr(m?.stressIncreasesPathogenLoad, 0.5);

  let diversity = plantDiversity;
  let pathogenFrac = plantPathogenBaseline;
  let resistome = 5;
  let beneficialMul = 1.0;
  let cullPulse = 0;
  let recolonizing = false;

  // How damage is shaped by the plant's own stability — higher stability
  // → smaller diversity drop, smaller pathogen surge under the same dose.
  const damageScale = 1 - 0.7 * plantStability;
  const pathogenScale = plantStressPathogenGain;

  if (arm.activeVocs.length === 0) {
    // no chemicals → stay at the plant's baseline (defense bonus still
    // applied below, in case stress.defenseProteins is non-zero from elsewhere).
  } else if (arm.delivery === "liquid") {
    // soil drench → biodiversity collapse, opportunistic takeover
    diversity = clamp(plantDiversity - 0.6 * Math.min(1, t / 4) * c * damageScale);
    pathogenFrac = clamp(plantPathogenBaseline + 0.55 * Math.min(1, t / 4) * c * pathogenScale);
    resistome = clamp(5 + 70 * Math.min(1, t / 5) * c, 0, 100);
    beneficialMul = 0.3 + 0.4 * (1 - c) * (0.5 + 0.5 * plantStability);
  } else if (arm.delivery === "gas") {
    if (t < 1.0) {
      cullPulse = clamp(0.85 * c * damageScale);
      diversity = clamp(plantDiversity * (0.45 - 0.3 * c));
      pathogenFrac = clamp(plantPathogenBaseline + 0.05 * c * pathogenScale);
      beneficialMul = 0.2;
      resistome = clamp(5 + 5 * c, 0, 100);
    } else {
      recolonizing = true;
      const recT = clamp((t - 1) / 4);
      diversity = clamp(plantDiversity * (0.45 + 0.35 * recT) - 0.15 * c * damageScale);
      pathogenFrac = clamp(plantPathogenBaseline + 0.15 * c * (1 - recT) * pathogenScale);
      beneficialMul = 0.6 + 0.7 * recT;
      resistome = clamp(10 + 25 * c * (1 - recT), 0, 100);
    }
  } else {
    // "both" — combined disturbance
    diversity = clamp(plantDiversity - 0.65 * Math.min(1, t / 3.5) * c * damageScale);
    pathogenFrac = clamp(plantPathogenBaseline + 0.5 * Math.min(1, t / 4) * c * pathogenScale);
    resistome = clamp(5 + 80 * Math.min(1, t / 5) * c, 0, 100);
    beneficialMul = 0.25 + 0.35 * (1 - c) * (0.5 + 0.5 * plantStability);
    if (t < 0.8) cullPulse = 0.4 * c * damageScale;
  }

  // defense protein presence (MeJA / MeSA) modestly protects diversity
  diversity = clamp(diversity + 0.12 * stress.defenseProteins);

  return { diversity, pathogenFrac, resistome, beneficialMul, cullPulse, recolonizing };
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
