import type { AnomalyKind, ExperimentArm, PlantAnomaly, SimulationState, StressVector } from "../types";

/**
 * Deterministic per-plant random error model.
 *
 * Two layers (both gated by state.randomErrors):
 *
 *   1. Continuous Gaussian "biological variability" — each plant in an arm
 *      gets a stable per-plant identity (genetic vigor + small additive
 *      stress jitter). Sampled around the true value, so averaging N plants
 *      converges on the arm mean (more N → better precision). This is the
 *      "Gaussian random error" that real plant studies recommend reducing
 *      by increasing sample size.
 *
 *   2. Discrete daily anomaly events (scorch, wilt, leaf drop, …) — these
 *      are episodic spikes on top of the continuous variability.
 *
 * All randomness is deterministic in (runSeed, arm.id, plantIndex, day) so
 * scrubbing the timeline back and forth is idempotent.
 */

const ZERO_DELTA: Partial<StressVector> = {};
const NONE: PlantAnomaly = { kind: "none", delta: ZERO_DELTA, dropPairs: 0 };

/** mulberry32 — small, fast, deterministic */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap string → 32-bit hash so each arm.id contributes a unique seed. */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mix(a: number, b: number, c: number, d: number): number {
  let x = (a * 374761393 + b * 668265263 + c * 2147483647 + d * 1597334677) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return x >>> 0;
}

export function computeAnomaly(
  s: SimulationState,
  arm: ExperimentArm,
  plantIndex: number,
): PlantAnomaly {
  if (!s.randomErrors) return NONE;

  const dayBucket = Math.floor(s.day);
  const armSeed = hashStr(arm.id);
  const seed = mix(s.runSeed, armSeed, plantIndex, dayBucket);
  const r = rng(seed);

  // base daily probability ~6%, +up-to-8% with concentration (only if treated)
  const cBoost = arm.activeVocs.length > 0
    ? 0.08 * Math.min(1, arm.vocConcentration / 10)
    : 0;
  const baseProb = 0.06 + cBoost;
  if (r() > baseProb) return NONE;

  const roll = r();
  let kind: AnomalyKind;
  if (roll < 0.25)      kind = "scorch";
  else if (roll < 0.45) kind = "necrosisSpot";
  else if (roll < 0.65) kind = "anthocyaninFlare";
  else if (roll < 0.85) kind = "wiltEvent";
  else                  kind = "leafDrop";

  const mag = 0.3 + 0.6 * r();

  switch (kind) {
    case "scorch":
      return { kind, delta: { chlorosis: 0.5 * mag }, dropPairs: 0 };
    case "necrosisSpot":
      return { kind, delta: { necrosis: 0.6 * mag }, dropPairs: 0 };
    case "anthocyaninFlare":
      return { kind, delta: { pigmentation: 0.9 * mag, defenseProteins: 0.3 * mag }, dropPairs: 0 };
    case "wiltEvent":
      return { kind, delta: { wilting: 0.7 * mag, curl: 0.3 * mag }, dropPairs: 0 };
    case "leafDrop":
      return { kind, delta: { heightSuppress: 0.1 * mag }, dropPairs: 1 + Math.floor(mag * 2) };
    default:
      return NONE;
  }
}

export function applyAnomaly(base: StressVector, anom: PlantAnomaly): StressVector {
  if (anom.kind === "none") return base;
  const out: StressVector = { ...base };
  for (const k of Object.keys(anom.delta) as (keyof StressVector)[]) {
    const add = anom.delta[k] ?? 0;
    const cur = out[k];
    const cap = k === "pigmentation" ? 2 : 1;
    out[k] = Math.min(cap, cur + add);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Continuous per-plant Gaussian noise (biological variability)
// ---------------------------------------------------------------------------

/**
 * Per-plant identity noise:
 *  - vigor:        multiplicative on height + leafScale (≈1.0 ± ~7%)
 *  - leafBias:     ±integer offset on leaf-pair count (rounds to nearest)
 *  - stressDelta:  small additive offsets on each stress axis
 *  - msNoise:      relative ±%-noise applied to every LC-MS peak intensity
 *                  (instrument + biological replicate variance)
 *
 * The noise is *stable per plant* (does not wobble frame-to-frame) so the
 * plant has a recognisable identity you can return to on the timeline. The
 * day is mixed in only weakly (low-frequency drift) so longitudinal
 * measurements still look smooth.
 */
export interface PlantNoise {
  vigor: number;
  leafBias: number;
  stressDelta: Partial<StressVector>;
  msNoise: number;
}

const ZERO_NOISE: PlantNoise = {
  vigor: 1, leafBias: 0, stressDelta: {}, msNoise: 0,
};

/** Box–Muller: a deterministic PRNG → standard-normal sample. */
function gauss(r: () => number): number {
  // protect log(0)
  const u1 = Math.max(1e-9, r());
  const u2 = r();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Sigmas tuned to typical plant CVs reported in literature:
 *   - height CV ≈ 6–10%   → VIGOR_SIGMA
 *   - stress trait noise  ≈ 3–8 percentage points additive
 *   - LC-MS replicate CV  ≈ 8–15%
 */
const VIGOR_SIGMA = 0.07;
const LEAF_SIGMA  = 0.9;          // leaf-pair count jitter (rounded)
const STRESS_SIGMA = {
  heightSuppress:  0.025,
  necrosis:        0.035,
  curl:            0.045,
  stomatalClose:   0.035,
  pigmentation:    0.080,
  chlorosis:       0.040,
  defenseProteins: 0.050,
  wilting:         0.040,
} as const;
const MS_NOISE_SIGMA = 0.10;      // 10% relative LC-MS replicate noise

export function computePlantNoise(
  s: SimulationState,
  arm: ExperimentArm,
  plantIndex: number,
): PlantNoise {
  if (!s.randomErrors) return ZERO_NOISE;

  // Per-plant identity seed (stable across days — independent of day bucket)
  const armSeed = hashStr(arm.id);
  const idSeed  = mix(s.runSeed ^ 0xA5A5_5A5A, armSeed, plantIndex, 7919);
  const r = rng(idSeed);

  const vigor    = clamp(1 + gauss(r) * VIGOR_SIGMA, 0.65, 1.35);
  const leafBias = Math.round(gauss(r) * LEAF_SIGMA);

  const stressDelta: Partial<StressVector> = {};
  for (const k of Object.keys(STRESS_SIGMA) as (keyof StressVector)[]) {
    stressDelta[k] = gauss(r) * STRESS_SIGMA[k];
  }

  const msNoise = clamp(1 + gauss(r) * MS_NOISE_SIGMA, 0.6, 1.4) - 1;

  return { vigor, leafBias, stressDelta, msNoise };
}

/** Add the noise's stress delta to a base stress vector and clamp. */
export function applyPlantNoise(base: StressVector, noise: PlantNoise): StressVector {
  if (noise === ZERO_NOISE) return base;
  const out: StressVector = { ...base };
  for (const k of Object.keys(noise.stressDelta) as (keyof StressVector)[]) {
    const add = noise.stressDelta[k] ?? 0;
    const cap = k === "pigmentation" ? 2 : 1;
    out[k] = Math.max(0, Math.min(cap, out[k] + add));
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function describeAnomaly(kind: AnomalyKind): string {
  switch (kind) {
    case "scorch":           return "leaf scorch";
    case "necrosisSpot":     return "necrosis spot";
    case "anthocyaninFlare": return "anthocyanin flare";
    case "wiltEvent":        return "turgor crash";
    case "leafDrop":         return "lower-leaf drop";
    case "none":             return "—";
  }
}
