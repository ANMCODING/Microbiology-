import { store } from "./state/store";
import { mountLeftPanel, mountTabs, mountTimeline } from "./ui/controls";
import { LogPanel } from "./ui/log";
import { TodayPanel } from "./ui/today";
import { AnalyticsPanel } from "./ui/analyticsPanel";
import { RecapPanel } from "./ui/recapPanel";
import { GreenhouseScene } from "./views/greenhouseScene";
import { MicroCanvas } from "./views/microCanvas";
import { MassSpecChart } from "./views/massSpecChart";
import { computeMicrobiome } from "./sim/microbiome";
import { DAY_MAX, activeArm } from "./types";
import type { MicroRegion, ViewMode } from "./types";
import { showInfo } from "./ui/infoPanel";
import { DELIVERY_INFO, MASS_SPEC_INFO, MICROBE_INFO } from "./data/encyclopedia";
import { mountEntrancePage, returnToEntrance } from "./ui/entrancePage";
import { mountGuidePage, goToGuide, readSkipGuidePreference } from "./ui/guidePage";
import { mountRigorModal, showRigorModal } from "./ui/rigorModal";
import { PLANTS } from "./data/loader";
import type { ScreenMode } from "./types";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

if (readSkipGuidePreference()) {
  store.set({ screen: "entrance" });
}

// ────────────────────────────────────────────────────────────────────────
// Guide → Entrance (picker) → Lab
const guideHost = $("guide");
const entranceHost = $("entrance");
const appHost = $("app");
mountGuidePage(guideHost);
mountEntrancePage(entranceHost);
mountRigorModal();
applyScreen(store.get().screen);
store.subscribe((s, prev) => {
  if (s.screen !== prev.screen) {
    applyScreen(s.screen);
    if (s.screen === "lab") {
      // re-measure once the lab becomes visible — Three/Chart need a kick
      requestAnimationFrame(() => requestAnimationFrame(scheduleResize));
    }
  }
  if (s.screen === "lab" && (s.activeArmId !== prev.activeArmId || s.arms !== prev.arms)) {
    refreshBrandSubtitle();
  }
});
function applyScreen(screen: ScreenMode): void {
  guideHost.classList.toggle("hidden-screen", screen !== "guide");
  entranceHost.classList.toggle("hidden-screen", screen !== "entrance");
  appHost.classList.toggle("hidden-screen", screen !== "lab");
  document.body.classList.toggle("guide-open", screen === "guide");
  if (screen === "lab") refreshBrandSubtitle();
}
function refreshBrandSubtitle(): void {
  const arm = activeArm(store.get());
  const plant = PLANTS[arm.plantId];
  const sub = document.getElementById("brand-subtitle");
  if (sub) {
    sub.textContent = plant
      ? `${plant.commonName} · ${plant.scientificName} · Multi-Scale Stress Lab`
      : "Multi-Scale Plant Stress Lab";
  }
}
$("brand-back").addEventListener("click", () => returnToEntrance());
$("brand-guide").addEventListener("click", () => goToGuide());
$("brand-rigor").addEventListener("click", () => showRigorModal());

const tabHost     = $("tab-strip");
const leftPanel   = $("left-panel");
const rightPanel  = $("right-panel");
const viewport    = $("viewport");
const timelineEl  = $("timeline");

mountTabs(tabHost);
mountLeftPanel(leftPanel);
mountTimeline(timelineEl);

const threeCanvas    = $("three-canvas") as HTMLCanvasElement;
const overlayMicro   = $("micro-canvas") as HTMLCanvasElement;
const molOverlay     = $("molecular-overlay");
const dashMicroCanvas = $("dash-micro-canvas") as HTMLCanvasElement;
const msCanvas       = $("ms-chart") as HTMLCanvasElement;

const greenhouse = new GreenhouseScene(threeCanvas);
const dashMicro  = new MicroCanvas(dashMicroCanvas);
const fullMicro  = new MicroCanvas(overlayMicro, { fullscreen: true });
const msChart    = new MassSpecChart(msCanvas);
const log        = new LogPanel($("log-feed"), $("log-week"));

// Insert "Today" + "Analytics" panels above the LC-MS card so they're the
// first things you see in the right column.
const todayHost = document.createElement("div");
todayHost.className = "dash-card";
const analyticsHost = document.createElement("div");
analyticsHost.className = "dash-card";
const firstCard = rightPanel.querySelector(".dash-card");
rightPanel.insertBefore(todayHost,    firstCard);
rightPanel.insertBefore(analyticsHost, firstCard);
const today     = new TodayPanel(todayHost);
const analytics = new AnalyticsPanel(analyticsHost);

