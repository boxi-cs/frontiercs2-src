// L05 content, adapted from frontiercs2/notes/L05-theory.md (checked by tools/check.py).

const demo = (name, title, instr, hint = "") =>
  `<div class="card demo" data-demo="${name}"><div class="head"><span class="title">${title}</span><span>${instr}</span></div>
   <div class="demo-body"></div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const callout = (kind, label, body) => `<div class="callout ${kind}"><b>${label}</b>${body}</div>`;
const predict = (q, a) => callout("predict", "PREDICT", `<p>${q}</p><details class="reveal"><summary>Show the answer</summary>${a}</details>`);
const out = (name) => codeBlock(OUT[name], "out");
const code = (name) => codeBlock(CODE[name]) + (OUT[name] ? out(name) : "");
const pass = '<span class="chip pass">Pass</span>', fail = '<span class="chip fail">Fail</span>';
const TASK = "https://frontier-cs.org/task/#";
const SLUG = "binary-fuse-filter-construction-and-lookup";

const LECTURE = {
  number: 5,
  title: "Theory",
  tagline: "Three slots, one XOR, and a fuse that burns from both ends",
  lead: "The Theory task of FrontierCS 2: building a binary fuse filter, a set-membership filter within 13% of the memory lower bound. We build up to it from a Bloom filter and an xor filter, then look at how the task is judged and what the agents wrote.",
  heroDemo: "fuseAuto",
  heroLabel: "Binary fuse filter · peeling 2,000 keys",
  heroCaption: "The thinly used end segments peel first; the fronts burn toward the middle.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the Theory task teaches",
  why: [
    ["Theory sets the size", "The lower bound is <b>log2(1/ε) bits per key</b>. Bloom filters spend 44% more, xor filters 23%, binary fuse filters <b>13%</b>."],
    ["Peeling is simple and fragile", "It works only above a <b>threshold</b> of slots per key, and never with a repeated key."],
    ["Every workload must win", "The passing runs <b>halved construction time</b>. One slow lookup stream out of 144 was enough to fail."],
  ],
  ctaTitle: "Ready to build a filter?",
  minutes: "About 60 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-bloom", nav: "Bloom filter", title: "Approximate Membership and the Bloom Filter",
    subtitle: "Never miss a stored key; rarely accept an absent one",
    abstract: "A filter answers \"is x in the set?\" with no false negatives and a small false-positive rate ε. Any such filter needs log2(1/ε) bits per key. A Bloom filter needs 44% more; the filters of this lecture get closer.",
    tags: ["approximate membership", "false positives", "Bloom filter", "lower bound"],
    hero: "code:bits", heroCaption: "Bits per key for two false-positive rates",
    sections: [
      { id: "idea", title: "Approximate membership", html: `
        <p>A <b>filter</b> answers one question about a set <code>S</code> of keys: is <code>x</code> in <code>S</code>? It may say "yes" for a key that is not in <code>S</code> (a <b>false positive</b>), with a small probability <code>ε</code>, but it never says "no" for a key that is in <code>S</code>. Engineers put a filter in front of something slow, a disk or a network, so most lookups of absent keys stop early.</p>
        <p>A filter stores much less than the keys themselves. Any filter with false-positive rate <code>ε</code> needs at least <code>log2(1/ε)</code> bits per key; for <code>ε = 1/256</code>, that is 8 bits.</p>
        <p>FrontierCS 2 has one Theory task, <b>Binary Fuse Filter</b>, from Graf and Lemire's paper <em>Binary Fuse Filters: Fast and Smaller Than Xor Filters</em> (ACM JEA 2022). With one task, this lecture goes deeper than the others: from a Bloom filter, to an xor filter built by peeling a hypergraph, to the binary fuse layout, and then to the task and what the agents wrote. The Python programs are ours; every output shown is the real output.</p>` },
      { id: "keys", title: "Keys and a hash", html: `
        <p>Our keys are 31-bit integers from a small generator, exact in JavaScript too. <code>hash32</code> scrambles a key with a seed into 32 random-looking bits (it ends with MurmurHash3's finalizer). Different seeds give independent-looking hashes.</p>
        ${code("keys")}` },
      { id: "bloom", title: "A Bloom filter", html: `
        <p>A <b>Bloom filter</b> (Bloom, 1970) is an array of <code>m</code> bits. To add a key, set the bits at <code>k</code> hashed positions. To look one up, check that all <code>k</code> bits are set. A stored key always finds its bits set; an absent key passes only if other keys happened to set all <code>k</code> of its bits.</p>
        ${code("bloom")}
        ${predict("With 8 bits per key, would more hashes always help?", "<p>No. More hashes check more bits, but also set more bits, so the array fills up. The best <code>k</code> is about 0.69 × bits per key, here 5 or 6. Try k = 10 in the demo.</p>")}
        ${demo("bloom", "Demo 1 · A Bloom filter of 1,000 keys", "move the sliders", "The strip shows the first 256 bits. Near the best k, about half the bits are set.")}` },
      { id: "bits", title: "How far from the lower bound", html: `
        <p>With 8 bits per key, the Bloom filter's false-positive rate is about 2%, five times the 1/256 that 8 bits allow in principle. The best Bloom filter needs <code>1.44 log2(1/ε)</code> bits per key: 44% above the lower bound. Xor filters cut this to 23%, and binary fuse filters to 13% (paper's abstract):</p>
        ${code("bits")}
        <p>A Bloom filter also reads <code>k</code> scattered bits per lookup. The two newer filters read exactly three slots and XOR them.</p>` },
    ],
    takeaways: ["No false negatives; false positives at rate ε.", "Lower bound: log2(1/ε) bits per key.", "Bloom +44%, xor +23%, binary fuse +13%."],
  },
  {
    slug: "2-xor", nav: "Xor filter", title: "The Xor Filter: Peeling a Hypergraph",
    subtitle: "Three slots per key, one equation per key, solved by peeling",
    abstract: "An xor filter stores a table B so that the three slots of every key XOR to its fingerprint. Construction peels the keys one by one from slots they use alone, then fills the table in reverse. Peeling works only with about 1.23 slots per key or more.",
    tags: ["xor filter", "fingerprint", "3-hypergraph", "peeling", "threshold"],
    hero: "peelAuto", heroCaption: "Peel the 8 keys, then fill their slots in reverse.",
    sections: [
      { id: "idea", title: "Three slots and a fingerprint", html: `
        <p>An <b>xor filter</b> (Graf and Lemire, 2020) stores a table <code>B</code> of small values, each <code>b</code> bits. Every key has a <code>b</code>-bit <b>fingerprint</b> <code>f(x)</code> and three slots <code>h0(x)</code>, <code>h1(x)</code>, <code>h2(x)</code>, one in each third of the table. Construction must fill <code>B</code> so that, for every stored key,</p>
        <p style="text-align:center"><code>B[h0(x)] ⊕ B[h1(x)] ⊕ B[h2(x)] = f(x)</code></p>
        <p>A lookup computes the three slots and the fingerprint, and answers "yes" when the equation holds. A stored key always passes. An absent key passes when three unrelated table values happen to XOR to its fingerprint, with probability <code>2<sup>−b</sup></code>: 1/256 for 8-bit fingerprints.</p>` },
      { id: "peeling", title: "Peeling", html: `
        <p>Each key is an edge joining three slots: the keys form a <b>3-hypergraph</b> on the slots. Filling <code>B</code> means solving one XOR equation per key. <b>Peeling</b> solves them without any algebra:</p>
        <ol><li>Count, for every slot, how many keys use it, and keep the XOR of those keys.</li>
        <li>A slot used by exactly one key belongs to that key alone. Remove the key from its three slots (the XOR of the remaining keys tells exactly which key it was) and remember the pair (key, slot). Removing it may leave other slots with one key; repeat.</li>
        <li>If every key was removed, go back through them in <b>reverse</b> order. Each key's own slot is still free, so set it to whatever makes the key's equation hold. Keys peeled earlier only touch slots that are set later, so no equation is broken.</li></ol>
        ${code("build")}
        <p>Here are 8 keys in 12 slots. The first seed that peels completely is kept; a real filter retries with a new seed in the same way.</p>
        ${code("small")}
        ${demo("peel", "Demo 2 · Peel 8 keys, then fill the table", "step through", "Underlined: the slot each key was peeled from, which it alone sets.")}` },
      { id: "lookups", title: "Lookups and false positives", html: `
        ${code("lookup")}
        <p>The 1,000-key filter has 1,263 slots, 1.23 per key plus 32, and its false-positive rate is close to 1/256.</p>` },
      { id: "threshold", title: "Why 1.23 slots per key", html: `
        <p>Peeling needs a slot with one key to start and keeps finding new ones as keys are removed. With too few slots, it gets stuck: every remaining slot is shared by two or more keys (a <b>2-core</b> remains). For random 3-hypergraphs, there is a sharp threshold near 1.222 slots per key. With 2,000 keys:</p>
        ${code("threshold")}
        ${demo("threshold", "Demo 3 · The peeling threshold", "move the slider")}
        <p>At 2,000 keys the threshold is still blurred; with millions of keys it becomes a cliff. Below it, retrying seeds does not help. So an xor filter spends 1.23 × 8 = 9.84 bits per key for <code>ε = 1/256</code>.</p>` },
    ],
    takeaways: ["B[h0] ⊕ B[h1] ⊕ B[h2] = f(x).", "Peel slots used by one key; fill in reverse.", "Needs about 1.23 slots per key."],
  },
  {
    slug: "3-fuse", nav: "Binary fuse", title: "The Binary Fuse Filter",
    subtitle: "Three nearby segments instead of three thirds",
    abstract: "The binary fuse filter changes only where a key's three slots go: three consecutive segments of a table cut into many. Peeling then starts at the thinly used ends and burns inward, and succeeds with fewer slots per key: 1.13 at a million keys.",
    tags: ["binary fuse filter", "segments", "fuse graph", "cache locality"],
    hero: "code:layout", heroCaption: "The layout, as the library's header computes it",
    sections: [
      { id: "layout", title: "The layout", html: `
        <p>The binary fuse filter changes only where a key's three slots go. The table is cut into many equal <b>segments</b> of length <code>L</code>, a power of two. A key picks one starting segment at random, and its three slots lie in that segment and the next two, at random offsets. This layout comes from the <b>fuse graphs</b> of Dietzfelbinger and Walzer (2019).</p>
        <p>The library's public header chooses the segment length and the number of slots per key from the number of keys <code>n</code>. Here are its formulas, for three slots per key:</p>
        ${code("layout")}
        <p>(The real hash places the first slot anywhere in the first <code>starts</code> segments, then shifts by whole segments and scrambles the low bits. Ours picks a segment and three offsets; the shape is the same.)</p>` },
      { id: "fewer", title: "Peeling with fewer slots", html: `
        <p>At 200,000 keys the header asks for 1.167 slots per key. An xor filter of that size cannot peel; the same keys in the fuse layout can:</p>
        ${code("fusevsxor")}
        ${predict("The header gives 10,000 keys 1.254 slots per key, more than an xor filter's 1.23. Why would a small filter need more?", "<p>The fuse layout's advantage grows with the number of segments. A small table has few of them, and peeling needs a safety margin, so the header adds slots. At a million keys the factor falls to 1.13.</p>")}` },
      { id: "fuse", title: "Why it is called a fuse", html: `
        <p>The first segment can only hold a key's first slot, and the last segment only its third slot, so the two ends are thinly used. Peeling starts there, and each removed key frees slots one segment further in, like a fuse burning toward the middle. Here is the average peeling time of each segment, as a percentage of the whole run, for 2,000 keys:</p>
        ${code("burn")}
        ${demo("fuse", "Demo 4 · Watch the fuse burn", "replay or switch layout", "Each bar is 16 slots; its height is how many of them have been peeled so far.")}
        <p>The ends finish first and the middle last. Because a key's three slots are close together, the table is also friendlier to the cache, which is one reason construction can be more than twice as fast as for xor filters (paper's abstract).</p>` },
    ],
    takeaways: ["Three slots in three consecutive segments.", "Thin ends peel first and burn inward.", "1.13 slots per key at a million keys."],
  },
  {
    slug: "4-task", nav: "Task & results", title: "The Task: Construction, Judged Five Ways",
    subtitle: "What the agent writes, the 144 workloads, and what the agents did",
    abstract: "The task removes the construction of 8-bit and 16-bit binary fuse filters. A pass must beat the reference's memory, build time and lookup time on all 144 workloads without a measurably worse false-positive rate or space overhead. Three of sixteen models passed.",
    tags: ["construction", "pass rule", "score", "FDI 48.3"],
    hero: "code:score", heroCaption: "The score, from Claude Opus 5.5's means",
    sections: [
      { id: "writes", title: "What the agent writes", html: `
        <p>The task keeps the library's allocation, lookup and serialization, and removes the <b>population</b> routines, the step that fills the table, for 8-bit and 16-bit fingerprints. (The xor filter's construction is removed too, so it cannot serve as an answer; it is not scored.) The agent writes <code>binary_fuse8_populate</code> and <code>binary_fuse16_populate</code>. It may also change the filter's struct, its hash and its lookup, changing up to 32 files under <code>include/</code>, as long as the API stays the same and every byte the filter keeps is allocated through <code>malloc</code> and friends, where the evaluator counts it.</p>` },
      { id: "judged", title: "How it is judged", html: `
        <p>Filters hold 10,000, 100,000 or 1,000,000 distinct keys from three families of key patterns, with both fingerprint widths. Each answers four query streams: 0%, 50%, 25% and 100% stored keys. With a development seed and a private one, that makes 144 workloads. Every stored key must be found, and false positives must stay under an allowance. For <code>m</code> absent queries and <code>b</code>-bit fingerprints:</p>
        ${code("allowance")}
        <p>Five metrics are measured against the human reference (the authors' library) on the same machine, five times each: <b>memory</b> kept by the filter, <b>construction time</b>, <b>lookup time</b> per query, the <b>false-positive rate</b>, and the <b>space overhead</b> <code>100 × (bits per key / log2(1/ε) − 1)</code>. The reference's memory follows from its layout. Its table has one byte per slot (two at 16 bits), plus a 40-byte struct:</p>
        ${code("memory")}
        <p>These match the leaderboard's reference row closely: 616.2 KiB, a measured 1.964 × 10<sup>−3</sup>, and 19.1% measured overhead (ours uses the nominal rate). Small filters pay more overhead, since the header gives them more slots per key.</p>` },
      { id: "score", title: "The pass rule and the score", html: `
        <p><b>Pass rule.</b> To pass, a run must be strictly better than the reference on memory, construction time and lookup time on <b>every</b> workload, and the false-positive rate and space overhead must not be measurably worse (a statistical guard against private anchors). The <b>score</b> is the mean of <code>100 × R / (C + R)</code> over all workloads and the three timed or counted metrics, where <code>C</code> is the run's value and <code>R</code> the reference's. A copy of the reference scores about 50. With the means of Claude Opus 5.5's run and of the reference measured in that run:</p>
        ${code("score")}
        ${demo("score", "Demo 5 · Score one workload", "edit the numbers")}
        <p>The task page gives 57.2. Twice as fast a build is worth 66.7 on that metric; a tie is worth 50. The memory term is nearly a tie: the table's size is fixed by the layout, so the only bytes to win are in the struct.</p>` },
      { id: "results", title: "What the agents did", html: `
        <p>Three of sixteen models passed; fourteen scored above the human reference (50.0). FDI 48.3 puts the task 29th hardest of 48.</p>
        <table><tr><th>Run</th><th>Build (ms)</th><th>Lookup (ns)</th><th>Memory (KiB)</th><th>FPR (×10<sup>−3</sup>)</th><th>Overhead (%)</th><th>Score</th><th></th></tr>
        <tr><td>Human reference</td><td>18</td><td>3.95</td><td>616.2</td><td>1.964</td><td>19.1</td><td>50.0</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>9.24</td><td>3.56</td><td>616.1</td><td>1.957</td><td>19.2</td><td>57.2</td><td>${pass}</td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>9.63</td><td>3.38</td><td>616.1</td><td>1.958</td><td>19.1</td><td>55.3</td><td>${pass}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>14.9</td><td>3.08</td><td>616.1</td><td>1.961</td><td>19</td><td>53.9</td><td>${fail}</td></tr>
        <tr><td>GPT-6 Astra</td><td>14.6</td><td>3.81</td><td>616.1</td><td>1.964</td><td>19.3</td><td>52.8</td><td>${pass}</td></tr>
        <tr><td>Kimi K3</td><td>15.8</td><td>3.84</td><td>616.2</td><td>1.964</td><td>19.2</td><td>50.4</td><td>${fail}</td></tr></table>
        <p class="meta">Means over the 144 hidden workloads, as of October 26, 2026. <a href="${TASK}${SLUG}" target="_blank" rel="noopener">Full table ↗</a></p>
        <p><b>Claude Opus 5.5</b> had the best score. Its solution, from the task page, has five parts:</p>
        <ol><li><em>Hash and layout.</em> Multiply the key by a random odd seed and fold the two halves of the 128-bit product. The high half picks the first slot; the fingerprint comes from other bits of the same product. The struct keeps fewer fields, which is where the memory win comes from.</li>
        <li><em>Counting and peeling.</em> For every slot, a count and the XOR of the keys' hashes, as in our <code>build</code>. The peeling queue is filled without branches, so the processor can overlap the work.</li>
        <li><em>Segment by segment.</em> For large sets, group the keys by the segment of their first slot. A segment is complete once its group has been added, so peeling runs right behind the adding while the data is still in cache. Incomplete segments carry a large extra count so they cannot look peelable.</li>
        <li><em>Assigning fingerprints</em> in reverse peeling order, prefetching the next keys' slots for large tables.</li>
        <li><em>Repeated keys,</em> below.</li></ol>` },
      { id: "repeats", title: "Repeated keys", html: `
        <p>The task promises distinct keys, but a robust construction must not loop forever if a key repeats. Two copies of a key always share all three slots: each slot counts at least 2, and their XOR cancels. They can never be peeled, whatever the seed.</p>
        ${code("dup")}
        <p>Checking for repeats means sorting, which is slow, so Claude Opus 5.5 sorts only when a failed attempt leaves a slot whose two keys have equal hashes, or after a few failures.</p>
        ${callout("pitfall", "A TIE IS NOT A WIN", "<p>Kimi K3, Gemini 4 Argon · Pi and Step 5 Preview kept exactly the reference's memory, 616.2 KiB, and so won memory on 0 of 144 workloads. GPT-6.1 Sol had the fastest lookups on average (3.08 ns) but was slower than the reference on 1 of 144 workloads, and failed.</p>")}` },
    ],
    takeaways: ["The agent writes populate, for 8 and 16 bits.", "Win memory, build and lookup on all 144 workloads.", "Best: Claude Opus 5.5, 57.2; 3 of 16 pass."],
  },
  {
    slug: "5-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>Bloom filter</h3><ul><li>k hashed bits per key</li><li>Rate (1 − e<sup>−kn/m</sup>)<sup>k</sup></li><li>44% above log2(1/ε)</li></ul></div>
        <div class="card"><h3>Xor filter</h3><ul><li>Three slots XOR to the fingerprint</li><li>Peel, then fill in reverse</li><li>1.23 slots per key</li></ul></div>
        <div class="card"><h3>Binary fuse filter</h3><ul><li>Three consecutive segments</li><li>Burns inward from the ends</li><li>1.13 slots per key at 10<sup>6</sup> keys</li></ul></div>
        <div class="card"><h3>The task</h3><ul><li>Write populate (8 and 16 bits)</li><li>Win all 144 workloads, three metrics</li><li>3 of 16 passed; best 57.2</li></ul></div></div>` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★ (experiment)</h3>
        <p>Change the Bloom filter to <code>k = 3</code> and <code>k = 8</code> hashes. Which gives the fewest false positives at 8 bits per key? Compare with 0.69 × 8.</p>
        <details class="reveal"><summary>Solution</summary><p>Of 100,000 absent keys, k = 3 accepts 3,193 and k = 8 accepts 2,466, both worse than k = 5 (2,063). k = 6 is best, with 2,007: 0.69 × 8 ≈ 5.5.</p></details>
        <h3>Exercise 2 ★ (by hand)</h3>
        <p>Peel the 8-key example by hand from the slot lists, and check the table against <code>contains</code>. (Demo 2 shows each step.)</p>
        <h3>Exercise 3 ★★ (experiment)</h3>
        <p>In the threshold experiment, use 20,000 keys. Is the cliff sharper?</p>
        <h3>Exercise 4 ★★ (modify)</h3>
        <p>Use <code>xor_where</code> with 1.17 slots per key for the 200,000 keys, and <code>fuse_where</code> with 1.10. What happens, and why?</p>
        <details class="reveal"><summary>Solution</summary><p>Both get stuck. 1.17 is below the xor filter's threshold of about 1.222, and 1.10 is below what the fuse layout needs at 200,000 keys; only with many more keys does its threshold approach 1.125 and below.</p></details>
        <h3>Exercise 5 ★ (by hand)</h3>
        <p>A run builds twice as fast, looks up 10% slower and ties on memory. What is its score on one workload, and does it pass?</p>
        <details class="reveal"><summary>Solution</summary><p>(66.7 + 47.6 + 50.0) / 3 = 54.8, above the reference's 50. It fails twice over: it loses lookup time, and a tie on memory is not a win.</p></details>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li>T. M. Graf, D. Lemire. <em>Binary Fuse Filters: Fast and Smaller Than Xor Filters.</em> ACM JEA 2022. <a href="https://arxiv.org/abs/2201.01174" target="_blank" rel="noopener">arXiv 2201.01174</a></li>
        <li>T. M. Graf, D. Lemire. <em>Xor Filters: Faster and Smaller Than Bloom and Cuckoo Filters.</em> ACM JEA 2020. <a href="https://arxiv.org/abs/1912.08258" target="_blank" rel="noopener">arXiv 1912.08258</a></li>
        <li>M. Dietzfelbinger, S. Walzer. <em>Dense Peelable Random Uniform Hypergraphs.</em> ESA 2019. <a href="https://arxiv.org/abs/1907.04749" target="_blank" rel="noopener">arXiv 1907.04749</a></li>
        <li>B. H. Bloom. <em>Space/Time Trade-offs in Hash Coding with Allowable Errors.</em> CACM 1970.</li>
        <li>The library: <a href="https://github.com/FastFilter/xor_singleheader" target="_blank" rel="noopener">FastFilter/xor_singleheader</a></li>
        <li>Task page: <a href="${TASK}${SLUG}" target="_blank" rel="noopener">Binary Fuse Filter</a></li></ul>` },
    ],
    takeaways: ["Theory sets the size.", "Peeling is simple and fragile.", "Every workload must win."],
  },
];

