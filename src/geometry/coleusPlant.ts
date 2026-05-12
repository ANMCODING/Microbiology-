import * as THREE from "three";
import type { PlantAnomaly, StressVector, VarietyConfig } from "../types";
import { buildLeafGeometry } from "./leafShape";
import { buildVeinTexture } from "./veinTexture";
import type { PlantMorph } from "../sim/growth";

/**
 * One Coleus blumei plant.
 *
 * Botanically faithful elements:
 *   - SQUARE stem (Lamiaceae) — TubeGeometry along a slightly-S-curved
 *     spline, tapered thinner toward the apex.
 *   - Decussate phyllotaxy: opposite leaf pairs, each pair rotated 90°
 *     from the one below.
 *   - Cordate / ovate leaves with crenate-serrate margins, now **curved**
 *     in 3D (lateral cup + tip droop) and carrying a procedural vein
 *     normal-map for depth under light.
 *   - 3-zone color blending per leaf (outer / mid / inner).
 *   - Wind sway: each plant oscillates at a unique phase; each leaf
 *     adds a small secondary flutter.
 *   - Per-plant pose variation (seeded): yaw, lean, stem-curve amount so
 *     a grid of "identical" plants never looks cloned.
 *   - Better pot with a visible rim + inner shadow, and a granular
 *     procedural soil material.
 */

const MAX_PAIRS = 11;

const veinShared = new Map<string, THREE.CanvasTexture>();
function veinTextureFor(variety: VarietyConfig): THREE.CanvasTexture {
  const key = `${variety.label}:${variety.serrations}`;
  const existing = veinShared.get(key);
  if (existing) return existing;
  const { normalMap } = buildVeinTexture({
    lateralCount: Math.round(5 + (variety.serrations - 7) * 0.4),
  });
  veinShared.set(key, normalMap);
  return normalMap;
}

export interface PlantIdentity {
  plantIndex: number;
  armId: string;
}

export class ColeusPlant {
  public root = new THREE.Group();

  private variety: VarietyConfig;
  private identity: PlantIdentity;

  // seeded per-plant pose numbers (0..1)
  private poseYaw: number;      // -1..1 whole-plant yaw (radians scale)
  private poseLean: number;     // -1..1 tilt
  private stemCurve: number;    // 0..1 how much the stem curves
  private swayPhase: number;    // 0..2π

  private stem: THREE.Mesh;
  private stemBase: THREE.Mesh;
  private stemMat: THREE.MeshStandardMaterial;
  private stemBaseMat: THREE.MeshStandardMaterial;

  private leafSlots: LeafSlot[] = [];

  private leafGeoOuter: THREE.ShapeGeometry;
  private leafGeoMid:   THREE.ShapeGeometry;
  private leafGeoInner: THREE.ShapeGeometry;
  private midribGeo:    THREE.BufferGeometry;
  private veinMap:      THREE.CanvasTexture;

  private wireMaterial: THREE.MeshBasicMaterial;
  private heatMaterials: THREE.MeshStandardMaterial[] = [];

  private molecularMode = false;
  private stemColorBase = new THREE.Color();
  private swayTime = 0;

