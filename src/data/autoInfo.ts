/**
 * Auto-generated `InfoEntry` builders for the 40-chemical / 10-plant
 * library. The encyclopedia in `encyclopedia.ts` only carries hand-written
 * entries for the original 4 VOCs; everything else uses these builders so
 * the right-click info card and entrance hover panel work for *every*
 * chemical and plant the user can pick.
 *
 * The builders synthesise a 3-sentence blurb from the JSON's structured
 * fields (`category`, `subCategory`, `phase`, `educationalContext`,
 * `simulationVector`, …) — never from a hardcoded copy of the prose.
 * If a more nuanced manual entry exists in `encyclopedia.ts` it is
 * preferred via `chemicalInfo()` / `plantInfo()`.
 */

import type { InfoEntry } from "./encyclopedia";
import { VOC_INFO, VARIETY_INFO } from "./encyclopedia";
import { CHEMICALS, getChemical, getPlant, PLANTS } from "./loader";
import type { Chemical } from "./chemical.schema";
import type { Plant } from "./plant.schema";

const PHASE_TEXT: Record<string, string> = {
  liquid: "liquid (delivered as soil drench or foliar spray)",
  gas: "gas (delivered by fumigation / vapor-phase exposure)",
  solid: "solid (typically delivered as a soil amendment or root drench solution)",
  aerosol: "aerosol (delivered as fine droplets that settle on leaves)",
};
const CATEGORY_TEXT: Record<string, string> = {
  voc: "volatile organic compound",
  signaling_voc: "plant-defense signaling VOC",
  gaseous_hormone: "gaseous plant hormone",
  plant_hormone: "endogenous plant hormone",
  heavy_metal: "heavy-metal contaminant",
  acid_rain: "acid-rain / atmospheric acid pollutant",
  fertilizer: "macronutrient fertilizer input",
  pesticide: "agricultural pesticide / xenobiotic",
  salinity: "salinity stressor (ionic + osmotic load)",
  greenhouse_gas: "atmospheric greenhouse gas",
  pharmaceutical: "pharmaceutical pollutant / emerging contaminant",
};
const STRESS_AXIS_LABEL: Record<string, string> = {
  heightSuppress: "growth suppression",
  necrosis: "necrosis",
  curl: "leaf curl",
  stomatalClose: "stomatal closure",
  pigmentation: "pigmentation",
  chlorosis: "chlorosis",
  defenseProteins: "defense-protein induction",
  wilting: "wilting",
};

function dominantAxes(c: Chemical, n = 2): string[] {
  const v = c.simulationVector;
  const ranked = (Object.keys(v) as (keyof typeof v)[])
    .map((k) => ({ k, val: v[k] / (k === "pigmentation" ? 2 : 1) }))
    .sort((a, b) => b.val - a.val)
    .slice(0, n)
    .filter((x) => x.val >= 0.2);
  return ranked.map((r) => STRESS_AXIS_LABEL[r.k] ?? String(r.k));
}

function shortDescription(c: Chemical): string {
  const cat = CATEGORY_TEXT[c.subCategory ?? ""] ??
              CATEGORY_TEXT[c.category] ??
              `${c.category.replace(/_/g, " ")}`;
  const phase = PHASE_TEXT[c.phase] ?? `${c.phase}-phase agent`;
  return `${c.commonName} (${c.formula}) is a ${cat}, ${phase}.`;
}

function effectsSentence(c: Chemical): string {
  const axes = dominantAxes(c, 2);
  const eduRaw = (c.educationalContext as Record<string, unknown> | undefined);
  const eduWhy = typeof eduRaw?.whyStudentsCare === "string"
    ? (eduRaw.whyStudentsCare as string)
    : null;
  if (axes.length === 0 && !eduWhy) {
    return `In the simulator it nudges the plant subtly across multiple axes — visible mostly through the LC-MS readout.`;
  }
  if (axes.length === 0 && eduWhy) {
    return `In the simulator: ${trimSentence(eduWhy)}`;
  }
  const axisStr = axes.length === 1
    ? `dominant ${axes[0]}`
    : `most pronounced as ${axes[0]} and ${axes[1]}`;
  return `In the simulator its effect is ${axisStr}; the LC-MS readout grows the chemical's signature peaks alongside the visible morphological change.`;
}

function relevanceSentence(c: Chemical): string {
  const eduRaw = (c.educationalContext as Record<string, unknown> | undefined);
  const real = typeof eduRaw?.realWorldIssue === "string"
    ? (eduRaw.realWorldIssue as string)
    : null;
  const sources = typeof eduRaw?.realWorldSources === "string"
    ? (eduRaw.realWorldSources as string)
    : null;
  if (real) return `Real-world relevance: ${trimSentence(real)}.`;
  if (sources) return `Where it comes from in the real world: ${trimSentence(sources)}.`;
  return `It belongs to the broader ${(c.category ?? "chemical").replace(/_/g, " ")} class studied in plant-pollutant research.`;
}

