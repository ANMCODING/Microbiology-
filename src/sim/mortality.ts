/**
 * Plant mortality model — realistic per-plant death + recovery.
 *
 * The lab now tracks **cumulative damage** for every plant in every arm.
 * Each simulated day:
 *
 *     severity = 1.5·necrosis + 1.2·wilting + 0.8·chlorosis
 *              + 0.6·heightSuppress + 0.4·curl
 *
 * is computed from the current stress vector. If `severity > tolerance`,
 * damage accumulates at `(severity − tolerance) · vigor⁻¹ · dt` per day
 * (weaker plants accumulate faster). When `severity ≤ tolerance`, damage
 * heals back at `recoveryRate · dt`. Once `damage ≥ lethalDose` the plant
 * is permanently dead — necrotic tissue does not regrow, biology rules.
 *
 * Per-plant `vigor` (the same noise term used for visual variation) gives
 * realistic spread: in an arm exposed to a borderline-lethal cadmium dose
 * the weakest 2–3 individuals die first, the strongest hang on. This is
 * exactly how real plant tox studies look.
 *
 * Defaults are derived from `lifeForm` + photosynthesis pathway when the
 * plant JSON doesn't carry an explicit `mortality` block, so adding a new
 * plant works out of the box; per-plant overrides win when present.
 *
 * The integrator is **pure**: `computePlantHealth(arm, plantIdx, day)`
 * always reproduces the same trajectory from day 0. This means scrubbing
 * the timeline backward, swapping chemicals, or changing concentration
 * mid-run all "just work" — no stale persistent state to invalidate.
 */

import type { ExperimentArm, SimulationState, StressVector } from "../types";
import { computeArmStress } from "./treatments";
import { computePlantNoise } from "./anomalies";
import { getPlant, CHEMICALS } from "../data/loader";

/** Minimal state shape we need for mortality — accepts the full sim state
 *  (preferred) but also a stub when called from outside the main loop. */
type MortalityState = Pick<SimulationState, "runSeed" | "randomErrors">;
const DEFAULT_STATE: MortalityState = { runSeed: 1, randomErrors: true };

export interface MortalityProfile {
  /** Daily severity below which the plant takes no damage. */
  stressTolerance: number;
  /** Cumulative damage at which the plant dies (and stays dead). */
  lethalDose: number;
  /** Damage healed per day when severity is below tolerance. */
  recoveryRate: number;
}

export interface PlantHealth {
  alive: boolean;
  /** 0..lethalDose; visual greying scales with damage / lethalDose. */
  damage: number;
  /** Day the plant died (Infinity if still alive). */
  deathDay: number;
  /** What killed it (label from the most-contributing chemical at death). */
  causeOfDeath: string | null;
}

/** Default mortality profiles by plant lifeForm + photosynthesis pathway.
 *  These are tuned so a maxed-out cadmium / acid-rain / glyphosate dose
 *  kills lettuce/Arabidopsis in 1–2 weeks, kills coleus/tomato in 2–4
 *  weeks, and only kills aloe/corn after sustained extreme exposure. */
const LIFEFORM_DEFAULTS: Record<string, MortalityProfile> = {
  succulent:           { stressTolerance: 0.95, lethalDose: 9.0, recoveryRate: 0.05 },
  tree:                { stressTolerance: 0.80, lethalDose: 8.0, recoveryRate: 0.10 },
  shrub:               { stressTolerance: 0.70, lethalDose: 7.0, recoveryRate: 0.12 },
  grass:               { stressTolerance: 0.75, lethalDose: 7.0, recoveryRate: 0.18 },
  cereal:              { stressTolerance: 0.65, lethalDose: 6.0, recoveryRate: 0.16 },
  legume:              { stressTolerance: 0.60, lethalDose: 6.0, recoveryRate: 0.18 },
  vine:                { stressTolerance: 0.50, lethalDose: 5.0, recoveryRate: 0.15 },
  herb:                { stressTolerance: 0.55, lethalDose: 5.5, recoveryRate: 0.15 },
  "herbaceous perennial": { stressTolerance: 0.55, lethalDose: 5.5, recoveryRate: 0.15 },
  "annual herb":       { stressTolerance: 0.45, lethalDose: 4.5, recoveryRate: 0.18 },
  fern:                { stressTolerance: 0.45, lethalDose: 5.5, recoveryRate: 0.08 },
  "rosette herb":      { stressTolerance: 0.40, lethalDose: 4.5, recoveryRate: 0.20 },
  "model plant":       { stressTolerance: 0.35, lethalDose: 4.0, recoveryRate: 0.22 },
};