  constructor(variety: VarietyConfig, identity: PlantIdentity) {
    this.variety = variety;
    this.identity = identity;

    // Seed per-plant pose (deterministic from armId + plantIndex)
    const seed = seedOf(identity.armId, identity.plantIndex);
    const r = mulberry(seed);
    this.poseYaw   = (r() * 2 - 1) * 0.30;        // ±~17°
    this.poseLean  = (r() * 2 - 1) * 0.10;        // ±~6°
    this.stemCurve = 0.3 + r() * 0.7;             // 0.3..1.0
    this.swayPhase = r() * Math.PI * 2;

    // leaf geometries — 3 stacked layers, variety cupping/droop applied
    const leafSize = variety.leafSize ?? 1.0;
    const a = buildLeafGeometry({
      length: 1.0 * leafSize, width: 0.78 * leafSize,
      serrationCount: variety.serrations, serrationDepth: 0.08, segments: 110,
      cordate: true, cupping: variety.cupping, droop: variety.droop,
    });
    const b = buildLeafGeometry({
      length: 0.7 * leafSize, width: 0.55 * leafSize,
      serrationCount: variety.serrations, serrationDepth: 0.05, segments: 90,
      cordate: true, cupping: variety.cupping * 0.9, droop: variety.droop,
    });
    const c = buildLeafGeometry({
      length: 0.4 * leafSize, width: 0.32 * leafSize,
      serrationCount: variety.serrations, serrationDepth: 0.04, segments: 70,
      cordate: true, cupping: variety.cupping * 0.8, droop: variety.droop * 0.8,
    });
    this.leafGeoOuter = a.geometry;
    this.leafGeoMid   = b.geometry;
    this.leafGeoInner = c.geometry;
    this.midribGeo    = a.midrib;

    this.veinMap = veinTextureFor(variety);

    this.stemColorBase.setHex(variety.stemColor);

    // ---- stem: TubeGeometry along a subtly S-curved, tapered spline ----
    const stemCurveObj = this.buildStemCurve();
    this.stemMat = new THREE.MeshStandardMaterial({
      color: this.stemColorBase.clone(), roughness: 0.72, metalness: 0.05,
    });
    const stemGeo = new THREE.TubeGeometry(stemCurveObj, 22, 0.03, 4, false);
    stemGeo.rotateY(Math.PI / 4);  // square cross-section alignment
    taperTube(stemGeo, 1.0, 0.55);  // radius 55% at the top
    this.stem = new THREE.Mesh(stemGeo, this.stemMat);
    this.stem.castShadow = true;
    this.root.add(this.stem);

    this.stemBaseMat = new THREE.MeshStandardMaterial({
      color: this.stemColorBase.clone().multiplyScalar(0.6), roughness: 0.88,
    });
    const baseGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.16, 4);
    baseGeo.rotateY(Math.PI / 4);
    this.stemBase = new THREE.Mesh(baseGeo, this.stemBaseMat);
    this.stemBase.position.y = 0.08;
    this.root.add(this.stemBase);

    // ---- pot + soil ----
    this.buildPot();

