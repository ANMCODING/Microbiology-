import type { StressVector } from "../types";

/**
 * Growth model for one Coleus plant over a 1-year (365-day) timeline.
 *
 * Real Coleus blumei matures from a young plant to full canopy in roughly
 * 12–14 weeks. After that, growth plateaus and the plant enters a long
 * mature phase punctuated by senescence (lower-leaf drop) and seasonal
 * variation. We model this in two stages:
 *
 *   maturity(week) = clamp(week / MATURE_WEEKS, 0, 1)        // 0..1
 *   senescence(week) = clamp((week - SENESCE_START) / 36, 0, 1)
 *
 * All quantities are smooth functions of fractional week so the renderer
 * can scrub day-by-day without keyframe jumps.
 *
 * Baseline (control) growth uses a logistic-ish curve in maturity:
 *   height(t)     = H_MAX * t / (k_h + t)
 *   leafCount(t)  = round( L_MAX * t / (k_l + t) )
 *   leafSize(t)   = S_MAX * sqrt(t / (k_s + t))
 *   stemRadius(t) = R_MIN + (R_MAX - R_MIN) * (t)^0.7
 */

const MATURE_WEEKS = 14;
const SENESCE_START = 16;

const H_MAX = 4.5;     // world units (max plant height at maturity)
const K_H = 0.32;      // tuned so half-max ~ week 4
const L_MAX = 22;
const K_L = 0.36;
const S_MAX = 0.95;
const K_S = 0.28;
const R_MIN = 0.025;
const R_MAX = 0.085;

export interface PlantMorph {
  height: number;
  leafPairs: number;     // integer, total visible
  leafScale: number;
  stemRadius: number;
  /** number of branching nodes (stem segments above ground) */
  nodes: number;
  /** continuous "growth fraction" 0..1 used for animations */
  growthFrac: number;
  /** 0..1 senescence factor (drives lower-leaf drop) */
  senescence: number;
  /** integer pairs to drop from the bottom of the stem (lower-leaf drop) */
  dropPairs: number;
  /** Set when the plant is dead (`alive: false`). The renderer reads this
   *  to render brown/grey, drop all leaves, freeze sway. */
  dead?: boolean;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export function computePlantMorph(week: number, stress: StressVector): PlantMorph {
  const w = Math.max(0, week);
  const maturity = clamp(w / MATURE_WEEKS);
  const senescence = clamp((w - SENESCE_START) / 36);

  const baseHeight = H_MAX * (maturity / (K_H + maturity));
  const baseLeafs  = L_MAX * (maturity / (K_L + maturity));
  const baseSize   = S_MAX * Math.sqrt(maturity / (K_S + maturity));
  const baseRadius = R_MIN + (R_MAX - R_MIN) * Math.pow(maturity, 0.7);

  const supp = 1 - stress.heightSuppress;

  const height = Math.max(0.05, baseHeight * supp);
  const leafScale = Math.max(0.05, baseSize * (0.65 + 0.35 * supp));
  // senescence + stress drives lower-leaf drop
  const stressDrop = (stress.heightSuppress + stress.necrosis + stress.chlorosis) / 3;
  const senDrop = senescence * 0.35 + Math.max(0, stressDrop - 0.5) * 0.6;
  const baseLeafCount = baseLeafs * (0.5 + 0.5 * supp);
  const leafPairs = Math.max(0, Math.round(baseLeafCount));
  const dropPairs = Math.min(leafPairs, Math.round(leafPairs * senDrop));
  const stemRadius = baseRadius * (0.7 + 0.3 * supp);
  const nodes = Math.max(1, Math.min(11, leafPairs));

  return {
    height,
    leafPairs,
    leafScale,
    stemRadius,
    nodes,
    growthFrac: maturity,
    senescence,
    dropPairs,
  };
}
