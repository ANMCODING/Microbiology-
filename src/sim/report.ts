import type {
  ExperimentArm, RecapPrefs, SimulationState, WeeklyRecap,
} from "../types";
import { activeArm, weekOf } from "../types";
import { VOC_SHORT } from "../constants/theme";
import { computeArmStress } from "./treatments";
import { computeMicrobiome } from "./microbiome";
import { computeBenchHealth } from "./mortality";
import { computeMetaboliteIntensity } from "./molecular";
import { aggregateArm, baselineHeightCm, type ArmAggregate } from "./analytics";
import { CHEMICALS, getPlant } from "../data/loader";

/** Resolve a chemical id to a short display label.
 *  Prefers `VOC_SHORT` for the original 4 VOCs, then the JSON commonName,
 *  finally falls back to the raw id. */
function chemShort(id: string): string {
  if (VOC_SHORT[id as keyof typeof VOC_SHORT]) return VOC_SHORT[id as keyof typeof VOC_SHORT];
  return CHEMICALS[id]?.commonName ?? id;
}

function plantShort(id: string): string {
  return getPlant(id)?.commonName ?? id;
}

export interface LogEntry {
  weekTag: string;
  armId: string;
  armColor: string;
  armLabel: string;
  text: string;
}

export interface ArmSnapshot extends ArmAggregate {
  label: string;
  color: string;
  /** vs the per-arm zero-VOC baseline (negative = shorter than untreated) */
  heightDeltaPct: number;
  diversity: number;
  resistome: number;
  pathogenPct: number;
  metabIntensity: number;
}

export interface DailySnapshot {
  day: number;
  week: number;
  arms: ArmSnapshot[];
}

const fmt = (n: number) => n.toFixed(1);
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Per-frame snapshot of every arm. */
export function buildDailySnapshot(s: SimulationState): DailySnapshot {
  const arms: ArmSnapshot[] = s.arms.map((arm) => {
    const agg = aggregateArm(s, arm);
    const baseline = baselineHeightCm(s, arm);
    const heightDelta = baseline > 0
      ? (agg.meanHeightCm - baseline) / baseline
      : 0;
    const micro = computeMicrobiome(arm, s.day);
    const metab = computeMetaboliteIntensity(arm, s.day);
    return {
      ...agg,
      label: arm.label,
      color: arm.color,
      heightDeltaPct: heightDelta * 100,
      diversity: micro.diversity,
      resistome: micro.resistome,
      pathogenPct: micro.pathogenFrac * 100,
      metabIntensity: metab,
    };
  });
  return { day: s.day, week: weekOf(s.day), arms };
}