// Weekly recap cards (one per category) — mounted at the top of the right
// panel. Each card self-tags with a view-scope so the scoping block below
// picks them up too.
new RecapPanel(rightPanel);

// Tag each right-panel card with the view-mode(s) where it is relevant.
// "all" cards stay visible everywhere (e.g. the Automated Log).
todayHost.dataset.viewScope     = "macro";
analyticsHost.dataset.viewScope = "macro";
const microCard = dashMicroCanvas.closest<HTMLElement>(".dash-card");
if (microCard) microCard.dataset.viewScope = "micro";
const msCard = msCanvas.closest<HTMLElement>(".dash-card");
if (msCard) msCard.dataset.viewScope = "molecular";
const logCard = $("log-feed").closest<HTMLElement>(".dash-card");
if (logCard) logCard.dataset.viewScope = "all";

function applyViewScope(view: ViewMode): void {
  rightPanel.querySelectorAll<HTMLElement>(".dash-card[data-view-scope]").forEach((el) => {
    const scope = el.dataset.viewScope;
    const show = scope === "all" || scope === view;
    el.classList.toggle("view-hidden", !show);
  });
  // cards that were display:none while hidden will have 0 box size until a
  // resize — kick the observer so chart.js / micro canvas re-measure
  requestAnimationFrame(() => requestAnimationFrame(scheduleResize));
}
applyViewScope(store.get().view);

// view toggle
const viewToggle = $("view-toggle");
viewToggle.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-mode]");
  if (!t) return;
  const mode = t.dataset.mode as ViewMode;
  store.set({ view: mode });
  viewToggle.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  t.classList.add("active");
});

// micro region toggle
const microToggle = $("micro-region-toggle");
microToggle.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-region]");
  if (!t) return;
  const region = t.dataset.region as MicroRegion;
  store.set({ microRegion: region });
  microToggle.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  t.classList.add("active");
});

// Active-arm tag in the microbiome card header — click for delivery info
const microArmTag = $("micro-arm-tag");
microArmTag.style.cursor = "pointer";
microArmTag.title = "Click for the bench's delivery info";
microArmTag.addEventListener("click", () => {
  const arm = activeArm(store.get());
  if (arm.activeVocs.length > 0) {
    if (DELIVERY_INFO[arm.delivery]) showInfo(DELIVERY_INFO[arm.delivery]);
  }
});
const refreshMicroTag = () => {
  const arm = activeArm(store.get());
  microArmTag.textContent = arm.label;
  microArmTag.style.color = arm.color;
};
refreshMicroTag();

// Microbe-class legend → info modal per microbe class
const microLegend = document.getElementById("micro-legend");
microLegend?.addEventListener("click", (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>(".leg-chip[data-class]");
  if (!chip) return;
  const k = chip.dataset.class as keyof typeof MICROBE_INFO;
  if (MICROBE_INFO[k]) showInfo(MICROBE_INFO[k]);
});

// LC-MS overlay-all toggle
const msOverlayCb = $("ms-overlay-all") as HTMLInputElement;
msOverlayCb.addEventListener("change", () => {
  msChart.setOverlayAll(msOverlayCb.checked);
  msChart.update(store.get());
});

// LC-MS info button
$("info-massspec").addEventListener("click", () => showInfo(MASS_SPEC_INFO));

// Log "+ entry" button — captures the current day's per-bench entries
$("log-add").addEventListener("click", () => log.addEntry(store.get()));

// LC-MS plant picker — always visible; chips for [Mean, P0, P1, …, Pn]
const msPickerHost = $("ms-plant-picker");
msPickerHost.addEventListener("click", (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>(".ms-chip[data-idx]");
  if (!chip) return;
  const raw = chip.dataset.idx!;
  const idx = raw === "mean" ? null : parseInt(raw, 10);
  store.set({ selectedPlantIndex: idx });
});

function refreshPlantPicker(): void {
  const s = store.get();
  const arm = activeArm(s);
  const cur = s.selectedPlantIndex;

  const chips: string[] = [];
  chips.push(
    `<button type="button" class="ms-chip ${cur === null ? "active" : ""}" data-idx="mean" style="${cur === null ? `--chip-color:${arm.color};` : ""}" title="Show bench mean spectrum">
       Mean · n=${arm.plantCount}
     </button>`,
  );
  for (let i = 0; i < arm.plantCount; i++) {
    const isActive = cur === i;
    chips.push(
      `<button type="button" class="ms-chip ${isActive ? "active" : ""}" data-idx="${i}" style="${isActive ? `--chip-color:${arm.color};` : ""}" title="Inspect plant P${i}'s individual spectrum">
         P${i}
       </button>`,
    );
  }
  msPickerHost.innerHTML = chips.join("");
}
refreshPlantPicker();

