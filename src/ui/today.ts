import type { SimulationState } from "../types";
import { activeArm } from "../types";
import { buildDailySnapshot, type ArmSnapshot } from "../sim/report";
import { CHEMICALS, PLANTS } from "../data/loader";
import { computeBenchHealth } from "../sim/mortality";

/**
 * Live "Today" feedback panel.
 *
 * Always shows the current day, the active arm's headline metrics, and a
 * compact comparison row for every other arm (so cross-tab differences are
 * visible without switching tabs).
 *
 * Updates every frame — pure DOM text writes against a stable layout.
 */
export class TodayPanel {
  private root: HTMLElement;
  private dayEl!: HTMLElement;
  private headlineEl!: HTMLElement;
  private rowsHost!: HTMLElement;
  private anomEl!: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = host;
    host.classList.add("today-card");
    host.innerHTML = `
      <div class="card-head">
        <h3>Today · Live Feedback</h3>
        <span class="card-meta" id="today-day">Day 0</span>
      </div>
      <div id="today-headline" class="today-headline"></div>
      <div id="today-anomalies" class="anomalies" style="display:none"></div>
      <div id="today-rows" class="today-rows"></div>
    `;
    this.dayEl = host.querySelector<HTMLElement>("#today-day")!;
    this.headlineEl = host.querySelector<HTMLElement>("#today-headline")!;
    this.anomEl = host.querySelector<HTMLElement>("#today-anomalies")!;
    this.rowsHost = host.querySelector<HTMLElement>("#today-rows")!;
  }

  update(state: SimulationState): void {
    const snap = buildDailySnapshot(state);
    const arm = activeArm(state);
    this.dayEl.textContent = `Day ${Math.floor(snap.day)} · Wk ${snap.week.toFixed(1)}`;

    const headline = snap.arms.find((a) => a.armId === arm.id);
    if (headline) {
      // Resolve human-readable plant + chemicals on the active arm so the
      // headline mirrors what the picker selected.
      const plantName = PLANTS[arm.plantId]?.commonName ?? arm.plantId;
      const chemNames = (arm.activeVocs ?? [])
        .map((id) => CHEMICALS[id]?.commonName ?? id);
      const chemBadge = chemNames.length === 0
        ? `<span class="hl-tag hl-tag-control">control</span>`
        : chemNames.slice(0, 3).map((n) =>
            `<span class="hl-chem">${escape(n)}</span>`,
          ).join("") +
          (chemNames.length > 3
            ? `<span class="hl-chem hl-chem-more">+${chemNames.length - 3}</span>`
            : "");

      // Live mortality summary for this bench
      const health = computeBenchHealth(arm, state.day, state);
      const healthBadge = (() => {
        if (health.dead === 0 && health.meanDamageFrac < 0.05) {
          return `<span class="hl-life hl-life-ok">${health.alive}/${health.total} alive</span>`;
        }
        if (health.dead === 0) {
          // alive but stressed
          const pct = Math.round(health.meanDamageFrac * 100);
          return `<span class="hl-life hl-life-warn" title="Mean cumulative damage on alive plants">${health.alive}/${health.total} alive · ${pct}% damaged</span>`;
        }
        const cause = health.topCause ? ` · ${escape(health.topCause)}` : "";
        const since = isFinite(health.firstDeathDay)
          ? ` · since day ${Math.floor(health.firstDeathDay)}`
          : "";
        return `<span class="hl-life hl-life-bad" title="Plants that have died on this bench">${health.alive}/${health.total} alive${cause}${since}</span>`;
      })();

      this.headlineEl.innerHTML = `
        <div class="hl-row">
          <span class="hl-dot" style="background:${headline.color}"></span>
          <span class="hl-label">${escape(headline.label)}</span>
          <span class="hl-tag">active</span>
          ${healthBadge}
        </div>
        <div class="hl-row hl-meta">
          <span class="hl-plant">${escape(plantName)}</span>
          <span class="hl-sep">·</span>
          ${chemBadge}
        </div>
        <div class="hl-stats">
          <div><b>${headline.meanHeightCm.toFixed(1)}</b><i>mean cm</i></div>
          <div><b>${headline.heightDeltaPct >= 0 ? "+" : ""}${headline.heightDeltaPct.toFixed(0)}%</b><i>vs untreated</i></div>
          <div><b>${Math.round(headline.meanLeafCount)}</b><i>leaves avg</i></div>
          <div><b>${headline.diversity.toFixed(2)}</b><i>diversity</i></div>
          <div class="hl-color"><span class="hl-swatch" style="background:${headline.meanDominantHex}"></span><b>${headline.meanDominantHex}</b><i>mean color</i></div>
        </div>
      `;
    }

    // Other arms — small comparison row each
    this.rowsHost.innerHTML = "";
    const others = snap.arms.filter((a) => a.armId !== arm.id);
    if (others.length === 0) {
      const p = document.createElement("div");
      p.className = "today-empty";
      p.textContent = "Add another bench (tab) to compare arms side-by-side.";
      this.rowsHost.appendChild(p);
    } else {
      for (const o of others) this.rowsHost.appendChild(this.armRow(o, state));
    }

    // anomalies banner — count across all arms
    const totalAnoms = snap.arms.reduce((acc, a) => acc + a.anomalyCount, 0);
    if (totalAnoms > 0) {
      this.anomEl.style.display = "";
      this.anomEl.innerHTML = `<b>Today's anomalies (${totalAnoms}):</b> ` +
        snap.arms
          .filter((a) => a.anomalyCount > 0)
          .map((a) => `${escape(a.label)} ${a.anomalyCount}/${a.plantCount}`)
          .join(" · ");
    } else {
      this.anomEl.style.display = "none";
    }
  }

  private armRow(a: ArmSnapshot, state?: SimulationState): HTMLElement {
    const row = document.createElement("div");
    row.className = "today-row";
    // Resolve mortality if we have the state + arm definition
    let lifeCol = "";
    if (state) {
      const armDef = state.arms.find((x) => x.id === a.armId);
      if (armDef) {
        const h = computeBenchHealth(armDef, state.day, state);
        const cls = h.dead === 0 ? "ok" : (h.dead < h.total / 2 ? "warn" : "bad");
        lifeCol = `<div class="s s-life s-life-${cls}"><b>${h.alive}/${h.total}</b><i>alive</i></div>`;
      }
    }
    row.innerHTML = `
      <span class="group-dot" style="background:${a.color}"></span>
      <span class="group-name" title="${escape(a.label)}">${escape(a.label)}</span>
      <div class="today-stats">
        <div class="s"><b>${a.meanHeightCm.toFixed(1)}</b><i>cm</i></div>
        <div class="s"><b>${a.heightDeltaPct >= 0 ? "+" : ""}${a.heightDeltaPct.toFixed(0)}%</b><i>vs base</i></div>
        <div class="s"><b>${Math.round(a.meanLeafCount)}</b><i>leaves</i></div>
        ${lifeCol}
        <div class="s"><b>${a.diversity.toFixed(2)}</b><i>div</i></div>
        <div class="s color-cell"><span class="mini-swatch" style="background:${a.meanDominantHex}"></span><b>${a.meanDominantHex}</b><i>color</i></div>
      </div>
    `;
    return row;
  }
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
