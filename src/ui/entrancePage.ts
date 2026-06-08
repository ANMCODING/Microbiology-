/**
 * Entrance Page — the picker that gates the lab.
 *
 * Shown when `state.screen === "entrance"`. Lets the user choose:
 *   - exactly one plant species (10 options)
 *   - any number of chemicals (0..N from the 40-chemical library)
 *
 * Clicking "Enter Lab" applies the selection to the active arm and flips
 * `state.screen` to "lab". Clicking the brand from inside the lab flips it
 * back here without losing the rest of the bench config.
 */

import { store } from "../state/store";
import { CHEMICALS, CHEMICAL_IDS, PLANTS, PLANT_IDS, chemicalsByCategory } from "../data/loader";
import { activeArm } from "../types";
import type { ChemicalId, PlantId } from "../types";
import { showInfo } from "./infoPanel";
import { chemicalInfo, plantInfo } from "../data/autoInfo";
import { mortalityProfileFor } from "../sim/mortality";
import { goToGuide } from "./guidePage";
import { showRigorModal } from "./rigorModal";

const CATEGORY_ORDER = [
  "voc", "plant_hormone", "heavy_metal", "acid_rain", "fertilizer",
  "pesticide", "salinity", "greenhouse_gas", "pharmaceutical",
];
const CATEGORY_LABEL: Record<string, string> = {
  voc: "Volatile Organic Compounds (VOCs)",
  plant_hormone: "Plant Hormones",
  heavy_metal: "Heavy Metals",
  acid_rain: "Acid Rain & Atmospheric Acids",
  fertilizer: "Fertilizers / Nutrients",
  pesticide: "Pesticides",
  salinity: "Salinity / Salts",
  greenhouse_gas: "Greenhouse Gases",
  pharmaceutical: "Pharmaceuticals",
};

type ApplyMode = "active" | "new";

interface DraftSelection {
  plantId: PlantId;
  chemicals: Set<ChemicalId>;
  applyMode: ApplyMode;
}

let draft: DraftSelection = makeInitialDraft();

function makeInitialDraft(): DraftSelection {
  const arm = activeArm(store.get());
  return {
    plantId: arm.plantId,
    chemicals: new Set(arm.activeVocs),
    applyMode: "active",
  };
}

export function mountEntrancePage(host: HTMLElement): void {
  host.innerHTML = renderShell();
  wire(host);
  refreshSummary(host);

  // re-render plant + chem grids on each open so external changes reflect
  store.subscribe((s, prev) => {
    if (s.screen !== prev.screen && s.screen === "entrance") {
      draft = makeInitialDraft();
      host.innerHTML = renderShell();
      wire(host);
      refreshSummary(host);
    }
  });
}