// Click on the 3D bench → focus a plant for per-plant LC-MS analysis.
// OrbitControls captures pointers for dragging the camera, so we discriminate
// "click" from "drag" by tracking how far the pointer travelled between
// pointerdown and pointerup. Small movement + short duration = click.
{
  let downX = 0, downY = 0, downT = 0, moved = 0;
  threeCanvas.addEventListener("pointerdown", (e) => {
    downX = e.clientX; downY = e.clientY; downT = performance.now();
    moved = 0;
  });
  threeCanvas.addEventListener("pointermove", (e) => {
    if (downT === 0) return;
    moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
  });
  const tryClick = (e: PointerEvent) => {
    const dt = performance.now() - downT;
    downT = 0;
    if (moved > 6 || dt > 450) return; // it was a drag
    const idx = greenhouse.pickPlantAt(e.clientX, e.clientY);
    store.set({ selectedPlantIndex: idx });
  };
  threeCanvas.addEventListener("pointerup", tryClick);
  // `click` acts as a belt-and-suspenders fallback in case pointerup was
  // swallowed by OrbitControls' pointer capture on some browsers.
  threeCanvas.addEventListener("click", (e) => {
    if (downT !== 0) tryClick(e as unknown as PointerEvent);
  });
}

// React to view changes (variety / arm changes are handled inside greenhouse)
store.subscribe((s, prev) => {
  if (s.view !== prev.view) {
    overlayMicro.classList.toggle("hidden", s.view !== "micro");
    molOverlay.classList.toggle("hidden", s.view !== "molecular");
    greenhouse.setMolecularMode(s.view === "molecular");
    if (s.view === "micro") {
      requestAnimationFrame(() => fullMicro.resize());
    }
    applyViewScope(s.view);
  }
  if (s.activeArmId !== prev.activeArmId || s.arms !== prev.arms) {
    refreshMicroTag();
  }
  if (
    s.selectedPlantIndex !== prev.selectedPlantIndex ||
    s.activeArmId !== prev.activeArmId ||
    s.arms !== prev.arms
  ) {
    refreshPlantPicker();
    msChart.update(store.get());
  }
});

const mDiv  = $("metric-diversity");
const mRes  = $("metric-resistome");
const mPath = $("metric-pathogen");

/**
 * Resize bookkeeping. Observe the *containers*, not the canvases (Chart.js
 * + DPR scaling resize the canvas attributes themselves; observing those
 * would re-trigger us in a loop). Coalesce all changes into one rAF.
 */
let resizePending = false;
function scheduleResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    const r = viewport.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) greenhouse.resize(r.width, r.height);
    if (!overlayMicro.classList.contains("hidden")) fullMicro.resize();
    dashMicro.resize();
    msChart.resize();
  });
}
const ro = new ResizeObserver(scheduleResize);
ro.observe(viewport);
ro.observe($("dash-micro-host"));
ro.observe(rightPanel);
window.addEventListener("resize", scheduleResize);

// frame loop
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const s = store.get();

  if (s.playing) {
    const speed = (window as any).__simSpeed ?? 7;
    const next = s.day + dt * speed;
    if (next >= DAY_MAX) store.set({ day: DAY_MAX, playing: false });
    else store.set({ day: next });
  }

  greenhouse.update(s, dt);
  greenhouse.render();

  if (s.view === "micro") fullMicro.step(dt, s);
  dashMicro.step(dt, s);

  // Microbiome metrics for the active arm
  const arm = activeArm(s);
  const micro = computeMicrobiome(arm, s.day);
  mDiv.textContent  = micro.diversity.toFixed(2);
  mRes.textContent  = Math.round(micro.resistome).toString();
  mPath.textContent = `${Math.round(micro.pathogenFrac * 100)}%`;

  today.update(s);
  analytics.update(s);
  log.update(s);

  requestAnimationFrame(frame);
}
requestAnimationFrame((t) => { last = t; msChart.update(store.get()); frame(t); });

// debounce ms chart updates on store changes
let msTimeout: number | null = null;
store.subscribe(() => {
  if (msTimeout !== null) window.clearTimeout(msTimeout);
  msTimeout = window.setTimeout(() => msChart.update(store.get()), 80);
});

// initial sizing kick (after layout settles)
requestAnimationFrame(scheduleResize);