/** Build an InfoEntry from a Chemical JSON. */
export function chemicalToInfo(c: Chemical): InfoEntry {
  return {
    title: c.commonName,
    subtitle: `${c.formula} · ${(c.subCategory ?? c.category).replace(/_/g, " ")}`,
    hex: c.color,
    blurb: [
      shortDescription(c),
      effectsSentence(c),
      relevanceSentence(c),
    ],
  };
}

/** Resolve an InfoEntry for a chemical id — manual entry first, JSON fallback. */
export function chemicalInfo(id: string): InfoEntry | null {
  if (VOC_INFO[id]) return VOC_INFO[id];
  const c = getChemical(id);
  if (!c) return null;
  return chemicalToInfo(c);
}

// ──────────────────────────────────────────────────────────────────────────
// Plants

function plantOverview(p: Plant): string {
  return `${p.commonName} (${p.scientificName}) is a ${p.lifecycle} ${p.lifeForm} in the ${p.family} family using ${p.physiology.photosynthesisPathway} photosynthesis.`;
}

function plantSimulator(p: Plant): string {
  // Pick the chemical with the highest sensitivity multiplier as the
  // "story chemical" for this species.
  const cs = p.chemicalSensitivity ?? {};
  const ranked = Object.entries(cs)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => (b[1] as number) - (a[1] as number));
  const topId = ranked[0]?.[0];
  const topVal = ranked[0]?.[1] as number | undefined;
  const topName = topId ? (CHEMICALS[topId]?.commonName ?? topId) : null;
  const heightCm = p.geometry.matureHeightCm;
  if (topName && typeof topVal === "number" && topVal > 1.4) {
    return `In the simulator it grows to roughly ${heightCm} cm with ${p.geometry.leafShape} leaves; it is hyper-sensitive to ${topName} (${topVal.toFixed(1)}× baseline) so picking that chemical produces the most dramatic visual response.`;
  }
  if (topName && typeof topVal === "number") {
    return `In the simulator it grows to roughly ${heightCm} cm with ${p.geometry.leafShape} leaves; its strongest reaction in this lab is to ${topName} (${topVal.toFixed(1)}× the Coleus baseline).`;
  }
  return `In the simulator it grows to roughly ${heightCm} cm with ${p.geometry.leafShape} leaves and reacts uniformly across the chemical library.`;
}

function plantWhy(p: Plant): string {
  const edu = p.educational as Record<string, unknown> | undefined;
  const why = typeof edu?.studentRelevance === "string"
    ? (edu.studentRelevance as string)
    : typeof edu?.scientificImportance === "string"
    ? (edu.scientificImportance as string)
    : null;
  if (why) return trimSentence(why);
  const real = typeof edu?.realWorldIssue === "string"
    ? (edu.realWorldIssue as string)
    : null;
  return real
    ? `Why it matters: ${trimSentence(real)}.`
    : `It is included as a ${p.lifeForm} reference for the multi-species comparison.`;
}

export function plantToInfo(p: Plant): InfoEntry {
  return {
    title: p.commonName,
    subtitle: `${p.scientificName} · ${p.family} · ${p.physiology.photosynthesisPathway}`,
    hex: p.geometry.leafColor,
    blurb: [plantOverview(p), plantSimulator(p), plantWhy(p)],
  };
}

export function plantInfo(id: string): InfoEntry | null {
  // Coleus has hand-written variety cards; if a known cultivar id matches
  // one of those, prefer it.
  if (id === "coleus") {
    if (VARIETY_INFO.wizard) return VARIETY_INFO.wizard;
  }
  const p = getPlant(id);
  if (!p) return null;
  return plantToInfo(p);
}

// ──────────────────────────────────────────────────────────────────────────
// utilities

function trimSentence(s: string, max = 220): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t.endsWith(".") ? t : t + ".";
  return t.slice(0, max - 1).trimEnd() + "…";
}

/** Pretty list of all chemical info entries — used for diagnostics / UIs. */
export function allChemicalInfo(): { id: string; entry: InfoEntry }[] {
  return Object.values(CHEMICALS).map((c) => ({ id: c.id, entry: chemicalInfo(c.id)! }));
}

export function allPlantInfo(): { id: string; entry: InfoEntry }[] {
  return Object.values(PLANTS).map((p) => ({ id: p.id, entry: plantInfo(p.id)! }));
}
