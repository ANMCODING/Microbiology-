/**
 * Guide screen — plain-language orientation before the plant/chemical picker.
 * Shown first on load (unless the user chose "skip next time" in localStorage).
 */

import { store } from "../state/store";
import { showRigorModal } from "./rigorModal";

const SKIP_KEY = "bioSimSkipGuide";

export function readSkipGuidePreference(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function goToGuide(): void {
  store.set({ screen: "guide", playing: false });
}

export function continueToPicker(): void {
  store.set({ screen: "entrance" });
}

export function mountGuidePage(host: HTMLElement): void {
  host.innerHTML = render();
  wire(host);
}

function wire(host: HTMLElement): void {
  host.querySelector("#guide-open-rigor")?.addEventListener("click", (e) => {
    e.preventDefault();
    showRigorModal();
  });

  host.querySelector("#guide-continue")?.addEventListener("click", () => {
    const skip = (host.querySelector("#guide-skip-next") as HTMLInputElement | null)?.checked;
    if (skip) {
      try {
        localStorage.setItem(SKIP_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    continueToPicker();
  });
}

function render(): string {
  return `
    <div class="guide-bg"></div>
    <div class="guide-shell">
      <header class="guide-head">
        <div class="guide-brand">
          <span class="logo-dot"></span>
          <div>
            <h1>How this lab works</h1>
            <p class="guide-lead">Take your time — especially the <strong>view guide</strong> and <strong>word glossary</strong>. This page is for everyone building or teaching with the site, not for experts.</p>
          </div>
        </div>
      </header>

      <nav class="guide-toc" aria-label="Sections">
        <a href="#g-what">What this is</a>
        <a href="#g-steps">What you do</a>
        <a href="#g-scales">Three views</a>
        <a href="#g-panels">Side panels</a>
        <a href="#g-views-deep">Macro · Micro · Molecular</a>
        <a href="#g-data">Plants &amp; chemicals</a>
        <a href="#g-life">Stress &amp; death</a>
        <a href="#g-glossary">Word glossary</a>
        <a href="#g-tips">Tips</a>
      </nav>

      <main class="guide-main">
        <section class="guide-card" id="g-what">
          <h2>What this is</h2>
          <p><strong>Bio-Sim Matrix</strong> is a virtual greenhouse experiment. You pick a plant species, pick one or more chemicals (or none for a control), then watch what happens over a simulated year.</p>
          <ul class="guide-bullets">
            <li>It is <strong>educational</strong>: numbers and visuals are tied to simplified biology, not a replacement for a real lab.</li>
            <li>It is <strong>multi-scale</strong>: the same experiment is shown as a whole plant, as microbes, and as a chemical readout.</li>
            <li>It is <strong>composable</strong>: you can compare several benches (tabs) side by side.</li>
            <li>For <strong>why it is semi-realistic</strong> and what each scale is accountable for, open the <strong>Basis</strong> report (lab header, or the button in the footer here) — you can print it or save as PDF from your browser.</li>
          </ul>
        </section>

        <section class="guide-card" id="g-steps">
          <h2>What you do (in order)</h2>
          <ol class="guide-steps">
            <li><strong>This page</strong> — you are here. When you are ready, press the green button at the bottom.</li>
            <li><strong>Choose plant &amp; chemicals</strong> — one plant species per bench, any combination of chemicals from the library (or zero for a control). You can search and filter chemicals by category.</li>
            <li><strong>Enter the lab</strong> — use the timeline to move through days, turn on play to run time forward, and switch between Macro / Micro / Molecular to see different sides of the same experiment.</li>
          </ol>
        </section>

        <section class="guide-card" id="g-scales">
          <h2>The three views (Macro · Micro · Molecular)</h2>
          <p>Use the three buttons in the top bar of the lab. They all describe the <em>same bench</em> — just at different zoom levels.</p>
          <dl class="guide-dl">
            <dt>Macro</dt>
            <dd>The <strong>3D plant</strong>. Height, leaf color, curling, wilting, and leaf drop show overall stress. Click a plant to focus that individual for some readouts.</dd>
            <dt>Micro</dt>
            <dd>The <strong>microbial community</strong> on leaves (phyllosphere) or near roots (rhizosphere). Diversity, pathogens, and “resistome” load shift with stress and chemicals.</dd>
            <dt>Molecular</dt>
            <dd>A <strong>mass spectrometry style chart</strong> (LC-MS). Peaks stand for classes of molecules; stress and which chemicals you applied change the pattern. In this view the 3D plant is drawn in wireframe to emphasize chemistry.</dd>
          </dl>
        </section>

        <section class="guide-card" id="g-panels">
          <h2>The side panels (right column)</h2>
          <dl class="guide-dl">
            <dt>Microbiome card</dt>
            <dd>Always visible in Macro view — quick summary of the active bench’s microbes.</dd>
            <dt>Today · Live feedback</dt>
            <dd>Short numbers for the current day: height, color, diversity, and how many plants are still alive.</dd>
            <dt>Analytics</dt>
            <dd>Tables and charts comparing plants or benches.</dd>
            <dt>LC-MS chart</dt>
            <dd>Stronger in Molecular view — spectrum for the bench or the clicked plant.</dd>
            <dt>Weekly recap</dt>
            <dd>Auto-generated text summaries you can turn on/off by category (macro, micro, molecular, overall).</dd>
            <dt>Automated log</dt>
            <dd>You add snapshots yourself — useful when you want a written record at a specific day.</dd>
          </dl>
        </section>

        <section class="guide-card guide-deep-card" id="g-views-deep">
          ${viewsDeepGuideHtml()}
        </section>

        <section class="guide-card" id="g-data">
          <h2>Plants &amp; chemicals (the data)</h2>
          <p>Each <strong>plant</strong> has its own shape in 3D, its own sensitivity to each chemical, its own default microbe profile, and its own “baseline” spectrum before stress.</p>
          <p>Each <strong>chemical</strong> has a stress fingerprint, optional synergy with other chemicals, and peaks that can show up on the LC-MS readout. Categories (metals, hormones, pesticides, etc.) group them on the picker.</p>
          <p><strong>Tip:</strong> Right-click a plant card or chemical chip on the picker for a longer info card.</p>
        </section>

        <section class="guide-card" id="g-life">
          <h2>Stress, damage, death, and recovery</h2>
          <p>If exposure stays high, plants accumulate <strong>damage</strong> over days. Different species tolerate stress differently: some die quickly, some only after a long exposure.</p>
          <p>If you <strong>lower concentration</strong>, <strong>remove chemicals</strong>, or improve water and humidity, surviving plants can <strong>recover</strong> — damage goes back down. A plant that has already died stays dead (like real necrotic tissue).</p>
          <p>The <strong>Today</strong> panel shows how many plants on the bench are still alive.</p>
        </section>

        <section class="guide-card guide-glossary-card" id="g-glossary">
          <h2>Word glossary</h2>
          <p class="glossary-intro">Important words you will see in the lab and on this site. Each term is explained in simple language, then how we use it here.</p>
          <div class="guide-glossary">
            ${glossaryHtml()}
          </div>
        </section>

        <section class="guide-card" id="g-tips">
          <h2>Quick tips for builders &amp; teachers</h2>
          <ul class="guide-bullets">
            <li><strong>Multiple benches</strong> — Tabs at the top of the lab are separate experiments; use them for control vs treatment.</li>
            <li><strong>Left panel</strong> — Dose, delivery (liquid vs gas), environment sliders, and plant count apply to the active tab.</li>
            <li><strong>Random errors</strong> — Toggle adds plant-to-plant variation so larger sample sizes look more stable (like real experiments).</li>
            <li><strong>“How it works”</strong> — You can open this page again from the picker or from the lab header anytime.</li>
          </ul>
        </section>
      </main>

      <footer class="guide-foot">
        <div class="guide-rigor-row">
          <button type="button" class="guide-rigor-btn" id="guide-open-rigor">Scientific basis · print / PDF</button>
          <span class="guide-rigor-hint">Short official-style note: what is grounded vs simplified for plants, chemicals, macro, micro, and molecular.</span>
        </div>
        <label class="guide-skip-label">
          <input type="checkbox" id="guide-skip-next" />
          Next time, skip this page and go straight to the plant &amp; chemical picker
        </label>
        <p class="guide-skip-hint">You can always open this page again with <strong>How it works</strong> in the lab or on the picker.</p>
        <button type="button" class="guide-continue-btn" id="guide-continue">
          Choose plant &amp; chemicals →
        </button>
      </footer>
    </div>
  `;
}

/**
 * Long-form explanation of Macro / Micro / Molecular: what each pixel layer
 * means and how the micro particle canvas maps to the simulation.
 */
function viewsDeepGuideHtml(): string {
  return `
          <h2>Understanding each view (Macro · Micro · Molecular)</h2>
          <p class="guide-deep-lead">The <strong>same experiment</strong> drives all three views. Numbers from your plant, chemicals, dose, delivery, and environment flow into one stress model. Macro shows the whole plant, Micro shows a cartoon of who lives on the surface, Molecular shows a cartoon spectrum. Below is what you are <em>actually</em> looking at in each.</p>

          <h3 class="guide-deep-h3" id="g-deep-macro">Macro — the 3D greenhouse</h3>
          <p>Each virtual plant is built from stems and leaves. As days pass, <strong>growth</strong> (height, leaf count, leaf size) follows a curve, then <strong>stress</strong> bends that curve down.</p>
          <ul class="guide-bullets">
            <li><strong>Yellowing</strong> (chlorosis) — the plant has trouble keeping chlorophyll healthy.</li>
            <li><strong>Browning / blackening</strong> (necrosis) — tissue is dying.</li>
            <li><strong>Droop and curl</strong> — water stress, stomatal behavior, and toxins show up as posture.</li>
            <li><strong>Purple-red glow</strong> (pigmentation) — stress pigments such as anthocyanins.</li>
            <li><strong>Lower leaves disappearing</strong> — aging plus severe stress can drop leaf pairs.</li>
            <li><strong>Dead plants</strong> — brown, stiff, almost no sway; the bench counter in Today tells you how many died.</li>
          </ul>
          <p><strong>Click a plant</strong> in Macro or Molecular to “sample” that individual — some readouts (for example the LC-MS card) can follow the focused plant.</p>

          <h3 class="guide-deep-h3" id="g-deep-micro">Micro — layers under the moving dots</h3>
          <p>Before the colored dots, the canvas draws a <strong>still background</strong> that stands for plant tissue, not more bacteria:</p>
          <ul class="guide-bullets">
            <li><strong>Honeycomb grid</strong> — abstract surface of cells (like a tissue patch).</li>
            <li><strong>Phyllosphere (leaf)</strong> — soft green oval patches read as chloroplast-rich leaf tissue; they wash yellower when chlorosis stress is high. Short lines with tiny dots are a <strong>stylized stoma</strong> (a pore) — not a bug.</li>
            <li><strong>Rhizosphere (root zone)</strong> — brown strokes rising from the bottom suggest <strong>root surface and soil</strong>, where root exudates feed microbes.</li>
            <li><strong>Purple halos</strong> — when the plant’s modeled <strong>defense-protein</strong> signal is strong, faint purple glows appear. That is the plant’s own biochemistry in the scene, <em>not</em> a fourth microbe color.</li>
          </ul>

          <h3 class="guide-deep-h3" id="g-deep-dots">Micro — what each moving dot means</h3>
          <p>Every colored speck is one simplified “cell” in a particle toy. The sim does <strong>not</strong> name real species (no <em>E. coli</em> vs <em>Bacillus</em> labels); it groups life into <strong>three roles</strong>, matching the legend on the dashboard:</p>
          <div class="guide-swatch-grid" aria-label="Microbe legend colors">
            <div class="guide-swatch-row">
              <span class="swatch-dot" style="background:#8cf0dc;box-shadow:0 0 0 2px rgba(140,240,220,0.35)"></span>
              <div><strong>Teal / mint — Beneficial</strong><br><span class="guide-swatch-desc">Helpers: nitrogen-fixers, protective microbes, and “good neighbors” that keep the community stable. In the canvas they are <strong>small</strong> dots with a soft glow. When the model says beneficial growth is strong, more of them spawn and each dot tends to live a bit longer.</span></div>
            </div>
            <div class="guide-swatch-row">
              <span class="swatch-dot" style="background:#f5af3c"></span>
              <div><strong>Orange — Opportunist</strong><br><span class="guide-swatch-desc">Fast adapters that bloom after a disturbance — not always evil, but they can muscle aside slower growers. <strong>Medium-sized</strong> solid circles.</span></div>
            </div>
            <div class="guide-swatch-row">
              <span class="swatch-dot swatch-pathogen" style="background:#e83c46"></span>
              <div><strong>Red — Pathogen</strong><br><span class="guide-swatch-desc">Disease-like organisms in this story. Drawn as <strong>larger elongated rods</strong> that slowly rotate. When the pathogen fraction in the model is high, the random spinner creates more red rods.</span></div>
            </div>
          </div>
          <p><strong>What the motion means:</strong> Dots drift with a little random jitter and friction, then wrap around the screen edge. That is <strong>not</strong> a literal map of swimming bacteria; it is a visual metaphor for a busy surface. When dots fade out, that is <strong>death / wash-off</strong> in the toy; when new dots appear, that is <strong>birth / immigration</strong>.</p>
          <p><strong>What ties dots to your sliders:</strong> The microbiome model outputs a few numbers — diversity, pathogen fraction, beneficial multiplier, sometimes a short “cull pulse” after fumigation, and a resistome score you see in the metrics row. Those numbers control <strong>how many</strong> particles exist, <strong>which color</strong> gets spawned, and <strong>how often</strong> a pulse wipes a slice of the community. Your <strong>plant’s JSON</strong> (baseline diversity, how stable it is under stress, etc.) nudges the same math so species differ.</p>
          <p><strong>Phyllo vs Rhizo:</strong> Same three microbe colors; only the <strong>backdrop story</strong> changes (leaf surface vs root zone). Toggle with <strong>Phyllo / Rhizo</strong> on the microbiome card.</p>

          <h3 class="guide-deep-h3" id="g-deep-mol">Molecular — the LC-MS chart</h3>
          <p>The chart is a <strong>stacked bar in m/z space</strong>: each peak is a class of molecules (chlorophyll, defense fragments, pigment peaks, peaks contributed by the chemicals you picked, etc.).</p>
          <ul class="guide-bullets">
            <li><strong>Baseline</strong> — every plant species ships a default spectrum shape when nothing is applied.</li>
            <li><strong>Chemical peaks</strong> — each treatment can add or sharpen peaks defined in its data.</li>
            <li><strong>Stress reshapes</strong> — the model bumps groups of peaks when defense, pigments, or damage signals are high — so Macro symptoms and Molecular bumps stay loosely in sync.</li>
            <li><strong>Wireframe plant</strong> — in Molecular view the 3D plant thins to lines so your eye spends attention on chemistry, not leaf texture.</li>
          </ul>

          <h3 class="guide-deep-h3" id="g-deep-chain">How it all hooks together (one chain)</h3>
          <ol class="guide-steps guide-chain">
            <li>You choose <strong>chemicals + dose + delivery + environment</strong>.</li>
            <li>The sim computes a <strong>stress vector</strong> (growth, color, wilting, defense, …).</li>
            <li>That vector feeds <strong>Macro</strong> (how the plant looks), <strong>Micro</strong> (how the three microbe roles behave), and <strong>Molecular</strong> (how peaks rise and fall), plus damage and death over time.</li>
          </ol>
          <p class="guide-deep-note">None of these panels is a microscope photograph or a real mass-spec file — they are <strong>linked teaching cartoons</strong> driven by the same state so learners can reason across scales.</p>
  `;
}

/** Plain-language glossary entries: term title, definition, in-lab usage. */
function glossaryHtml(): string {
  const items: Array<{ term: string; def: string; lab: string }> = [
    {
      term: "Mass spectrometry (and LC-MS)",
      def: "In real science, mass spectrometry weighs molecules very precisely. Often the sample is first separated by liquid chromatography (LC), then each fraction goes to the mass spectrometer (MS). Together that is called LC-MS.",
      lab: "Our Molecular view shows an LC-MS style chart: each bump (peak) stands for a kind of molecule or fragment. Taller peaks mean “more signal” in the simplified model—not a real instrument reading.",
    },
    {
      term: "m/z (mass-to-charge ratio)",
      def: "A number scientists put on the x-axis of a mass spectrum. It describes where a peak appears for a given ion. You do not need the math to use the lab—just think of it as a label for each bump on the chart.",
      lab: "Peaks are labeled with m/z and a short name (for example chlorophyll or a defense compound). Different plants and chemicals change which peaks grow or shrink.",
    },
    {
      term: "Metabolite",
      def: "A small molecule made inside a cell—sugars, amino acids, pigments, toxins, signaling molecules, and so on.",
      lab: "The LC-MS panel is a cartoon of which metabolite classes are more or less abundant under your treatment. It is meant to teach patterns, not to identify unknown real-world samples.",
    },
    {
      term: "Secondary metabolite",
      def: "Molecules a plant makes that are not strictly required for basic growth, but often help with stress, defense, or color (for example pigments and many flavor or scent compounds).",
      lab: "When you stress a plant or add certain chemicals, the model bumps “defense” and pigment-related peaks so the spectrum looks busier or shifted.",
    },
    {
      term: "Macro (scale)",
      def: "The big picture you can see with your eyes: whole plant shape, leaf count, color, wilting.",
      lab: "The 3D greenhouse is the Macro view. Use it to compare treatments at a glance.",
    },
    {
      term: "Micro (scale)",
      def: "Things too small to see without a microscope: cells, tissues, and the microbes living on and around the plant.",
      lab: "The Micro view shows a simplified community of bacteria-like dots on a leaf or near roots. It is a teaching picture of balance vs disturbance, not a real microscope image. On this same guide page, read the long section “Macro · Micro · Molecular” for what each dot color and the purple halos mean.",
    },
    {
      term: "Molecular (scale)",
      def: "The chemistry level: which kinds of molecules are relatively more or less abundant.",
      lab: "The Molecular view pairs the LC-MS chart with a wireframe plant so you remember you are still looking at the same experiment, just at chemistry zoom.",
    },
    {
      term: "Microbiome",
      def: "All the microorganisms (mostly bacteria and similar life) living in a place—in soil, on roots, or on leaf surfaces—together with how they interact.",
      lab: "Each bench has a modeled microbiome that reacts to stress, water, and which chemicals you picked.",
    },
    {
      term: "Phyllosphere",
      def: "The surface world of a leaf: the leaf itself plus the microbes and tiny particles sitting on it.",
      lab: "In the lab, “Phyllo” is the leaf-surface micro view.",
    },
    {
      term: "Rhizosphere",
      def: "The narrow zone of soil right around roots where roots leak food and microbes gather.",
      lab: "In the lab, “Rhizo” is the root-zone micro view.",
    },
    {
      term: "Diversity (microbial)",
      def: "How mixed a community is. High diversity usually means many kinds of microbes sharing the space; very low diversity can mean one or a few types took over.",
      lab: "The diversity number goes up or down as your treatment disturbs or stabilizes the community in the model.",
    },
    {
      term: "Pathogen (fraction)",
      def: "Microbes that can harm the plant if they grow too much—think of them as the “bad germs” in this simplified story.",
      lab: "The pathogen percentage rises when stress weakens the plant or chemicals shift the community toward opportunists in the simulation.",
    },
    {
      term: "Resistome",
      def: "A loose term for the collection of genes in a community that could help microbes survive antibiotics and similar drugs.",
      lab: "We show a single resistome score that goes up when pharmaceutical-type chemicals or strong disturbance push the model toward more resistance genes.",
    },
    {
      term: "VOC (volatile organic compound)",
      def: "Organic chemicals that easily enter the air as vapor. Many plant scents and industrial pollutants are VOCs.",
      lab: "Some treatments in the library are classic VOCs; others are metals, salts, or hormones. All are handled the same way in the picker—you choose what hits the plant.",
    },
    {
      term: "Chemical stress fingerprint",
      def: "A pattern of effects (growth, leaf color, wilting, defense, etc.) that a given chemical tends to cause in the model.",
      lab: "Each chemical in the data has a stress profile. Combining chemicals can blend or amplify those effects (see synergy).",
    },
    {
      term: "Synergy and antagonism",
      def: "Synergy: two things together hurt (or help) more than you would guess from each alone. Antagonism: together they partly cancel each other out.",
      lab: "Some chemical pairs in the data are marked as synergistic or antagonistic; the simulator nudges the combined stress up or down a bit when both are active.",
    },
    {
      term: "Delivery (liquid, gas, both)",
      def: "How the chemical reaches the plant: through soil or spray (liquid), through air (gas), or a mix.",
      lab: "Liquid vs gas changes which stress symptoms are emphasized in the model (for example more root-type damage vs more leaf-surface type damage). “Both” uses a middle path.",
    },
    {
      term: "Concentration / dose",
      def: "How strong the treatment is—more chemical usually means stronger effects up to the limits of the model.",
      lab: "The concentration slider scales how strongly the chemical stress profile applies over time.",
    },
    {
      term: "Control",
      def: "An experiment without the thing you are testing, so you have a baseline to compare against.",
      lab: "A bench with zero chemicals selected is a control for that species. Compare it to another tab with treatments.",
    },
    {
      term: "Bench (tab)",
      def: "One independent experiment setup—its own plant species, chemicals, sliders, and color.",
      lab: "Each tab at the top of the lab is one bench. You can add benches to compare many conditions.",
    },
    {
      term: "Plant sensitivity",
      def: "How strongly a species reacts to a specific chemical compared with an “average” response.",
      lab: "Every plant has a sensitivity table. The same cadmium dose might barely bother one species but devastate another—that is realistic in broad strokes.",
    },
    {
      term: "Baseline spectrum",
      def: "The LC-MS pattern you would expect from a healthy, untreated plant of that species in the model.",
      lab: "When no chemicals are on, peaks mostly follow the plant’s baseline. Adding chemicals layers extra peaks and shifts on top.",
    },
    {
      term: "Chlorosis",
      def: "Yellowing of leaves because chlorophyll (the green pigment) breaks down or is not replaced fast enough—often tied to nutrient problems or stress.",
      lab: "Higher chlorosis in the model makes leaves look more yellow-brown in the 3D view and feeds into damage over time.",
    },
    {
      term: "Necrosis",
      def: "Dead tissue: parts of the leaf or stem that have actually died and usually look brown or black.",
      lab: "High necrosis darkens stems and leaves. Dead plants in the model are shown with strong necrosis-like coloring.",
    },
    {
      term: "Wilting and turgor",
      def: "Turgor is internal water pressure that keeps leaves firm. Wilting is when that pressure drops and leaves go limp.",
      lab: "Low watering and some chemicals increase wilting in the model. It adds to the “damage” score that can eventually kill a plant.",
    },
    {
      term: "Stomatal closure",
      def: "Stomata are tiny pores on leaves for gas exchange. Under drought or some chemicals they close to save water, which also slows photosynthesis.",
      lab: "We use stomatal closure as one stress axis; it nudges wilting and how “dull” leaves look in the visualization.",
    },
    {
      term: "Leaf curl",
      def: "Leaves bending, cupping, or rolling—common under heat, drought, or some toxins.",
      lab: "Curl is its own stress axis and affects the 3D leaf pose.",
    },
    {
      term: "Pigmentation and anthocyanin",
      def: "Pigments are colored molecules in the plant. Anthocyanins are red-purple pigments many plants make under sun, cold, or stress.",
      lab: "The pigmentation axis can make leaves more purple-red in the model. It also feeds the LC-MS “defense / pigment” part of the story.",
    },
    {
      term: "Defense proteins (PR-like)",
      def: "Special proteins plants ramp up when they sense danger—pathogens, chewing insects, or some chemicals.",
      lab: "A higher defense score influences microbiome readouts and molecular peaks in a simplified way.",
    },
    {
      term: "Height suppression",
      def: "The plant still lives but does not grow as tall as it could—common under toxins, shade stress, or some hormones.",
      lab: "This axis shrinks the 3D stem and overall size in the model.",
    },
    {
      term: "Cumulative damage",
      def: "Harm that adds up day after day while stress stays high, instead of resetting every morning.",
      lab: "Each virtual plant tracks damage over the timeline. If it crosses the species-specific limit, that plant dies in the simulation.",
    },
    {
      term: "Mortality",
      def: "Death rate or, here, whether an individual virtual plant has crossed the point of no return.",
      lab: "Dead plants stop growing, drop most leaves, and do not recover even if you later remove the chemical.",
    },
    {
      term: "Recovery",
      def: "Living tissue getting better after stress goes away—lighter symptoms, greener leaves, lower damage score.",
      lab: "If you lower concentration or switch to a gentler setup before death, surviving plants can heal in the model. Dead plants cannot.",
    },
    {
      term: "Random error mode",
      def: "Real experiments always have plant-to-plant variation (genetics, micro-climate, soil clumps).",
      lab: "Turning random errors on adds that kind of noise so a bench of many plants looks more like real data.",
    },
    {
      term: "Weekly recap",
      def: "A written summary of what happened that week in each category (macro, micro, molecular, overall).",
      lab: "You choose which recap sections are on. It reads numbers from the same simulation driving the graphics.",
    },
    {
      term: "Anomaly",
      def: "A sudden one-off event—like a hot-day scorch spot or a random wilt patch.",
      lab: "With random errors on, individual plants can occasionally get a small extra bump of stress for realism.",
    },
  ];

  return items
    .map(
      (e) => `
    <div class="gloss-item">
      <h3 class="gloss-term">${escapeHtml(e.term)}</h3>
      <p class="gloss-def">${escapeHtml(e.def)}</p>
      <p class="gloss-lab"><span class="gloss-lab-label">In this lab:</span> ${escapeHtml(e.lab)}</p>
    </div>`,
    )
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