    this.wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x4fd1c5, wireframe: true, transparent: true, opacity: 0.7,
    });

    for (let i = 0; i < MAX_PAIRS * 2; i++) {
      const slot = this.createLeafSlot();
      slot.group.visible = false;
      this.leafSlots.push(slot);
      this.root.add(slot.group);
    }

    // apply seeded yaw/lean to the whole plant once — this is stable
    this.root.rotation.y = this.poseYaw;
    this.root.rotation.z = this.poseLean;
  }

  private buildStemCurve(): THREE.CatmullRomCurve3 {
    // S-curve: five control points from base to tip, slight sway in X
    const amp = 0.06 * this.stemCurve;
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3( 0,      0,   0),
      new THREE.Vector3( amp,    0.25, 0),
      new THREE.Vector3(-amp * 0.7, 0.5, 0),
      new THREE.Vector3( amp * 0.5, 0.75, 0),
      new THREE.Vector3( 0,      1.0, 0),
    ]);
  }

  private buildPot(): void {
    // Terracotta pot with a visible rim and a darker inner band.
    const potBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.50, 0.38, 0.32, 28, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x8a4c30, roughness: 0.92, metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    );
    potBody.position.y = -0.10;
    potBody.receiveShadow = true;
    this.root.add(potBody);

    const potRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.50, 0.028, 10, 36),
      new THREE.MeshStandardMaterial({
        color: 0x9a5a3a, roughness: 0.85, metalness: 0.04,
      }),
    );
    potRim.rotation.x = Math.PI / 2;
    potRim.position.y = 0.06;
    this.root.add(potRim);

    // Inner shadow disk to suggest pot depth
    const innerShadow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.002, 28, 1),
      new THREE.MeshBasicMaterial({ color: 0x1a0f08 }),
    );
    innerShadow.position.y = 0.03;
    this.root.add(innerShadow);

    // Procedural soil — granular color variation via vertex colors
    const soilGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.04, 28, 1);
    soilGeo.translate(0, 0.045, 0);
    const colors = new Float32Array(soilGeo.attributes.position.count * 3);
    for (let i = 0; i < soilGeo.attributes.position.count; i++) {
      const v = 0.85 + Math.random() * 0.3;       // 0.85..1.15
      const redTint = 0.55 + Math.random() * 0.2;
      colors[i * 3]     = redTint * v * 0.35;
      colors[i * 3 + 1] = 0.22   * v * 0.35;
      colors[i * 3 + 2] = 0.12   * v * 0.35;
    }
    soilGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const soilMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1.0, metalness: 0,
    });
    const soil = new THREE.Mesh(soilGeo, soilMat);
    soil.receiveShadow = true;
    this.root.add(soil);
  }

  private createLeafSlot(): LeafSlot {
    const group = new THREE.Group();

    const outerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.5 - this.variety.gloss * 0.2,
      side: THREE.DoubleSide,
      emissive: 0x000000, emissiveIntensity: 0,
      bumpMap: this.veinMap,
      bumpScale: 0.08,  // subtle vein relief — keeps color zones readable
    });

    const midMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide,
      transparent: true, opacity: 1,
    });
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide,
      transparent: true, opacity: 1,
    });
    const veinMat = new THREE.MeshStandardMaterial({
      color: 0x1a1206, roughness: 0.85, side: THREE.DoubleSide,
    });

    const outer = new THREE.Mesh(this.leafGeoOuter, outerMat);
    outer.castShadow = true;
    const mid = new THREE.Mesh(this.leafGeoMid, midMat);
    mid.position.z = 0.001;
    const inner = new THREE.Mesh(this.leafGeoInner, innerMat);
    inner.position.z = 0.002;
    const vein = new THREE.Mesh(this.midribGeo, veinMat);
    vein.position.z = 0.003;

    group.add(outer, mid, inner, vein);

    return { group, outer, mid, inner, vein, outerMat, midMat, innerMat, veinMat };
  }

  setMolecularMode(on: boolean): void {
    this.molecularMode = on;
    if (on) {
      this.stem.material = this.wireMaterial;
      this.stemBase.material = this.wireMaterial;
      const heat = new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: 0xff3380, emissiveIntensity: 0.6,
        roughness: 0.4, side: THREE.DoubleSide,
      });
      this.heatMaterials.push(heat);
      for (const s of this.leafSlots) {
        s.outer.material = heat;
        s.mid.visible = false;
        s.inner.visible = false;
        s.vein.visible = false;
      }
    } else {
      this.stem.material = this.stemMat;
      this.stemBase.material = this.stemBaseMat;
      for (const s of this.leafSlots) {
        s.outer.material = s.outerMat;
        s.mid.visible = true;
        s.inner.visible = true;
        s.vein.visible = true;
      }
      for (const m of this.heatMaterials) m.dispose();
      this.heatMaterials = [];
    }
  }

  /** Per-frame update. See greenhouseScene for the call site. */
  update(
    morph: PlantMorph,
    stress: StressVector,
    metabIntensity: number,
    phototropism = 0,
    anomaly?: PlantAnomaly,
    dt = 0,
  ): void {
    // Dead plants don't sway. Living-but-stressed plants sway less than
    // healthy ones (turgor loss = limp tissue). Either way, we skip the
    // sway clock advance when dead so the seed doesn't drift.
    const isDead = morph.dead === true;
    if (!isDead) this.swayTime += dt;

    // ---- stem scale ----
    // Apply the variety's mature-height multiplier (1.0 = original
    // ~Coleus 1m, 0.3 = aloe rosette, 1.5 = corn). Defaults to 1.0.
    const heightUnits = this.variety.matureHeightUnits ?? 1.0;
    const stemH = Math.max(0.05, morph.height * heightUnits);
    // TubeGeometry was built with radius 0.03 along a y:0..1 curve, so
    // scaling x/z by (stemRadius / 0.03) gives us the same visible radius
    // as the old unit-radius cylinder. Scale y by stemH for height.
    const stemXZ = morph.stemRadius / 0.03;
    this.stem.scale.set(stemXZ, stemH, stemXZ);
    this.stem.position.set(0, 0.05, 0);

    // phototropism + persistent per-plant lean
    this.root.rotation.z = this.poseLean + phototropism;
    this.root.rotation.y = this.poseYaw;

    if (!this.molecularMode) {
      if (isDead) {
        // Dead stem: greyish-brown, fully desaturated, slight olive cast.
        // We use a pre-mixed dead color so necrosis intensity doesn't
        // change it further (consistent across all dead plants).
        const dead = new THREE.Color(0x4a3a2a);
        this.stemMat.color.copy(dead);
        this.stemBaseMat.color.copy(dead).multiplyScalar(0.5);
      } else {
        const nFactor = 1 - stress.necrosis * 0.65;
        this.stemMat.color.copy(this.stemColorBase).multiplyScalar(nFactor);
        this.stemBaseMat.color.copy(this.stemColorBase).multiplyScalar(0.6 * nFactor);
      }
    } else {
      const heat = this.heatMaterials[0];
      if (heat) {
        heat.emissiveIntensity = 0.4 + 1.6 * metabIntensity;
        heat.emissive = new THREE.Color().setHSL(
          0.85 - 0.55 * metabIntensity, 1, 0.5,
        );
      }
    }

    // ── Phyllotaxy / leaves-per-node selection ──
    // Defaults match Coleus: 2 leaves per node, decussate. Other plants
    // (set by varietyFromPlant) flip to 1-leaf alternate / rosette / fronds.
    const leavesPerNode = this.variety.leavesPerNode ?? 2;
    const phyllotaxy = this.variety.phyllotaxy ?? "decussate";

    const visiblePairs = morph.leafPairs; // semantic = number of NODES
    const dropPairs = Math.min(
      visiblePairs,
      morph.dropPairs + (anomaly?.dropPairs ?? 0),
    );
    const visibleNodes = visiblePairs - dropPairs;
    // total leaf slots that should be visible this frame
    const maxLeafSlots = this.leafSlots.length;
    const visibleCount = Math.min(maxLeafSlots, visibleNodes * leavesPerNode);

    const palette = isDead
      ? this.computeDeadPalette()
      : this.computePalette(stress);

    // Gentle wind — global sway + per-leaf flutter (dead plants are stiff)
    const windAmp = isDead ? 0 : 0.04 + 0.05 * stress.wilting;
    const sway = isDead ? 0 : Math.sin(this.swayTime * 1.4 + this.swayPhase) * windAmp;

    // Golden-angle constant for alternate phyllotaxy
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < maxLeafSlots; i++) {
      const slot = this.leafSlots[i];
      // Which node this slot belongs to + position within the node
      const nodeIndex = Math.floor(i / leavesPerNode);
      const inNode = i % leavesPerNode;
      if (nodeIndex < dropPairs || i >= visibleCount + dropPairs * leavesPerNode) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;

      // tNode 0..1 from base (oldest leaves) to tip (newest leaves)
      const tNode = (nodeIndex - dropPairs + 1) / Math.max(1, visibleNodes);

      // ── Position the leaf node along the stem ──
      let yPos: number;
      if (phyllotaxy === "rosette") {
        // All leaves emerge from the base in a low rosette; small vertical
        // spread to avoid z-fighting.
        yPos = 0.18 + 0.08 * tNode;
      } else if (phyllotaxy === "fronds") {
        // Fronds in a tuft at the apex
        yPos = 0.18 + (stemH - 0.2) * 0.85 + 0.05 * tNode;
      } else {
        yPos = 0.18 + (stemH - 0.2) * tNode;
      }

      const tipShrink = 0.55 + 0.45 * (1 - tNode);
      const scale = morph.leafScale * tipShrink;

      slot.group.scale.set(scale * this.variety.aspect, scale, scale);
      slot.group.position.set(0, yPos, 0);

      // ── Rotation per phyllotaxy ──
      slot.group.rotation.set(0, 0, 0);

      let yawRot: number;
      let outDir: number;
      let outwardTilt = Math.PI / 3;

      if (phyllotaxy === "decussate") {
        // Coleus / mint: opposite leaf pairs, every other pair rotated 90°
        yawRot = (nodeIndex % 2) * (Math.PI / 2);
        outDir = inNode === 0 ? -1 : 1;
      } else if (phyllotaxy === "alternate") {
        // Monocot grasses + alternate dicots: spiral around the stem
        // following the golden angle. Single leaf per node.
        yawRot = nodeIndex * GOLDEN;
        outDir = nodeIndex % 2 === 0 ? -1 : 1;
        // grass blades stick out flatter — reduce outward tilt
        outwardTilt = leavesPerNode === 1 ? Math.PI / 2.4 : Math.PI / 3;
      } else if (phyllotaxy === "rosette") {
        // All leaves splay out from base — yaw evenly distributed
        yawRot = nodeIndex * (Math.PI * 2 / Math.max(1, visibleNodes));
        outDir = 1;
        outwardTilt = Math.PI / 2.1; // very flat, almost horizontal
      } else { // fronds
        yawRot = nodeIndex * (Math.PI * 2 / Math.max(1, visibleNodes)) * 0.6;
        outDir = 1;
        outwardTilt = Math.PI / 2.7;
      }
      slot.group.rotation.y = yawRot;

      const droop = Math.min(
        Math.PI * 0.55,
        stress.curl * Math.PI * 0.45 + stress.wilting * Math.PI * 0.4,
      );
      slot.group.rotateX(-Math.PI / 2);
      slot.group.rotateZ(outDir * outwardTilt);
      slot.group.rotateX(-droop);

      // Wind sway — tilt leaves a little around the Z axis over time.
      // Tip pairs sway more than base pairs (quadratic weighting).
      const leafFlutter = sway * (0.4 + 0.6 * tNode) +
        Math.sin(this.swayTime * 2.1 + i * 0.7 + this.swayPhase) * 0.015;
      slot.group.rotateZ(leafFlutter);

      if (!this.molecularMode) {
        slot.outerMat.color.copy(palette.outer);
        slot.midMat.color.copy(palette.mid);
        slot.innerMat.color.copy(palette.inner);
        slot.midMat.opacity = palette.midOpacity;
        slot.innerMat.opacity = palette.innerOpacity;
        slot.outerMat.roughness =
          Math.max(0.2, 0.5 - this.variety.gloss * 0.2 + stress.stomatalClose * 0.25);
        slot.outerMat.emissive.copy(palette.glow);
        slot.outerMat.emissiveIntensity = palette.glowIntensity;
      }
    }
  }

  /** Palette for a dead plant: dry-leaf brown, no glow, no anthocyanin.
   *  Returns a slightly-varied brown so a row of dead plants doesn't look
   *  uniform — old dead leaves are darker than recently-dead ones. */
  private computeDeadPalette(): {
    outer: THREE.Color; mid: THREE.Color; inner: THREE.Color;
    midOpacity: number; innerOpacity: number;
    glow: THREE.Color; glowIntensity: number;
  } {
    return {
      outer: new THREE.Color(0x6b5232),     // dry leaf brown
      mid:   new THREE.Color(0x4f3a22),     // darker brown vein
      inner: new THREE.Color(0x3a2a18),     // dark brown
      midOpacity: 0.85,
      innerOpacity: 0.55,
      glow: new THREE.Color(0x000000),
      glowIntensity: 0,
    };
  }

  private computePalette(stress: StressVector): {
    outer: THREE.Color; mid: THREE.Color; inner: THREE.Color;
    midOpacity: number; innerOpacity: number;
    glow: THREE.Color; glowIntensity: number;
  } {
    const outer = new THREE.Color(this.variety.leafColor);
    if (stress.chlorosis > 0) {
      const carotenoid = new THREE.Color(0xd9c34a);
      outer.lerp(carotenoid, stress.chlorosis * 0.85);
    }
    if (stress.wilting > 0) {
      const dull = new THREE.Color(0x4a4d3a);
      outer.lerp(dull, stress.wilting * 0.35);
    }

    const mid = new THREE.Color(this.variety.accentColor)
      .lerp(new THREE.Color(0x4a0d44), 0.35);
    const midOpacity = Math.min(0.95, 0.35 + stress.pigmentation * 0.5);

    const inner = new THREE.Color(0xff3aa6);
    const innerOpacity = Math.min(0.85, Math.max(0, stress.pigmentation - 0.5) * 0.9);

    const glow = new THREE.Color(0xff3aa6);
    const glowIntensity = Math.max(0, stress.pigmentation - 1) * 0.6;

    return { outer, mid, inner, midOpacity, innerOpacity, glow, glowIntensity };
  }

  dispose(): void {
    this.leafGeoOuter.dispose();
    this.leafGeoMid.dispose();
    this.leafGeoInner.dispose();
    this.midribGeo.dispose();
    this.wireMaterial.dispose();
    for (const s of this.leafSlots) {
      s.outerMat.dispose();
      s.midMat.dispose();
      s.innerMat.dispose();
      s.veinMat.dispose();
    }
    for (const m of this.heatMaterials) m.dispose();
    (this.stem.geometry as THREE.BufferGeometry).dispose();
    this.stemMat.dispose();
    (this.stemBase.geometry as THREE.BufferGeometry).dispose();
    this.stemBaseMat.dispose();
  }
}

interface LeafSlot {
  group: THREE.Group;
  outer: THREE.Mesh;
  mid: THREE.Mesh;
  inner: THREE.Mesh;
  vein: THREE.Mesh;
  outerMat: THREE.MeshStandardMaterial;
  midMat: THREE.MeshStandardMaterial;
  innerMat: THREE.MeshStandardMaterial;
  veinMat: THREE.MeshStandardMaterial;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Taper a TubeGeometry so the top radius shrinks to `tipFrac` of the base. */
function taperTube(geo: THREE.BufferGeometry, _baseFrac: number, tipFrac: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // In the TubeGeometry we built (curve y: 0..1), we'll taper by normalising
  // y then scaling x/z by lerp(1, tipFrac, y).
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(1e-6, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const y = (pos.getY(i) - minY) / span;
    const k = 1 * (1 - y) + tipFrac * y;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function seedOf(armId: string, plantIndex: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < armId.length; i++) {
    h ^= armId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= plantIndex + 0x9e3779b9;
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
