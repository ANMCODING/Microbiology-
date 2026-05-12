import type { SimulationState } from "../types";
import { activeArm } from "../types";
import { aggregateArm, computeArmPlantStats, rgbToHex } from "../sim/analytics";
import { store } from "../state/store";

/**
 * Per-plant + bench-aggregate analytics for the currently active arm,
 * plus a cross-arm comparison row at the bottom (mean color, mean height,
 * delta, anomaly count) so the user can compare benches without switching
 * tabs.
 *
 * Re-renders fully each frame; the active arm rarely has more than 20
 * plants so the DOM cost is fine. Cross-arm row is at most MAX_TABS rows.
 */
export class AnalyticsPanel {
  private root: HTMLElement;
  private headEl!: HTMLElement;
  private aggEl!: HTMLElement;
  private plantsEl!: HTMLElement;
  private compareEl!: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = host;
    host.classList.add("analytics-card");
    host.innerHTML = `
      <div class="card-head">
        <h3>Analytics · Active bench</h3>
        <span class="card-meta" id="anl-head">—</span>
      </div>
      <div id="anl-agg" class="anl-agg"></div>
      <div class="anl-section-title">Per-plant snapshot</div>
      <div class="anl-table-wrap">
        <table class="anl-table" id="anl-plants">
          <thead>
            <tr>
              <th>P#</th><th>cm</th><th>leaves</th><th>color</th><th>Δ vs P0 day 0</th><th>anomaly</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="anl-section-title">Cross-bench comparison</div>
      <div class="anl-table-wrap">
        <table class="anl-table" id="anl-compare">
          <thead>
            <tr>
              <th>Bench</th><th>n</th><th>VOCs</th><th>mean cm</th><th>Δ vs base</th><th>mean color</th><th>anom</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;
    this.headEl    = host.querySelector<HTMLElement>("#anl-head")!;
    this.aggEl     = host.querySelector<HTMLElement>("#anl-agg")!;
    this.plantsEl  = host.querySelector<HTMLTableSectionElement>("#anl-plants tbody")!;
    this.compareEl = host.querySelector<HTMLTableSectionElement>("#anl-compare tbody")!;

    // Click a plant row → focus that plant for the LC-MS chart.
    this.plantsEl.addEventListener("click", (e) => {
      const tr = (e.target as HTMLElement).closest<HTMLElement>("tr[data-plant]");
      if (!tr) return;
      const idx = parseInt(tr.dataset.plant!, 10);
      const cur = store.get().selectedPlantIndex;
      store.set({ selectedPlantIndex: cur === idx ? null : idx });
    });
  }

  // remember each arm's day-0 reference per plant for "change since start"
  // We store a single P0-day-0 height as the reference for that arm.
  private dayZeroRefByArm = new Map<string, { height: number; color: string }>();

  update(s: SimulationState): void {
    const arm = activeArm(s);
    const stats = computeArmPlantStats(s, arm);
    const agg = aggregateArm(s, arm);

    this.headEl.textContent =
      `${arm.label} · ${arm.plantCount}× ${arm.variety} · ` +
      (arm.activeVocs.length ? `${arm.activeVocs.join("+")} (${arm.delivery})` : "control");

    // capture day-0 ref the first time this arm is seen
    if (!this.dayZeroRefByArm.has(arm.id) && s.day === 0 && stats[0]) {
      this.dayZeroRefByArm.set(arm.id, {
        height: stats[0].morph.height * 10,
        color: rgbToHex(stats[0].palette.dominant),
      });
    }
    const ref = this.dayZeroRefByArm.get(arm.id);

    // ---- aggregate header ----
    this.aggEl.innerHTML = `
      <div class="agg-cell">
        <div class="agg-swatch" style="background:${agg.meanDominantHex}"></div>
        <div class="agg-text">
          <b>${agg.meanDominantHex}</b>
          <i>mean leaf color</i>
        </div>
      </div>
      <div class="agg-cell"><b>${agg.meanHeightCm.toFixed(1)} cm</b><i>mean height</i></div>
      <div class="agg-cell"><b>± ${agg.stdHeightCm.toFixed(2)}</b><i>height stdev</i></div>
      <div class="agg-cell"><b>${Math.round(agg.meanLeafCount)}</b><i>leaves avg</i></div>
      <div class="agg-cell"><b>${agg.colorDispersion.toFixed(1)}</b><i>color spread</i></div>
      <div class="agg-cell"><b>${agg.anomalyCount}/${agg.plantCount}</b><i>anomalies</i></div>
    `;

    // ---- per-plant rows ----
    const focusIdx = s.selectedPlantIndex;
    const rows = stats.map((p) => {
      const heightCm = p.morph.height * 10;
      const dHeight = ref ? heightCm - ref.height : 0;
      const dStr = ref
        ? `${dHeight >= 0 ? "+" : ""}${dHeight.toFixed(1)} cm`
        : "—";
      const colorHex = rgbToHex(p.palette.dominant);
      const anomLabel = p.anomaly ? p.anomaly.label : "—";
      const anomCls = p.anomaly ? "anom" : "ok";
      const focusedCls = focusIdx === p.plantIndex ? "focused" : "";
      return `
        <tr class="clickable ${focusedCls}" data-plant="${p.plantIndex}" title="Click to inspect P${p.plantIndex}'s LC-MS spectrum">
          <td><b>P${p.plantIndex}</b></td>
          <td>${heightCm.toFixed(1)}</td>
          <td>${p.morph.leafPairs * 2}</td>
          <td>
            <span class="row-swatch" style="background:${colorHex}"></span>
            <span class="row-hex">${colorHex}</span>
          </td>
          <td>${dStr}</td>
          <td class="${anomCls}">${anomLabel}</td>
        </tr>`;
    }).join("");
    this.plantsEl.innerHTML = rows;

    // ---- cross-bench comparison ----
    const compareRows = s.arms.map((a) => {
      const aAgg = aggregateArm(s, a);
      const isActive = a.id === arm.id;
      const baselineRef = this.dayZeroRefByArm.get(a.id);
      const baseStr = baselineRef
        ? `${(aAgg.meanHeightCm - baselineRef.height >= 0 ? "+" : "")}${(aAgg.meanHeightCm - baselineRef.height).toFixed(1)} cm`
        : "—";
      const vocStr = a.activeVocs.length ? `${a.activeVocs.join("+")} · ${a.delivery}` : "control";
      return `
        <tr class="${isActive ? "active" : ""}">
          <td>
            <span class="row-swatch" style="background:${a.color}"></span>
            <b>${escape(a.label)}</b>
          </td>
          <td>${a.plantCount}</td>
          <td>${escape(vocStr)}</td>
          <td>${aAgg.meanHeightCm.toFixed(1)}</td>
          <td>${baseStr}</td>
          <td>
            <span class="row-swatch" style="background:${aAgg.meanDominantHex}"></span>
            <span class="row-hex">${aAgg.meanDominantHex}</span>
          </td>
          <td>${aAgg.anomalyCount}/${a.plantCount}</td>
        </tr>`;
    }).join("");
    this.compareEl.innerHTML = compareRows;
  }
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
