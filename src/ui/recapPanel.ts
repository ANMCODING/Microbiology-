import type { RecapCategory, SimulationState } from "../types";
import { weekOf } from "../types";
import { store } from "../state/store";
import { buildWeeklyRecap } from "../sim/report";

/**
 * Weekly recap UI — four dedicated dash-cards, one per category.
 *
 *   - Macro      → visible only in Macro view
 *   - Micro      → visible only in Micro view
 *   - Molecular  → visible only in Molecular view
 *   - Overall    → visible in all views (cross-scale synthesis)
 *
 * Generation is **on-demand**. Each card has a "Generate now" button that
 * rebuilds the whole recap at the current simulation day with the current
 * recap preferences (so any button refreshes every enabled card). This
 * means:
 *   - scrubbing the timeline or tweaking parameters does NOT auto-post;
 *   - pressing the button always captures "what I'm looking at right now";
 *   - toggling a category on after the fact fills in its content on the
 *     next button press.
 *
 * Disabled categories stay collapsed/muted.
 */
export class RecapPanel {
  private cards: Record<RecapCategory, HTMLElement> = {} as any;
  private rightPanel: HTMLElement;

  constructor(rightPanel: HTMLElement) {
    this.rightPanel = rightPanel;
    this.mountCards();

    store.subscribe((s, prev) => {
      if (
        s.lastRecap !== prev.lastRecap ||
        s.recapPrefs !== prev.recapPrefs ||
        s.activeArmId !== prev.activeArmId ||
        Math.floor(s.day) !== Math.floor(prev.day)
      ) {
        this.render(s);
      }
    });

    this.render(store.get());
  }

  private mountCards(): void {
    const specs: { key: RecapCategory; title: string; scope: "macro" | "micro" | "molecular" | "all" }[] = [
      { key: "macro",     title: "Weekly recap · Macro",     scope: "macro" },
      { key: "micro",     title: "Weekly recap · Micro",     scope: "micro" },
      { key: "molecular", title: "Weekly recap · Molecular", scope: "molecular" },
      { key: "overall",   title: "Weekly recap · Overall",   scope: "all" },
    ];

    const firstExisting = this.rightPanel.firstElementChild;
    for (const spec of specs) {
      const el = document.createElement("div");
      el.className = `dash-card recap-card recap-${spec.key}`;
      el.dataset.viewScope = spec.scope;
      el.dataset.recapKey = spec.key;
      el.innerHTML = `
        <div class="card-head">
          <h3>${spec.title}</h3>
          <div class="recap-head-right">
            <span class="card-meta recap-meta">—</span>
            <button class="recap-btn" type="button" title="Capture a fresh snapshot at the current simulation day">
              Generate now
            </button>
          </div>
        </div>
        <div class="recap-body-wrap">
          <p class="recap-body">No snapshot yet — press <b>Generate now</b> to capture the current day.</p>
        </div>
      `;
      this.rightPanel.insertBefore(el, firstExisting);
      this.cards[spec.key] = el;

      // Any card's "Generate now" rebuilds the whole recap at current day.
      el.querySelector<HTMLButtonElement>(".recap-btn")!
        .addEventListener("click", () => this.regenerate());
    }
  }

  /** Build a fresh recap at the current simulation day and push it to the
   *  store so every enabled card re-renders. */
  regenerate(): void {
    const s = store.get();
    const fresh = buildWeeklyRecap(s, s.recapPrefs);
    store.set({ lastRecap: fresh });
  }

  private render(s: SimulationState): void {
    const recap = s.lastRecap;
    const prefs = s.recapPrefs;
    const curDay = Math.floor(s.day);
    const curWk  = weekOf(s.day).toFixed(1);

    (Object.keys(this.cards) as RecapCategory[]).forEach((k) => {
      const card = this.cards[k];
      const enabled = prefs[k];
      card.classList.toggle("recap-disabled", !enabled);

      const body = card.querySelector<HTMLElement>(".recap-body")!;
      const meta = card.querySelector<HTMLElement>(".recap-meta")!;
      const btn  = card.querySelector<HTMLButtonElement>(".recap-btn")!;

      btn.textContent = `Generate · Day ${curDay}`;
      btn.disabled = !enabled;

      if (!enabled) {
        body.textContent = `Category disabled — enable "${labelOf(k)}" in the left panel, then press Generate.`;
        meta.textContent = "off";
        meta.style.color = "";
        return;
      }
      if (!recap) {
        body.textContent = `No snapshot yet — press Generate to capture Day ${curDay} (Wk ${curWk}).`;
        meta.textContent = "awaiting snapshot";
        meta.style.color = "";
        return;
      }
      const text = recap[k];
      meta.textContent = `Day ${Math.floor(recap.day)} · Wk ${weekOf(recap.day).toFixed(1)} · ${recap.headlineLabel}`;
      meta.style.color = recap.headlineColor;
      if (text) {
        body.textContent = text;
      } else {
        body.textContent = "No content generated this week for this category.";
      }
    });
  }
}

function labelOf(k: RecapCategory): string {
  return k === "macro" ? "Macro" :
         k === "micro" ? "Micro" :
         k === "molecular" ? "Molecular" : "Overall";
}
