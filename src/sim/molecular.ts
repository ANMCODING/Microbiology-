import type { ChemicalId, ExperimentArm, StressVector, VocPeak } from "../types";
import { weekOf } from "../types";
import { computeArmStress } from "./treatments";
import { CHEMICALS, getPlant } from "../data/loader";

/**
 * Simulated LC-MS spectrum builder.
 *
 * Pipeline (now fully JSON-driven):
 *  - Each plant species contributes its `baselineLcMs` peaks (chlorophyll,
 *    rosmarinic acid, etc.) — different species ⇒ different background
 *    spectrum. These scale with chlorosis (chlorophyll-derived peaks fade
 *    when stressed) and grow with `weekFactor` over the experiment.
 *  - Each chemical applied to the bench contributes its `lcMsPeaks` block
 *    from `src/data/chemicals/<id>.json`. They scale with concentration,
 *    plant sensitivity, and the relevant stress axis (anthocyanin peaks
 *    follow `pigmentation`, defense fragments follow `defenseProteins`,
 *    MDA / oxidative markers follow `chlorosis`, etc.).
 *
 * Hardcoded fallbacks for the original 4 VOCs remain so legacy benches
 * stay valid before any plant/chemical JSON is loaded.
 */

// Legacy fallback peaks for the original 4 VOCs.
const LEGACY_PEAKS: Record<string, VocPeak[]> = {
  ethylene: [
    { mz: 87,  label: "ACC",                       base: 55, weekFactor: 1.0 },
    { mz: 117, label: "Senescence enzyme frag.",   base: 75, weekFactor: 1.0 },
    { mz: 162, label: "Chlorophyll catabolite",    base: 60, weekFactor: 1.0 },
    { mz: 384, label: "Pheophorbide a",            base: 48, weekFactor: 1.0 },
  ],
  meja: [
    { mz: 224, label: "Methyl Jasmonate",          base: 70, weekFactor: 0.9 },
    { mz: 287, label: "Anthocyanin aglycone",      base: 95, weekFactor: 1.0 },
    { mz: 449, label: "Cyanidin-3-glucoside",      base: 62, weekFactor: 1.0 },
    { mz: 332, label: "Defense protein frag.",     base: 55, weekFactor: 0.85 },
  ],
  mesa: [
    { mz: 152, label: "Methyl Salicylate",         base: 58, weekFactor: 0.9 },
    { mz: 138, label: "Salicylic acid",            base: 80, weekFactor: 1.0 },
    { mz: 287, label: "Anthocyanin aglycone",      base: 70, weekFactor: 1.0 },
    { mz: 300, label: "SA-glucoside",              base: 50, weekFactor: 0.95 },
  ],
  linalool: [
    { mz: 154, label: "Linalool",                  base: 65, weekFactor: 0.8 },
    { mz: 170, label: "Linalool oxide",            base: 50, weekFactor: 1.0 },
    { mz: 195, label: "MDA (oxidative marker)",    base: 72, weekFactor: 1.0 },
    { mz: 220, label: "Lipid peroxide",            base: 45, weekFactor: 0.9 },
  ],
};

/** Coleus baseline used when a plant doesn't expose `baselineLcMs`. */
const FALLBACK_BASELINE: VocPeak[] = [
  { mz: 893, label: "Chlorophyll a", base: 60, weekFactor: 1.0 },
  { mz: 907, label: "Chlorophyll b", base: 45, weekFactor: 1.0 },
  { mz: 138, label: "Salicylic acid", base: 18, weekFactor: 1.0 },
];

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export interface MsPoint {
  mz: number;
  intensity: number;
  label: string;
}

/** Resolve a chemical's LC-MS peak list (JSON first, legacy second). */
function chemPeaks(id: ChemicalId): VocPeak[] {
  const j = CHEMICALS[id]?.lcMsPeaks;
  if (Array.isArray(j) && j.length > 0) return j as VocPeak[];
  return LEGACY_PEAKS[id] ?? [];
}

/** Resolve a plant's baseline LC-MS peak list (JSON first, fallback second). */
function plantBaseline(plantId: string): VocPeak[] {
  const j = getPlant(plantId)?.baselineLcMs;
  if (Array.isArray(j) && j.length > 0) return j as VocPeak[];
  return FALLBACK_BASELINE;
}

/** Heuristic: peaks tagged with these substrings track the named stress axis. */
const PIGMENT_HINTS = ["anthoc", "cyanid", "pelargon", "delphin", "pigment"];
const DEFENSE_HINTS = ["pr-", "pr ", "defense", "salicyl", "jasmon", "lox", "prot"];
const CHLORO_HINTS = ["chloroph", "pheoph", "carotenoid"];
const OXID_HINTS   = ["mda", "malondialdehyd", "oxidative", "lipid perox", "ros"];

