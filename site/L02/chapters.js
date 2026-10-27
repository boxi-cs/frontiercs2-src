// L02 content, adapted from frontiercs2/notes/L02-hpc.md (checked by tools/check.py).

const demo = (name, title, instr, hint = "") =>
  `<div class="card demo" data-demo="${name}"><div class="head"><span class="title">${title}</span><span>${instr}</span></div>
   <div class="demo-body"></div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const callout = (kind, label, body) => `<div class="callout ${kind}"><b>${label}</b>${body}</div>`;
const predict = (q, a) => callout("predict", "PREDICT", `<p>${q}</p><details class="reveal"><summary>Show the answer</summary>${a}</details>`);
const out = (name) => codeBlock(OUT[name], "out");
const code = (name) => codeBlock(CODE[name]) + (OUT[name] ? out(name) : "");
const pass = '<span class="chip pass">Pass</span>', fail = '<span class="chip fail">Fail</span>';
const TASK = "https://frontier-cs.org/task/#";

const LECTURE = {
  number: 2,
  title: "HPC",
  tagline: "A sort in place, exact clusters, a peeled hypergraph and a butterfly count",
  lead: "The four HPC tasks of FrontierCS 2, all from Julian Shun's group at MIT: in-place parallel radix sorting, exact DBSCAN, hypergraph core numbers and butterfly counting. The papers share one aim, work-efficient parallelism. For each task: the idea, the part the task removed, how a run is judged, and what the agents did.",
  heroDemo: "regionsAuto",
  heroLabel: "RegionsSort · swaps from the regions graph",
  heroCaption: "Each swap sends one range of keys home. The swaps of one bucket touch disjoint ranges, so they run in parallel.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the HPC tasks teach",
  why: [
    ["Work first, then threads", "Each paper cuts the <b>total work</b> before it adds threads. Hygra checks this directly with a <b>one-thread</b> time."],
    ["Every workload counts", "The best scores on RegionsSort and Parallel DBSCAN <b>failed</b>, each on one of twelve inputs."],
    ["A pass is decided in its own run", "The reference is timed again in every run. Runs passed with scores <b>below</b> the reference's row."],
  ],
  ctaTitle: "Ready to plan the swaps of a radix sort?",
  minutes: "About 70 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-regionssort", nav: "RegionsSort", title: "RegionsSort: Sorting in Place",
    subtitle: "A graph of misplaced keys, and swaps that run in parallel",
    abstract: "Regions Sort puts every key in its bucket without a second array. Misplaced ranges form a regions graph, and 2-paths in it give swaps that can run at once. The task removes the swap planner; a pass must beat the reference's sort time on all twelve arrays.",
    tags: ["radix sort", "in place", "regions graph", "FDI 60.5"],
    hero: "regionsAuto", heroCaption: "Each swap sends a range of keys home; a 2-cycle sends both sides home.",
    sections: [
      { id: "idea", title: "Radix sort, in place", html: `
        <p>A <b>radix sort</b> sorts integers digit by digit. A most-significant-digit sort puts every key in a <b>bucket</b> by its top digit (eight bits in the task, so 256 buckets), then sorts each bucket by the next digit. The fast parallel versions copy the keys into a second array, which doubles the memory. In place, each key must be <em>swapped</em> to its bucket, and the swaps depend on one another.</p>
        <p><b>Regions Sort</b> (Obeya, Kahssay, Fan and Shun, SPAA 2019) turns these dependences into a graph and finds swaps that can run in parallel. It needs only O(K log r log n) extra memory for K blocks, and it is <b>work-efficient</b>: O(n log r) work, as much as a serial radix sort.</p>` },
      { id: "countries", title: "Blocks, countries and regions", html: `
        <p>Our toy has 40 keys of 8 bits. The digit is the top two bits, so there are four buckets, and the array is cut into K = 4 <b>blocks</b> of 10. First, each block sorts its own keys by digit; the blocks are independent, so this runs in parallel. Then counting gives each bucket its final interval, its <b>country</b>.</p>
        ${code("setup")}
        <p>Country 0 is positions 0–8, so it should hold only 0s. It holds 001123333 instead: two 1s, a 2 and four 3s are misplaced. A <b>region</b> is a run of keys of one bucket inside one block and one country. Each misplaced region becomes an edge of the <b>regions graph</b>: an edge <code>i -> j</code> of weight <code>w</code> says that <code>w</code> keys in country <code>i</code> belong to bucket <code>j</code>.</p>
        ${code("graph")}
        <p>For every vertex, the weights in equal the weights out: country 0 holds 7 foreign keys, and 7 keys of bucket 0 sit in other countries (3 + 3 + 1). This is the lemma the paper builds on.</p>` },
      { id: "swaps", title: "Swaps from 2-paths", html: `
        <p>The paper processes the graph along <b>2-paths</b>. Take two edges <code>x -> b</code> and <code>b -> y</code>. The first is a range of b's keys in country x; the second is a range of y's keys in country b. Swap equal-length parts of the two ranges. Now b's keys are home. The y keys have moved to country x: a new edge <code>x -> y</code>, unless <code>x == y</code>, when both sides land home at once (a <b>2-cycle</b>). Each swap is one record of the task's interface, <code>Triangle{from, to, offset1, offset2, amount}</code>.</p>
        <p>Here we plan one bucket at a time, the way Claude Opus 5.5 did: all 2-paths through bucket <code>b</code>, with 2-cycles preferred. The swaps that complete one bucket touch disjoint ranges, so they can all run at once, in one parallel round.</p>
        ${code("plan")}
        ${demo("regions", "Demo 1 · Plan the swaps", "step through the plan", "Faded keys are not yet in their country. The highlighted ranges are the last swap.")}
        <p>The first swap, <code>(10, 2, 2)</code>, is a 2-cycle: two 0s at positions 10–11 trade places with two 1s at 2–3. The last bucket needs no swaps: once the other three are complete, it is too. Then the sort recurses into each country with the next digit.</p>` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task keeps the sorter, the executor that performs the swaps, and the recursion. It removes the bodies of the region-graph planner in <code>EdgeListGraph</code>: turning two edges into one swap, extracting the swaps of a node, and updating the graph after a swap is done. All swaps returned in one call run concurrently, so no array position may appear in two of them.</p>
        <p>Each submission sorts twelve arrays: unsigned 32-bit keys or key–payload records, uniform, skewed, repeated or nearly sorted: eight arrays of 2.4 to 3.2 million elements, plus four arrays of 16 million keys. On four cores, a pass needs three things on <b>every</b> array: a lower median sort time than the reference, a lower median time inside the region-graph code, and extra memory of at most 5% of the input, the bound the paper states. The score rewards speed over <code>std::sort</code>, the serial sort of the C++ library, through a geometric-mean speedup <code>S</code> on the eight original arrays. ParButterfly uses the same formula.</p>
        ${code("score")}
        <p>A tenfold speedup scores 50. The reference sorts about ten times faster than <code>std::sort</code>, and the best run about 11.5 times.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <table><tr><th>Run</th><th>Extra memory (KiB)</th><th>Region-graph time (ms)</th><th>Sort time (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>701</td><td>6</td><td>18.9</td><td>50.2</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>516</td><td>1.82</td><td>18.2</td><td>51.5</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>861</td><td>2.65</td><td>18.5</td><td>51.3</td><td>${fail}</td></tr>
        <tr><td>GLM 5.3</td><td>700</td><td>2.66</td><td>18.5</td><td>51.1</td><td>${pass}</td></tr>
        <tr><td>Step 5 Preview</td><td>700</td><td>2.56</td><td>18.5</td><td>51.1</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>780</td><td>2.79</td><td>20.3</td><td>49.8</td><td>${fail}</td></tr></table>
        <p class="meta">Selected rows; the full table is on the task page. Means over the twelve hidden arrays, as of October 26, 2026. Two of sixteen passed; nine scored above the reference. <a href="${TASK}regionssort" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Every one of the sixteen runs beat the reference's region-graph time on all twelve arrays, most by a factor of two or more. The pass was decided by the whole sort. The planner is a small part of a sort call: the reference spends about 6 ms in it, summed over four workers, in a call that takes about 19 ms. Gemini 4 Argon · Antigravity, with the best score, was faster than the reference on eleven of twelve arrays and failed. Claude Opus 5.5 was faster on seven.</p>
        <p><b>Claude Opus 5.5</b> planned one bucket at a time, as in our model: it paired every key of the bucket held elsewhere with every misplaced slot of the bucket's own interval, took 2-cycles first, filled the rest in address order, and fused swaps that continue each other into one. Its last step was to <b>defer the graph updates</b>: the ranges that the swaps leave in other countries are recorded only after the caller has started sorting the finished bucket, in small per-bucket lists, and large scratch buffers are freed, which keeps the extra memory low.</p>
        ${callout("pitfall", "A FASTER PART IS NOT A FASTER WHOLE", "<p>Making the removed component twice as fast left the sort within a few percent of the reference, where small effects decide each array. The two passing runs won all twelve arrays with mean sort times of 18.5 ms.</p>")}` },
    ],
    takeaways: ["Misplaced ranges form a regions graph.", "A 2-path gives one swap; a bucket's swaps run at once.", "Pass = faster sort on all twelve arrays."],
  },
  {
    slug: "2-dbscan", nav: "Parallel DBSCAN", title: "Parallel DBSCAN: Exact Clusters on a Grid",
    subtitle: "Cells of side ε/√d, and union-find over the core cells",
    abstract: "DBSCAN clusters dense regions and marks the rest as noise. A grid of cells of side ε/√d makes every point in a cell a neighbor of the others, so only nearby cells need distance tests. The task removes the step that links core cells; a pass must be faster on all twelve point sets.",
    tags: ["DBSCAN", "grid", "union-find", "FDI 42.1"],
    hero: "dbscan", heroCaption: "Shaded cells hold core points. Move ε and watch the clusters and the test counts.",
    sections: [
      { id: "idea", title: "Density clustering", html: `
        <p><b>DBSCAN</b> finds clusters as dense regions. A point is <b>core</b> if at least <code>minPts</code> points, itself included, lie within distance ε. Two core points are in the same cluster when a chain of core points joins them, each step at most ε. A non-core point within ε of a core point is a <b>border</b> point; any other point is <b>noise</b>. Done naively, DBSCAN compares every pair of points: O(n²) work.</p>
        <p><em>Theoretically-Efficient and Practical Parallel DBSCAN</em> (Wang, Gu and Shun, SIGMOD 2020) gives exact parallel algorithms that are work-efficient in two dimensions and fast in higher ones.</p>` },
      { id: "plain", title: "The plain algorithm", html: `
        <p>Our toy has 80 points in the plane: three clusters of 22 points each and 14 points of uniform noise, with ε = 0.6 and <code>minPts</code> = 4. The plain algorithm is our oracle: it counts neighbors by comparing every pair, then grows each cluster from a core point.</p>
        ${code("oracle")}` },
      { id: "grid", title: "Cells of side ε/√d", html: `
        <p>The paper puts the points in a grid of cells of side ε/√d, here ε/√2. The diagonal of a cell is ε, so any two points in one cell are neighbors. A cell's neighbors are the few cells close enough to hold a point within ε. The step the task removed comes next: <b>link the core cells</b>. Two core cells belong to one cluster if some core point of one is within ε of some core point of the other. Our version checks each pair of nearby core cells, stops at the first close pair, skips cells that are already joined, and keeps the clusters in a <b>union-find</b> structure.</p>
        ${code("grid")}
        ${predict("The plain algorithm needs 1,385 distance tests to link the core points. Roughly how many does the grid need: about 1,000, about 500, or under 200?", "<p>Under 200: 189. Most core cells are joined by the first pair tested, and cells already joined are skipped.</p>")}
        ${demo("dbscan", "Demo 2 · Clusters on a grid", "move the slider")}
        <p>The grid links the same clusters with a fraction of the distance tests. In parallel, threads take different cell pairs and merge components in the union-find with atomic operations.</p>` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task keeps the loader, the grid, the core-point test and the border step. It removes <code>ClusterCoreBCPGridParallelBucketingND</code>, the core-connectivity stage, with its helpers. The agent returns one entry per point: a cluster id for each core point, −1 for every other point.</p>
        <p>Each submission clusters twelve generated point sets on eight threads: eight small sets of 12,000 or 14,000 points in three or seven dimensions, and four seed-spreader sets of 200,000 points in five or seven dimensions, the generator family of the paper's datasets. The output must match an exact oracle point by point, including every membership of a border point. To pass, the run time must be strictly lower than the reference's on every set. The score uses only the small sets: their geometric-mean time <code>C</code>, in seconds, against a fixed anchor of 20 ms.</p>
        ${code("dbscore")}
        <p>The reference's score of 71.7 means a geometric mean of about 7.9 ms on the small sets. The run times in the table below are means over all twelve sets, so the large ones dominate them.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <table><tr><th>Run</th><th>Run time (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>46.4</td><td>71.7</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>25.3</td><td>77.4</td><td>${fail}</td></tr>
        <tr><td>GLM 5.3</td><td>30.3</td><td>76.0</td><td>${fail}</td></tr>
        <tr><td>GPT-6 Astra</td><td>34.1</td><td>73.8</td><td>${pass}</td></tr>
        <tr><td>GPT-6.1 Terra</td><td>29.3</td><td>73.7</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>35.3</td><td>72.5</td><td>${pass}</td></tr>
        <tr><td>GLM 5.3 Flash</td><td>46.8</td><td>68.8</td><td>${pass}</td></tr></table>
        <p class="meta">Selected rows; the full table is on the task page. Means over the twelve hidden sets, as of October 26, 2026. Six of sixteen passed. <a href="${TASK}parallel-dbscan" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>The two best scores failed: Gemini 4 Argon · Antigravity and GLM 5.3 were faster than the reference on eleven of twelve sets. <b>Claude Opus 5.5</b> passed. It used a lock-free union-find: threads merge components with atomic compare-and-swap, linking a root to the smaller index. It checks cell pairs in three phases, nearest neighbors first (cells that differ by one in a single coordinate), then diagonal neighbors, then cells further away but still within reach of ε.</p>
        <p>Each test stops early: one representative core point from each cell, then a few point pairs, and only then an exhaustive check of the points near the other cell's bounding box, with the reference's own arithmetic so the result matches exactly. Its own idea: the far candidates come from a trie over cell coordinates, each trie node records the component its whole subtree shares, and a subtree already in the querying cell's component is skipped.</p>
        ${callout("pitfall", "A PASS IS DECIDED IN ITS OWN RUN", "<p>GLM 5.3 Flash scored 68.8, below the reference's 71.7 in the table, and passed. Its mean time, 46.8 ms, is above the table's 46.4, but the reference measured in its own run took 53.4 ms, and GLM 5.3 Flash was faster on all twelve sets. The score is absolute; the pass compares two programs on the same machine at the same time.</p>")}` },
    ],
    takeaways: ["Cell side ε/√d: one cell, all neighbors.", "Union-find links the core cells.", "The best two scores failed on one set each."],
  },
  {
    slug: "3-hygra", nav: "Hygra", title: "Hygra: Peeling a Hypergraph",
    subtitle: "Core numbers, and why buckets make peeling work-efficient",
    abstract: "A vertex's core number is the largest k whose k-core still holds it. Peeling finds them all in one pass, and buckets by degree keep the work linear. The task removes the whole computation; a pass must be 3% faster than the reference on eight threads and on one.",
    tags: ["hypergraph", "k-core", "peeling", "work-efficiency"],
    hero: "peel", heroCaption: "Peel one round at a time: each leaving vertex takes the level as its core number.",
    sections: [
      { id: "idea", title: "Core numbers of a hypergraph", html: `
        <p>A <b>hypergraph</b> lets one edge, a <b>hyperedge</b>, join any number of vertices. The <b>k-core</b> is what remains after repeatedly removing every vertex that lies in fewer than <code>k</code> hyperedges, and with it each hyperedge that loses a member. A vertex's <b>core number</b> is the largest <code>k</code> whose core still holds it: a measure of how deep inside the dense part it sits.</p>
        <p><em>Practical Parallel Hypergraph Algorithms</em> (Shun, PPoPP 2020) builds Hygra, a framework for parallel hypergraph algorithms, and gives it a new work-efficient algorithm for core numbers.</p>` },
      { id: "definition", title: "The definition", html: `
        <p>Our hypergraph has nine vertices and eight hyperedges. Vertices 0 to 3 form a tight group of four three-vertex hyperedges; 4, 5 and 6 a looser one; vertex 7 hangs on one hyperedge, and vertex 8 is in none. The definition gives the core numbers directly, if slowly.</p>
        ${code("definition")}` },
      { id: "peel", title: "Peeling with buckets", html: `
        <p>Peeling finds all core numbers in one pass. Keep each vertex's live degree. At level <code>k</code>, remove every vertex whose degree is at most <code>k</code>; it gets core number <code>k</code>. Each of its live hyperedges dies, and every other member loses one from its degree. Members that fall to <code>k</code> leave in the next round of the same level.</p>
        <p>A simple parallel version scans all remaining vertices in every round, so its work grows with the number of rounds. The paper keeps the vertices in <b>buckets</b> by degree, so a round touches only the vertices that leave and the ones whose degree drops: linear work.</p>
        ${code("peel")}
        ${demo("peel", "Demo 3 · Peel the hypergraph", "one round at a time")}
        <p>Four rounds: vertex 8 at level 0, vertex 7 at level 1, then 4, 5 and 6 together at level 2, which kills {3, 4}, {4, 5, 6} and {5, 6} and leaves vertices 0 to 3 at degree 3. On a larger random hypergraph, the count of vertex visits shows the difference the buckets make:</p>
        ${code("big")}` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task removes the whole body of <code>KCore</code>. The agent gets the hypergraph in both directions (each vertex's hyperedges and each hyperedge's vertices) and must return the exact core number of every vertex.</p>
        <p>Each submission runs on four random hypergraphs from the framework's own generator, with hundreds of thousands of vertices and hyperedges and millions of memberships: two public, two held out. The time is the whole process, from launch to exit, loading the file included. The score is <code>100 · e<sup>−t / 0.25</sup></code> for a median time <code>t</code> in seconds. To pass, the run must be at least 3% faster than the reference on every hypergraph, twice: on eight threads, and on <b>one</b> thread. The one-thread time is the paper's T<sub>1</sub>, the total work, so the task checks work-efficiency directly.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <table><tr><th>Run</th><th>Run time (ms)</th><th>Sequential run time (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>164</td><td>639</td><td>52.2</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>131</td><td>518</td><td>59.5</td><td>${pass}</td></tr>
        <tr><td>DeepSeek V4.1 Flash 1017</td><td>132</td><td>548</td><td>59.1</td><td>${pass}</td></tr>
        <tr><td>Muse Wonder 1.0</td><td>139</td><td>574</td><td>57.6</td><td>${fail}</td></tr>
        <tr><td>Step 5 Preview</td><td>141</td><td>574</td><td>56.8</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>176</td><td>541</td><td>49.7</td><td>${pass}</td></tr>
        <tr><td>GLM 5.3</td><td>213</td><td>648</td><td>43.1</td><td>${fail}</td></tr></table>
        <p class="meta">Selected rows; the full table is on the task page. Means over the four hidden hypergraphs, as of October 26, 2026. Eight of sixteen passed. FDI 38.7. <a href="${TASK}hygra" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Every run with a valid result beat the reference on one thread on all four hypergraphs. All six failures with a valid result came from eight threads; for example Muse Wonder 1.0 and Step 5 Preview won one of four, GLM 5.3 none. Two runs, GLM 5.3 Flash and Muse Spark 1.3, scored 0.</p>
        <p><b>Claude Opus 5.5</b> passed with a score below the reference's, because the reference took 197 ms in its run. It peels level by level, as in our model, and runs each round in one of three ways. <em>Push</em>: each live hyperedge touching the leaving vertices is handled once, by its lowest-numbered leaving member, which decrements the others. <em>Pull</em>: the leaving vertices mark their hyperedges dead, and every remaining vertex recounts its live hyperedges. <em>Fix</em>: when few vertices remain, only those are recounted. A cost model picks the cheapest from the frontier size, the level and the average sizes.</p>
        <p>It also used <b>ownership instead of atomics</b>: each thread owns aligned blocks of 64 vertices and of the dead-hyperedge bitmap, and in parallel push rounds threads send kills and decrements to the owner as messages, so no atomic operation touches the hot arrays.</p>
        ${callout("pitfall", "WORK-EFFICIENT IS NOT ENOUGH", "<p>All fourteen runs with a valid result beat the reference on one thread on every hypergraph. Only eight also beat it on eight threads on every hypergraph, which the pass needs too.</p>")}` },
    ],
    takeaways: ["Core number = deepest k-core that holds the vertex.", "Buckets: linear work, no rescans.", "Pass on eight threads and on one."],
  },
  {
    slug: "4-parbutterfly", nav: "ParButterfly", title: "ParButterfly: Counting Butterflies",
    subtitle: "Wedges, vertex orders, and the easiest task of the benchmark",
    abstract: "A butterfly is two vertices on each side of a bipartite graph joined by all four edges. Counting comes down to grouping wedges by their endpoints, and the vertex order decides how many wedges there are. Fifteen of sixteen models beat the authors' parallel code by more than 5% on every graph.",
    tags: ["bipartite graph", "butterfly", "wedges", "FDI −11.2"],
    hero: "butterfly", heroCaption: "Same count in every order; the number of wedges changes.",
    sections: [
      { id: "idea", title: "Butterflies", html: `
        <p>A <b>bipartite graph</b> has two sides, and every edge joins the two: users and products, authors and papers. A <b>butterfly</b> is two vertices on each side joined by all four edges, the smallest dense pattern such a graph can have, much as a triangle is in an ordinary graph. <em>Parallel Algorithms for Butterfly Computations</em> (Shi and Shun, APOCS 2020) builds ParButterfly, a framework that counts and peels butterflies in parallel.</p>` },
      { id: "wedges", title: "Wedges and vertex orders", html: `
        <p>A <b>wedge</b> is a path of two edges, <code>x – y – z</code>, with <code>x</code> and <code>z</code> on the same side. Two vertices that share <code>c</code> neighbors are the endpoints of <code>c</code> wedges, and any two of those wedges form a butterfly: <code>c(c − 1)/2</code> butterflies. So counting comes down to collecting wedges by their endpoints.</p>
        <p>The framework first <b>ranks</b> the vertices. It keeps only the wedges whose center <code>y</code> and far endpoint <code>z</code> are both ranked after <code>x</code>. Every butterfly is then counted exactly once, from its first-ranked vertex. The order decides how many wedges there are. <b>Side order</b> ranks one side first, so all wedges have their centers on the other side; <b>degree order</b> ranks vertices by decreasing degree, so the hubs are always endpoints and seldom centers. Our two graphs have 40 vertices on each side and 320 edges: one with equal degrees, one with heavy tails on both sides.</p>
        ${code("wedges")}
        <p>The paper's rule, which the task's comparison code applies: count the wedges <code>w_s</code> of the better side order and <code>w_r</code> of degree order, and use side order when <code>(w_s − w_r) / w_s &lt; 0.1</code>.</p>
        ${code("orders")}
        ${predict("On the skewed graph, a few left and right vertices have very high degree. Which order should process the fewest wedges?", "<p>Degree order: 1,348 wedges against 2,410 for the best side order. The hubs are ranked first, so they are endpoints and seldom centers.</p>")}
        ${demo("butterfly", "Demo 4 · Wedges by vertex order", "choose a graph and an order", "Amber bars mark the side whose vertices are the centers.")}
        <p>Every order finds the same count. On the uniform graph, one side order is cheapest. On the skewed graph, degree order processes 44% fewer wedges than the best side order, because the hubs seldom serve as centers: a hub is a center only for wedges whose endpoint is an even bigger hub. The work is the number of wedges; the order is a choice of algorithm, made before any thread starts.</p>` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task removes <code>CountTotal</code>, the routine that returns the exact total. The command line names a ranking and a way of grouping wedges, but only the count is checked, so the agent may choose its own order and aggregation. The comparison is the authors' parallel code with the rule above and their simple batching.</p>
        <p>There are eight graphs with about two million edges each, 18,000 to 23,000 vertices on one side and 20,000 to 25,000 on the other: six with uniform degrees and two with heavy tails on both sides, where the largest hubs have 14,000 to 19,000 neighbors. On four threads, the count must be exact on every graph, and the median of 31 paired time ratios must show the agent's code <b>more than 5% faster</b> than the comparison on every graph. The score is the speedup score of RegionsSort, against a frozen serial baseline, on the uniform graphs only.</p>
        ${code("bfscore")}
        <p>The reference counts 3.4 times faster than the serial baseline; the best run, 19.4 times.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <table><tr><th>Run</th><th>Counting time (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>172</td><td>34.7</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>29.1</td><td>56.3</td><td>${pass}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>29.4</td><td>56.3</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>29.8</td><td>56.0</td><td>${pass}</td></tr>
        <tr><td>GPT-6.1 Terra</td><td>37.8</td><td>54.1</td><td>${pass}</td></tr>
        <tr><td>Kimi K3</td><td>154</td><td>37.5</td><td>${pass}</td></tr>
        <tr><td>GLM 5.3</td><td>—</td><td>0.0</td><td>${fail}</td></tr></table>
        <p class="meta">Selected rows; the full table is on the task page. Means over the eight hidden graphs, as of October 26, 2026; every valid count was 2.73 × 10<sup>9</sup> on average, the same as the reference's. Fifteen of sixteen passed. <a href="${TASK}parbutterfly" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Fifteen models scored above the reference; GLM 5.3 had no valid result. With an FDI of −11.2, ParButterfly is the easiest task of the benchmark. The best runs counted about six times faster than the reference (29.1 ms against 165 ms in Gemini 4 Argon · Antigravity's run).</p>
        <p><b>Claude Opus 5.5</b> chose a strategy per graph. It takes the side with fewer wedges; on skewed graphs it also counts the wedges of a degree order and picks the cheaper by a cost model. In side order, for every neighbor, the smaller endpoints form a prefix of that neighbor's sorted list, and a small per-thread counter collects the shared neighbors of each pair, adding <code>c(c − 1)/2</code>.</p>
        <p>Neighbor lists are copied once into fixed-width slots of 16-bit ids, so vector instructions find and copy a prefix without branches; each thread times two forms of its counting loop on its first chunks and keeps the faster. On skewed graphs it ranks by degree, as in our model, so the few hubs seldom serve as centers, and low-degree vertices use 8-bit counters.</p>` },
    ],
    takeaways: ["c shared neighbors: c(c − 1)/2 butterflies.", "The order decides the wedges.", "15 of 16 passed; FDI −11.2."],
  },
  {
    slug: "5-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>RegionsSort</h3><ul><li>Regions graph of misplaced ranges</li><li>2-paths give parallel swaps</li><li>2 of 16 passed</li></ul></div>
        <div class="card"><h3>Parallel DBSCAN</h3><ul><li>Cells of side ε/√d</li><li>Union-find over core cells</li><li>6 of 16 passed</li></ul></div>
        <div class="card"><h3>Hygra</h3><ul><li>Peeling gives core numbers</li><li>Buckets keep the work linear</li><li>8 of 16 passed</li></ul></div>
        <div class="card"><h3>ParButterfly</h3><ul><li>Wedges grouped by endpoints</li><li>Degree order on skewed graphs</li><li>15 of 16 passed</li></ul></div></div>
        ${callout("pattern", "THREE LESSONS FROM THE HPC TASKS", "<p><b>Work first, then threads.</b> Each paper is about doing less total work in parallel: swaps planned from a graph, a grid instead of all pairs, buckets instead of rescans, an order with fewer wedges. Hygra checks it directly with a one-thread time.</p><p><b>Every workload counts.</b> The best scores on RegionsSort and Parallel DBSCAN failed, each on one of twelve inputs.</p><p><b>A pass is decided in its own run.</b> The reference is timed again in every run. On Hygra and Parallel DBSCAN, runs passed with scores below the reference's row.</p>")}` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★ (modify)</h3>
        <p>In the RegionsSort toy, plan the buckets in the order 3, 2, 1, 0. How many swaps does the plan need now, and why could it differ?</p>
        <details class="reveal"><summary>Solution</summary><p>12 swaps instead of 10. The planning order changes which 2-paths exist when each bucket is planned, and so how many swaps are 2-cycles that send both sides home.</p></details>
        <h3>Exercise 2 ★ (modify)</h3>
        <p>Change the toy to K = 2 blocks of 20. How many edges does the regions graph have?</p>
        <details class="reveal"><summary>Solution</summary><p>8 instead of 12. Larger blocks hold longer runs of each bucket, so there are fewer, heavier regions. More blocks give the local sorts more parallelism, but more regions to plan.</p></details>
        <h3>Exercise 3 ★ (experiment)</h3>
        <p>In the DBSCAN toy, double ε to 1.2. How many clusters are there, and how many distance tests does the grid need to link them? (Demo 2 shows it.)</p>
        <details class="reveal"><summary>Solution</summary><p>72 core points in 4 clusters; the grid needs 82 tests, against 1,911 for the plain algorithm. Bigger cells hold more points, so fewer cells need linking.</p></details>
        <h3>Exercise 4 ★★ (by hand)</h3>
        <p>In Hygra's small hypergraph, add the hyperedge {4, 5}. Which core numbers change?</p>
        <details class="reveal"><summary>Solution</summary><p>None. Vertex 7 still leaves at level 1, which drops vertex 6 to degree 2; at level 2, vertex 6 leaves and kills {4, 5, 6} and {5, 6}, so 4 and 5 fall to degree 2 or less and leave at level 2 too.</p></details>
        <h3>Exercise 5 ★★ (think)</h3>
        <p>Why does degree order help on the skewed graph and not on the uniform one? Count the wedges a single vertex of degree 40 would produce as a center.</p>
        <details class="reveal"><summary>Solution</summary><p>40 · 39 / 2 = 780 wedges, from one vertex. Degree order makes hubs endpoints, so they seldom serve as centers. On the uniform graph all degrees are alike, so no order avoids much work, and here degree order processes more wedges than the better side order.</p></details>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li>O. Obeya, E. Kahssay, E. Fan, J. Shun. <em>Theoretically-Efficient and Practical Parallel In-Place Radix Sorting.</em> SPAA 2019. <a href="https://people.csail.mit.edu/jshun/RegionsSort.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li>Y. Wang, Y. Gu, J. Shun. <em>Theoretically-Efficient and Practical Parallel DBSCAN.</em> SIGMOD 2020. <a href="https://doi.org/10.1145/3318464.3380582" target="_blank" rel="noopener">doi:10.1145/3318464.3380582</a></li>
        <li>J. Shun. <em>Practical Parallel Hypergraph Algorithms.</em> PPoPP 2020. <a href="https://people.csail.mit.edu/jshun/hygra.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li>J. Shi, J. Shun. <em>Parallel Algorithms for Butterfly Computations.</em> APOCS 2020. <a href="https://jshun.csail.mit.edu/butterfly.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li>Task pages: <a href="${TASK}regionssort" target="_blank" rel="noopener">RegionsSort</a>, <a href="${TASK}parallel-dbscan" target="_blank" rel="noopener">Parallel DBSCAN</a>, <a href="${TASK}hygra" target="_blank" rel="noopener">Hygra</a>, <a href="${TASK}parbutterfly" target="_blank" rel="noopener">ParButterfly</a></li></ul>` },
    ],
    takeaways: ["Work first, then threads.", "Every workload counts.", "A pass is decided in its own run."],
  },
];

