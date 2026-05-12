/**
 * Scientific basis & accountability — modal + printable / downloadable report.
 *
 * Explains why the lab is "semi-realistic" and what is (and is not) grounded
 * at each scale. "PDF" path: user clicks Print → chooses Save as PDF in the
 * browser dialog, or downloads the bundled .html and prints from there.
 */

const DOC_TITLE = "Bio-Sim Matrix — Scientific basis & accountability";
const DOC_VERSION = "May 2026";

export function mountRigorModal(): void {
  if (document.getElementById("rigor-backdrop")) return;

  const backdrop = document.createElement("div");
  backdrop.id = "rigor-backdrop";
  backdrop.className = "rigor-backdrop hidden";
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.innerHTML = `
    <div class="rigor-card" role="dialog" aria-modal="true" aria-labelledby="rigor-title">
      <div class="rigor-card-head">
        <div>
          <h2 id="rigor-title" class="rigor-title">${escapeAttr(DOC_TITLE)}</h2>
          <p class="rigor-sub">Semi-realistic by design · ${escapeAttr(DOC_VERSION)}</p>
        </div>
        <div class="rigor-head-actions">
          <button type="button" class="rigor-btn rigor-btn-ghost" id="rigor-print" title="Opens a clean page, then use Print → Save as PDF">Print / Save as PDF</button>
          <button type="button" class="rigor-btn rigor-btn-ghost" id="rigor-download" title="Download a single HTML file you can open and print">Download .html</button>
          <button type="button" class="rigor-close" id="rigor-close" aria-label="Close">×</button>
        </div>
      </div>
      <nav class="rigor-tabs" role="tablist" aria-label="Report sections">
        ${TAB_IDS.map((id, i) =>
          `<button type="button" role="tab" class="rigor-tab${i === 0 ? " active" : ""}" data-tab="${id}" aria-selected="${i === 0 ? "true" : "false"}">${TAB_LABELS[id]}</button>`,
        ).join("")}
      </nav>
      <div class="rigor-body">
        ${TAB_IDS.map((id, i) => sectionHtml(id, i === 0)).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const card = backdrop.querySelector<HTMLElement>(".rigor-card")!;
  card.addEventListener("click", (e) => e.stopPropagation());
  backdrop.addEventListener("click", () => hideRigorModal());
  backdrop.querySelector("#rigor-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    hideRigorModal();
  });
  backdrop.querySelector("#rigor-print")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openPrintableReport();
  });
  backdrop.querySelector("#rigor-download")?.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadStandaloneReport();
  });

  backdrop.querySelector(".rigor-tabs")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".rigor-tab[data-tab]");
    if (!btn) return;
    const id = btn.dataset.tab!;
    backdrop.querySelectorAll(".rigor-tab").forEach((b) => {
      const on = (b as HTMLElement).dataset.tab === id;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    backdrop.querySelectorAll<HTMLElement>(".rigor-panel").forEach((p) => {
      p.classList.toggle("active", p.dataset.panel === id);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.classList.contains("hidden")) hideRigorModal();
  });
}

export function showRigorModal(): void {
  mountRigorModal();
  const el = document.getElementById("rigor-backdrop");
  if (!el) return;
  el.classList.remove("hidden");
  el.setAttribute("aria-hidden", "false");
}

export function hideRigorModal(): void {
  const el = document.getElementById("rigor-backdrop");
  if (!el) return;
  el.classList.add("hidden");
  el.setAttribute("aria-hidden", "true");
}

const TAB_IDS = [
  "overview", "plants", "chemicals", "macro", "micro", "molecular", "limits",
] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  overview: "Overview",
  plants: "Plants",
  chemicals: "Chemicals",
  macro: "Macro",
  micro: "Micro",
  molecular: "Molecular",
  limits: "Limits & use",
};

function sectionHtml(id: TabId, active: boolean): string {
  const body = SECTION_COPY[id];
  return `
    <section class="rigor-panel${active ? " active" : ""}" data-panel="${id}" role="tabpanel">
      ${body}
    </section>
  `;
}

const SECTION_COPY: Record<TabId, string> = {
  overview: `
    <h3>Why we call it semi-realistic</h3>
    <p>The simulator is built to teach <strong>how ideas connect across scales</strong> (whole plant → surface microbes → simplified chemistry readout) using <strong>curated JSON data</strong> for plants and chemicals. The math is internally consistent and reproducible (same settings → same run), but it is <strong>not</strong> a calibrated predictive model for field or greenhouse outcomes.</p>
    <h3>What “accountability” means here</h3>
    <ul class="rigor-ul">
      <li><strong>Declared inputs</strong> — stress fingerprints, LC-MS peaks, sensitivities, microbiome baselines, and mortality hints live in data files you can inspect.</li>
      <li><strong>Explicit simplifications</strong> — each scale below states what is modeled and what is cartoon.</li>
      <li><strong>Appropriate use</strong> — ideal for classroom reasoning, comparing scenarios, and literacy; not for regulatory decisions or replacing wet-lab validation.</li>
    </ul>
  `,
  plants: `
    <h3>What is grounded</h3>
    <p>Each plant species has its own <strong>geometry</strong> parameters (height, leaf habit, colors), a <strong>chemical sensitivity</strong> table (how strongly it reacts to each of the 40 library chemicals), <strong>microbiome baselines</strong> (diversity, pathogen baseline, stability), optional <strong>mortality</strong> overrides, and a <strong>baseline LC-MS</strong> peak list. That makes cross-species comparisons <em>directionally</em> meaningful.</p>
    <h3>What is simplified</h3>
    <ul class="rigor-ul">
      <li>All species share one underlying 3D plant renderer (parameterized), not separate organ-level models.</li>
      <li>No full genetics, developmental stages beyond growth curves, or soil physics.</li>
    </ul>
  `,
  chemicals: `
    <h3>What is grounded</h3>
    <p>Each chemical carries a <strong>simulation stress vector</strong> (growth, necrosis, wilting, etc.), optional <strong>dose-response</strong> hints, <strong>synergy / antagonism</strong> links to other IDs, and <strong>LC-MS peak</strong> contributions. Combining chemicals uses documented pairwise modifiers where present.</p>
    <h3>What is simplified</h3>
    <ul class="rigor-ul">
      <li>Stress axes are capped so the interface never “blows up” numerically.</li>
      <li>No true pharmacokinetics (uptake, half-life in tissue) — exposure is scaled by your concentration slider and a time ramp, not by metabolism pathways.</li>
    </ul>
  `,
  macro: `
    <h3>What is grounded</h3>
    <p>3D morphology responds to the same <strong>stress vector</strong> as the rest of the app: height suppression, chlorosis, wilting, curl, necrosis, pigmentation, stomatal closure, and defense signal. <strong>Mortality</strong> freezes growth and changes appearance; <strong>recovery</strong> lowers cumulative damage for survivors when exposure eases.</p>
    <h3>What is simplified</h3>
    <ul class="rigor-ul">
      <li>Visuals are stylized meshes, not biomechanical or hydraulic simulations.</li>
      <li>Wind sway and anomalies are teaching flourishes, not measured micrometeorology.</li>
    </ul>
  `,
  micro: `
    <h3>What is grounded</h3>
    <p>The <strong>microbiome card metrics</strong> (diversity, pathogen fraction, resistome, beneficial multiplier, fumigation cull pulses) are computed from your bench settings, delivery mode, concentration, time, plant JSON baselines, and defense-related stress relief. The <strong>Micro canvas</strong> uses those scalars to control spawn mix, population target, lifetimes, and occasional culls — so the <em>trend</em> matches the numbers.</p>
    <h3>What is simplified</h3>
    <ul class="rigor-ul">
      <li>Only <strong>three roles</strong> (beneficial, opportunist, pathogen) — not real taxonomic communities.</li>
      <li>Particle motion is a <strong>metaphor</strong> (drift, wrap, fade), not a spatial simulation of cells on a leaf.</li>
      <li>Background drawings (honeycomb, stomatal hints, chloroplast ovals, root strokes, purple defense halos) are <strong>scenery</strong>, not counted microbes.</li>
    </ul>
  `,
  molecular: `
    <h3>What is grounded</h3>
    <p>The LC-MS chart merges <strong>plant baseline peaks</strong> and <strong>chemical peaks</strong> from JSON, then modulates with stress heuristics so chemistry readouts move in rough concert with visible stress. Clicking a plant in Molecular mode ties the chart to that individual’s noise where applicable.</p>
    <h3>What is simplified</h3>
    <ul class="rigor-ul">
      <li>Peaks are <strong>teaching abstractions</strong>, not instrument-accurate m/z or isotope patterns.</li>
      <li>No real chromatography time axis — the x-axis is “mass channel” style only.</li>
    </ul>
  `,
  limits: `
    <h3>When this lab is “realistic enough”</h3>
    <p>For <strong>learning outcomes</strong> — vocabulary, relative comparisons, multi-scale thinking, and discussion of trade-offs — the level of realism is intentionally balanced: rich enough to feel serious, simple enough to run in a browser with transparent rules.</p>
    <h3>When it is not enough</h3>
    <ul class="rigor-ul">
      <li>Quantitative exposure–response for human health or environmental permits.</li>
      <li>Species-specific predictions under untested combinations without new data.</li>
      <li>Replacing peer-reviewed models or published dose–response curves.</li>
    </ul>
    <p><strong>Export:</strong> Use <em>Print / Save as PDF</em> or <em>Download .html</em> above to share this accountability text offline.</p>
  `,
};

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function buildStandaloneReportHtml(): string {
  const inner = TAB_IDS.map((id) => `
    <section class="print-sec">
      <h2>${escapeAttr(TAB_LABELS[id])}</h2>
      ${SECTION_COPY[id]}
    </section>
  `).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeAttr(DOC_TITLE)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.55; color: #111; max-width: 720px; margin: 24px auto; padding: 0 20px 40px; }
  h1 { font-size: 1.35rem; margin-bottom: 0.2em; }
  .meta { color: #555; font-size: 0.9rem; margin-bottom: 1.5em; }
  h2 { font-size: 1.1rem; margin-top: 1.6em; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; }
  h3 { font-size: 1rem; margin: 1em 0 0.4em; }
  p { margin: 0.6em 0; }
  ul { margin: 0.4em 0 0.8em 1.2em; }
  li { margin: 0.25em 0; }
  @media print {
    body { margin: 0; max-width: none; }
    h2 { break-after: avoid; }
  }
</style>
</head>
<body>
  <h1>${escapeAttr(DOC_TITLE)}</h1>
  <p class="meta">Semi-realistic by design · ${escapeAttr(DOC_VERSION)} · Generated from Bio-Sim Matrix</p>
  ${inner}
  <p class="meta" style="margin-top:2em;">End of document.</p>
</body>
</html>`;
}

function openPrintableReport(): void {
  const html = buildStandaloneReportHtml();
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!w) {
    window.alert("Your browser blocked the print window. Allow pop-ups for this site, or use “Download .html” and open the file.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  const trigger = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  };
  if (w.document.readyState === "complete") setTimeout(trigger, 250);
  else w.onload = () => setTimeout(trigger, 100);
}

function downloadStandaloneReport(): void {
  const html = buildStandaloneReportHtml();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bio-sim-matrix-scientific-basis.html";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
