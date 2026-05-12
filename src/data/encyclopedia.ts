import type { PolyDelivery, VarietyId, VocId } from "../types";

/**
 * Encyclopedia of clickable simulation entities.
 *
 * Every entry exposes:
 *  - title: human label
 *  - hex:   representative color string ("#rrggbb"), shown both as a swatch
 *           and as the displayed hex digit string in the info modal.
 *  - blurb: exactly THREE sentences describing what it is, what it does in
 *           the simulator, and how it affects the readout. Keep them concise
 *           and reasonably accurate to the underlying biology.
 */

export interface InfoEntry {
  title: string;
  subtitle?: string;
  hex: string;
  blurb: [string, string, string];
}

// ---------- General "what is this technique?" cards ----------

export const MASS_SPEC_INFO: InfoEntry = {
  title: "Mass spectrometry (LC-MS)",
  subtitle: "How the molecular readout is produced",
  hex: "#80cfff",
  blurb: [
    "Every mass spectrometer has three stages: an ionization source converts molecules into gas-phase ions (we model nanoelectrospray), a mass analyzer separates them by mass-to-charge (m/z) ratio, and an ion detector counts them — yielding peaks whose height reflects relative abundance.",
    "Each bar in this chart is therefore a unique m/z component in the leaf extract; bar height ≈ how much of that ion the analyzer saw, and the pop-up label tells you which secondary metabolite the peak corresponds to.",
    "Click any plant in the 3D bench to switch from the bench-mean spectrum to that single plant's spectrum — that is what real mass spectrometry sees: one sample at a time, with replicate-to-replicate variance from biology and instrument noise.",
  ],
};

export const RANDOM_ERROR_INFO: InfoEntry = {
  title: "Random error in plant studies",
  subtitle: "Precision vs. accuracy · Gaussian variability",
  hex: "#f9a825",
  blurb: [
    "Random error is the unavoidable, fluctuating variation between measurements caused by tiny environmental shifts, biological variability and instrument limits — it scatters Gaussian-style above and below the true value.",
    "Random error reduces precision (reproducibility) but not accuracy: enabling it here gives every plant in a bench its own height, color, anomaly and LC-MS spectrum, so the bench mean only converges on the 'true' value as N grows.",
    "Increase the plants-per-bench slider and watch the height stdev shrink and the bench-mean LC-MS bars stabilise — the textbook fix of 'more samples → less random error'.",
  ],
};

// ---------- LC-MS peaks (keyed by integer m/z) ----------

