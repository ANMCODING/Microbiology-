import * as THREE from "three";

/**
 * Procedural leaf-venation textures built on a 2D canvas at startup.
 *
 * Two textures are produced at once for each call:
 *   - a subtle *bump* map (grayscale) used as the leaf `normalMap` proxy;
 *   - an *alpha / emissive* mask the material can blend slightly to darken
 *     vein channels on top of the mid-zone color.
 *
 * Everything stays in memory (no external PNGs), coordinates are in the
 * leaf's local UV space (0..1 along leaf length & width) so the textures
 * align naturally with `buildLeafGeometry` UVs.
 *
 * Biology notes (so the drawing is plausible):
 *   - Coleus has a pinnate-reticulate vein system: one thick midrib, ~5-7
 *     primary lateral veins per side arcing toward the margin, and a
 *     tertiary cross-vein network between them.
 *   - Veins are slightly raised above the leaf surface → a bump map.
 *   - They're also slightly darker than the surrounding mesophyll → an
 *     albedo-modulating texture (used as `normalMap`-only here to keep the
 *     chromatic zones intact for scientific readability).
 */
export function buildVeinTexture(opts: {
  lateralCount?: number;
  reticulate?: boolean;
  width?: number;
  height?: number;
} = {}): { normalMap: THREE.CanvasTexture } {
  const W = opts.width  ?? 512;
  const H = opts.height ?? 512;
  const laterals = opts.lateralCount ?? 7;
  const reticulate = opts.reticulate ?? true;

  const cvs = document.createElement("canvas");
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext("2d")!;

  // White background = surface level. Veins are drawn darker (valleys),
  // producing a grayscale height field that we'll feed to `bumpMap`.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // In THREE.js ShapeGeometry UVs from a leaf built along y-axis
  // typically map u → x (width), v → y (length from base to tip).
  // The leaf tip is at v=1 in our shape (y = length). Midrib is at u=0.5.
  const midX = W * 0.5;
  const tipY = H * 0.02;     // v≈1 (tip)
  const baseY = H * 0.98;    // v≈0 (petiole / base)

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Midrib — thick, slightly wavy, dark
  drawCurve(ctx, [
    [midX, baseY],
    [midX + 5, (baseY + tipY) * 0.7],
    [midX - 3, (baseY + tipY) * 0.4],
    [midX, tipY],
  ], { color: "rgba(50,50,50,0.75)", width: 6 });

  // Primary laterals: alternating left/right, arcing outward toward margin
  for (let i = 0; i < laterals; i++) {
    const t = (i + 0.5) / laterals; // 0..1 along the leaf
    const y = baseY + (tipY - baseY) * t;
    const lengthFrac = 0.33 + 0.25 * Math.sin(Math.PI * t); // wider mid-leaf
    // left lateral
    drawVein(ctx, midX, y, -1, lengthFrac, W, H);
    // right lateral
    drawVein(ctx, midX, y, +1, lengthFrac, W, H);
  }

  // Tertiary reticulation — fine cross-hatching between laterals
  if (reticulate) {
    ctx.strokeStyle = "rgba(70,70,70,0.25)";
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 140; i++) {
      const x = midX + (Math.random() - 0.5) * W * 0.85;
      const y = baseY - (baseY - tipY) * Math.random();
      const l = 8 + Math.random() * 18;
      const a = Math.random() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  }

  // Subtle overall noise so the surface isn't perfectly flat under light
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    d[i]     = clamp255(d[i]     + n);
    d[i + 1] = clamp255(d[i + 1] + n);
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;

  return { normalMap: tex };
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  opts: { color: string; width: number },
): void {
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.width;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.quadraticCurveTo(x1, y1, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
}

function drawVein(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  dir: 1 | -1,
  lengthFrac: number,
  W: number, _H: number,
): void {
  // lateral vein arcs outward and slightly up toward the margin
  const len = W * 0.5 * lengthFrac;
  const cpx = ox + dir * len * 0.55;
  const cpy = oy - len * 0.25;
  const ex  = ox + dir * len;
  const ey  = oy - len * 0.55;

  ctx.strokeStyle = "rgba(60,60,60,0.45)";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.quadraticCurveTo(cpx, cpy, ex, ey);
  ctx.stroke();

  ctx.strokeStyle = "rgba(60,60,60,0.30)";
  ctx.lineWidth = 1.2;
  for (let i = 1; i <= 3; i++) {
    const t = 0.3 + i * 0.18;
    const bx = ox + (ex - ox) * t;
    const by = oy + (ey - oy) * t;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + dir * len * 0.08, by - len * 0.02 - i * 2);
    ctx.stroke();
  }
}

function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}
