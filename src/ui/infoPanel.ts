import type { InfoEntry } from "../data/encyclopedia";

/**
 * Reusable info modal.
 *
 * Mounts a single fixed-position card (with backdrop) on first open and
 * reuses it for every subsequent call. Click backdrop or press Escape to
 * dismiss.
 *
 * Layout:
 *   - title + subtitle
 *   - large color swatch + the hex digit string side-by-side
 *   - exactly three sentences as bullet points
 */

let mountedRoot: HTMLElement | null = null;
let mountedCard: HTMLElement | null = null;

function mount(): { root: HTMLElement; card: HTMLElement } {
  if (mountedRoot && mountedCard) return { root: mountedRoot, card: mountedCard };

  const root = document.createElement("div");
  root.className = "info-backdrop hidden";
  root.innerHTML = `
    <div class="info-card" role="dialog" aria-modal="true">
      <button class="info-close" aria-label="Close">×</button>
      <div class="info-head">
        <div class="info-title" id="info-title">—</div>
        <div class="info-sub"   id="info-sub"></div>
      </div>
      <div class="info-color">
        <div class="info-swatch" id="info-swatch"></div>
        <div class="info-hex">
          <div class="info-hex-label">HEX</div>
          <div class="info-hex-val"   id="info-hex">#000000</div>
        </div>
      </div>
      <ul class="info-blurb" id="info-blurb"></ul>
    </div>
  `;
  document.body.appendChild(root);

  const card = root.querySelector<HTMLElement>(".info-card")!;
  card.addEventListener("click", (e) => e.stopPropagation());
  root.addEventListener("click", () => hide());
  root.querySelector(".info-close")!.addEventListener("click", () => hide());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !root.classList.contains("hidden")) hide();
  });

  mountedRoot = root;
  mountedCard = card;
  return { root, card };
}

function hide(): void {
  if (!mountedRoot) return;
  mountedRoot.classList.add("hidden");
}

/** Open the info modal with a populated entry. */
export function showInfo(entry: InfoEntry, extra?: { footer?: string }): void {
  const { root } = mount();
  root.querySelector("#info-title")!.textContent = entry.title;
  const subEl = root.querySelector<HTMLElement>("#info-sub")!;
  subEl.textContent = entry.subtitle ?? "";
  subEl.style.display = entry.subtitle ? "" : "none";

  const swatch = root.querySelector<HTMLElement>("#info-swatch")!;
  swatch.style.background = entry.hex;
  root.querySelector("#info-hex")!.textContent = entry.hex.toUpperCase();

  const blurb = root.querySelector<HTMLElement>("#info-blurb")!;
  blurb.innerHTML = entry.blurb
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");

  if (extra?.footer) {
    let footer = root.querySelector<HTMLElement>(".info-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "info-footer";
      root.querySelector(".info-card")!.appendChild(footer);
    }
    footer.textContent = extra.footer;
    footer.style.display = "";
  } else {
    const f = root.querySelector<HTMLElement>(".info-footer");
    if (f) f.style.display = "none";
  }

  root.classList.remove("hidden");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