export const PEAK_INFO: Record<number, InfoEntry> = {
  87: {
    title: "ACC — 1-Aminocyclopropane-1-carboxylate",
    subtitle: "Ethylene biosynthesis precursor (m/z 87)",
    hex: "#a3b18a",
    blurb: [
      "ACC is the immediate precursor to ethylene; ACC oxidase converts it into the gaseous senescence hormone.",
      "A rising ACC peak signals the plant is actively producing ethylene in response to wounding, ripening, or stress.",
      "In this simulator, this peak grows under any treatment containing Ethylene and amplifies with temperature.",
    ],
  },
  117: {
    title: "Senescence enzyme fragment",
    subtitle: "Chlorophyllase / SAG-derived ion (m/z 117)",
    hex: "#bca06c",
    blurb: [
      "This peak proxies senescence-associated enzymes that dismantle the chloroplast during programmed leaf death.",
      "Its rise correlates with chlorophyll degradation, which is why it climbs alongside Ethylene exposure here.",
      "When this peak is high, expect leaves to yellow (chlorosis) and lower-leaf drop to accelerate.",
    ],
  },
  138: {
    title: "Salicylic acid (SA)",
    subtitle: "Defense phytohormone (m/z 138)",
    hex: "#e0d2b6",
    blurb: [
      "Salicylic acid is the master regulator of systemic acquired resistance (SAR) against biotrophic pathogens.",
      "SA itself is colorless; the swatch shown is a representative pale tone for graph identification.",
      "MeSA (methyl salicylate) hydrolyzes back to SA in planta, so this peak swells under MeSA treatment.",
    ],
  },
  152: {
    title: "Methyl salicylate (MeSA)",
    subtitle: "Volatile defense ester (m/z 152)",
    hex: "#d6e2c4",
    blurb: [
      "MeSA is the volatile methylated form of salicylic acid — the active compound in wintergreen oil.",
      "It is the airborne 'damage call' plants release to prime neighbors for biotrophic pathogen attack.",
      "Adding MeSA here amplifies anthocyanin (m/z 287) and SA (m/z 138) peaks via the SA pathway.",
    ],
  },
  154: {
    title: "Linalool",
    subtitle: "Monoterpene alcohol (m/z 154)",
    hex: "#e7e3d4",
    blurb: [
      "Linalool is a floral monoterpene found in lavender, basil and many other Lamiaceae essential oils.",
      "It can act as a deterrent to herbivores and as an antimicrobial component of the leaf headspace.",
      "In the simulator it modestly raises oxidative-stress markers (MDA, lipid peroxide) and curl.",
    ],
  },
  162: {
    title: "Chlorophyll catabolite",
    subtitle: "Linear tetrapyrrole breakdown product (m/z 162)",
    hex: "#a89351",
    blurb: [
      "Once chlorophyll is dismantled, the porphyrin ring is cleaved into colorless or yellow-brown catabolites.",
      "These accumulate in the vacuole and contribute to the warm tones seen in autumn-shifted Coleus leaves.",
      "A rising peak here pairs with falling chlorophyll a/b (m/z 893, 907) — the chemical signature of chlorosis.",
    ],
  },
  170: {
    title: "Linalool oxide",
    subtitle: "Oxidized monoterpene (m/z 170)",
    hex: "#ddd9cb",
    blurb: [
      "Linalool oxide forms when linalool reacts with reactive oxygen species at the leaf surface or in air.",
      "It is itself an aroma compound (slightly woody) but more importantly a marker of oxidative chemistry.",
      "Its presence here scales with how long linalool has been applied and with overall stress level.",
    ],
  },
  195: {
    title: "MDA — Malondialdehyde",
    subtitle: "Lipid-peroxidation marker (m/z 195)",
    hex: "#c8a4a4",
    blurb: [
      "Malondialdehyde is the canonical end-product of polyunsaturated fatty-acid peroxidation in membranes.",
      "Plant biologists routinely use MDA as the gold-standard quantitative marker of oxidative stress.",
      "A high MDA peak in this run means membranes are being damaged faster than antioxidant systems can repair.",
    ],
  },
  220: {
    title: "Lipid peroxide",
    subtitle: "Hydroperoxide intermediate (m/z 220)",
    hex: "#b89a9a",
    blurb: [
      "Lipid hydroperoxides are the unstable intermediates that decompose into MDA and other reactive aldehydes.",
      "They form in membranes attacked by reactive oxygen species generated under VOC and UV stress.",
      "Co-occurrence of this peak with MDA (m/z 195) confirms ongoing membrane oxidation, not a one-off event.",
    ],
  },
  224: {
    title: "Methyl jasmonate (MeJA)",
    subtitle: "Volatile defense jasmonate (m/z 224)",
    hex: "#fff59d",
    blurb: [
      "MeJA is the volatile methyl ester of jasmonic acid — the central hormone of necrotroph and herbivore defense.",
      "Spraying or volatilizing MeJA induces anthocyanin biosynthesis (the magenta zone in Coleus leaves).",
      "Expect this peak, m/z 287 (anthocyanin), and the defense fragment (m/z 332) to all rise together.",
    ],
  },
  287: {
    title: "Anthocyanin aglycone (cyanidin)",
    subtitle: "Magenta vacuolar pigment (m/z 287)",
    hex: "#9c1f5e",
    blurb: [
      "Anthocyanins are water-soluble flavonoid pigments stored in epidermal cell vacuoles, masking chlorophyll below.",
      "They function as a 'sunscreen' against UV and as a sink for excess photosynthetic energy under stress.",
      "This is the headline peak that drives the magenta-to-purple zoning you see on stressed Coleus leaves here.",
    ],
  },
  300: {
    title: "SA-glucoside",
    subtitle: "Conjugated salicylic acid (m/z 300)",
    hex: "#cfd6c2",
    blurb: [
      "Plants store excess SA as the inactive glucoside conjugate to avoid runaway defense signaling.",
      "Hydrolases release free SA from this pool when a pathogen or stress signal triggers SAR.",
      "A persistent SA-glucoside peak indicates a primed plant — defense is loaded but not yet fully fired.",
    ],
  },
  332: {
    title: "Defense protein fragment",
    subtitle: "MeJA-induced PR-protein ion (m/z 332)",
    hex: "#7b3fa0",
    blurb: [
      "Pathogenesis-related (PR) proteins like chitinases and glucanases break down pathogen cell walls.",
      "MeJA strongly induces several PR families; their tryptic fragments give a characteristic LC-MS signal.",
      "This peak's height drives the purple defense-protein clusters drawn in the Microbiome view.",
    ],
  },
  384: {
    title: "Pheophorbide a",
    subtitle: "Magnesium-stripped chlorophyll (m/z 384)",
    hex: "#7c8a3a",
    blurb: [
      "Pheophorbide is the olive-green intermediate formed when Mg²⁺ is removed from chlorophyll a.",
      "It is one of the early breakdown products on the way to colorless tetrapyrrole catabolites.",
      "Its accumulation here marks an active senescence pathway, especially under Ethylene treatment.",
    ],
  },
  449: {
    title: "Cyanidin-3-glucoside",
    subtitle: "Major dietary anthocyanin (m/z 449)",
    hex: "#7b1fa2",
    blurb: [
      "Cyanidin-3-glucoside is the most abundant anthocyanin in red/purple plant tissues, including Coleus.",
      "Its glucose moiety stabilises the pigment and traps it in the vacuole where it does its UV-screening job.",
      "This peak grows together with m/z 287; their ratio indicates how much pigment is glycosylated vs free.",
    ],
  },
  893: {
    title: "Chlorophyll a",
    subtitle: "Primary photosynthetic pigment (m/z 893)",
    hex: "#1f5d2a",
    blurb: [
      "Chlorophyll a sits at the heart of both photosystems and is the molecule that actually splits water.",
      "It absorbs strongly in the blue (430 nm) and red (662 nm), giving healthy leaves their deep green color.",
      "This peak shrinks under Ethylene as chlorosis breaks the porphyrin ring — the chemical face of leaf yellowing.",
    ],
  },
  907: {
    title: "Chlorophyll b",
    subtitle: "Accessory pigment (m/z 907)",
    hex: "#7cb342",
    blurb: [
      "Chlorophyll b is an accessory pigment that funnels extra wavelengths of light into chlorophyll a.",
      "It is found only in light-harvesting complexes; the a:b ratio is a sensitive index of shade vs sun adaptation.",
      "Like chlorophyll a, this peak declines under chlorosis-driving treatments such as Ethylene.",
    ],
  },
};