function renderShell(): string {
  return `
    <div class="entrance-bg"></div>
    <div class="entrance-shell">
      <header class="entrance-head">
        <div class="entrance-brand">
          <span class="logo-dot"></span>
          <div>
            <h1>Bio-Sim Matrix</h1>
            <div class="entrance-subtitle">Multi-Scale Plant Stress Lab · Pick a species + chemicals to begin</div>
          </div>
        </div>
        <div class="entrance-counts">
          <span><b>${PLANT_IDS.length}</b> plants</span>
          <span class="sep">·</span>
          <span><b>${CHEMICAL_IDS.length}</b> chemicals</span>
          <span class="sep">·</span>
          <span><b>3</b> scales (Macro / Micro / Molecular)</span>
        </div>
        <div class="entrance-head-btns">
          <button type="button" class="entrance-to-guide" id="entrance-to-guide" title="Open the orientation page">How it works</button>
          <button type="button" class="entrance-rigor" id="entrance-rigor" title="Semi-realistic? Accountability report (print / PDF)">Basis</button>
        </div>
      </header>

      <main class="entrance-body">
        <section class="entrance-col entrance-col-plants">
          <h2>1 · Choose a plant species</h2>
          <p class="entrance-hint">Each species has its own geometry, chemical sensitivities, and baseline LC-MS profile.</p>
          <div class="plant-stack">
            <div class="plant-grid" id="plant-grid">
              ${PLANT_IDS.map(renderPlantCard).join("")}
            </div>
            <div class="plant-detail" id="plant-detail"></div>
          </div>
        </section>

        <section class="entrance-col entrance-col-chemicals">
          <h2>2 · Pick chemicals to expose it to <span class="muted">(0 = control)</span></h2>
          <p class="entrance-hint">Click any chip to toggle, right-click for the full info card. The lab supports any combination.</p>
          <div class="chem-search-row">
            <input type="search" id="chem-search" placeholder="Filter ${CHEMICAL_IDS.length} chemicals by name, formula, or category…" autocomplete="off" />
          </div>
          <div class="chem-cats" id="chem-cats">
            ${renderChemicalCategories()}
          </div>
        </section>
      </main>

      <footer class="entrance-foot">
        <div class="entrance-summary" id="entrance-summary"></div>
        <div class="entrance-actions">
          <div class="apply-mode" id="apply-mode" role="radiogroup" title="Where the picker writes its selection">
            <button type="button" data-apply="active" role="radio" aria-checked="true" class="active">replace active bench</button>
            <button type="button" data-apply="new" role="radio">add as a new bench</button>
          </div>
          <button id="enter-lab" class="enter-lab-btn" type="button">
            Enter Lab →
          </button>
        </div>
      </footer>
    </div>
  `;
}

function renderPlantCard(id: PlantId): string {
  const p = PLANTS[id];
  if (!p) return "";
  const selected = draft.plantId === id;
  const leafColor = p.geometry.leafColor;
  const stemColor = p.geometry.stemColor;
  return `
    <button type="button" class="plant-card ${selected ? "selected" : ""}" data-plant="${id}" title="Click to select; right-click for full info">
      <div class="plant-swatch" aria-hidden="true">
        <span class="swatch-stem" style="background:${stemColor}"></span>
        <span class="swatch-leaf" style="background:${leafColor}"></span>
      </div>
      <div class="plant-card-body">
        <div class="plant-name">${escape(p.commonName)}</div>
        <div class="plant-sci">${escape(p.scientificName)}</div>
        <div class="plant-meta">
          <span class="tag">${escape(p.physiology.photosynthesisPathway)}</span>
          <span class="tag">${escape(p.lifeForm)}</span>
          ${p.isModelOrganism ? `<span class="tag tag-model">model</span>` : ""}
        </div>
      </div>
      <span class="plant-info-i" data-plant-info="${id}" title="About this plant">i</span>
    </button>
  `;
}

