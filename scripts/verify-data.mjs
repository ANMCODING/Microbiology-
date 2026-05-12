#!/usr/bin/env node
/**
 * Standalone data validator — runs WITHOUT the website.
 *
 * Loads every JSON in src/data/{chemicals,plants}/ and checks the same
 * invariants the runtime loader does. Use this after authoring a new
 * JSON to catch problems before the lab tries to start.
 *
 *   node scripts/verify-data.mjs
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "src", "data");

const SIM_AXES = [
  "heightSuppress", "necrosis", "curl", "stomatalClose",
  "pigmentation", "chlorosis", "defenseProteins", "wilting",
];
const VALID_PHASES = new Set(["liquid", "gas", "solid", "aerosol"]);
const VALID_DELIVERY = new Set([
  "liquid", "gas", "soil", "foliar_spray", "root_drench", "fumigation",
]);
const VALID_PATHWAYS = new Set(["C3", "C4", "CAM"]);
const HEX = /^#[0-9a-fA-F]{6}$/;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v) => typeof v === "string";
const inRange = (v, lo, hi) => v >= lo && v <= hi;

let errors = 0;
const fail = (file, path, msg) => {
  errors++;
  console.error(`  ✗ ${file} → ${path}: ${msg}`);
};

function checkSimVector(v, file, path) {
  if (!v || typeof v !== "object") return fail(file, path, "must be object");
  for (const a of SIM_AXES) {
    const x = v[a];
    if (!isNum(x)) { fail(file, `${path}.${a}`, "not a number"); continue; }
    const cap = a === "pigmentation" ? 2 : 1;
    if (!inRange(x, 0, cap)) fail(file, `${path}.${a}`, `must be in [0, ${cap}]`);
  }
}

// ───── chemicals
console.log("Validating chemicals…");
const chemDir = join(ROOT, "chemicals");
const chemFiles = readdirSync(chemDir).filter((f) => f.endsWith(".json"));
const chemIds = new Set();

for (const file of chemFiles) {
  const c = JSON.parse(readFileSync(join(chemDir, file), "utf8"));
  const base = file.replace(/\.json$/, "");
  if (c.id !== base) fail(file, "id", `must equal filename "${base}"`);
  chemIds.add(c.id);
  if (!isStr(c.commonName)) fail(file, "commonName", "missing");
  if (!isStr(c.formula)) fail(file, "formula", "missing");
  if (!isNum(c.molecularWeight)) fail(file, "molecularWeight", "must be a number");
  if (!VALID_PHASES.has(c.phase)) fail(file, "phase", `invalid: ${c.phase}`);
  if (!Array.isArray(c.deliveryMethods) || c.deliveryMethods.length === 0)
    fail(file, "deliveryMethods", "must be non-empty array");
  for (const d of c.deliveryMethods ?? [])
    if (!VALID_DELIVERY.has(d)) fail(file, "deliveryMethods", `invalid: ${d}`);
  if (!HEX.test(c.color ?? "")) fail(file, "color", "must be #RRGGBB hex");
  checkSimVector(c.simulationVector, file, "simulationVector");
  if (c.doseResponse) {
    checkSimVector(c.doseResponse.lowDose?.simulationVector, file,
      "doseResponse.lowDose.simulationVector");
    checkSimVector(c.doseResponse.highDose?.simulationVector, file,
      "doseResponse.highDose.simulationVector");
  }
  if (!Array.isArray(c.lcMsPeaks)) fail(file, "lcMsPeaks", "must be array");
  for (let i = 0; i < (c.lcMsPeaks?.length ?? 0); i++) {
    const p = c.lcMsPeaks[i];
    const path = `lcMsPeaks[${i}]`;
    if (!isNum(p.mz)) fail(file, `${path}.mz`, "not a number");
    if (!isStr(p.label)) fail(file, `${path}.label`, "missing");
    if (!isNum(p.base) || !inRange(p.base, 0, 100))
      fail(file, `${path}.base`, "must be [0,100]");
    if (!isNum(p.weekFactor) || !inRange(p.weekFactor, 0, 2))
      fail(file, `${path}.weekFactor`, "must be [0,2]");
  }
  if (!Array.isArray(c.sources) || c.sources.length === 0)
    fail(file, "sources", "must be non-empty array");
}
console.log(`  ${chemFiles.length} chemical files checked`);

// ───── plants
console.log("\nValidating plants…");
const plantDir = join(ROOT, "plants");
const plantFiles = readdirSync(plantDir).filter((f) => f.endsWith(".json"));

for (const file of plantFiles) {
  const p = JSON.parse(readFileSync(join(plantDir, file), "utf8"));
  const base = file.replace(/\.json$/, "");
  if (p.id !== base) fail(file, "id", `must equal filename "${base}"`);
  if (!isStr(p.scientificName)) fail(file, "scientificName", "missing");
  if (!isStr(p.commonName)) fail(file, "commonName", "missing");
  if (!isStr(p.family)) fail(file, "family", "missing");
  if (typeof p.isModelOrganism !== "boolean")
    fail(file, "isModelOrganism", "must be boolean");
  if (!VALID_PATHWAYS.has(p.physiology?.photosynthesisPathway))
    fail(file, "physiology.photosynthesisPathway",
      `invalid: ${p.physiology?.photosynthesisPathway}`);

  const g = p.geometry ?? {};
  for (const k of ["matureHeightCm", "leafLengthCm", "leafWidthCm",
    "leafAspectRatio", "serrations", "cupping", "droop", "gloss",
    "internodeSpacingCm", "stemThicknessRatio", "branchingAngleDeg",
    "branchingFrequency", "leavesPerNode", "rootDepthCm",
    "rootBranchingDensity"])
    if (!isNum(g[k])) fail(file, `geometry.${k}`, "not a number");
  for (const k of ["leafColor", "veinColor", "stemColor"])
    if (!HEX.test(g[k] ?? "")) fail(file, `geometry.${k}`, "not #RRGGBB");

  const cs = p.chemicalSensitivity ?? {};
  const missing = [...chemIds].filter((id) => !(id in cs));
  if (missing.length)
    fail(file, "chemicalSensitivity",
      `missing keys for known chemicals: ${missing.join(", ")}`);
  for (const [k, v] of Object.entries(cs))
    if (!isNum(v) || !inRange(v, 0, 2))
      fail(file, `chemicalSensitivity.${k}`, "must be [0,2]");

  if (!Array.isArray(p.baselineLcMs))
    fail(file, "baselineLcMs", "must be array");
  for (let i = 0; i < (p.baselineLcMs?.length ?? 0); i++) {
    const peak = p.baselineLcMs[i];
    const path = `baselineLcMs[${i}]`;
    if (!isNum(peak.mz)) fail(file, `${path}.mz`, "not a number");
    if (!isStr(peak.label)) fail(file, `${path}.label`, "missing");
    if (!isNum(peak.base) || !inRange(peak.base, 0, 100))
      fail(file, `${path}.base`, "must be [0,100]");
    if (!isNum(peak.weekFactor) || !inRange(peak.weekFactor, 0, 2))
      fail(file, `${path}.weekFactor`, "must be [0,2]");
  }
  if (!Array.isArray(p.sources) || p.sources.length === 0)
    fail(file, "sources", "must be non-empty array");

  // optional mortality block — when present every numeric field must be sane
  if (p.mortality !== undefined) {
    const m = p.mortality;
    if (m.stressTolerance !== undefined &&
        (!isNum(m.stressTolerance) || !inRange(m.stressTolerance, 0.1, 2.0)))
      fail(file, "mortality.stressTolerance", "must be in [0.1, 2.0]");
    if (m.lethalDose !== undefined &&
        (!isNum(m.lethalDose) || !inRange(m.lethalDose, 1.0, 20.0)))
      fail(file, "mortality.lethalDose", "must be in [1, 20]");
    if (m.recoveryRate !== undefined &&
        (!isNum(m.recoveryRate) || !inRange(m.recoveryRate, 0.0, 0.5)))
      fail(file, "mortality.recoveryRate", "must be in [0, 0.5]");
  }
}
console.log(`  ${plantFiles.length} plant files checked`);

console.log("\n────────────────────────────────────────");
if (errors === 0) {
  console.log(
    `✓ All ${chemFiles.length + plantFiles.length} files valid ` +
    `(${chemFiles.length} chemicals, ${plantFiles.length} plants)`,
  );
  process.exit(0);
} else {
  console.error(`✗ ${errors} validation error(s) — see above`);
  process.exit(1);
}
