import type { ChemicalId, ExperimentArm, SimulationState } from "../types";
import { MAX_TABS } from "../types";

type Listener = (s: SimulationState, prev: SimulationState) => void;

/** Suggested palette for new arms — cycled in order so each tab gets a
 *  distinct, readable color in the UI / chart legend / pot ring. */
export const ARM_PALETTE = [
  "#4fd1c5", // teal
  "#f9a825", // amber
  "#7b3fa0", // violet
  "#0277bd", // blue
  "#e83c46", // crimson
  "#8bc34a", // lime
];

let armCounter = 0;
function nextArmId(): string {
  armCounter += 1;
  return `arm_${Date.now().toString(36)}_${armCounter}`;
}

/** Create a fresh arm with sensible defaults. */
export function makeArm(opts: Partial<ExperimentArm> = {}): ExperimentArm {
  const colorIdx = opts.color ? -1 : armCounter % ARM_PALETTE.length;
  return {
    id: opts.id ?? nextArmId(),
    label: opts.label ?? "Untitled bench",
    color: opts.color ?? ARM_PALETTE[colorIdx === -1 ? 0 : colorIdx],
    variety: opts.variety ?? "wizard",
    plantId: opts.plantId ?? "coleus",
    plantCount: opts.plantCount ?? 4,
    activeVocs: opts.activeVocs ?? [],
    delivery: opts.delivery ?? "both",
    vocConcentration: opts.vocConcentration ?? 4,
    waterDosage: opts.waterDosage ?? 80,
    temperature: opts.temperature ?? 24,
    humidity: opts.humidity ?? 60,
  };
}

// Two seed arms so the user immediately sees the multi-tab idea: a
// reference control bench and a poly-VOC treated bench.
const seedControl = makeArm({
  label: "Bench A · Control",
  color: ARM_PALETTE[0],
  activeVocs: [],
});
const seedTreated = makeArm({
  label: "Bench B · MeJA + MeSA",
  color: ARM_PALETTE[1],
  activeVocs: ["meja", "mesa"] as ChemicalId[],
  delivery: "both",
});

const initial: SimulationState = {
  screen: "guide",
  day: 0,
  playing: false,

  arms: [seedControl, seedTreated],
  activeArmId: seedControl.id,

  view: "macro",
  microRegion: "phyllosphere",

  randomErrors: false,
  runSeed: 1337,

  selectedPlantIndex: null,

  recapPrefs: { macro: true, micro: true, molecular: true, overall: true },
  lastRecap: null,
};

class Store {
  private state: SimulationState = { ...initial };
  private listeners = new Set<Listener>();

  get(): SimulationState {
    return this.state;
  }

  set(patch: Partial<SimulationState>): void {
    const prev = this.state;
    let next: SimulationState = { ...prev, ...patch };

    // Keep selectedPlantIndex valid: clear it when the active arm changed
    // or when the active arm's plantCount no longer covers the index.
    if (next.selectedPlantIndex !== null) {
      const armChanged = next.activeArmId !== prev.activeArmId;
      const arm = next.arms.find((a) => a.id === next.activeArmId);
      if (armChanged || !arm || next.selectedPlantIndex >= arm.plantCount) {
        next = { ...next, selectedPlantIndex: null };
      }
    }

    this.state = next;
    for (const fn of this.listeners) fn(this.state, prev);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------- arm CRUD ----------

  /** Mutate one arm in place (replaced with a new object) and notify. */
  updateArm(armId: string, patch: Partial<ExperimentArm>): void {
    const arms = this.state.arms.map((a) =>
      a.id === armId ? { ...a, ...patch } : a,
    );
    this.set({ arms });
  }

  /** Add a new arm; returns the created arm or null if cap hit. */
  addArm(template?: Partial<ExperimentArm>): ExperimentArm | null {
    if (this.state.arms.length >= MAX_TABS) return null;
    const idx = this.state.arms.length;
    const arm = makeArm({
      label: `Bench ${String.fromCharCode(65 + idx)}`,
      color: ARM_PALETTE[idx % ARM_PALETTE.length],
      ...template,
    });
    this.set({ arms: [...this.state.arms, arm], activeArmId: arm.id });
    return arm;
  }

  /** Remove an arm; refuses if it would leave 0 arms. Re-targets active arm. */
  removeArm(armId: string): void {
    if (this.state.arms.length <= 1) return;
    const remaining = this.state.arms.filter((a) => a.id !== armId);
    const activeArmId =
      this.state.activeArmId === armId ? remaining[0].id : this.state.activeArmId;
    this.set({ arms: remaining, activeArmId });
  }

  setActiveArm(armId: string): void {
    if (!this.state.arms.find((a) => a.id === armId)) return;
    this.set({ activeArmId: armId });
  }
}

export const store = new Store();
