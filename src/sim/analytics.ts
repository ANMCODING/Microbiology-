import type { ExperimentArm, SimulationState, StressVector, VarietyConfig } from "../types";
import { weekOf } from "../types";
import { computeArmStress } from "./treatments";
import { computePlantMorph, type PlantMorph } from "./growth";
import {
  computeAnomaly, applyAnomaly, describeAnomaly,
  computePlantNoise, applyPlantNoise,
} from "./anomalies";
import { VARIETIES } from "../constants/theme";

/**
 * Pure (no THREE.js) computation of the displayed leaf color zones for one
 * plant. Mirrors the logic in ColeusPlant.computePalette so the analytics
 * panel can show the same hex values you see on the 3D mesh.
 */
export interface LeafPalette {
  outer: { r: number; g: number; b: number };
  mid:   { r: number; g: number; b: number };
  inner: { r: number; g: number; b: number };
  /** "displayed" / dominant color = mid blended over outer by midOpacity, then
   *  inner blended over that by innerOpacity. This is what the eye sees. */
  dominant: { r: number; g: number; b: number };
}

const hexToRgb = (n: number) => ({
  r: (n >>> 16) & 0xff,
  g: (n >>> 8)  & 0xff,
  b:  n         & 0xff,
});

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const lerpRgb = (
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
) => ({
  r: lerp(a.r, b.r, t),
  g: lerp(a.g, b.g, t),
  b: lerp(a.b, b.b, t),
});

