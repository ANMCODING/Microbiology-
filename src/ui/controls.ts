import { store, ARM_PALETTE } from "../state/store";
import { VARIETIES } from "../constants/theme";
import {
  DAY_MAX, MAX_PLANTS_PER_ARM, MAX_TABS, MIN_PLANTS_PER_ARM, activeArm, weekOf,
} from "../types";
import type { ChemicalId, ExperimentArm, PolyDelivery, RecapCategory, VarietyId } from "../types";
import { showInfo } from "./infoPanel";
import { DELIVERY_INFO, RANDOM_ERROR_INFO, VARIETY_INFO } from "../data/encyclopedia";
import { CHEMICALS, PLANTS } from "../data/loader";
import { chemicalInfo, plantInfo } from "../data/autoInfo";

/**
 * Mounts the experiment-arm tab strip into `tabHost` (a horizontal bar that
 * lives above the main layout) and the per-arm editor into `panel`
 * (the left column).
 *
 * Tabs:
 *   - one button per arm (with color swatch + label)
 *   - a "+" button to add a new arm (capped at MAX_TABS)
 *   - clicking a tab makes it active; the editor + 3D bench follow
 *   - long-press / right-click renames; a small × removes (refused if last)
 *
 * Editor (per active arm): label, color, variety, plant count slider 1–20,
 * VOC chip multi-select, delivery seg, per-arm environment sliders.
 *
 * Global anomalies + run seed live below the per-arm editor.
 */
export function mountTabs(tabHost: HTMLElement): void {
  tabHost.classList.add("tab-strip");
  const render = () => {
    const s = store.get();
    const tabsHtml = s.arms.map((a) => `
      <div class="tab ${a.id === s.activeArmId ? "active" : ""}" data-arm="${a.id}" title="${escape(a.label)}">
        <span class="tab-dot" style="background:${a.color}"></span>
        <span class="tab-label">${escape(a.label)}</span>
        ${s.arms.length > 1 ? `<button class="tab-x" data-x="${a.id}" title="Remove this bench">×</button>` : ""}
      </div>
    `).join("");
    const addBtn = s.arms.length < MAX_TABS
      ? `<button class="tab-add" id="tab-add" title="Add bench">+ bench</button>`
      : `<span class="tab-cap">${MAX_TABS}/${MAX_TABS} max</span>`;
    tabHost.innerHTML = `<div class="tabs">${tabsHtml}${addBtn}</div>`;

    tabHost.querySelectorAll<HTMLElement>(".tab[data-arm]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const t = (e.target as HTMLElement);
        if (t.classList.contains("tab-x")) return;
        const id = el.dataset.arm!;
        store.setActiveArm(id);
      });
    });
    tabHost.querySelectorAll<HTMLButtonElement>(".tab-x").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        store.removeArm(btn.dataset.x!);
      });
    });
    const add = tabHost.querySelector<HTMLButtonElement>("#tab-add");
    if (add) add.addEventListener("click", () => store.addArm());
  };

  render();
  store.subscribe((s, prev) => {
    // re-render only when the arm list / active tab actually changed
    if (s.arms !== prev.arms || s.activeArmId !== prev.activeArmId) render();
  });
}

export function mountLeftPanel(panel: HTMLElement): void {
  const render = () => {
    const arm = activeArm(store.get());
    panel.innerHTML = renderEditor(arm);
    wireEditor(panel, arm);
    wireGlobals(panel);
  };

  render();
  store.subscribe((s, prev) => {
    // Re-render the editor when the active arm changes, or when the active
    // arm's own fields change from elsewhere (e.g. tab strip rename).
    const armChanged = s.activeArmId !== prev.activeArmId;
    const sameArm = s.arms.find((a) => a.id === s.activeArmId);
    const prevArm = prev.arms.find((a) => a.id === s.activeArmId);
    if (armChanged || sameArm !== prevArm) {
      // light re-render is fine — only the left panel
      render();
    }
  });
}