/** C4 plants get a +0.10 tolerance bonus (drought/heat hardened),
 *  CAM plants get +0.20 (extreme stress endurance),
 *  C3 stays at baseline. */
const PATHWAY_TOLERANCE_BONUS: Record<string, number> = {
  C4:  0.10,
  CAM: 0.20,
  C3:  0.0,
};

/** Look up (or derive) a plant's mortality profile.
 *  Order of precedence:
 *    1. plant.mortality block in JSON (explicit override)
 *    2. lifeForm default + pathway bonus
 *    3. generic herb fallback */
export function mortalityProfileFor(plantId: string): MortalityProfile {
  const plant = getPlant(plantId);
  if (!plant) {
    return { stressTolerance: 0.55, lethalDose: 5.5, recoveryRate: 0.15 };
  }
  // explicit override
  const override = (plant as unknown as { mortality?: Partial<MortalityProfile> }).mortality;
  // start from lifeForm defaults
  const lf = (plant.lifeForm ?? "herb").toLowerCase();
  const base = LIFEFORM_DEFAULTS[lf] ?? LIFEFORM_DEFAULTS["herb"];
  const pathway = plant.physiology?.photosynthesisPathway ?? "C3";
  const bonus = PATHWAY_TOLERANCE_BONUS[pathway] ?? 0;

  return {
    stressTolerance: clamp01(
      (override?.stressTolerance ?? base.stressTolerance + bonus),
      0.20,
      1.50,
    ),
    lethalDose: clamp01(
      (override?.lethalDose ?? base.lethalDose),
      1.5,
      15.0,
    ),
    recoveryRate: clamp01(
      (override?.recoveryRate ?? base.recoveryRate),
      0.0,
      0.50,
    ),
  };
}

/** Severity scalar — what fraction of "lethal-class" stress this plant is
 *  experiencing today. Pigmentation / defenseProteins are *defenses*,
 *  not damage, so they don't contribute. */
export function severityScalar(stress: StressVector): number {
  return (
    1.5 * stress.necrosis +
    1.2 * stress.wilting +
    0.8 * stress.chlorosis +
    0.6 * stress.heightSuppress +
    0.4 * stress.curl
  );
}

/** Integration step size (in days). Larger = faster, smaller = smoother. */
const DT_DAYS = 1.0;

/**
 * Stress-severity cache, keyed by an `(armSig, integerDay)` tuple.
 * The same severity sample is shared across every plant in the bench,
 * so the inner per-plant integrator becomes a pure scalar walk.
 *
 * This collapses the cost from O(plantCount × days × stressCalcCost)
 * to O(days × stressCalcCost + plantCount × days). With 365 days × ~30
 * plants that's the difference between 11k stress calls per frame and
 * 365 — we comfortably stay at 60 fps.
 */
const stressCache: Map<string, Float32Array> = new Map();
let stressCacheHit = 0;
let stressCacheMiss = 0;

function armSig(arm: ExperimentArm): string {
  return [
    arm.id,
    arm.plantId,
    arm.plantCount,
    arm.activeVocs.join(","),
    arm.delivery,
    arm.vocConcentration.toFixed(2),
    arm.waterDosage.toFixed(1),
    arm.temperature.toFixed(1),
    arm.humidity.toFixed(1),
  ].join("|");
}

/** Pre-compute / fetch the cached severity-per-day curve for an arm. */
function getSeverityCurve(arm: ExperimentArm, untilDay: number): Float32Array {
  const sig = armSig(arm);
  const cached = stressCache.get(sig);
  const need = Math.min(365, Math.max(0, Math.ceil(untilDay))) + 1;
  if (cached && cached.length >= need) {
    stressCacheHit++;
    return cached;
  }
  stressCacheMiss++;
  // (re)compute up to need
  const arr = new Float32Array(need);
  for (let d = 0; d < need; d++) {
    arr[d] = severityScalar(computeArmStress(arm, d));
  }
  // bound cache size
  if (stressCache.size > 64) stressCache.clear();
  stressCache.set(sig, arr);
  return arr;
}

/** Optional debug — current cache hit rate. */
export function mortalityCacheStats(): { hits: number; misses: number; size: number } {
  return { hits: stressCacheHit, misses: stressCacheMiss, size: stressCache.size };
}

/**
 * Pure: integrate the plant's damage trajectory from day 0 to `day`,
 * using the *current* arm config (so changing concentration mid-run
 * retroactively replays the timeline).
 *
 * This trades a tiny bit of biological "stickiness" (a brief overdose
 * you cancel mid-experiment is forgotten) for a vastly simpler mental
 * model: what you see on screen is exactly the trajectory of the current
 * arm config. For a teaching simulator that's the right call.
 */