function renderChemicalCategories(): string {
  const grouped = chemicalsByCategory();
  const known = new Set(Object.keys(grouped));
  const ordered = [
    ...CATEGORY_ORDER.filter((c) => known.has(c)),
    ...[...known].filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
  ];
  return ordered.map((cat) => {
    const items = grouped[cat].slice().sort((a, b) =>
      a.commonName.localeCompare(b.commonName),
    );
    return `
      <div class="chem-cat" data-cat="${cat}">
        <div class="chem-cat-head">
          ${escape(CATEGORY_LABEL[cat] ?? cat)} <span class="muted">${items.length}</span>
          <span class="chem-cat-actions">
            <button type="button" class="cat-mini" data-cat-all="${cat}" title="Select every chemical in this category">all</button>
            <button type="button" class="cat-mini" data-cat-none="${cat}" title="Deselect every chemical in this category">none</button>
          </span>
        </div>
        <div class="chem-chip-row">
          ${items.map((c) => {
            const on = draft.chemicals.has(c.id);
            return `<button type="button" class="chem-chip ${on ? "on" : ""}" data-chem="${c.id}" title="${escape(c.commonName)} · ${escape(c.formula)} (right-click for info)">
              <span class="chip-dot" style="background:${c.color}"></span>
              <span>${escape(c.commonName)}</span>
            </button>`;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function wire(host: HTMLElement): void {
  const plantGrid = host.querySelector<HTMLElement>("#plant-grid");
  plantGrid?.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    // info badge inside the card → open detail modal, do NOT change selection
    const infoBadge = t.closest<HTMLElement>("[data-plant-info]");
    if (infoBadge) {
      e.stopPropagation();
      const info = plantInfo(infoBadge.dataset.plantInfo!);
      if (info) showInfo(info);
      return;
    }
    const card = t.closest<HTMLElement>(".plant-card[data-plant]");
    if (!card) return;
    draft.plantId = card.dataset.plant!;
    plantGrid.querySelectorAll<HTMLElement>(".plant-card").forEach((el) =>
      el.classList.toggle("selected", el.dataset.plant === draft.plantId),
    );
    refreshSummary(host);
    refreshPlantDetail(host);
  });
  plantGrid?.addEventListener("contextmenu", (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>(".plant-card[data-plant]");
    if (!card) return;
    e.preventDefault();
    const info = plantInfo(card.dataset.plant!);
    if (info) showInfo(info);
  });

  const chemCats = host.querySelector<HTMLElement>("#chem-cats");
  chemCats?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    // bulk all/none per category
    const allBtn = target.closest<HTMLElement>("[data-cat-all]");
    if (allBtn) {
      const cat = allBtn.dataset.catAll!;
      const grouped = chemicalsByCategory();
      (grouped[cat] ?? []).forEach((c) => draft.chemicals.add(c.id));
      refreshChipStates(host);
      refreshSummary(host);
      return;
    }
    const noneBtn = target.closest<HTMLElement>("[data-cat-none]");
    if (noneBtn) {
      const cat = noneBtn.dataset.catNone!;
      const grouped = chemicalsByCategory();
      (grouped[cat] ?? []).forEach((c) => draft.chemicals.delete(c.id));
      refreshChipStates(host);
      refreshSummary(host);
      return;
    }

    const chip = target.closest<HTMLButtonElement>(".chem-chip[data-chem]");
    if (!chip) return;
    const id = chip.dataset.chem!;
    if (draft.chemicals.has(id)) draft.chemicals.delete(id);
    else draft.chemicals.add(id);
    chip.classList.toggle("on", draft.chemicals.has(id));
    refreshSummary(host);
  });
  chemCats?.addEventListener("contextmenu", (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>(".chem-chip[data-chem]");
    if (!chip) return;
    e.preventDefault();
    const info = chemicalInfo(chip.dataset.chem!);
    if (info) showInfo(info);
  });

  // Search box filters chemicals by name / formula / category
  const searchInput = host.querySelector<HTMLInputElement>("#chem-search");
  searchInput?.addEventListener("input", () => {
    const q = (searchInput.value || "").trim().toLowerCase();
    chemCats?.querySelectorAll<HTMLElement>(".chem-chip[data-chem]").forEach((chip) => {
      const id = chip.dataset.chem!;
      const c = CHEMICALS[id];
      const hay = `${c?.commonName ?? id} ${c?.formula ?? ""} ${c?.category ?? ""} ${c?.subCategory ?? ""}`.toLowerCase();
      const show = q.length === 0 || hay.includes(q);
      chip.style.display = show ? "" : "none";
    });
    // hide categories whose chips are all hidden
    chemCats?.querySelectorAll<HTMLElement>(".chem-cat").forEach((cat) => {
      const visible = cat.querySelectorAll<HTMLElement>(`.chem-chip[data-chem]:not([style*="display: none"])`).length;
      cat.style.display = visible === 0 ? "none" : "";
    });
  });

  // apply-mode radio
  const applyEl = host.querySelector<HTMLElement>("#apply-mode");
  applyEl?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-apply]");
    if (!btn) return;
    draft.applyMode = (btn.dataset.apply as ApplyMode) ?? "active";
    applyEl.querySelectorAll<HTMLElement>("[data-apply]").forEach((el) => {
      const on = el.dataset.apply === draft.applyMode;
      el.classList.toggle("active", on);
      el.setAttribute("aria-checked", on ? "true" : "false");
    });
    // Also nudge the enter-lab button label so the consequence is obvious
    const enterBtn = host.querySelector<HTMLButtonElement>("#enter-lab");
    if (enterBtn) {
      enterBtn.textContent = draft.applyMode === "new"
        ? "Add bench + Enter Lab →"
        : "Enter Lab →";
    }
  });

  host.querySelector<HTMLButtonElement>("#enter-lab")?.addEventListener("click", () => {
    enterLab();
  });

  host.querySelector("#entrance-to-guide")?.addEventListener("click", () => {
    goToGuide();
  });
  host.querySelector("#entrance-rigor")?.addEventListener("click", () => {
    showRigorModal();
  });

  // first-paint detail
  refreshPlantDetail(host);
}

function refreshChipStates(host: HTMLElement): void {
  host.querySelectorAll<HTMLElement>(".chem-chip[data-chem]").forEach((chip) => {
    const id = chip.dataset.chem!;
    chip.classList.toggle("on", draft.chemicals.has(id));
  });
}

/** Render the live plant-detail strip below the plant grid. */
function refreshPlantDetail(host: HTMLElement): void {
  const el = host.querySelector<HTMLElement>("#plant-detail");
  if (!el) return;
  const p = PLANTS[draft.plantId];
  if (!p) {
    el.innerHTML = "";
    return;
  }
  // Top-3 most-sensitive chemicals (largest sensitivity multiplier > 1)
  const sens = p.chemicalSensitivity ?? {};
  const sensList = Object.entries(sens)
    .filter(([, v]) => typeof v === "number" && v > 1.05)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 4)
    .map(([id, v]) => `${escape(CHEMICALS[id]?.commonName ?? id)} <span class="muted">×${(v as number).toFixed(1)}</span>`);
  // Top-3 most-tolerant (multiplier < 1)
  const tolList = Object.entries(sens)
    .filter(([, v]) => typeof v === "number" && v < 0.95)
    .sort((a, b) => (a[1] as number) - (b[1] as number))
    .slice(0, 3)
    .map(([id, v]) => `${escape(CHEMICALS[id]?.commonName ?? id)} <span class="muted">×${(v as number).toFixed(2)}</span>`);
  // Real-world relevance pulled from the educational block when present
  const issue = (p as unknown as { educational?: { realWorldIssue?: string } })
    .educational?.realWorldIssue;
  // A few signature metabolites from the plant baseline LC-MS, if available
  const peaks = (p as unknown as { baselineLcMs?: { peaks?: Array<{ name: string; intensity: number }> } })
    .baselineLcMs?.peaks ?? [];
  const topPeaks = peaks.slice().sort((a, b) => b.intensity - a.intensity).slice(0, 4);

  // Mortality profile preview
  const mort = mortalityProfileFor(draft.plantId);
  const toughnessLabel = mort.lethalDose >= 8 ? "very tough"
    : mort.lethalDose >= 6 ? "moderately tough"
    : mort.lethalDose >= 5 ? "average resilience"
    : "fragile";
  const recoveryLabel = mort.recoveryRate >= 0.18 ? "fast"
    : mort.recoveryRate >= 0.10 ? "moderate"
    : "slow";

  el.innerHTML = `
    <div class="pd-row pd-head">
      <div class="pd-title">${escape(p.commonName)} <span class="pd-sci">${escape(p.scientificName)}</span></div>
      <div class="pd-tags">
        <span class="tag">${escape(p.physiology.photosynthesisPathway)}</span>
        <span class="tag">${escape(p.lifeForm)}</span>
        ${p.isModelOrganism ? `<span class="tag tag-model">model organism</span>` : ""}
      </div>
    </div>
    <div class="pd-row pd-grid">
      <div class="pd-cell">
        <div class="pd-label">Most sensitive to</div>
        <div class="pd-val">${sensList.length ? sensList.join(", ") : `<span class="muted">— none above baseline —</span>`}</div>
      </div>
      <div class="pd-cell">
        <div class="pd-label">Tolerates well</div>
        <div class="pd-val">${tolList.length ? tolList.join(", ") : `<span class="muted">— none below baseline —</span>`}</div>
      </div>
      <div class="pd-cell">
        <div class="pd-label">Signature metabolites</div>
        <div class="pd-val">${topPeaks.length ? topPeaks.map((p) => `${escape(p.name)} <span class="muted">m/z ${Math.round((p as unknown as { mz: number }).mz)}</span>`).join(", ") : `<span class="muted">— uses generic baseline —</span>`}</div>
      </div>
      <div class="pd-cell pd-mort">
        <div class="pd-label">Mortality profile</div>
        <div class="pd-val">
          <b>${toughnessLabel}</b>
          <span class="muted"> · tolerance ${mort.stressTolerance.toFixed(2)}</span>
          <span class="muted"> · lethal load ${mort.lethalDose.toFixed(1)}</span>
          <span class="muted"> · recovery ${recoveryLabel} (${mort.recoveryRate.toFixed(2)}/day)</span>
        </div>
      </div>
    </div>
    ${issue ? `<div class="pd-row pd-issue"><span class="pd-label">Why it matters:</span> ${escape(issue)}</div>` : ""}
  `;
}

function refreshSummary(host: HTMLElement): void {
  const el = host.querySelector<HTMLElement>("#entrance-summary");
  if (!el) return;
  const plant = PLANTS[draft.plantId];
  const chemNames = [...draft.chemicals]
    .map((id) => CHEMICALS[id]?.commonName ?? id)
    .slice(0, 4);
  const moreCount = draft.chemicals.size - chemNames.length;
  const chemSummary =
    draft.chemicals.size === 0
      ? `<span class="muted">control bench (no chemicals)</span>`
      : chemNames.map(escape).join(", ") +
        (moreCount > 0 ? ` <span class="muted">+ ${moreCount} more</span>` : "");

  el.innerHTML = `
    <div class="sum-line"><span class="sum-key">Plant:</span> <b>${escape(plant?.commonName ?? draft.plantId)}</b></div>
    <div class="sum-line"><span class="sum-key">Chemicals (${draft.chemicals.size}):</span> ${chemSummary}</div>
  `;
}

function enterLab(): void {
  const chems = [...draft.chemicals];
  const plant = PLANTS[draft.plantId];
  const plantLabel = plant?.commonName ?? draft.plantId;
  const chemLabel = chems.length === 0
    ? "Control"
    : chems.length <= 2
      ? chems.map((id) => CHEMICALS[id]?.commonName ?? id).join(" + ")
      : `${chems.length} chemicals`;
  const label = `${plantLabel} · ${chemLabel}`;

  if (draft.applyMode === "new") {
    // Spawn a brand-new bench inheriting the active bench's other fields
    // (lighting, water, dose schedule) but with the picker's plant + chems.
    const arm = activeArm(store.get());
    // addArm activates the new arm itself; falls through to label-only path
    // when the bench cap (MAX_TABS) is hit.
    const newArm = store.addArm({
      ...arm,
      plantId: draft.plantId,
      activeVocs: chems,
      label,
    });
    if (!newArm) {
      store.updateArm(arm.id, {
        plantId: draft.plantId,
        activeVocs: chems,
        label,
      });
    }
  } else {
    const arm = activeArm(store.get());
    store.updateArm(arm.id, {
      plantId: draft.plantId,
      activeVocs: chems,
      label,
    });
  }
  store.set({ screen: "lab" });
}

/** Allow the lab UI to flip back to the entrance picker. */
export function returnToEntrance(): void {
  store.set({ screen: "entrance", playing: false });
}

function escape(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
