/**
 * Synthesize a `VarietyConfig` from a JSON `Plant` so the existing
 * `ColeusPlant` mesh builder can render every species in the library
 * with distinguishable geometry, without having to write a brand-new
 * renderer per plant.
 *
 * What it maps from the plant JSON:
 *   geometry.leafColor   → variety.leafColor
 *   geometry.veinColor   → variety.accentColor
 *   geometry.stemColor   → variety.stemColor
 *   geometry.serrations  → variety.serrations  (0 → small minimum so the
 *                          leaf shape builder still triangulates)
 *   geometry.leafAspectRatio → variety.aspect
 *   geometry.cupping     → variety.cupping
 *   geometry.droop       → variety.droop
 *   geometry.gloss       → variety.gloss
 *   geometry.leafLengthCm → coarse leafSize bucket
 *
 * Pose-specific overrides (CAM rosettes, monocot blades, fronds) are
 * approximated by tweaking serrations & aspect to widen the visual
 * distance between the plant species — this is "different and okay"
 * rather than photoreal, per project priorities.
 */

import type { Plant } from "../data/plant.schema";
import type { VarietyConfig } from "../types";

function hexToInt(h: string): number {
  return parseInt(h.replace("#", ""), 16);
}

type CharacterOverride = Partial<{
  serrations: number;
  aspect: number;
  cupping: number;
  droop: number;
  leafSize: number;
  leavesPerNode: number;
  phyllotaxy: VarietyConfig["phyllotaxy"];
  matureHeightUnits: number;
}>;

const CHARACTER_OVERRIDES: Record<string, CharacterOverride> = {
  // monocot grass blades — long, narrow, smooth-edged, near-zero cup,
  // single leaf per node, alternate phyllotaxy.
  corn:    { serrations: 3, aspect: 4.0, cupping: 0.05, droop: 0.5, leafSize: 1.4,
             leavesPerNode: 1, phyllotaxy: "alternate", matureHeightUnits: 1.5 },
  rice:    { serrations: 3, aspect: 5.5, cupping: 0.03, droop: 0.6, leafSize: 0.9,
             leavesPerNode: 1, phyllotaxy: "alternate", matureHeightUnits: 0.9 },

  // succulent CAM rosette — short fleshy "leaves" all from base
  aloe:    { serrations: 5, aspect: 3.2, cupping: 0.85, droop: 0.05, leafSize: 1.05,
             leavesPerNode: 1, phyllotaxy: "rosette", matureHeightUnits: 0.55 },

  // fern fronds — single tuft at the apex, many fine pinnae, drooping
  fern:    { serrations: 22, aspect: 3.5, cupping: 0.10, droop: 0.55, leafSize: 0.85,
             leavesPerNode: 1, phyllotaxy: "fronds", matureHeightUnits: 0.65 },

  // small herbaceous opposite-leaved (Lamiaceae like Coleus)
  mint:    { serrations: 11, aspect: 1.8, cupping: 0.20, droop: 0.18, leafSize: 0.65,
             leavesPerNode: 2, phyllotaxy: "decussate", matureHeightUnits: 0.5 },

  // small bushy rosette dicot
  arabidopsis: { serrations: 7, aspect: 2.2, cupping: 0.25, droop: 0.30, leafSize: 0.55,
                 leavesPerNode: 1, phyllotaxy: "rosette", matureHeightUnits: 0.30 },

  // tomato — alternate compound leaves, droopy
  tomato:  { serrations: 10, aspect: 1.7, cupping: 0.22, droop: 0.32, leafSize: 1.05,
             leavesPerNode: 1, phyllotaxy: "alternate", matureHeightUnits: 1.2 },

  // soybean — broad alternate trifoliolate
  soybean: { serrations: 6, aspect: 1.5, cupping: 0.18, droop: 0.25, leafSize: 0.95,
             leavesPerNode: 1, phyllotaxy: "alternate", matureHeightUnits: 0.85 },

  // lettuce — large frilly ruffled rosette
  lettuce: { serrations: 14, aspect: 1.3, cupping: 0.45, droop: 0.20, leafSize: 1.15,
             leavesPerNode: 1, phyllotaxy: "rosette", matureHeightUnits: 0.30 },
};

export function varietyFromPlant(plant: Plant): VarietyConfig {
  const g = plant.geometry;
  const overrides = CHARACTER_OVERRIDES[plant.id] ?? {};

  const baseLeafSize = (() => {
    // map a 1..30 cm leaf length to roughly 0.5..1.4
    const s = Math.max(1, g.leafLengthCm) / 8;
    return Math.max(0.5, Math.min(1.4, s));
  })();

  const serrations = Math.max(3, Math.round(overrides.serrations ?? g.serrations ?? 7));
  const aspect = Math.max(0.8, Math.min(6, overrides.aspect ?? g.leafAspectRatio ?? 1.35));
  const cupping = Math.max(0, Math.min(1, overrides.cupping ?? g.cupping ?? 0.3));
  const droop = Math.max(0, Math.min(1, overrides.droop ?? g.droop ?? 0.25));
  const leafSize = Math.max(0.5, Math.min(1.4, overrides.leafSize ?? baseLeafSize));
  const gloss = Math.max(0, Math.min(1, g.gloss ?? 0.5));

  // Map JSON `phyllotaxy` to renderer enum (defaults to decussate so any
  // unknown value still renders).
  const jsonPhyl = g.phyllotaxy;
  const phyllotaxy: VarietyConfig["phyllotaxy"] =
    overrides.phyllotaxy ??
    (jsonPhyl === "alternate" ? "alternate"
      : jsonPhyl === "rosette" || jsonPhyl === "basal" ? "rosette"
      : jsonPhyl === "fronds" ? "fronds"
      : "decussate");

  // leavesPerNode from JSON when present (1 for monocots, 2 for opposite),
  // overridable per-plant.
  const leavesPerNode = overrides.leavesPerNode ??
    (typeof g.leavesPerNode === "number" ? g.leavesPerNode : 2);

  // Mature height in scene units — converted from cm with a soft cap so
  // the camera can still frame the bench. ≈ 1.0 unit = 60 cm.
  const matureHeightUnits = overrides.matureHeightUnits ??
    Math.max(0.25, Math.min(1.7, g.matureHeightCm / 60));

  return {
    label: plant.commonName,
    leafColor: hexToInt(g.leafColor),
    accentColor: hexToInt(g.veinColor),
    stemColor: hexToInt(g.stemColor),
    serrations,
    aspect,
    saturation: 1.0,
    cupping,
    droop,
    leafSize,
    gloss,
    leavesPerNode,
    phyllotaxy,
    matureHeightUnits,
  };
}
