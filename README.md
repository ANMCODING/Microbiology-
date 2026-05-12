# Bio-Sim Matrix · 3D Coleus Multi-Scale VOC Lab

An interactive single-page lab simulator for *Coleus blumei* response to mono- and
poly-Volatile Organic Compound exposure across **macro** (3D morphology),
**micro** (microbiome + ultrastructure), and **molecular** (LC-MS readout +
heatmap) scales over a 6-week timeline.

> Visualization simulator with documented narrative coefficients — not an
> empirical model. Tune the constants in `src/sim/*.ts` to fit your data.

## Stack

- **Vite + TypeScript**
- **Three.js** + `OrbitControls` for the macro greenhouse
- **HTML5 Canvas 2D** for the microbiome particle system
- **Chart.js** for the LC-MS dashboard

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle
```

## Layout

```
src/
  main.ts                   # entry: wires store → views → loop
  state/store.ts            # central SimulationState + listeners
  types.ts                  # shared types
  constants/theme.ts        # group/voc/variety colour and label tables
  sim/
    growth.ts               # logistic growth curves (continuous in week)
    treatments.ts           # per-group stress vector (delivery shaping, env mods)
    vocCombine.ts           # poly-VOC combination rules (synergy + caps)
    microbiome.ts           # diversity / pathogenFrac / resistome model
    molecular.ts            # LC-MS peak templates, spectrum builder, metabolite intensity
    report.ts               # automated weekly text log
  geometry/
    leafShape.ts            # procedural serrated leaf via THREE.Shape
    coleusPlant.ts          # stem + decussate leaf pairs, treatment visuals, molecular heatmap
  views/
    greenhouseScene.ts      # 4×4 plant matrix, lights, OrbitControls
    microCanvas.ts          # particle simulation + ultrastructure overlay
    massSpecChart.ts        # Chart.js LC-MS bar chart
  ui/
    controls.ts             # left panel + bottom timeline
    log.ts                  # right-panel automated log
  styles/lab.css            # dark HUD theme
```

## Treatment groups

The 16-plant grid is split into 2×2 quadrants by group:

| Group | Color | VOCs | Delivery shaping |
|------|------|------|------------------|
| Control | green `#2e7d32` | none | baseline |
| Liquid Mono-VOC | blue `#0277bd` | `monoVoc` slider | + necrosis & height suppression, − curl |
| Gaseous Mono-VOC | amber `#f9a825` | `monoVoc` slider | + curl, stomatal closure & chlorosis |
| Poly-VOC | purple `#6a1b9a` | 2–3 chips | synergistic pigmentation, capped height suppression |

## Poly-VOC combination math

`combineVocs()` in [`src/sim/vocCombine.ts`](src/sim/vocCombine.ts):

- per axis = sum of base VOC contributions (capped, pigmentation cap = 2)
- synergy term `α · min(v_i) · (n−1)` rewards combinations whose VOCs all push
  the same axis (e.g. MeJA + MeSA both raising defenseProteins)
- antagonism: heightSuppress synergy is halved so suppressors don't simply
  stack into a dead plant

## Molecular view

Toggle `Molecular` in the topbar — the 3D plants switch to wireframe stems
plus an emissive heatmap material on leaves whose hue/intensity tracks the
group's combined secondary metabolite concentration (pigmentation + defense
proteins + chlorosis).

## Tuning

All scientific narrative coefficients are at the top of:

- [`src/sim/vocCombine.ts`](src/sim/vocCombine.ts) — `VOC_BASE_VECTOR`
- [`src/sim/treatments.ts`](src/sim/treatments.ts) — delivery / env modifiers
- [`src/sim/growth.ts`](src/sim/growth.ts) — `H_MAX`, `K_H`, `L_MAX`, …
- [`src/sim/microbiome.ts`](src/sim/microbiome.ts) — diversity / resistome curves
- [`src/sim/molecular.ts`](src/sim/molecular.ts) — `PEAKS` per VOC

Click the right-panel microbiome canvas to cycle which group it inspects.