export function rgbToHex(c: { r: number; g: number; b: number }): string {
  const ch = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`.toUpperCase();
}

const CAROTENOID = hexToRgb(0xd9c34a);
const DULL_GREY  = hexToRgb(0x4a4d3a);
const ANTHO_DEEP = hexToRgb(0x4a0d44);
const MAGENTA    = hexToRgb(0xff3aa6);

/** Compute the displayed palette for one plant under a given stress. */
export function computeLeafPalette(variety: VarietyConfig, stress: StressVector): LeafPalette {
  let outer = hexToRgb(variety.leafColor);
  if (stress.chlorosis > 0) outer = lerpRgb(outer, CAROTENOID, stress.chlorosis * 0.85);
  if (stress.wilting   > 0) outer = lerpRgb(outer, DULL_GREY, stress.wilting   * 0.35);

  const accent = hexToRgb(variety.accentColor);
  const mid = lerpRgb(accent, ANTHO_DEEP, 0.35);
  const midOpacity = Math.min(0.95, 0.35 + stress.pigmentation * 0.5);

  const inner = MAGENTA;
  const innerOpacity = Math.min(0.85, Math.max(0, stress.pigmentation - 0.5) * 0.9);

  // dominant = stack: outer → mid → inner
  let dominant = lerpRgb(outer, mid, midOpacity);
  dominant = lerpRgb(dominant, inner, innerOpacity);

  return { outer, mid, inner, dominant };
}

/** A per-plant snapshot used by the analytics + today panels. */
export interface PlantStat {
  plantIndex: number;
  morph: PlantMorph;
  stress: StressVector;
  palette: LeafPalette;
  /** anomaly active on this plant today, or undefined */
  anomaly?: { kind: string; label: string };
}

/** Aggregated stats across all plants in one arm. */
export interface ArmAggregate {
  armId: string;
  plantCount: number;
  meanHeightCm: number;
  stdHeightCm: number;
  meanLeafCount: number;
  meanPigmentation: number;
  meanChlorosis: number;
  meanWilting: number;
  meanDefense: number;
  /** mean dominant leaf color across all plants (0..255 RGB) */
  meanDominant: { r: number; g: number; b: number };
  /** mean color hex (uppercase #RRGGBB) for display */
  meanDominantHex: string;
  /** colour dispersion = mean Euclidean RGB distance from the mean */
  colorDispersion: number;
  /** count of plants currently showing an anomaly today */
  anomalyCount: number;
}

/** Per-plant stats for one arm at the given day. */
export function computeArmPlantStats(
  s: SimulationState,
  arm: ExperimentArm,
): PlantStat[] {
  const week = weekOf(s.day);
  const variety = VARIETIES[arm.variety];
  const baseStress = computeArmStress(arm, s.day);

  const out: PlantStat[] = [];
  for (let i = 0; i < arm.plantCount; i++) {
    const noise = computePlantNoise(s, arm, i);
    const anomaly = computeAnomaly(s, arm, i);

    // Stress = arm baseline → + Gaussian biological jitter → + discrete anomaly
    let stress = applyPlantNoise(baseStress, noise);
    if (anomaly.kind !== "none") stress = applyAnomaly(stress, anomaly);

    const morph = computePlantMorph(week, stress);
    // Apply per-plant vigor (genetic / micro-env identity)
    morph.height    *= noise.vigor;
    morph.leafScale *= 1 + (noise.vigor - 1) * 0.5;
    morph.leafPairs  = Math.max(0, morph.leafPairs + noise.leafBias);
    morph.dropPairs  = Math.min(morph.leafPairs, morph.dropPairs);

    const palette = computeLeafPalette(variety, stress);
    out.push({
      plantIndex: i,
      morph,
      stress,
      palette,
      anomaly: anomaly.kind === "none"
        ? undefined
        : { kind: anomaly.kind, label: describeAnomaly(anomaly.kind) },
    });
  }
  return out;
}

/** Aggregate one arm's plants into a bench-level summary. */
export function aggregateArm(s: SimulationState, arm: ExperimentArm): ArmAggregate {
  const stats = computeArmPlantStats(s, arm);
  const n = Math.max(1, stats.length);

  let sumH = 0, sumLeaves = 0, sumPig = 0, sumChl = 0, sumWilt = 0, sumDef = 0;
  let sumR = 0, sumG = 0, sumB = 0;
  for (const p of stats) {
    sumH      += p.morph.height * 10; // cm
    sumLeaves += p.morph.leafPairs * 2;
    sumPig    += p.stress.pigmentation;
    sumChl    += p.stress.chlorosis;
    sumWilt   += p.stress.wilting;
    sumDef    += p.stress.defenseProteins;
    sumR      += p.palette.dominant.r;
    sumG      += p.palette.dominant.g;
    sumB      += p.palette.dominant.b;
  }
  const meanHeight = sumH / n;
  const meanDominant = { r: sumR / n, g: sumG / n, b: sumB / n };

  // height stdev
  let varH = 0;
  for (const p of stats) varH += (p.morph.height * 10 - meanHeight) ** 2;
  const stdH = n > 1 ? Math.sqrt(varH / (n - 1)) : 0;

  // mean RGB distance from the mean color
  let dispSum = 0;
  for (const p of stats) {
    const dr = p.palette.dominant.r - meanDominant.r;
    const dg = p.palette.dominant.g - meanDominant.g;
    const db = p.palette.dominant.b - meanDominant.b;
    dispSum += Math.sqrt(dr * dr + dg * dg + db * db);
  }
  const dispersion = dispSum / n;

  return {
    armId: arm.id,
    plantCount: stats.length,
    meanHeightCm: meanHeight,
    stdHeightCm: stdH,
    meanLeafCount: sumLeaves / n,
    meanPigmentation: sumPig / n,
    meanChlorosis: sumChl / n,
    meanWilting: sumWilt / n,
    meanDefense: sumDef / n,
    meanDominant,
    meanDominantHex: rgbToHex(meanDominant),
    colorDispersion: dispersion,
    anomalyCount: stats.reduce((a, p) => a + (p.anomaly ? 1 : 0), 0),
  };
}

/** Reference baseline plant for "vs control" comparisons:
 *  same variety + day, but with zero-stress (no VOCs) and the arm's water/humidity. */
export function baselineHeightCm(s: SimulationState, arm: ExperimentArm): number {
  const baselineArm: ExperimentArm = { ...arm, activeVocs: [], delivery: "both" };
  const stress = computeArmStress(baselineArm, s.day);
  const morph = computePlantMorph(weekOf(s.day), stress);
  return morph.height * 10;
}
