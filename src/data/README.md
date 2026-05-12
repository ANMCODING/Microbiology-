# `src/data/` — chemical & plant data infrastructure

This folder is the **single source of truth** for the simulator's chemical
library (40 entries) and plant library (10 entries). Drop a JSON file in
the right subfolder and it shows up in the lab — no code edits needed.

## Layout

```
src/data/
  chemicals/         one .json per chemical (filename = id)
    meja.json
    ethylene.json
    cadmium.json
    …                ← 37 more to add
  plants/            one .json per plant (filename = id)
    coleus.json
    tomato.json
    …
  chemical.schema.ts type definitions for chemicals
  plant.schema.ts    type definitions for plants
  validators.ts      runtime validators (clear errors on bad data)
  loader.ts          auto-discovers all .json files via import.meta.glob
  index.ts           re-exports everything
  encyclopedia.ts    legacy reference content (kept for now)
  README.md          you are here
```

## Adding a new chemical

1. Save the AI-generated JSON as `src/data/chemicals/<id>.json`
   (filename **must** match the JSON's `id` field, e.g. `lead.json` ↔ `"id": "lead"`).
2. Reload the dev server. The chemical is now in `CHEMICALS["lead"]`.
3. If it's malformed, the validator throws on import with a precise
   `path: reason` so the typo is obvious.

## Adding a new plant

Same pattern: drop in `src/data/plants/<id>.json`. The plant validator
also enforces that the plant's `chemicalSensitivity` map contains a key
for **every** chemical id currently loaded — so as you add chemicals,
you'll get errors pointing at plants whose matrix is missing the new id.

## Importing in code

```ts
import { CHEMICALS, PLANTS, getChemical, getPlant, chemicalsByCategory }
  from "../data";

const meja = getChemical("meja");        // typed as Chemical | undefined
const tomato = getPlant("tomato");       // typed as Plant | undefined
const groups = chemicalsByCategory();    // { voc: [...], heavy_metal: [...] }
```

## What this folder does NOT do

It does **not** wire the new chemicals/plants into the existing
simulator yet. The current `src/sim/vocCombine.ts` and
`src/sim/molecular.ts` still hard-code the original 4 VOCs. Switching
them to read from `CHEMICALS` is a separate integration step (Phase 3
in the roadmap).

## Current status

| Asset | Loaded | Pending |
|---|---|---|
| Chemicals | 3 / 40 (`meja`, `ethylene`, `cadmium`) | 37 |
| Plants | 10 / 10 ✅ | 0 |

The 37 remaining chemicals will be authored by an external research AI
in batches of 10. As each batch arrives, save each chemical as a separate
JSON file in `src/data/chemicals/`.
