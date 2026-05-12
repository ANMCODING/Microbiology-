import * as THREE from "three";

/**
 * Procedural Coleus leaf — ovate to cordate (heart-shaped) with a pointed
 * tip and crenate-serrate margins. Now built as a *curved* surface instead
 * of a flat ShapeGeometry so leaves read as three-dimensional under shading.
 *
 * Pipeline:
 *   1. Build the 2D outline (unchanged math from before).
 *   2. Triangulate it via `THREE.Shape` + `ShapeGeometry`.
 *   3. Post-process the vertex positions: apply a z-displacement that
 *      produces (a) a longitudinal droop toward the tip, and (b) a lateral
 *      cup (the leaf sides curve up forming a shallow channel along the
 *      midrib). `cupping` (per variety) controls how pronounced this is.
 *   4. Re-compute vertex normals so shading follows the new surface.
 *   5. Normalise UVs so (0,0) is the bottom-left of the leaf bbox and (1,1)
 *      the top-right — this lets the procedural vein texture align with
 *      the leaf regardless of length/width.
 *
 * Outline math (unchanged):
 *  - silhouette half-width: w/2 * sin(πt)^0.55  (basic ovate envelope)
 *  - cordate base notch, pointed tip, serrations as before.
 *
 * `t` runs 0 (tip) → 1 (base).
 */

export interface LeafGeoOptions {
  length?: number;
  width?: number;
  serrationCount?: number;
  serrationDepth?: number;
  segments?: number;
  cordate?: boolean;
  /** 0..1 — how strongly the leaf curls up along its sides (channel). */
  cupping?: number;
  /** 0..1 — how much the leaf tip droops down under its own weight. */
  droop?: number;
}

export function buildLeafGeometry(opts: LeafGeoOptions = {}): {
  geometry: THREE.ShapeGeometry;
  shape: THREE.Shape;
  midrib: THREE.BufferGeometry;
} {
  const length = opts.length ?? 1.0;
  const width  = opts.width  ?? 0.7;
  const serrationCount = Math.max(3, opts.serrationCount ?? 9);
  const serrationDepth = opts.serrationDepth ?? 0.06;
  const segments = Math.max(80, opts.segments ?? 110);
  const cordate  = opts.cordate ?? true;
  const cupping  = Math.max(0, Math.min(1, opts.cupping ?? 0.35));
  const droop    = Math.max(0, Math.min(1, opts.droop ?? 0.25));

  const shape = new THREE.Shape();
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push(edgePoint(t, length, width, serrationCount, serrationDepth, +1, cordate));
  }
  for (let i = 0; i <= segments; i++) {
    const t = 1 - i / segments;
    points.push(edgePoint(t, length, width, serrationCount, serrationDepth, -1, cordate));
  }
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].y);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape, 26);
  geometry.computeBoundingBox();

  // ---- curve the surface: z = f(u, v) ----
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const bb = geometry.boundingBox!;
  const halfW = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x));
  const leafLen = bb.max.y - bb.min.y;

  // Rebuild UVs while we're here — (u, v) in [0,1]
  const uvs = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);

    // u: -1..+1 across width  →  used for cup
    const uNorm = halfW > 0 ? x / halfW : 0;
    // v: 0 (base) .. 1 (tip)  →  used for droop
    const vNorm = leafLen > 0 ? (y - bb.min.y) / leafLen : 0;

    // Lateral cup: sides rise, center dips. Profile is cos so the midline
    // stays at 0 and edges rise by `cupping * halfW * 0.6`.
    const sideRise = cupping * halfW * 0.55 * (1 - Math.cos(uNorm * Math.PI));

    // Longitudinal droop: tip drops further than base (quadratic in v).
    // Negative z so the tip bends "down" when the leaf is later rotated
    // into world space (ColeusPlant rotates the leaf so -z becomes -y).
    const tipDrop = -droop * leafLen * 0.25 * Math.pow(vNorm, 2);

    // A subtle S-wave along length so the leaf isn't perfectly symmetric
    const sWave = Math.sin(vNorm * Math.PI) * cupping * halfW * 0.05;

    pos.setZ(i, sideRise + tipDrop + sWave);

    uvs[i * 2]     = (x - bb.min.x) / (bb.max.x - bb.min.x);
    uvs[i * 2 + 1] = vNorm;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  // ---- midrib ribbon (central vein) — small 3D strip raised slightly ----
  const ribLen = length * 0.92;
  const ribW = width * 0.012;
  const midrib = new THREE.PlaneGeometry(ribW, ribLen, 1, 8);
  midrib.translate(0, ribLen / 2 + length * 0.04, 0.002);

  return { geometry, shape, midrib };
}

function edgePoint(
  t: number,
  length: number,
  width: number,
  serrationCount: number,
  serrationDepth: number,
  side: 1 | -1,
  cordate: boolean,
): THREE.Vector2 {
  const y = length * (1 - t);

  let baseHalf =
    (width / 2) *
    Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.5) *
    (0.85 + 0.3 * t);

  if (t < 0.18) {
    const k = t / 0.18;
    baseHalf *= Math.pow(k, 0.7);
  }

  if (cordate && t > 0.85) {
    const k = (t - 0.85) / 0.15;
    const notch = Math.sin(k * Math.PI);
    baseHalf *= 1 - 0.55 * notch;
  }

  const envelope = Math.sin(Math.PI * t);
  const teeth = Math.cos(serrationCount * 2 * Math.PI * t) * 0.5 + 0.5;
  const x = side * (baseHalf + serrationDepth * envelope * teeth * width);

  return new THREE.Vector2(x, y);
}
