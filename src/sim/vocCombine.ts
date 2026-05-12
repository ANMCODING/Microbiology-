import type { ChemicalId, StressVector } from "../types";
import { CHEMICALS } from "../data/loader";

/**
 * Hard-coded fallback vectors for the original 4 VOCs.
 *
 * The lab now reads stress vectors directly from the JSON chemical library
 * (`src/data/chemicals/<id>.json`). This map only kicks in if a chemical
 * id isn't in the JSON registry — useful as a safety net while the data
 * folder is being populated.
 */
export const VOC_BASE_VECTOR: Record<string, StressVector> = {
  ethylene: {
    heightSuppress: 0.35, necrosis: 0.15, curl: 0.55, stomatalClose: 0.6,
    pigmentation: 0.2, chlorosis: 0.7, defenseProteins: 0.1, wilting: 0.15,
  },
  meja: {
    heightSuppress: 0.25, necrosis: 0.05, curl: 0.15, stomatalClose: 0.2,
    pigmentation: 0.85, chlorosis: 0.05, defenseProteins: 0.95, wilting: 0.05,
  },
  mesa: {
    heightSuppress: 0.15, necrosis: 0.05, curl: 0.1, stomatalClose: 0.15,
    pigmentation: 0.65, chlorosis: 0.1, defenseProteins: 0.8, wilting: 0.05,
  },
  linalool: {
    heightSuppress: 0.2, necrosis: 0.1, curl: 0.2, stomatalClose: 0.3,
    pigmentation: 0.4, chlorosis: 0.25, defenseProteins: 0.45, wilting: 0.1,
  },
};

const ZERO_VEC: StressVector = {
  heightSuppress: 0, necrosis: 0, curl: 0, stomatalClose: 0,
  pigmentation: 0, chlorosis: 0, defenseProteins: 0, wilting: 0,
};

/** Resolve any chemical id (legacy VocId or new JSON id) to its base vector.
 *  Prefers the data-driven JSON value, falls back to the hardcoded map for
 *  the original 4 VOCs, finally a zero vector. */
export function chemicalBaseVector(id: ChemicalId): StressVector {
  const fromJson = CHEMICALS[id]?.simulationVector;
  if (fromJson) return fromJson as StressVector;
  return VOC_BASE_VECTOR[id] ?? ZERO_VEC;
}

const AXES: (keyof StressVector)[] = [
  "heightSuppress", "necrosis", "curl", "stomatalClose",
  "pigmentation", "chlorosis", "defenseProteins", "wilting",
];

const ZERO: StressVector = {
  heightSuppress: 0, necrosis: 0, curl: 0, stomatalClose: 0,
  pigmentation: 0, chlorosis: 0, defenseProteins: 0, wilting: 0,
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/**
 * Combine a list of VOCs (mono = single, poly = 2..3) into one StressVector.
 *
 * Rules:
 *  - Each axis = sum of base contributions, capped at 1 (or 2 for pigmentation).
 *  - Synergy term: for axes where the smallest contribution is > 0 and n >= 2,
 *    add α · min(v_i) · (n − 1) — this rewards combinations where every VOC
 *    pushes the same axis (e.g. MeJA + MeSA both raising defenseProteins).
 *  - Antagonism: heightSuppress synergy is *halved* — multiple suppressors
 *    don't simply stack into "dead plant".
 */
export function combineVocs(vocs: ChemicalId[]): StressVector {
  if (vocs.length === 0) return { ...ZERO };
  const vectors = vocs.map((id) => chemicalBaseVector(id));
  const n = vectors.length;
  const out: StressVector = { ...ZERO };
  const ALPHA = 0.45;

  // Data-driven multiplier from the JSON synergies block:
  //   1.0 = neutral, >1.0 = synergy, <1.0 = antagonism.
  // We compute one multiplier per axis by counting how many active pairs
  // declare each other in synergizesWith / antagonizesWith.
  const synergyMul = computeJsonSynergyMul(vocs);

  for (const axis of AXES) {
    let sum = 0;
    let min = Infinity;
    for (const v of vectors) {
      const x = v[axis];
      sum += x;
      if (x < min) min = x;
    }
    let combined = sum;
    if (n >= 2 && min > 0) {
      const baseSyn = axis === "heightSuppress" ? ALPHA * 0.5 : ALPHA;
      combined += baseSyn * min * (n - 1);
    }
    // apply data-driven JSON synergy/antagonism on top
    combined *= synergyMul;
    const cap = axis === "pigmentation" ? 2 : 1;
    out[axis] = clamp(combined, 0, cap);
  }

  return out;
}

/**
 * Inspect the chemical JSONs for the active set and compute a single
 * synergy multiplier:
 *   +0.10 per documented `synergizesWith` pair (capped at +0.40)
 *   −0.10 per documented `antagonizesWith` pair (capped at −0.30)
 * Returns a multiplier in [0.7, 1.4]. Missing JSON → 1.0 (neutral).
 */
function computeJsonSynergyMul(ids: ChemicalId[]): number {
  if (ids.length < 2) return 1.0;
  let synergy = 0;
  let antagonism = 0;
  for (let i = 0; i < ids.length; i++) {
    const a = CHEMICALS[ids[i]];
    if (!a) continue;
    const synWith = a.synergies?.synergizesWith ?? [];
    const antWith = a.synergies?.antagonizesWith ?? [];
    for (let j = i + 1; j < ids.length; j++) {
      const bId = ids[j];
      if (synWith.includes(bId)) synergy++;
      if (antWith.includes(bId)) antagonism++;
      // also the reverse: b → a
      const b = CHEMICALS[bId];
      if (b) {
        if ((b.synergies?.synergizesWith ?? []).includes(ids[i])) synergy++;
        if ((b.synergies?.antagonizesWith ?? []).includes(ids[i])) antagonism++;
      }
    }
  }
  // each pair contributes once; both directions ⇒ divide by 2 max
  const synergyBoost = Math.min(0.40, synergy * 0.05);
  const antagonismDamp = Math.min(0.30, antagonism * 0.05);
  return Math.max(0.7, Math.min(1.4, 1 + synergyBoost - antagonismDamp));
}