/** Per-day log entries — one per arm, summarising what changed today. */
export function buildDailyReport(s: SimulationState): LogEntry[] {
  const dayInt = Math.floor(s.day);
  const weekInt = Math.floor(weekOf(s.day));
  const entries: LogEntry[] = [];

  for (const arm of s.arms) {
    const stress = computeArmStress(arm, s.day);
    const agg = aggregateArm(s, arm);
    const baseline = baselineHeightCm(s, arm);
    const heightDelta = baseline > 0 ? (agg.meanHeightCm - baseline) / baseline : 0;
    const micro = computeMicrobiome(arm, s.day);
    const metab = computeMetaboliteIntensity(arm, s.day);

    const lines: string[] = [];
    const plantLabel = plantShort(arm.plantId);
    if (arm.activeVocs.length === 0) {
      lines.push(
        `${arm.label} (control, ${arm.plantCount}× ${plantLabel}): ` +
        `${fmt(agg.meanHeightCm)}±${fmt(agg.stdHeightCm)} cm, ` +
        `${Math.round(agg.meanLeafCount)} leaves avg, ` +
        `diversity ${fmt(micro.diversity)}, wilting ${pct(stress.wilting)}.`,
      );
    } else {
      const vocStr = arm.activeVocs.map(chemShort).join(" + ");
      const heightStr = heightDelta < 0
        ? `${pct(-heightDelta)} below baseline`
        : `${pct(heightDelta)} above baseline`;
      lines.push(
        `${arm.label} (${vocStr} · ${arm.delivery}, ${arm.plantCount}× ${plantLabel}) ` +
        `@ ${arm.vocConcentration.toFixed(1)} mg/L:`,
      );
      lines.push(
        `mean height ${heightStr} (${fmt(agg.meanHeightCm)}±${fmt(agg.stdHeightCm)} cm), ` +
        `curl ${pct(stress.curl)}, chlorosis ${pct(stress.chlorosis)}, wilt ${pct(stress.wilting)}.`,
      );
      if (arm.delivery === "liquid") {
        lines.push(`Soil drench → diversity ${fmt(micro.diversity)}, resistome ${micro.resistome.toFixed(0)}/100, mean color ${agg.meanDominantHex}.`);
      } else if (arm.delivery === "gas") {
        if (weekOf(s.day) < 1.0) lines.push(`Fumigation pulse killed ${pct(micro.cullPulse)} of community today.`);
        else lines.push(`Recolonization ongoing; opportunists at ${fmt(micro.beneficialMul)}× spawn rate.`);
      } else {
        lines.push(`Mixed delivery: pigment ${stress.pigmentation.toFixed(2)}, defense ${pct(stress.defenseProteins)}, metab ${pct(metab)}, mean color ${agg.meanDominantHex}.`);
      }
    }

    if (s.randomErrors && agg.anomalyCount > 0) {
      lines.push(`Anomalies firing on ${agg.anomalyCount}/${arm.plantCount} plants today.`);
    }

    entries.push({
      weekTag: `D${dayInt}·W${weekInt}`,
      armId: arm.id,
      armColor: arm.color,
      armLabel: arm.label,
      text: lines.join(" "),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Weekly recap — per-category paragraphs with flexible length.
// ---------------------------------------------------------------------------

/**
 * Build a per-category recap for the week the simulation is currently in.
 * Only categories whose `prefs.<cat>` flag is true will be populated; the
 * rest are left `undefined` so callers can skip them.
 *
 * Length is flexible: each paragraph is assembled as an array of sentences
 * with some of them conditional (only added if the corresponding signal is
 * actually non-trivial this week). A quiet week therefore gets a shorter
 * recap and a busy week a longer one.
 */
export function buildWeeklyRecap(s: SimulationState, prefs: RecapPrefs): WeeklyRecap {
  const week = Math.max(0, Math.floor(weekOf(s.day)));
  const dayInt = Math.floor(s.day);
  const weekFloat = weekOf(s.day).toFixed(1);
  const stamp = `Day ${dayInt} (Wk ${weekFloat})`;
  const arm = activeArm(s);
  const stress = computeArmStress(arm, s.day);
  const agg = aggregateArm(s, arm);
  const baseline = baselineHeightCm(s, arm);
  const heightDelta = baseline > 0 ? (agg.meanHeightCm - baseline) / baseline : 0;
  const micro = computeMicrobiome(arm, s.day);
  const metab = computeMetaboliteIntensity(arm, s.day);

  const totalPlants = s.arms.reduce((n, a) => n + a.plantCount, 0);
  const treatedArms = s.arms.filter((a) => a.activeVocs.length > 0);
  const totalAnomalies = s.arms.reduce(
    (n, a) => n + aggregateArm(s, a).anomalyCount,
    0,
  );
  const armSummaries = s.arms.map((a) => {
    const ag = aggregateArm(s, a);
    const b = baselineHeightCm(s, a);
    const dPct = b > 0 ? ((ag.meanHeightCm - b) / b) * 100 : 0;
    return { label: a.label, color: a.color, dPct, meanCm: ag.meanHeightCm };
  });
  const mostSuppressed = [...armSummaries].sort((x, y) => x.dPct - y.dPct)[0];
  const mostRobust    = [...armSummaries].sort((x, y) => y.dPct - x.dPct)[0];

  const out: WeeklyRecap = {
    week, day: s.day,
    headlineLabel: arm.label, headlineColor: arm.color,
  };

  // -------- MACRO (morphology / 3D observables) --------
  if (prefs.macro) {
    const deltaStr =
      Math.abs(heightDelta) < 0.01
        ? "tracking the untreated baseline"
        : heightDelta < 0
        ? `${Math.round(-heightDelta * 100)}% shorter than untreated controls`
        : `${Math.round(heightDelta * 100)}% taller than untreated controls`;

    const macroLines: string[] = [];
    macroLines.push(
      `Macro · ${stamp}: "${arm.label}" is at ${agg.meanHeightCm.toFixed(1)} ± ${agg.stdHeightCm.toFixed(2)} cm mean height with ${Math.round(agg.meanLeafCount)} leaves per plant on average, ${deltaStr}.`,
    );
    macroLines.push(
      `Dominant leaf color across the bench is ${agg.meanDominantHex}; pigmentation is at ${pct(stress.pigmentation / 2)} of max and chlorosis at ${pct(stress.chlorosis)}.`,
    );
    if (stress.curl > 0.2 || stress.wilting > 0.25) {
      macroLines.push(
        `Canopy shape shows ${pct(stress.curl)} leaf curl and ${pct(stress.wilting)} wilting — the visual signature of stomatal / turgor stress.`,
      );
    }
    if (s.randomErrors && agg.stdHeightCm > 0) {
      const cv = agg.stdHeightCm / Math.max(0.5, agg.meanHeightCm);
      macroLines.push(
        `Random-error mode is on, so height CV across the ${arm.plantCount} plants is ${(cv * 100).toFixed(1)}% — adding more plants would shrink this spread toward the true bench mean.`,
      );
    }
    out.macro = macroLines.join(" ");
  }

  // -------- MICRO (microbiome + cellular micro-observables) --------
  if (prefs.micro) {
    const divPhrase = micro.diversity > 0.75
      ? "a healthy, diverse community"
      : micro.diversity > 0.45
      ? "a moderately disturbed community"
      : "a collapsed, low-diversity community";
    const pathPhrase = micro.pathogenFrac > 0.35
      ? "pathogens now dominate"
      : micro.pathogenFrac > 0.15
      ? "pathogens are elevated"
      : "pathogens remain background";
    const resPhrase = micro.resistome > 60
      ? "antibiotic-resistance gene load is high"
      : micro.resistome > 25
      ? "resistome load is climbing"
      : "resistome load is low";

    const microLines: string[] = [];
    microLines.push(
      `Micro · ${stamp}: Shannon-like diversity is ${micro.diversity.toFixed(2)} and pathogen fraction ${pct(micro.pathogenFrac)}, indicating ${divPhrase} where ${pathPhrase}.`,
    );
    if (arm.activeVocs.length === 0) {
      microLines.push(
        `This is a pure control bench — no VOCs applied — so beneficial cocci dominate the phyllosphere and the rhizosphere sits at its native composition.`,
      );
    } else if (arm.delivery === "gas") {
      microLines.push(
        micro.recolonizing
          ? `After the fumigation pulse the community is recolonizing; opportunists are repopulating at ${micro.beneficialMul.toFixed(2)}× baseline spawn rate.`
          : `Fumigation culled ~${pct(micro.cullPulse)} of the surface community this week — expect an opportunist rebound next week.`,
      );
    } else if (arm.delivery === "liquid") {
      microLines.push(
        `Soil drench is disturbing the rhizosphere directly: beneficial mutualists are down to ${micro.beneficialMul.toFixed(2)}× native spawn rate and gram-positive opportunists are filling the niche.`,
      );
    } else {
      microLines.push(
        `Mixed (liquid + gas) delivery is compounding disturbance in both root and leaf compartments; the community has little refuge from chemical stress.`,
      );
    }
    microLines.push(
      `At the cellular level, defense proteins (PR-family) are at ${pct(stress.defenseProteins)} and stomatal closure at ${pct(stress.stomatalClose)}, so ${resPhrase} and membrane integrity is ${stress.wilting > 0.4 ? "compromised" : "holding"}.`,
    );
    out.micro = microLines.join(" ");
  }

  // -------- MOLECULAR (LC-MS / metabolite signatures) --------
  if (prefs.molecular) {
    const molLines: string[] = [];
    molLines.push(
      `Molecular · ${stamp}: secondary-metabolite load is ${pct(metab)} — the LC-MS readout is ${metabPhrase(metab)}.`,
    );
    if (arm.activeVocs.length === 0) {
      const plant = getPlant(arm.plantId);
      const baselinePeaks = (plant?.baselineLcMs ?? [])
        .slice().sort((a, b) => b.base - a.base).slice(0, 2);
      const peakLine = baselinePeaks.length
        ? baselinePeaks.map((p) => `m/z ${p.mz} (${p.label})`).join(" and ")
        : "chlorophyll a (m/z 893) and chlorophyll b (m/z 907)";
      molLines.push(
        `With no chemicals applied the ${plantShort(arm.plantId)} bench's dominant peaks remain ${peakLine}; stress-response peaks (anthocyanin, defense fragments) stay at baseline.`,
      );
    } else {
      // Per-chemical mini-summary, data-driven from each JSON's lcMsPeaks.
      // We highlight the 1–2 dominant peaks per chemical so the recap
      // names exactly which masses to look for.
      const headline: string[] = [];
      for (const id of arm.activeVocs) {
        const c = CHEMICALS[id];
        if (!c) continue;
        const top = (c.lcMsPeaks ?? []).slice().sort((a, b) => b.base - a.base).slice(0, 2);
        if (top.length === 0) continue;
        const peakStr = top
          .map((p) => `m/z ${p.mz} (${p.label})`)
          .join(" and ");
        headline.push(`${c.commonName} is driving ${peakStr}`);
      }
      molLines.push(
        headline.length
          ? `Applied chemistry: ${headline.join("; ")}.`
          : `Applied chemistry: ${arm.activeVocs.map(chemShort).join(", ")}.`,
      );
    }
    if (stress.chlorosis > 0.3) {
      molLines.push(
        `Chlorophyll peaks are ${pct(1 - Math.min(1, 0.7 * stress.chlorosis))} of their healthy reference — the chemical face of the chlorosis you can see in the canopy.`,
      );
    }
    if (s.randomErrors) {
      molLines.push(
        `Random-error mode is on: click any plant in the 3D bench to inspect its individual spectrum versus the bench mean (that is how real mass spec is done — one sample at a time).`,
      );
    }
    out.molecular = molLines.join(" ");
  }

  // -------- OVERALL (cross-scale synthesis) --------
  if (prefs.overall) {
    const lines: string[] = [];
    lines.push(
      `Overall · ${stamp}: ${s.arms.length} bench${s.arms.length === 1 ? "" : "es"} running ${totalPlants} plants total, ${treatedArms.length} under VOC treatment and ${s.arms.length - treatedArms.length} as control.`,
    );
    lines.push(
      `Active bench "${arm.label}" is ${Math.abs(heightDelta) < 0.01 ? "on-baseline" : heightDelta < 0 ? `${Math.round(-heightDelta * 100)}% below baseline` : `${Math.round(heightDelta * 100)}% above baseline`} with microbiome diversity ${micro.diversity.toFixed(2)} and molecular load ${pct(metab)} — a ${syntheticPhrase(heightDelta, micro.diversity, metab)} profile.`,
    );
    if (armSummaries.length > 1) {
      lines.push(
        `Across the matrix the hardest-hit bench is "${mostSuppressed.label}" (${mostSuppressed.dPct.toFixed(0)}%) while "${mostRobust.label}" is the most robust (${mostRobust.dPct >= 0 ? "+" : ""}${mostRobust.dPct.toFixed(0)}%).`,
      );
    }
    if (s.randomErrors && totalAnomalies > 0) {
      lines.push(
        `Random errors: ${totalAnomalies} per-plant anomalies fired today across all benches — precision improves as you add plants per bench.`,
      );
    }

    // ── Mortality summary across the matrix ──
    let totalDead = 0;
    let totalPlantsAll = 0;
    const benchDeaths: Array<{ label: string; dead: number; total: number; cause: string | null; firstDay: number }> = [];
    for (const a of s.arms) {
      const h = computeBenchHealth(a, s.day, s);
      totalDead += h.dead;
      totalPlantsAll += h.total;
      if (h.dead > 0) {
        benchDeaths.push({
          label: a.label,
          dead: h.dead,
          total: h.total,
          cause: h.topCause,
          firstDay: h.firstDeathDay,
        });
      }
    }
    if (totalDead > 0) {
      const benchSummaries = benchDeaths
        .sort((a, b) => b.dead - a.dead)
        .slice(0, 3)
        .map((b) => {
          const causePart = b.cause ? ` from ${b.cause}` : "";
          const dayPart = isFinite(b.firstDay) ? ` since day ${Math.floor(b.firstDay)}` : "";
          return `"${b.label}" lost ${b.dead}/${b.total}${causePart}${dayPart}`;
        })
        .join("; ");
      lines.push(
        `Mortality: ${totalDead}/${totalPlantsAll} plants have died across the matrix — ${benchSummaries}.`,
      );
    } else if (totalPlantsAll > 0) {
      // Subtle "all alive" line when at least one bench is non-trivially stressed
      const stressedBench = s.arms.find((a) => {
        const h = computeBenchHealth(a, s.day, s);
        return h.meanDamageFrac > 0.3;
      });
      if (stressedBench) {
        const h = computeBenchHealth(stressedBench, s.day, s);
        lines.push(
          `Mortality: 0 deaths so far, but "${stressedBench.label}" is at ${Math.round(h.meanDamageFrac * 100)}% mean cumulative damage — recovery is possible only if exposure drops.`,
        );
      }
    }
    out.overall = lines.join(" ");
  }

  return out;
}

function metabPhrase(m: number): string {
  if (m < 0.15) return "quiet, near control";
  if (m < 0.40) return "starting to show stress-response peaks";
  if (m < 0.70) return "dominated by pigmentation and defense peaks";
  return "saturated — magenta anthocyanin and PR-protein fragments are the loudest signals";
}

function syntheticPhrase(heightDelta: number, diversity: number, metab: number): string {
  if (heightDelta > -0.05 && diversity > 0.7 && metab < 0.25) return "healthy, low-stress";
  if (heightDelta < -0.25 && diversity < 0.5 && metab > 0.5) return "severely stressed, multi-scale";
  if (metab > 0.5) return "metabolically active but morphologically resilient";
  if (diversity < 0.5) return "microbially disrupted with modest macro signal";
  return "moderate-stress";
}
