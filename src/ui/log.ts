import type { SimulationState } from "../types";
import { buildDailyReport } from "../sim/report";
import { weekOf } from "../types";

/**
 * Scrolling lab log of per-day, per-arm entries.
 *
 * Entries are **manual** now: scrubbing / playing no longer auto-posts.
 * Use `addEntry(state)` to capture a fresh per-arm report at the current
 * simulation day and prepend it to the feed. The tiny day/week counter in
 * the card head is still live-updated every frame via `update()`.
 */
export class LogPanel {
  private feed: HTMLElement;
  private weekEl: HTMLElement;

  constructor(feedEl: HTMLElement, weekEl: HTMLElement) {
    this.feed = feedEl;
    this.weekEl = weekEl;
  }

  /** Live day/week counter — cheap, safe to call every frame. */
  update(state: SimulationState): void {
    this.weekEl.textContent =
      `Day ${Math.floor(state.day)} · Wk ${weekOf(state.day).toFixed(1)}`;
  }

  /** Append one per-arm block for the current day to the feed. */
  addEntry(state: SimulationState): void {
    const entries = buildDailyReport(state);
    const stamp = `Day ${Math.floor(state.day)} · Wk ${weekOf(state.day).toFixed(1)}`;
    const header = `
      <div class="log-stamp">${escapeHtml(stamp)}</div>
    `;
    const html = header + entries.map((e) => `
      <div class="log-entry">
        <span class="week-tag">${e.weekTag}</span>
        <span class="group-dot" style="background:${e.armColor}"></span>
        ${escapeHtml(e.text)}
      </div>
    `).join("");
    this.feed.innerHTML = html + this.feed.innerHTML;

    const all = this.feed.querySelectorAll(".log-entry, .log-stamp");
    if (all.length > 200) {
      for (let i = 200; i < all.length; i++) all[i].remove();
    }
    // auto-scroll to top so the user sees the new block they just captured
    this.feed.scrollTop = 0;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