function isAnyOf(label: string, hints: string[]): boolean {
  const l = label.toLowerCase();
  for (const h of hints) if (l.includes(h)) return true;
  return false;
}

/**
 * Build the simulated LC-MS spectrum for one arm at the current day,
 * driven by the arm's mean stress vector. This is the "bench mean"
 * spectrum used when no individual plant is in focus.
 */
export function computeSpectrum(arm: ExperimentArm, day: number): MsPoint[] {
  return computeSpectrumFromStress(arm, day, computeArmStress(arm, day), 0);
}

/**
 * Per-plant LC-MS spectrum.
 *
 * Real mass spectrometry observes a *single sample* at a time — a leaf
 * disc, a tissue extract — so the m/z spectrum reflects that one plant's
 * actual metabolite levels (which differ from the bench mean because of
 * Gaussian biological + instrument noise).
 */
export function computePlantSpectrum(
  arm: ExperimentArm,
  day: number,
  plantStress: StressVector,
  msNoise = 0,
): MsPoint[] {
  return computeSpectrumFromStress(arm, day, plantStress, msNoise);
}

function computeSpectrumFromStress(
  arm: ExperimentArm,
  day: number,
  stress: StressVector,
  msNoise: number,
): MsPoint[] {
  const out = new Map<number, MsPoint>();
  const tNorm = clamp(weekOf(day) / 6);
  const c = clamp(arm.vocConcentration / 10);
  const noiseMul = 1 + msNoise;

  // ── Plant-baseline peaks (always present, modulated by chlorosis/time) ──
  const baseline = plantBaseline(arm.plantId);
  for (const p of baseline) {
    const wf = p.weekFactor ?? 1;
    let intensity = p.base * (0.4 + 0.6 * tNorm * wf);
    // Anything chlorophyll/carotenoid-like fades with chlorosis.
    if (isAnyOf(p.label, CHLORO_HINTS) || p.mz === 893 || p.mz === 907) {
      intensity *= 1 - 0.7 * stress.chlorosis;
    }
    // Anthocyanin peaks in the *baseline* (e.g. Coleus's cyanidin-3-glu)
    // get a small boost from defense pigmentation too.
    if (isAnyOf(p.label, PIGMENT_HINTS)) {
      intensity *= 0.7 + 0.4 * stress.pigmentation;
    }
    addPeak(out, { mz: p.mz, label: p.label, intensity: intensity * noiseMul });
  }

  if (arm.activeVocs.length === 0) return finalize(out);

  const isMulti = arm.activeVocs.length >= 2;

  // ── Chemical-driven peaks ──
  for (const id of arm.activeVocs) {
    const peaks = chemPeaks(id);
    for (const p of peaks) {
      const wf = p.weekFactor ?? 1;
      let intensity = p.base * (0.2 + 0.8 * tNorm * wf) * (0.4 + 1.0 * c);
      // Stress-axis modulation (data-driven via label hints)
      if (isAnyOf(p.label, PIGMENT_HINTS)) {
        intensity *= 0.5 + 0.6 * stress.pigmentation;
      }
      if (isAnyOf(p.label, DEFENSE_HINTS) || p.mz === 138 || p.mz === 300 || p.mz === 332) {
        intensity *= 0.5 + 0.8 * stress.defenseProteins;
      }
      if (isAnyOf(p.label, OXID_HINTS)) {
        intensity *= 0.4 + 1.0 * stress.chlorosis;
      }
      // Multi-chemical bench → small synergy on shared signal peaks
      if (isMulti && (isAnyOf(p.label, PIGMENT_HINTS) || isAnyOf(p.label, DEFENSE_HINTS))) {
        intensity *= 1.18;
      }
      addPeak(out, { mz: p.mz, label: p.label, intensity: intensity * noiseMul });
    }
  }

  return finalize(out);
}

function addPeak(map: Map<number, MsPoint>, peak: MsPoint) {
  const existing = map.get(peak.mz);
  if (existing) {
    // keep the most informative label (longer = usually more specific)
    if (peak.label.length > existing.label.length) existing.label = peak.label;
    existing.intensity += peak.intensity;
  } else {
    map.set(peak.mz, { ...peak });
  }
}

function finalize(map: Map<number, MsPoint>): MsPoint[] {
  return Array.from(map.values()).sort((a, b) => a.mz - b.mz);
}

/** Aggregate "secondary metabolite concentration" used to drive the
 *  molecular heatmap intensity for an arm. 0..1. */
export function computeMetaboliteIntensity(arm: ExperimentArm, day: number): number {
  const stress = computeArmStress(arm, day);
  const pig = stress.pigmentation / 2;
  const def = stress.defenseProteins;
  const chl = stress.chlorosis;
  const total = (pig * 0.45 + def * 0.4 + chl * 0.15);
  return Math.max(0, Math.min(1, total));
}