function renderEditor(arm: ExperimentArm): string {
  return `
    <div class="section">
      <h3>Bench identity</h3>
      <div class="field">
        <label><span>Label</span></label>
        <input type="text" id="ed-label" value="${escapeAttr(arm.label)}" maxlength="40" />
      </div>
      <div class="field">
        <label><span>Tab color</span></label>
        <div class="color-row" id="ed-color">
          ${ARM_PALETTE.map((c) =>
            `<button class="color-chip ${c.toLowerCase() === arm.color.toLowerCase() ? "active" : ""}" data-c="${c}" style="background:${c}" title="${c}"></button>`,
          ).join("")}
        </div>
      </div>
    </div>

    <div class="section">
      <h3>Plant species <button class="info-icon" id="info-plant" title="About this plant">i</button></h3>
      <div class="field">
        <div style="font-size:12px;color:var(--text);margin-bottom:6px">
          <b>${escape(PLANTS[arm.plantId]?.commonName ?? arm.plantId)}</b>
          <span style="color:var(--text-dim);font-style:italic;margin-left:6px">
            ${escape(PLANTS[arm.plantId]?.scientificName ?? "")}
          </span>
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-bottom:8px">
          ${escape(PLANTS[arm.plantId]?.family ?? "")} ·
          ${escape(PLANTS[arm.plantId]?.physiology.photosynthesisPathway ?? "")} ·
          ${escape(PLANTS[arm.plantId]?.lifeForm ?? "")}
        </div>
        <button type="button" id="ed-change-plant" class="chem-edit" title="Return to the picker to choose a different plant">Change plant…</button>
      </div>
      ${arm.plantId === "coleus" ? `
      <div class="field">
        <label><span>Coleus cultivar <button class="info-icon" id="info-variety" title="About this variety">i</button></span></label>
        <select id="ed-variety">
          ${(Object.keys(VARIETIES) as VarietyId[])
            .map((k) => `<option value="${k}" ${k === arm.variety ? "selected" : ""}>${VARIETIES[k].label}</option>`)
            .join("")}
        </select>
      </div>` : ""}
      ${slider("ed-count", "Plants in this bench", "plants", MIN_PLANTS_PER_ARM, MAX_PLANTS_PER_ARM, 1, arm.plantCount)}
    </div>

    <div class="section">
      <h3>Chemicals <span style="color:var(--text-dim);font-weight:400">(${arm.activeVocs.length} of ${Object.keys(CHEMICALS).length})</span></h3>
      <div class="field">
        <div class="lab-chem-strip" id="ed-chem-strip">
          ${arm.activeVocs.length === 0
            ? `<span style="font-size:11px;color:var(--text-dim)">Control bench (no chemicals).</span>`
            : arm.activeVocs.map(renderChemPill).join("")}
          <button type="button" class="chem-edit" id="ed-edit-chem" title="Open the picker to add or remove chemicals">+ edit chemicals</button>
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:6px">
          0 chemicals = pure control. 1 = mono-exposure. 2+ = poly-exposure
          (synergy boosts pigment + defense; antagonism rules apply per
          chemical). Click <b>+ edit chemicals</b> to return to the picker.
        </div>
      </div>
      <div class="field" style="margin-top:10px">
        <label><span>Delivery <button class="info-icon" id="info-delivery" title="About delivery modes">i</button></span></label>
        <div class="seg-row" id="ed-delivery" role="radiogroup">
          <button data-mode="liquid" type="button" role="radio" ${arm.delivery === "liquid" ? `class="active"` : ""}>Liquid</button>
          <button data-mode="gas"    type="button" role="radio" ${arm.delivery === "gas"    ? `class="active"` : ""}>Gas</button>
          <button data-mode="both"   type="button" role="radio" ${arm.delivery === "both"   ? `class="active"` : ""}>Both</button>
        </div>
      </div>
    </div>

    <div class="section">
      <h3>Bench environment</h3>
      ${slider("ed-conc",  "VOC Concentration", "mg/L", 0, 10, 0.1, arm.vocConcentration)}
      ${slider("ed-water", "Water Dosage",      "mL",   0, 200, 1, arm.waterDosage)}
      ${slider("ed-temp",  "Temperature",       "°C",  15, 35, 0.5, arm.temperature)}
      ${slider("ed-hum",   "Humidity",          "%",   20, 95, 1, arm.humidity)}
    </div>

    <div class="section">
      <h3>Random error (global) <button class="info-icon" id="info-randerr" title="What is random error?">i</button></h3>
      <label class="toggle-row">
        <input type="checkbox" id="ctl-errors" ${store.get().randomErrors ? "checked" : ""} />
        <span class="toggle-label">Per-plant Gaussian variability</span>
      </label>
      <div style="font-size:10px;color:var(--text-dim);margin-top:6px">
        Each plant gets its own vigor, leaf count, stress jitter, anomalies
        and LC-MS spectrum. Increase the plant count to see the bench mean
        converge — same seed + day is fully reproducible.
      </div>
      <div class="field" style="margin-top:10px">
        <label><span>Run seed</span><span class="val" id="ctl-seed-v">${store.get().runSeed}</span></label>
        <input type="range" id="ctl-seed" min="1" max="9999" step="1" value="${store.get().runSeed}" />
      </div>
    </div>

    <div class="section">
      <h3>Weekly recap</h3>
      <div style="font-size:10px;color:var(--text-dim);margin-bottom:8px">
        Enable the categories you want. A recap auto-posts to the right
        panel at each week rollover — each category lives in its own card
        (Macro/Micro/Molecular cards show only in the matching view;
        Overall shows everywhere).
      </div>
      ${recapToggleRow("rc-macro",     "Macro (morphology)",   store.get().recapPrefs.macro)}
      ${recapToggleRow("rc-micro",     "Micro (microbiome)",   store.get().recapPrefs.micro)}
      ${recapToggleRow("rc-molecular", "Molecular (LC-MS)",    store.get().recapPrefs.molecular)}
      ${recapToggleRow("rc-overall",   "Overall summary",      store.get().recapPrefs.overall)}
    </div>
  `;
}

