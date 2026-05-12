import type { ExperimentArm, MicroRegion, SimulationState } from "../types";
import { activeArm } from "../types";
import { computeMicrobiome } from "../sim/microbiome";
import { computeArmStress } from "../sim/treatments";

/**
 * 2D particle simulation of a microbial community on a leaf (phyllosphere)
 * or root (rhizosphere) surface, with an ultrastructure layer underneath.
 *
 * Always reflects whichever arm is currently active in the global state.
 */

type ParticleKind = "beneficial" | "opportunist" | "pathogen";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  kind: ParticleKind;
  age: number;
  life: number;
  size: number;
  rot: number;
}

const MAX_PARTICLES_FULLSCREEN = 380;
const MAX_PARTICLES_DASHBOARD = 180;

export class MicroCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private maxParticles = MAX_PARTICLES_DASHBOARD;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private spawnAccumulator = 0;
  private fullscreen: boolean;

  constructor(canvas: HTMLCanvasElement, opts: { fullscreen?: boolean } = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.fullscreen = !!opts.fullscreen;
    this.maxParticles = this.fullscreen ? MAX_PARTICLES_FULLSCREEN : MAX_PARTICLES_DASHBOARD;
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.floor(rect.width));
    this.h = Math.max(1, Math.floor(rect.height));
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  step(dt: number, state: SimulationState): void {
    const arm = activeArm(state);
    const micro = computeMicrobiome(arm, state.day);
    const stress = computeArmStress(arm, state.day);

    // ---- spawning ----
    const targetPop = Math.round(this.maxParticles * (0.25 + 0.75 * micro.diversity));
    const spawnRate = 0.05 * micro.beneficialMul + 0.05 + 0.05 * (this.particles.length < targetPop ? 1 : 0);

    this.spawnAccumulator += dt * spawnRate * 60;
    while (this.spawnAccumulator >= 1 && this.particles.length < this.maxParticles) {
      this.spawnAccumulator -= 1;
      this.particles.push(this.spawn(micro.pathogenFrac, micro.beneficialMul));
    }

    if (micro.cullPulse > 0) {
      const killProb = micro.cullPulse * 0.04;
      for (const p of this.particles) {
        if (Math.random() < killProb) p.age = p.life;
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vx += (Math.random() - 0.5) * 0.05;
      p.vy += (Math.random() - 0.5) * 0.05;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.x < -10) p.x = this.w + 10;
      if (p.x > this.w + 10) p.x = -10;
      if (p.y < -10) p.y = this.h + 10;
      if (p.y > this.h + 10) p.y = -10;
      p.age += dt;
      if (p.age >= p.life) this.particles.splice(i, 1);
    }

    this.draw(state, arm, stress);
  }

  private spawn(pathogenFrac: number, beneficialMul: number): Particle {
    const r = Math.random();
    let kind: ParticleKind;
    if (r < pathogenFrac) kind = "pathogen";
    else if (r < pathogenFrac + 0.25 * (1 - pathogenFrac)) kind = "opportunist";
    else kind = "beneficial";

    const size =
      kind === "pathogen" ? 3.0 + Math.random() * 1.4 :
      kind === "opportunist" ? 2.0 + Math.random() * 1.0 :
      1.6 + Math.random() * 1.2;

    return {
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      kind,
      age: 0,
      life: 6 + Math.random() * 8 / Math.max(0.3, beneficialMul),
      size,
      rot: Math.random() * Math.PI,
    };
  }

  private draw(state: SimulationState, arm: ExperimentArm, stress: ReturnType<typeof computeArmStress>): void {
    const { ctx, w, h } = this;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    if (state.microRegion === "phyllosphere") {
      bg.addColorStop(0, "#0a1a14");
      bg.addColorStop(1, "#06100c");
    } else {
      bg.addColorStop(0, "#1a1208");
      bg.addColorStop(1, "#0c0805");
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    this.drawUltrastructure(state, stress);
    this.drawParticles();
    this.drawHud(state, arm);
  }

  private drawUltrastructure(
    state: SimulationState,
    stress: ReturnType<typeof computeArmStress>,
  ): void {
    const { ctx, w, h } = this;
    const cell = 64;
    ctx.strokeStyle = "rgba(120, 180, 200, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = -cell; y < h + cell; y += cell * 0.866) {
      const offset = (Math.floor((y + cell) / (cell * 0.866)) % 2) * cell / 2;
      for (let x = -cell + offset; x < w + cell; x += cell) {
        ctx.moveTo(x + cell * 0.5, y);
        ctx.lineTo(x + cell, y + cell * 0.433);
        ctx.lineTo(x + cell, y + cell * 1.299);
        ctx.lineTo(x + cell * 0.5, y + cell * 1.732);
        ctx.lineTo(x, y + cell * 1.299);
        ctx.lineTo(x, y + cell * 0.433);
        ctx.closePath();
      }
    }
    ctx.stroke();

    if (state.microRegion === "phyllosphere") {
      const greenMix = 1 - stress.chlorosis * 0.9;
      const r = Math.round(60 + (200 - 60) * (1 - greenMix));
      const g = Math.round(180 - 60 * (1 - greenMix));
      const b = 60;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
      const count = 40;
      for (let i = 0; i < count; i++) {
        const x = (i * 137.51) % w;
        const y = (i * 223.17) % h;
        ctx.beginPath();
        ctx.ellipse(x, y, 4.5, 3.0, (i * 0.7) % Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(220, 235, 240, 0.55)";
      ctx.fillStyle = "rgba(255, 235, 200, 0.65)";
      ctx.lineWidth = 0.8;
      const tCount = 28;
      for (let i = 0; i < tCount; i++) {
        const x = (i * 401.7 + 13) % w;
        const y = (i * 263.3 + 37) % h;
        const angle = (i * 1.234) % (Math.PI * 2);
        const len = 6 + (i % 3) * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * len, y + Math.sin(angle) * len, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = "rgba(150,110,70,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const x = (i / 16) * w;
        ctx.moveTo(x, h);
        ctx.lineTo(x + Math.sin(i) * 6, h - 22 - Math.random() * 18);
      }
      ctx.stroke();
    }

    if (stress.defenseProteins > 0.15) {
      const n = Math.round(20 * stress.defenseProteins);
      for (let i = 0; i < n; i++) {
        const x = (i * 311.13) % w;
        const y = (i * 79.41) % h;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 9);
        grad.addColorStop(0, `rgba(170, 80, 220, ${0.55 * stress.defenseProteins})`);
        grad.addColorStop(1, "rgba(170, 80, 220, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawParticles(): void {
    const { ctx } = this;
    for (const p of this.particles) {
      const lifeT = 1 - p.age / p.life;
      const alpha = 0.2 + 0.7 * Math.min(1, lifeT * 2);
      if (p.kind === "pathogen") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + p.age * 0.3);
        ctx.fillStyle = `rgba(232, 60, 70, ${alpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 2.2, p.size * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 130, 140, ${alpha * 0.8})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === "opportunist") {
        ctx.fillStyle = `rgba(245, 175, 60, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.2);
        halo.addColorStop(0, `rgba(120, 220, 200, ${alpha})`);
        halo.addColorStop(1, "rgba(120, 220, 200, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(140, 240, 220, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawHud(state: SimulationState, arm: ExperimentArm): void {
    const { ctx } = this;
    ctx.fillStyle = "rgba(8,12,18,0.6)";
    ctx.fillRect(8, 8, 260, 18);
    ctx.fillStyle = "#80cfff";
    ctx.font = "10px JetBrains Mono, monospace";
    const tag = arm.activeVocs.length === 0
      ? "CONTROL"
      : `${arm.activeVocs.join("+").toUpperCase()} · ${arm.delivery.toUpperCase()}`;
    ctx.fillText(
      `${state.microRegion.toUpperCase()} · ${tag} · D${Math.floor(state.day)}`,
      14, 21,
    );
  }
}
