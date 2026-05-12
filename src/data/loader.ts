/**
 * Auto-discovering data loader.
 *
 * Drop a new JSON file into `src/data/chemicals/` or `src/data/plants/`
 * and it shows up in `CHEMICALS` / `PLANTS` after the next dev reload —
 * no registration, no imports to update.
 *
 * How it works:
 *   - Vite's `import.meta.glob(..., { eager: true, import: 'default' })`
 *     synchronously bundles every matching JSON at build time.
 *   - The basename (e.g. `meja` from `meja.json`) is used as the id and
 *     cross-checked against the JSON's own `id` field.
 *   - All entries are validated; a malformed file throws on import so
 *     authoring errors surface before the lab even opens.
 */

import type { Chemical } from "./chemical.schema";
import type { Plant } from "./plant.schema";
import { validateChemical, validatePlant } from "./validators";

// ──────────────────────────────────────────────────────────────────────────
// chemicals

const chemicalModules = import.meta.glob<Record<string, unknown>>(
  "./chemicals/*.json",
  { eager: true, import: "default" },
);

function loadChemicals(): Record<string, Chemical> {
  const out: Record<string, Chemical> = {};
  for (const [path, raw] of Object.entries(chemicalModules)) {
    const file = path.split("/").pop() ?? path;
    const basename = file.replace(/\.json$/, "");
    const c = validateChemical(raw, file);
    if (c.id !== basename) {
      throw new Error(
        `[data/loader] ${file}: id "${c.id}" must match filename "${basename}"`,
      );
    }
    if (out[c.id]) {
      throw new Error(`[data/loader] duplicate chemical id: ${c.id}`);
    }
    out[c.id] = c;
  }
  return out;
}

export const CHEMICALS: Record<string, Chemical> = loadChemicals();
export const CHEMICAL_IDS: string[] = Object.keys(CHEMICALS).sort();

// ──────────────────────────────────────────────────────────────────────────
// plants — validated against the chemicals that were actually loaded

const plantModules = import.meta.glob<Record<string, unknown>>(
  "./plants/*.json",
  { eager: true, import: "default" },
);

function loadPlants(): Record<string, Plant> {
  const knownChemIds = new Set(CHEMICAL_IDS);
  const out: Record<string, Plant> = {};
  for (const [path, raw] of Object.entries(plantModules)) {
    const file = path.split("/").pop() ?? path;
    const basename = file.replace(/\.json$/, "");
    const p = validatePlant(raw, file, knownChemIds);
    if (p.id !== basename) {
      throw new Error(
        `[data/loader] ${file}: id "${p.id}" must match filename "${basename}"`,
      );
    }
    if (out[p.id]) {
      throw new Error(`[data/loader] duplicate plant id: ${p.id}`);
    }
    out[p.id] = p;
  }
  return out;
}

export const PLANTS: Record<string, Plant> = loadPlants();
export const PLANT_IDS: string[] = Object.keys(PLANTS).sort();

// ──────────────────────────────────────────────────────────────────────────
// convenience helpers

export function getChemical(id: string): Chemical | undefined {
  return CHEMICALS[id];
}

export function getPlant(id: string): Plant | undefined {
  return PLANTS[id];
}

/** Group chemicals by their declared `category` (voc, heavy_metal, …). */
export function chemicalsByCategory(): Record<string, Chemical[]> {
  const out: Record<string, Chemical[]> = {};
  for (const c of Object.values(CHEMICALS)) {
    (out[c.category] ??= []).push(c);
  }
  return out;
}