export function computePlantHealth(
  arm: ExperimentArm,
  plantIndex: number,
  day: number,
  state: MortalityState = DEFAULT_STATE,
): PlantHealth {
  const profile = mortalityProfileFor(arm.plantId);
  const noise = computePlantNoise(
    state as SimulationState,
    arm,
    plantIndex,
  );
  // vigor noise narrows or widens lethal threshold — weaker plants die first
  const vigor = Math.max(0.55, Math.min(1.45, noise.vigor));
  const lethal = profile.lethalDose * vigor;
  const tolerance = profile.stressTolerance * (0.85 + 0.30 * vigor);

  let damage = 0;
  let alive = true;
  let deathDay = Infinity;

  // Walk the cached severity curve from day 0 to `day`. This is the hot
  // path for every plant on every frame, so the inner loop is a tight
  // scalar walk — no allocations, no method calls beyond Math.max.
  const maxDay = Math.min(day, 365);
  const sevCurve = getSeverityCurve(arm, maxDay);
  const recoveryStep = profile.recoveryRate * DT_DAYS;
  const tolInv = 1 / Math.max(0.1, tolerance);

  for (let d = 0; d <= maxDay; d += DT_DAYS) {
    const sev = sevCurve[d] ?? 0;

    if (sev > tolerance) {
      damage += (sev - tolerance) * DT_DAYS;
      if (damage >= lethal) {
        alive = false;
        deathDay = d;
        damage = lethal;
        break;
      }
    } else if (damage > 0) {
      // recovery path — scales by how far below tolerance we are.
      // Skipped entirely when damage is already 0 (no work).
      const headroom = (tolerance - sev) * tolInv;
      damage -= recoveryStep * headroom;
      if (damage < 0) damage = 0;
    }
  }

  // Identify cause of death = active chemical with the largest contribution
  // to severity at the death day (or at `day` if still alive but stressed).
  let causeOfDeath: string | null = null;
  if (!alive) {
    causeOfDeath = dominantChemicalLabel(arm, deathDay);
  }

  return { alive, damage, deathDay, causeOfDeath };
}

/** What chemical contributes most to severity in this arm at this day? */
function dominantChemicalLabel(arm: ExperimentArm, day: number): string | null {
  if (arm.activeVocs.length === 0) {
    // pure control death = drought / dehydration
    const stress = computeArmStress(arm, day);
    if (stress.wilting > 0.6) return "drought";
    return "stress";
  }
  let bestId = arm.activeVocs[0];
  let bestSev = -Infinity;
  for (const id of arm.activeVocs) {
    const c = CHEMICALS[id];
    const v = c?.simulationVector;
    if (!v) continue;
    const sev = severityScalar(v as StressVector);
    if (sev > bestSev) {
      bestSev = sev;
      bestId = id;
    }
  }
  return CHEMICALS[bestId]?.commonName ?? bestId;
}

/** Bench-level summary used by the Today panel headline. */
export interface BenchHealthSummary {
  total: number;
  alive: number;
  dead: number;
  /** First day a death occurred this bench (Infinity if no deaths yet). */
  firstDeathDay: number;
  /** Most frequent cause-of-death label across dead plants. */
  topCause: string | null;
  /** Mean fractional damage among *alive* plants (0..1 of lethal dose). */
  meanDamageFrac: number;
}

export function computeBenchHealth(
  arm: ExperimentArm,
  day: number,
  state: MortalityState = DEFAULT_STATE,
): BenchHealthSummary {
  const profile = mortalityProfileFor(arm.plantId);
  let alive = 0;
  let firstDeathDay = Infinity;
  const causes: Record<string, number> = {};
  let damageSum = 0;
  let aliveCount = 0;

  for (let i = 0; i < arm.plantCount; i++) {
    const h = computePlantHealth(arm, i, day, state);
    if (h.alive) {
      alive++;
      aliveCount++;
      damageSum += h.damage / Math.max(0.01, profile.lethalDose);
    } else {
      if (h.deathDay < firstDeathDay) firstDeathDay = h.deathDay;
      const cause = h.causeOfDeath ?? "stress";
      causes[cause] = (causes[cause] ?? 0) + 1;
    }
  }

  const topCause = Object.entries(causes)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    total: arm.plantCount,
    alive,
    dead: arm.plantCount - alive,
    firstDeathDay,
    topCause,
    meanDamageFrac: aliveCount > 0 ? damageSum / aliveCount : 0,
  };
}

function clamp01(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