// ---------- VOC chemicals ----------

export const VOC_INFO: Record<VocId, InfoEntry> = {
  ethylene: {
    title: "Ethylene (C₂H₄)",
    subtitle: "Gaseous senescence hormone",
    hex: "#cdd5b6",
    blurb: [
      "Ethylene is a small, naturally gaseous hormone that regulates fruit ripening, senescence and stress response.",
      "It travels easily through air, which is why it is highly effective in the gas-delivery treatment group here.",
      "Expect chlorosis, leaf curling, premature lower-leaf drop and falling chlorophyll peaks under ethylene exposure.",
    ],
  },
  meja: {
    title: "Methyl jasmonate (MeJA)",
    subtitle: "Volatile defense ester",
    hex: "#fff176",
    blurb: [
      "MeJA is the methyl ester of jasmonic acid, the master signaling lipid for wound and herbivore defense.",
      "It triggers anthocyanin biosynthesis (the purple/magenta pigments) and induces PR-proteins like chitinases.",
      "In this simulator MeJA produces the strongest pigmentation glow and the largest defense-protein response.",
    ],
  },
  mesa: {
    title: "Methyl salicylate (MeSA)",
    subtitle: "Wintergreen-scented defense volatile",
    hex: "#dce5c5",
    blurb: [
      "MeSA is the volatile form of salicylic acid; you know it as the active aroma of wintergreen oil.",
      "Plants emit it to prime neighbors for systemic acquired resistance against biotrophic pathogens.",
      "It boosts the SA peak (m/z 138), anthocyanin peak (m/z 287), and defense protein clusters.",
    ],
  },
  linalool: {
    title: "Linalool",
    subtitle: "Floral monoterpene alcohol",
    hex: "#efeadc",
    blurb: [
      "Linalool is a fragrant monoterpene alcohol found across mints, citrus and many essential-oil plants.",
      "It deters some herbivores and disrupts microbial membranes at high concentration in the leaf headspace.",
      "Here it raises oxidative-stress markers (MDA, lipid peroxide) and contributes mild leaf curling.",
    ],
  },
};

// ---------- Delivery modes (one card per route) ----------