function renderChemPill(id: ChemicalId): string {
  const c = CHEMICALS[id];
  const color = c?.color ?? "#888";
  const label = c?.commonName ?? id;
  return `
    <span class="chem-pill" data-id="${id}" title="${escape(c?.formula ?? "")}">
      <span class="pill-dot" style="background:${color}"></span>
      <span>${escape(label)}</span>
      <button type="button" data-x="${id}" title="Remove this chemical">×</button>
    </span>
  `;
}

function recapToggleRow(id: string, label: string, checked: boolean): string {
  return `
    <label class="toggle-row" style="margin-top:4px">
      <input type="checkbox" id="${id}" ${checked ? "checked" : ""} />
      <span class="toggle-label">${label}</span>
    </label>
  `;
}

function wireEditor(panel: HTMLElement, arm: ExperimentArm): void {
  const label = panel.querySelector<HTMLInputElement>("#ed-label")!;
  label.addEventListener("input", () => {
    store.updateArm(arm.id, { label: label.value || "Untitled bench" });
  });

  const colorRow = panel.querySelector<HTMLElement>("#ed-color")!;
  colorRow.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-c]");
    if (!btn) return;
    store.updateArm(arm.id, { color: btn.dataset.c! });
  });

  // Variety dropdown only shown for Coleus (the original lab species)
  const variety = panel.querySelector<HTMLSelectElement>("#ed-variety");
  if (variety) {
    variety.addEventListener("change", () => {
      store.updateArm(arm.id, { variety: variety.value as VarietyId });
    });
    panel.querySelector<HTMLButtonElement>("#info-variety")
      ?.addEventListener("click", () => {
        const v = variety.value as VarietyId;
        if (VARIETY_INFO[v]) showInfo(VARIETY_INFO[v]);
      });
  }

  // "Change plant…" returns to the entrance picker without losing other
  // bench config (the picker initialises from the active arm).
  panel.querySelector<HTMLButtonElement>("#ed-change-plant")
    ?.addEventListener("click", () => {
      store.set({ screen: "entrance", playing: false });
    });
  panel.querySelector<HTMLButtonElement>("#info-plant")
    ?.addEventListener("click", () => {
      const info = plantInfo(arm.plantId);
      if (info) showInfo(info);
    });

  bindSlider(panel, "ed-count",
    (v) => store.updateArm(arm.id, { plantCount: Math.round(v) }),
    () => arm.plantCount, true);

  // Chemical strip: × removes a chemical, "+ edit chemicals" jumps to the
  // entrance picker so the user can add/remove from the full library.
  const chemStrip = panel.querySelector<HTMLElement>("#ed-chem-strip")!;
  chemStrip.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const x = t.closest<HTMLButtonElement>("button[data-x]");
    if (x) {
      const id = x.dataset.x!;
      const next = arm.activeVocs.filter((v) => v !== id);
      store.updateArm(arm.id, { activeVocs: next });
      return;
    }
    if (t.id === "ed-edit-chem" || t.closest("#ed-edit-chem")) {
      store.set({ screen: "entrance", playing: false });
    }
  });
  chemStrip.addEventListener("contextmenu", (e) => {
    const pill = (e.target as HTMLElement).closest<HTMLElement>(".chem-pill[data-id]");
    if (!pill) return;
    e.preventDefault();
    const id = pill.dataset.id!;
    const info = chemicalInfo(id);
    if (info) showInfo(info);
  });
  chemStrip.addEventListener("click", (e) => {
    const dot = (e.target as HTMLElement).closest<HTMLElement>(".chem-pill[data-id] .pill-dot");
    if (!dot) return;
    const pill = dot.closest<HTMLElement>(".chem-pill[data-id]");
    if (!pill) return;
    const info = chemicalInfo(pill.dataset.id!);
    if (info) showInfo(info);
  });

  const del = panel.querySelector<HTMLElement>("#ed-delivery")!;
  del.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-mode]");
    if (!btn) return;
    store.updateArm(arm.id, { delivery: btn.dataset.mode as PolyDelivery });
  });
  panel.querySelector<HTMLButtonElement>("#info-delivery")!
    .addEventListener("click", () => {
      const mode = arm.delivery as PolyDelivery;
      if (DELIVERY_INFO[mode]) showInfo(DELIVERY_INFO[mode]);
    });

  bindSlider(panel, "ed-conc",  (v) => store.updateArm(arm.id, { vocConcentration: v }), () => arm.vocConcentration);
  bindSlider(panel, "ed-water", (v) => store.updateArm(arm.id, { waterDosage: v }),      () => arm.waterDosage);
  bindSlider(panel, "ed-temp",  (v) => store.updateArm(arm.id, { temperature: v }),      () => arm.temperature);
  bindSlider(panel, "ed-hum",   (v) => store.updateArm(arm.id, { humidity: v }),         () => arm.humidity);
}

