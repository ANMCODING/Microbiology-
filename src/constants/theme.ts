import type { VarietyId, VarietyConfig, VocId } from "../types";

export const VOC_LABEL: Record<VocId, string> = {
  ethylene: "Ethylene (C₂H₄)",
  meja: "Methyl Jasmonate",
  mesa: "Methyl Salicylate",
  linalool: "Linalool",
};

export const VOC_SHORT: Record<VocId, string> = {
  ethylene: "Ethylene",
  meja: "MeJA",
  mesa: "MeSA",
  linalool: "Linalool",
};

export const VARIETIES: Record<VarietyId, VarietyConfig> = {
  wizard: {
    label: "Wizard Mix (Variegated)",
    leafColor: 0x4caf50,
    accentColor: 0xec407a,
    stemColor: 0x6b8a3a,
    serrations: 9,
    aspect: 1.35,
    saturation: 0.95,
    cupping: 0.30,
    droop:   0.22,
    leafSize: 1.0,
    gloss:   0.5,
  },
  blackDragon: {
    // Deeply ruffled, near-black variety — heavy cup, strong droop, larger
    // leaves, glossier surface to catch specular on the dark pigment.
    label: "Black Dragon",
    leafColor: 0x3a081d,
    accentColor: 0x6a0e2e,
    stemColor: 0x3d1a25,
    serrations: 16,
    aspect: 1.65,
    saturation: 1.10,
    cupping: 0.65,
    droop:   0.42,
    leafSize: 1.12,
    gloss:   0.75,
  },
  limeDelight: {
    // Bright chartreuse cultivar with smaller, finer leaves and less
    // cupping — a high-chroma matte look to contrast with Black Dragon.
    label: "Lime Delight",
    leafColor: 0xc8ff3d,
    accentColor: 0xfff59d,
    stemColor: 0xa8c96a,
    serrations: 6,
    aspect: 1.22,
    saturation: 1.0,
    cupping: 0.18,
    droop:   0.14,
    leafSize: 0.82,
    gloss:   0.40,
  },
};