export const DELIVERY_INFO: Record<PolyDelivery, InfoEntry> = {
  liquid: {
    title: "Liquid delivery",
    subtitle: "Soil drench / foliar spray",
    hex: "#0277bd",
    blurb: [
      "VOCs are dissolved in water (or low-percentage ethanol) and applied directly to the soil or leaf surface.",
      "Aqueous delivery gives precise dosing but disturbs the rhizosphere microbiome — diversity drops sharply.",
      "Expect higher necrosis and stronger height suppression than the gaseous route at the same concentration.",
    ],
  },
  gas: {
    title: "Gaseous delivery",
    subtitle: "Vapor / fumigation",
    hex: "#f9a825",
    blurb: [
      "Plants share air with an evaporating VOC source so dosing happens through the headspace, not the soil.",
      "Fumigation produces a sharp microbial cull in week 1 followed by a rapid opportunistic recolonization phase.",
      "Visually, gaseous treatment causes more leaf curling, stomatal closure and chlorosis than the liquid route.",
    ],
  },
  both: {
    title: "Mixed delivery",
    subtitle: "Liquid + gas combined",
    hex: "#6a1b9a",
    blurb: [
      "Both routes are applied simultaneously, so soil and air receive the chemical in parallel.",
      "Multi-VOC arms in this mode get the synergy bonus without the dampening that single-route shaping adds.",
      "This is typically the harshest setup; pair it with a control bench to see the full magnitude of effects.",
    ],
  },
};

// ---------- Plant varieties ----------

export const VARIETY_INFO: Record<VarietyId, InfoEntry> = {
  wizard: {
    title: "Wizard Mix",
    subtitle: "Variegated cultivar series",
    hex: "#ec407a",
    blurb: [
      "Wizard Mix is the classic seed-grown Coleus series with mid-sized, ovate leaves and pink/green variegation.",
      "Its moderate serration (~9 teeth per side) and balanced anthocyanin make it the easiest variety to read visually.",
      "Use it as the default reference when comparing how treatments alter color zoning across other cultivars.",
    ],
  },
  blackDragon: {
    title: "Black Dragon",
    subtitle: "Deeply lobed, near-black variety",
    hex: "#4a0d2c",
    blurb: [
      "Black Dragon carries one of the highest baseline anthocyanin loads in the cultivar group — leaves look near-black.",
      "Its deeply fringed margins (modeled here with ~14 serrations per side) make pigmentation changes very visible.",
      "Under MeJA or poly stress, hyper-pigmentation pushes its mid-zone color into a glowing magenta-purple.",
    ],
  },
  limeDelight: {
    title: "Lime Delight",
    subtitle: "Carotenoid-dominant chartreuse cultivar",
    hex: "#c6ff00",
    blurb: [
      "Lime Delight is a low-anthocyanin, low-chlorophyll mutant where carotenoids dominate, giving the neon-green look.",
      "Because chlorophyll is already reduced, ethylene-driven chlorosis is harder to see than in Wizard or Black Dragon.",
      "It is the best variety to read carotenoid (yellow/orange) shifts against because nothing is masking them.",
    ],
  },
};

// ---------- Microbe classes (for the micro view legend) ----------

export interface MicrobeInfoEntry extends InfoEntry {
  shape: string;
}

export const MICROBE_INFO: Record<"beneficial" | "opportunist" | "pathogen", MicrobeInfoEntry> = {
  beneficial: {
    title: "Beneficial coccus",
    subtitle: "Mutualist (e.g. Pseudomonas, Bacillus)",
    hex: "#8cf0dc",
    shape: "Small round cell with a teal halo",
    blurb: [
      "Beneficial members of the phyllosphere and rhizosphere produce siderophores, induce systemic resistance, and out-compete pathogens.",
      "They prefer low-disturbance environments — heavy aqueous VOC dosing causes their populations to crash.",
      "On the canvas they appear as small teal cocci with a soft luminescent halo.",
    ],
  },
  opportunist: {
    title: "Opportunist coccus",
    subtitle: "Generalist colonizer",
    hex: "#f5af3c",
    shape: "Amber round cell, no halo",
    blurb: [
      "Opportunists tolerate disturbance well and quickly fill empty ecological niches after stress events.",
      "After a fumigation pulse you'll see this class rebound first while diversity is still low.",
      "They are not strictly pathogenic but their dominance signals an unhealthy, low-diversity community.",
    ],
  },
  pathogen: {
    title: "Pathogenic bacillus",
    subtitle: "Gram-positive opportunistic pathogen",
    hex: "#e83c46",
    shape: "Elongated red rod",
    blurb: [
      "Under aqueous VOC drenching the rhizosphere shifts toward gram-positive opportunistic pathogens.",
      "Their rise correlates with the resistome score — antibiotic-resistance gene load increases in step.",
      "Visually they are red elongated rods that swim across the canvas with a small rotational drift.",
    ],
  },
};