const QUIZ = [
  { q: "In the regions graph, what does an edge <code>i -> j</code> of weight <code>w</code> mean?",
    opts: ["Bucket i is w keys larger than bucket j", "Blocks i and j share w keys", "w keys in country i belong to bucket j", "w swaps run between i and j"],
    a: 2, why: "Country i is the interval bucket i will occupy; the edge counts the keys of bucket j sitting there." },
  { q: "Why are DBSCAN's grid cells of side ε/√d?",
    opts: ["So that the cell's diagonal is ε, and any two points in one cell are neighbors", "So that each cell holds minPts points", "So that cells never touch", "So that each cell is one cluster"],
    a: 0, why: "A cell's diagonal is side · √d = ε. A cell with at least minPts points is all core, with no distance test." },
  { q: "Hygra's task measures time on one thread as well as eight. What does the one-thread time measure?",
    opts: ["The time to load the file", "The span", "The memory used", "The total work, T<sub>1</sub>"],
    a: 3, why: "On one thread, the run does all its work alone: the paper's T<sub>1</sub>. A work-efficient algorithm keeps it low." },
  { q: "Two vertices on one side share 4 neighbors. How many butterflies have both as endpoints?",
    opts: ["4", "6", "8", "16"],
    a: 1, why: "Any two of the 4 wedges form a butterfly: 4 · 3 / 2 = 6." },
  { q: "On Parallel DBSCAN, GLM 5.3 Flash scored 68.8, below the reference's 71.7, and passed. How?",
    opts: ["The pass ignores the large sets", "Its score was rounded down", "The pass compares it with the reference timed in its own run, which was slower there", "The reference failed a correctness check"],
    a: 2, why: "In its run the reference averaged 53.4 ms, and GLM 5.3 Flash was faster on all twelve sets. The score uses a fixed anchor, not the reference." },
];
