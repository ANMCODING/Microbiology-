import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
  Filler,
} from "chart.js";
import type { ExperimentArm, SimulationState } from "../types";
import { activeArm } from "../types";
import { computeSpectrum, computePlantSpectrum, type MsPoint } from "../sim/molecular";
import { computeArmPlantStats } from "../sim/analytics";
import { computePlantNoise } from "../sim/anomalies";
import { showInfo } from "../ui/infoPanel";
import { PEAK_INFO } from "../data/encyclopedia";

Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Title, Filler,
);

/**
 * Mass spec chart for the active arm (or, if `overlayAll`, every arm).
 *
 * Click a bar to open the peak's encyclopedia info card with the arm name,
 * exact m/z and the bar's intensity in the footer.
 */
export class MassSpecChart {
  private chart: Chart;
  private overlayAll = false;
  private armOrderSnapshot: ExperimentArm[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.chart = new Chart(canvas, {
      type: "bar",
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 220, easing: "easeOutQuad" },
        onClick: (_evt, elements, chart) => {
          if (!elements.length) return;
          const el = elements[0];
          const mzLabel = chart.data.labels?.[el.index];
          const mz = mzLabel != null ? parseInt(String(mzLabel), 10) : NaN;
          const ds = chart.data.datasets[el.datasetIndex];
          const raw = ds.data[el.index] as { y?: number } | undefined;
          const intensity = raw?.y ?? 0;
          const armName = ds.label ?? "—";
          const peakInfo = PEAK_INFO[mz];
          if (peakInfo) {
            showInfo(peakInfo, {
              footer: `Selected: ${armName} · m/z ${mz} · intensity ${intensity.toFixed(1)}`,
            });
          }
        },
        onHover: (evt, elements) => {
          const target = (evt.native?.target as HTMLElement | null);
          if (target) target.style.cursor = elements.length ? "pointer" : "default";
        },
        scales: {
          x: {
            title: { display: true, text: "m/z", color: "#8a9bb3", font: { size: 10 } },
            ticks: { color: "#8a9bb3", font: { size: 9 }, maxRotation: 0, autoSkip: true },
            grid: { color: "rgba(80,100,130,0.08)" },
          },
          y: {
            title: { display: true, text: "Intensity", color: "#8a9bb3", font: { size: 10 } },
            ticks: { color: "#8a9bb3", font: { size: 9 } },
            grid: { color: "rgba(80,100,130,0.1)" },
            beginAtZero: true,
          },
        },
        plugins: {
          legend: {
            position: "top",
            labels: { color: "#d8e2ee", font: { size: 10 }, boxWidth: 10, boxHeight: 10 },
          },
          tooltip: {
            backgroundColor: "rgba(10,14,20,0.95)",
            borderColor: "#1f2a3a", borderWidth: 1,
            titleColor: "#80cfff",
            bodyColor: "#d8e2ee",
            callbacks: {
              afterBody: (ctx) => {
                const item = ctx[0];
                const label = (item.raw as any)?.label as string | undefined;
                return label ? [label] : [];
              },
            },
          },
        },
      },
    });
  }

  setOverlayAll(on: boolean): void {
    this.overlayAll = on;
  }

  update(s: SimulationState): void {
    const arm = activeArm(s);
    const focusIdx = s.selectedPlantIndex;

    // ---- per-plant focus mode (single plant of active arm) ----
    if (focusIdx !== null && focusIdx < arm.plantCount) {
      const stats = computeArmPlantStats(s, arm);
      const focused = stats[focusIdx];
      const armMean = computeSpectrum(arm, s.day);
      const noise = computePlantNoise(s, arm, focusIdx);
      const plantPeaks = focused
        ? computePlantSpectrum(arm, s.day, focused.stress, noise.msNoise)
        : [];

      const mzSet = new Set<number>();
      for (const p of armMean)    mzSet.add(p.mz);
      for (const p of plantPeaks) mzSet.add(p.mz);
      const mzs = Array.from(mzSet).sort((x, y) => x - y);

      const meanMap  = mapByMz(armMean);
      const plantMap = mapByMz(plantPeaks);

      const datasets = [
        {
          label: `Plant P${focusIdx} · ${arm.label}`,
          data: mzs.map((mz) => {
            const p = plantMap.get(mz);
            return p ? { x: mz, y: round(p.intensity, 1), label: p.label } : { x: mz, y: 0 };
          }),
          backgroundColor: hexAlpha(arm.color, 0.85),
          borderColor: arm.color,
          borderWidth: 1,
          borderRadius: 2,
          categoryPercentage: 0.95,
          barPercentage: 0.9,
        },
        {
          label: `Bench mean (n=${arm.plantCount})`,
          data: mzs.map((mz) => {
            const p = meanMap.get(mz);
            return p ? { x: mz, y: round(p.intensity, 1), label: `mean: ${p.label}` } : { x: mz, y: 0 };
          }),
          backgroundColor: "rgba(216,226,238,0.18)",
          borderColor: "rgba(216,226,238,0.55)",
          borderWidth: 1,
          borderRadius: 2,
          categoryPercentage: 0.95,
          barPercentage: 0.9,
        },
      ];

      this.armOrderSnapshot = [arm];
      this.chart.data.labels   = mzs.map(String);
      this.chart.data.datasets = datasets as any;
      this.chart.update("none");
      return;
    }

    // ---- bench-mean mode (one or more arms) ----
    const arms = this.overlayAll ? s.arms : [arm];
    this.armOrderSnapshot = arms;

    const mzSet = new Set<number>();
    const armPeaks: Record<string, MsPoint[]> = {};
    for (const a of arms) {
      const peaks = computeSpectrum(a, s.day);
      armPeaks[a.id] = peaks;
      for (const p of peaks) mzSet.add(p.mz);
    }
    const mzs = Array.from(mzSet).sort((x, y) => x - y);

    const datasets = arms.map((a) => {
      const map = new Map<number, MsPoint>();
      for (const p of armPeaks[a.id]) map.set(p.mz, p);
      return {
        label: a.label,
        data: mzs.map((mz) => {
          const p = map.get(mz);
          return p ? { x: mz, y: round(p.intensity, 1), label: p.label } : { x: mz, y: 0 };
        }),
        backgroundColor: hexAlpha(a.color, 0.65),
        borderColor: a.color,
        borderWidth: 1,
        borderRadius: 2,
        categoryPercentage: 0.95,
        barPercentage: 0.9,
      };
    });

    this.chart.data.labels = mzs.map(String);
    this.chart.data.datasets = datasets as any;
    this.chart.update("none");
  }

  resize(): void {
    this.chart.resize();
  }
}

function mapByMz(peaks: MsPoint[]): Map<number, MsPoint> {
  const m = new Map<number, MsPoint>();
  for (const p of peaks) m.set(p.mz, p);
  return m;
}

function round(n: number, d: number): number {
  const k = Math.pow(10, d);
  return Math.round(n * k) / k;
}

function hexAlpha(hex: string, a: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