const QUIZ = [
  { q: "A filter has false-positive rate ε = 1/65,536. At least how many bits per key does it need?",
    opts: ["8", "16", "23", "65,536"],
    a: 1, why: "log2(1/ε) = log2(65,536) = 16. A Bloom filter would need about 1.44 × 16 = 23." },
  { q: "During peeling, a slot has count 1 and mask 0x2A71. What does that tell you?",
    opts: ["The slot is empty", "The only key left in the slot is 0x2A71", "Two keys cancel there", "Peeling is stuck"],
    a: 1, why: "The mask is the XOR of the keys still using the slot. With one key left, the mask is that key." },
  { q: "Why does the second phase assign slots in <b>reverse</b> peeling order?",
    opts: ["It is faster in memory", "A key's own slot is untouched by keys peeled before it, so setting it last breaks no equation", "To shuffle the keys", "The fingerprints are sorted"],
    a: 1, why: "Keys peeled earlier only use slots that later keys still share; going backward, each key's own slot is set after its other two are final." },
  { q: "What lets a binary fuse filter peel with fewer slots per key than an xor filter?",
    opts: ["Longer fingerprints", "Its three slots lie in three consecutive segments, so peeling starts at the thin ends and spreads", "It uses four slots per key", "It sorts the keys first"],
    a: 1, why: "The end segments are thinly used, so peeling always has a start there and burns inward like a fuse." },
  { q: "GPT-6.1 Sol had the fastest mean lookup time. Why did it fail?",
    opts: ["Too many false positives", "It was slower than the reference on 1 of 144 workloads", "It used more memory", "Its score was below 50"],
    a: 1, why: "A pass needs a strict win on every metric of every workload. One slow lookup stream is enough to fail." },
];