function wireGlobals(panel: HTMLElement): void {
  const errCb = panel.querySelector<HTMLInputElement>("#ctl-errors")!;
  errCb.addEventListener("change", () => store.set({ randomErrors: errCb.checked }));

  panel.querySelector<HTMLButtonElement>("#info-randerr")!
    .addEventListener("click", () => showInfo(RANDOM_ERROR_INFO));

  bindSlider(panel, "ctl-seed",
    (v) => store.set({ runSeed: Math.round(v) }),
    () => store.get().runSeed, true);

  const recapMap: { id: string; key: RecapCategory }[] = [
    { id: "rc-macro",     key: "macro" },
    { id: "rc-micro",     key: "micro" },
    { id: "rc-molecular", key: "molecular" },
    { id: "rc-overall",   key: "overall" },
  ];
  for (const { id, key } of recapMap) {
    const cb = panel.querySelector<HTMLInputElement>(`#${id}`);
    if (!cb) continue;
    cb.addEventListener("change", () => {
      const cur = store.get().recapPrefs;
      store.set({ recapPrefs: { ...cur, [key]: cb.checked } });
    });
  }
}

export function mountTimeline(el: HTMLElement): void {
  el.innerHTML = `
    <div class="week-label">
      <div>Day</div>
      <div class="timeline-controls">
        <button id="tl-rewind" title="Reset to day 0">⟲</button>
        <button id="tl-back" title="-1 day">◀</button>
        <button id="tl-play" title="Play / pause">▶</button>
        <button id="tl-fwd" title="+1 day">▶|</button>
        <select id="tl-speed" title="Playback speed">
          <option value="1">1×</option>
          <option value="3">3×</option>
          <option value="7" selected>7× (1 wk/s)</option>
          <option value="15">15×</option>
          <option value="30">30×</option>
        </select>
      </div>
    </div>
    <input type="range" id="tl-day" min="0" max="${DAY_MAX}" step="1" value="0" />
    <div class="week-value">
      <div id="tl-day-value">D 0</div>
      <div class="week-sub" id="tl-week-value">Wk 0.0</div>
    </div>
  `;

  const range = el.querySelector<HTMLInputElement>("#tl-day")!;
  const dayEl = el.querySelector<HTMLDivElement>("#tl-day-value")!;
  const weekEl = el.querySelector<HTMLDivElement>("#tl-week-value")!;
  const playBtn = el.querySelector<HTMLButtonElement>("#tl-play")!;
  const rewindBtn = el.querySelector<HTMLButtonElement>("#tl-rewind")!;
  const fwdBtn = el.querySelector<HTMLButtonElement>("#tl-fwd")!;
  const backBtn = el.querySelector<HTMLButtonElement>("#tl-back")!;
  const speedSel = el.querySelector<HTMLSelectElement>("#tl-speed")!;

  const setDay = (d: number, stop = true) => {
    const v = Math.max(0, Math.min(DAY_MAX, d));
    store.set(stop ? { day: v, playing: false } : { day: v });
    if (stop) playBtn.textContent = "▶";
  };

  const sync = (d: number) => {
    range.value = String(Math.round(d));
    dayEl.textContent = `D ${Math.floor(d)}`;
    weekEl.textContent = `Wk ${weekOf(d).toFixed(1)}`;
  };

  sync(store.get().day);

  range.addEventListener("input", () => setDay(parseInt(range.value, 10)));
  fwdBtn.addEventListener("click", () => setDay(store.get().day + 1));
  backBtn.addEventListener("click", () => setDay(store.get().day - 1));
  rewindBtn.addEventListener("click", () => setDay(0));

  playBtn.addEventListener("click", () => {
    const cur = store.get();
    store.set({ playing: !cur.playing });
    playBtn.textContent = !cur.playing ? "❚❚" : "▶";
  });

  speedSel.addEventListener("change", () => {
    (window as any).__simSpeed = parseFloat(speedSel.value);
  });
  (window as any).__simSpeed = 7;

  store.subscribe((s) => {
    if (Math.abs(parseInt(range.value, 10) - s.day) > 0.5) sync(s.day);
    else { dayEl.textContent = `D ${Math.floor(s.day)}`;
           weekEl.textContent = `Wk ${weekOf(s.day).toFixed(1)}`; }
  });
}

function slider(
  id: string, label: string, unit: string,
  min: number, max: number, step: number, val: number,
): string {
  return `
    <div class="field">
      <label>
        <span>${label}</span>
        <span class="val"><span id="${id}-v">${val}</span> ${unit}</span>
      </label>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" />
    </div>
  `;
}

function bindSlider(
  root: HTMLElement,
  id: string,
  setter: (v: number) => void,
  getter: () => number,
  integer = false,
): void {
  const input = root.querySelector<HTMLInputElement>(`#${id}`)!;
  const valEl = root.querySelector<HTMLElement>(`#${id}-v`)!;
  input.value = getter().toString();
  valEl.textContent = formatNum(getter(), integer);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    setter(v);
    valEl.textContent = formatNum(v, integer);
  });
}

function formatNum(n: number, integer = false): string {
  if (integer) return n.toFixed(0);
  return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1);
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escape(s).replace(/"/g, "&quot;");
}
