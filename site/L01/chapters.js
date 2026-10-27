// L01 content, adapted from frontiercs2/notes/L01-mlsys.md (checked by tools/check.py).

const demo = (name, title, instr, hint = "") =>
  `<div class="card demo" data-demo="${name}"><div class="head"><span class="title">${title}</span><span>${instr}</span></div>
   <div class="demo-body"></div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const callout = (kind, label, body) => `<div class="callout ${kind}"><b>${label}</b>${body}</div>`;
const predict = (q, a) => callout("predict", "PREDICT", `<p>${q}</p><details class="reveal"><summary>Show the answer</summary>${a}</details>`);
const out = (name) => codeBlock(OUT[name], "out");
const code = (name) => codeBlock(CODE[name]) + (OUT[name] ? out(name) : "");
const pass = '<span class="chip pass">Pass</span>', fail = '<span class="chip fail">Fail</span>';
const TASK = "https://frontier-cs.org/task/#";
const CASE = "https://frontier-cs.org/blog/svg-ear-measured-error/";

const LECTURE = {
  number: 1,
  title: "MLSys",
  tagline: "Sparse attention, a patient cache and four fast kernels",
  lead: "The six MLSys tasks of FrontierCS 2: sparse attention for video diffusion, serving multi-turn agents with vLLM, and fast GPU versions of k-NN, DBSCAN, k-means and IVF-PQ. For each one: the idea, the part the task removed, how a run is judged, and what the agents did.",
  heroDemo: "attnAuto",
  heroLabel: "SVG-EAR · one query, two clusters",
  heroCaption: "Compute one cluster, estimate the other from its average key.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the MLSys tasks teach",
  why: [
    ["Estimate, and rank by error", "SVG-EAR keeps an estimate of every block it skips and spends its budget where the estimate is <b>worst</b>, not where the weight is largest."],
    ["Every workload, every metric", "GPT-6 Astra beat the SVG-EAR reference on <b>every mean</b> and still missed five of 48 checks. No model passed SVG-EAR or Continuum."],
    ["Bound, then be exact", "The FlashLib passes compute approximately, <b>prove</b> how far off they can be, and redo only what lies near the boundary."],
  ],
  ctaTitle: "Ready to route one query by hand?",
  minutes: "About 80 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-svg-ear", nav: "SVG-EAR", title: "SVG-EAR: Estimating What You Skip",
    subtitle: "Sparse attention for video diffusion, with an estimate of every skipped block",
    abstract: "Video diffusion spends most of its time in attention. Sparse VideoGen2 clusters tokens and computes only the cluster pairs that matter. SVG-EAR also estimates the skipped pairs from cluster averages, and picks the pairs to compute by the error skipping would cause.",
    tags: ["sparse attention", "clustering", "centroid estimate", "error-aware routing"],
    hero: "code:attn", heroCaption: "The case study's example: one query, four keys",
    sections: [
      { id: "idea", title: "Attention is the cost", html: `
        <p>A video diffusion model makes a clip from noise in 50 steps, and each step runs a transformer over the clip's tokens. A 720p clip of 81 frames has 75,600 of them. In attention, every token looks at every other token, and that dominates the cost. <b>Sparse VideoGen2</b> clusters similar tokens and computes attention only for the cluster pairs that matter. <b>SVG-EAR</b> (ECCV 2026) also estimates the pairs it skips, from cluster averages, and picks the pairs to compute by the error that skipping would cause.</p>` },
      { id: "toy", title: "One query, four keys", html: `
        <p>The <a href="${CASE}" target="_blank" rel="noopener">case study</a>'s example has one query and four keys in two clusters. The query gives key <code>j</code> a score <code>s_j</code> (a dot product over the square root of the vector length), and the output averages the keys' values with weights <code>e^{s_j}</code>. In cluster A both keys score 1. In cluster B they score 0 and 2. The values are ours. A skipped cluster of <code>n</code> keys whose average key scores <code>s̄</code> is estimated as <code>n</code> keys of weight <code>e^{s̄}</code>, each carrying the average value.</p>
        ${code("attn")}
        <p>The estimate is exact for A, whose keys score the same, and about 3 short for B.</p>
        ${code("plans")}
        ${predict("By estimated weight, A and B tie at 5.44. If there is room to compute only one, which should it be?", "<p>B. A's estimate has no error, B's is about 3 short. Computing B and estimating A gives the exact output, 2.462.</p>")}
        ${demo("attn", "Demo 1 · One query, two clusters", "choose per cluster")}
        <p>Dropping a cluster loses its weight. Estimating it helps, but only if the right one is estimated. SVG-EAR ranks clusters by how wrong the estimate would be: A's has no error, so it computes B, estimates A, and the toy query comes out exact.</p>` },
      { id: "route", title: "Routing a whole layer", html: `
        <p>In a real layer the queries form clusters too, and sorting tokens by cluster turns attention into blocks, one per pair of a query cluster and a key cluster. The task uses 300 query clusters for Wan, 400 for HunyuanVideo and 1,000 key clusters. Our model keeps 16 key clusters of 8 keys, from tight to loose, and routes 32 queries one by one. It compares three rules at the same budget: rank by weight and drop the rest (Sparse VideoGen2), rank by weight and estimate the rest, and rank by error and estimate the rest (SVG-EAR). The error of a block is the case study's signal: the summed squared gap between the centroid estimate and each key, <code>Σ ‖e^{s̄} v̄ − e^{s_j} v_j‖²</code>.</p>
        ${code("route")}
        ${demo("route", "Demo 2 · Three routing rules", "move the sliders")}
        <p>The table gives the mean gap from full attention. At every budget, estimating beats dropping, and ranking by error beats ranking by weight. In the paper the budget comes from Sparse VideoGen2: the token pairs in the blocks that hold 90% of the estimated weight.</p>` },
      { id: "writes", title: "What the agent writes", html: `
        <p>The task removes the SVG-EAR attention layer of both models, Wan 2.1 and HunyuanVideo, and three routines they share. One averages each cluster (<code>scatter_mean_fused</code>). One picks which cluster pairs to compute (<code>identify_dynamic_map_estimated</code>). One computes the chosen pairs and estimates the rest (<code>dynamic_block_sparse_prune_fwd_flashinfer</code>). The agent may rebuild the paper or try anything else behind the same interfaces. The pipelines, schedulers and metrics stay fixed.</p>` },
    ],
    takeaways: ["Estimate a skipped cluster from its centroid.", "Rank blocks by error, not weight.", "The agent writes the layer and three routines."],
  },
  {
    slug: "2-svg-ear-results", nav: "48 checks", title: "SVG-EAR: 48 Checks, No Pass",
    subtitle: "Faster was within reach; matching the reference's image quality on every clip was not",
    abstract: "Twelve hidden clips, four bars each: 4% faster than the reference, and PSNR, SSIM and LPIPS within small margins of it. No model passed. GPT-6 Astra measured its own error per head and added a variance term the paper leaves out; it missed five checks.",
    tags: ["PSNR", "SSIM", "LPIPS", "variance correction", "FDI 88.5"],
    hero: "code:checks", heroCaption: "The four bars of one clip",
    sections: [
      { id: "judged", title: "How it is judged", html: `
        <p>Twelve graded clips, eight from Wan and four from HunyuanVideo, are each compared with the clip that full attention makes from the same prompt and seed. Three image scores measure the match: PSNR and SSIM (higher is better) and LPIPS (lower is better). The leaderboard score rewards quality and speed measured against full attention:</p>
        ${code("clipscore")}
        <p>The pass rule measures against the human reference instead, clip by clip. Every clip must take at least 4% less time than with the reference, and its PSNR may be at most 0.25 dB lower, SSIM at most 0.01 lower and LPIPS at most 0.005 higher. Four measures on twelve clips make 48 checks.</p>
        ${code("checks")}
        <p>GPT-6 Astra cleared every bar on average and still failed: on Wan clip 3 its PSNR was 19.42 dB against the reference's 20.47.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <table><tr><th>Run</th><th>Latency (s)</th><th>LPIPS</th><th>PSNR (dB)</th><th>SSIM</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>891</td><td>0.215</td><td>21.7</td><td>0.766</td><td>33.9</td><td></td></tr>
        <tr><td>GPT-6 Astra</td><td>729</td><td>0.186</td><td>23.8</td><td>0.797</td><td>48.6</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Terra</td><td>839</td><td>0.181</td><td>23.7</td><td>0.809</td><td>45.5</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>942</td><td>0.172</td><td>25.4</td><td>0.808</td><td>38.4</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>804</td><td>0.223</td><td>21.5</td><td>0.757</td><td>37.4</td><td>${fail}</td></tr></table>
        <p class="meta">Means over the twelve hidden clips, as of October 26, 2026. No model passed; 13 of 16 scored above the human reference. <a href="${TASK}svg-ear" target="_blank" rel="noopener">Full table ↗</a></p>
        <p><b>GPT-6 Astra</b> kept the design and changed how it runs. Every fourth denoising step it takes 32 query tokens as probes, computes their exact attention, and rebuilds them the sparse way under caps of 12%, 25% and 50% of the keys. Each head runs at the lowest cap whose error stays under a bound, and a head that fails even at 50% runs dense attention until the next check.</p>
        <p>It also added a term the paper leaves out. A score is linear in the key, but <code>e^x</code> bends upward, so the average of <code>e^{s_j}</code> is never below <code>e^{s̄}</code>: the centroid guesses low. A second-order expansion gives the fix, <code>e^{s̄ + σ²/2}</code>, where <code>σ²</code> is the variance of the query's scores over the cluster.</p>
        ${code("variance")}
        <p>The corrected estimate overshoots here, but it lands far closer than 5.44. Astra tries the term at 0, ½, 1 and 1½ times its size on each head's probes and keeps the best.</p>
        <p><b>Claude Opus 5.5</b> stayed closest to the paper. It rebuilt the error-aware choice of blocks, and sized the budget by error too: it takes key clusters until they cover 85% of the row's total error. Its k-means starts each step from the previous step's centroids, and FlashInfer's block-sparse kernel computes the chosen pairs and merges in the estimates through their log-sum-exp. It passed all twelve speed checks and 32 of 48 checks in all; its misses were all on image quality.</p>
        <p><b>GPT-6.1 Sol</b> ran exact attention. Its image quality was the best of any run, and it lost all twelve speed checks. It also served as a yardstick: exact attention missed six image checks, five of them the ones Astra missed. (<a href="${CASE}" target="_blank" rel="noopener">case study ↗</a>)</p>
        ${callout("pitfall", "FIDELITY DECIDED THE TASK", "<p>Seven runs beat the reference's time on every clip, but no run passed all 36 image checks. Wan clip 3 stopped every run the case study examined.</p>")}` },
    ],
    takeaways: ["48 checks; a pass needs all.", "The centroid guesses low: add σ²/2.", "Fidelity, not speed, decided it."],
  },
  {
    slug: "3-continuum", nav: "Continuum", title: "Continuum: Keeping the Cache Between Turns",
    subtitle: "Serving agents that call a model in many turns, with a tool call between turns",
    abstract: "vLLM frees a request's KV cache when it ends, so after each tool call the context may be computed again, and other conversations cut in. Continuum holds the cache for a time-to-live and serves whole conversations first come, first served. No model passed.",
    tags: ["vLLM", "KV cache", "time-to-live", "tail latency", "FDI 81.8"],
    hero: "serveMini", heroCaption: "The same six conversations, vLLM and Continuum in turn.",
    sections: [
      { id: "idea", title: "Multi-turn agents", html: `
        <p>An AI agent calls a model in many turns, with a tool call between turns. vLLM keeps each request's <b>KV cache</b>, the keys and values of its context, only while the request runs; when it ends the blocks may be evicted, so after a tool call the whole context may be computed again. Other conversations also cut in between turns. <b>Continuum</b> (arXiv 2025) holds a conversation's cache for a <b>time-to-live</b> (TTL) after a tool call, and serves whole conversations first come, first served.</p>` },
      { id: "server", title: "A small server", html: `
        <p>Our server runs one request at a time. A request computes its uncached prompt tokens at 4,000 a second, then spends one second on its 300-token reply. The cache holds 14,000 tokens. Six conversations arrive in the first six seconds, each with three or four turns and a tool pause after each reply. vLLM serves requests in the order they become ready and evicts the least recently used cache; Continuum serves the oldest conversation first and holds a finished turn's cache until its TTL runs out.</p>
        ${code("serve")}
        ${demo("serve", "Demo 3 · Six conversations on one server", "pick a policy, move the TTL")}
        <p>Ordering by conversation alone lowers the mean; the TTL then cuts recomputation by more than half. Here every tool pause is at most 7 s, so any TTL above that changes nothing. In the real system a held cache is memory other requests cannot use, which is why the TTL is chosen with care.</p>` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task starts from unmodified vLLM 0.11.0 serving Qwen3-Coder-30B-A3B on one H100. The agent may change vLLM's Python code for scheduling and serving: the scheduler, the KV-cache manager, the engine and the server. Kernels, the model and the workloads stay fixed.</p>
        <p>Each submission serves 48 SWE-bench coding conversations and 155 BFCL tool-calling conversations, each at a public and a hidden load, with real tools. To pass, in all four groups it must beat the human reference on the geometric mean of conversation latency and at the 90th, 95th and 99th percentiles, and solve at least the reference's median count minus <code>max(1, ceil(0.05 N))</code>. The score compares with unmodified vLLM instead: a latency score <code>L(S)</code> per workload, cut if accuracy falls by more than 5 points and more than 5% of vLLM's, then 0.8 × SWE + 0.2 × BFCL.</p>
        ${code("lscore")}
        <p>The same <code>L(S)</code> scores all four FlashLib tasks.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <table><tr><th>Run</th><th>Correct (%)</th><th>P90 (s)</th><th>P95 (s)</th><th>P99 (s)</th><th>Speedup</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>15.3</td><td>158</td><td>176</td><td>183</td><td>1</td><td>9.6</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>16.5</td><td>137</td><td>145</td><td>162</td><td>1.26</td><td>24.2</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>19.6</td><td>93.2</td><td>99.8</td><td>111</td><td>1.2</td><td>23.9</td><td>${fail}</td></tr>
        <tr><td>Qwen 3.8 Max</td><td>17.4</td><td>107</td><td>116</td><td>134</td><td>1.13</td><td>22.3</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>17.3</td><td>118</td><td>126</td><td>4,990</td><td>1.03</td><td>19.1</td><td>${fail}</td></tr></table>
        <p class="meta">Means over the hidden groups, as of October 26, 2026. No model passed; 10 of 16 scored above the human reference. <a href="${TASK}continuum" target="_blank" rel="noopener">Full table ↗</a></p>
        <p><b>Claude Opus 5.5</b> rebuilt Continuum. Its scheduler groups requests into conversations by their prompts alone, through the hash vLLM's prefix cache gives each full block, and orders waiting requests by when their conversation began. When a turn finishes it holds the conversation's cache for a TTL set from the last 256 pauses: 10 seconds until eight pauses are seen, then twice the 90th-percentile pause plus one second, within 2 to 30 seconds. An expired hold frees nothing until memory runs short; then holds are released, expired ones first. Before a large hold is released, it is copied to host memory and copied back when the conversation returns.</p>
        ${callout("pitfall", "ONE SLOW CONVERSATION SINKS A TAIL", "<p>Claude Opus 5.5's 99th percentile was 4,990 s against the reference's 183. The tail checks use the slowest few conversations, so one stuck conversation fails them however good the mean is.</p>")}` },
    ],
    takeaways: ["Hold the cache for a TTL.", "Serve conversations, not requests.", "Mean and three tails, in four groups."],
  },
  {
    slug: "4-knn-kmeans", nav: "k-NN, k-means", title: "FlashLib: k-NN and K-Means",
    subtitle: "Classical operators rewritten for the GPU, without storing the distance table",
    abstract: "FlashLib applies the ideas behind fast attention kernels to classical operators. k-NN and a k-means step both stream tiles and keep running minima. Claude Opus 5.5 passed both, with a bound that prunes k-NN exactly and a tile number hidden in each distance.",
    tags: ["k-NN", "k-means", "tiling", "running minimum", "L(S)"],
    hero: "code:bound", heroCaption: "Keep two per group, bound the k-th, rescore few",
    sections: [
      { id: "flash", title: "Flash magic for classical operators", html: `
        <p><b>FlashLib</b> applies the ideas behind fast GPU attention kernels to classical machine-learning operators. The first of its principles is to rewrite an operator into a mathematically equivalent form that suits the GPU: never write a large intermediate table to memory, keep running minima in registers, and split <code>‖x − y‖² = ‖x‖² + ‖y‖² − 2⟨x, y⟩</code> so that the costly part becomes a matrix product on tensor cores. (<a href="https://flashml-org.github.io/" target="_blank" rel="noopener">FlashLib blog ↗</a>)</p>` },
      { id: "knn", title: "k-nearest neighbors", html: `
        <p>Brute-force k-NN compares each query with every database row and keeps the k closest. The naive version fills the whole distance table, then sorts each row. Our data are integer vectors from 0 to 255, like SIFT descriptors.</p>
        ${code("knn")}
        <p>A GPU version streams tiles of the database through each query and keeps only a few candidates. It also drops <code>‖q‖²</code>, the same for every row, and computes <code>⟨q, x⟩</code> as a matrix product.</p>` },
      { id: "bound", title: "A bound on the k-th distance", html: `
        <p><b>Claude Opus 5.5</b> passed with a pruning idea. Its first pass keeps only the two smallest distances in each group of database rows. The k-th smallest of the group minima is an upper bound on the true k-th distance, since those are k real rows. A group whose minimum is below the bound contributes its best row; a group whose second value is too is rescanned in full. Every other row is provably too far.</p>
        ${code("bound")}
        ${demo("knn", "Demo 4 · Pruning a k-NN search", "change k and the group size")}
        <p>The answer is always exact; how much work it saves depends on k and the group size.</p>` },
      { id: "judged", title: "How the four FlashLib tasks are judged", html: `
        <p>Each task leaves a plain, slow version as the starter, and the agent writes a fast GPU version in Python and Triton on one H100. The score is <code>L(S)</code> from the Continuum chapter, with <code>S</code> the geometric mean, over the scored workloads, of the median paired speedup over the naive starter. A pass compares with the human reference on every workload, including hidden ones: strictly faster, and quality no worse.</p>
        <p>The score formula can be inverted. From the leaderboard's rounded scores:</p>
        ${code("invert")}
        <p>The log scale squeezes large speedups: 75.6 against 80.5 on IVF-PQ is a factor of about ten. The scores are rounded to one decimal, so the high ones are rough.</p>
        <p>For <b>k-NN</b>, the workloads are SIFT and GIST descriptors, up to 1,000,000 database rows and k up to 256 in hidden shapes. Every timed call must reach ball-recall 0.88. To pass, each workload must be faster than the reference, with worst ball-recall and worst exact recall at least the reference's, and every reported distance within a relative 10<sup>−6</sup> of a direct recomputation.</p>
        <table><tr><th>Run</th><th>Latency (ms)</th><th>Worst ball recall</th><th>Worst exact recall</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>2.23</td><td>0.948</td><td>1.000</td><td>44.7</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>1.51</td><td>0.948</td><td>1.000</td><td>51.8</td><td>${pass}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>1.84</td><td>0.948</td><td>0.9999</td><td>47.6</td><td>${fail}</td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>1.95</td><td>0.948</td><td>1.000</td><td>45.4</td><td>${pass}</td></tr></table>
        <p class="meta">As of October 26, 2026. 2 of 16 passed. <a href="${TASK}knn-kernel" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Beyond the bound, Opus recomputed the surviving candidates in double precision so the distances match exactly, replayed a recorded launch plan to skip Python dispatch, and, as its own idea, noticed that SIFT values are whole numbers: shifted by −128 into 8-bit integers, the dot products are exact in 32-bit integer arithmetic.</p>` },
      { id: "kmeans", title: "One k-means step", html: `
        <p>A Lloyd step sends every point to its nearest center, then moves each center to the mean of its points. The task asks for exactly this step; an empty cluster keeps its old center.</p>
        ${code("kmeans")}
        <p>The GPU version computes the distances to one tile of centers after another as a matrix product and keeps a running minimum, never storing the point-by-center table.</p>` },
      { id: "tag", title: "A tile number inside a float", html: `
        <p><b>Claude Opus 5.5</b>'s own idea was to write the center tile's number into the lowest mantissa bits of each distance. A plain element-wise minimum over the tiles then carries the winning tile along with the value, with no branches. The bits given up cost a tiny relative error.</p>
        ${code("tag")}
        <p>The pass rule allows the clustering cost (inertia) to grow by at most 5% and the share of points not at an exact nearest center by at most 0.002, and asks for a faster time on every one of six shapes. 8 of 16 models passed, as many as on IVF-PQ and more than on the other four MLSys tasks. Opus had the best score, 53.8 against the reference's 43.3, at 0.944 ms per Lloyd iteration against 1.96. (<a href="${TASK}kmeans-kernel" target="_blank" rel="noopener">task page ↗</a>)</p>` },
    ],
    takeaways: ["Never store the distance table.", "A bound makes pruning exact.", "Score = L(S), S over the naive starter."],
  },
  {
    slug: "5-dbscan-ivfpq", nav: "DBSCAN, IVF-PQ", title: "FlashLib: DBSCAN and IVF-PQ",
    subtitle: "Density clusters and compressed nearest-neighbor search, exact to the plain version",
    abstract: "DBSCAN links dense points into clusters; the task checks the match by ARI and by the noise mask. IVF-PQ probes a few lists and scores compressed codes with table lookups. The passing runs compute fast and approximately, then recheck what lies near a boundary exactly.",
    tags: ["DBSCAN", "union-find", "ARI", "IVF-PQ", "product quantization"],
    hero: "dbscanMini", heroCaption: "The same 150 points, as eps grows.",
    sections: [
      { id: "dbscan", title: "DBSCAN", html: `
        <p>DBSCAN groups points by density. A point with at least <code>min_samples</code> points within distance <code>eps</code>, itself included, is a <b>core</b> point. Core points within <code>eps</code> of each other link into a cluster. A non-core point next to a core point is a <b>border</b> point and joins the smallest neighboring core label; the rest are <b>noise</b>. Union-find links the core points.</p>
        ${code("dbscan")}
        ${demo("dbscan", "Demo 5 · DBSCAN on 150 points", "move eps and min_samples", "The dashed circle is eps around the first point.")}
        <p>The task compares with the plain version by the <b>adjusted Rand index</b> (ARI), which ignores how clusters are numbered. That is why it also counts noise-mask mismatches: ARI cannot tell noise from a cluster.</p>
        ${code("ari")}` },
      { id: "dbscan-results", title: "DBSCAN: judged, and results", html: `
        <p>Every timed result needs ARI at least 0.99. To pass, each of six workloads, including hidden ones with 200,000 points and with <code>min_samples = 20</code>, must be faster than the reference, with ARI no lower and noise mismatch no higher. 5 of 16 passed.</p>
        <table><tr><th>Run</th><th>ARI</th><th>Latency (ms)</th><th>Noise mismatch (×10<sup>−5</sup>)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>0.9999</td><td>21</td><td>4</td><td>63.7</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>1.000</td><td>2.35</td><td>0</td><td>72.9</td><td>${pass}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>0.9999</td><td>1.42</td><td>5.92</td><td>72.1</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>1.000</td><td>4.69</td><td>1.5</td><td>70.7</td><td>${pass}</td></tr></table>
        <p class="meta">As of October 26, 2026. <a href="${TASK}dbscan-kernel" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Gemini 4 Argon · Pi was the fastest and failed on noise. <b>Claude Opus 5.5</b> sorted points into cells around pivot points, gave each tile of points a bounding sphere, and skipped tile pairs whose spheres lie more than <code>eps</code> apart. A tensor-core pass settled pairs clearly inside or outside <code>eps</code>, and pairs near the boundary were rechecked with the plain version's exact 32-bit arithmetic, so its noise matched exactly.</p>` },
      { id: "ivfpq", title: "IVF-PQ", html: `
        <p><b>IVF-PQ</b> is a standard index for approximate nearest-neighbor search. IVF splits the vectors into lists by their nearest coarse center. PQ compresses each vector's residual from its center: the residual is cut into <code>m</code> parts and each part is replaced by the number of its nearest codeword. A query probes only its <code>nprobe</code> nearest lists and, per list, builds a small table of distances from its own residual to every codeword, so each stored vector costs <code>m</code> table lookups.</p>
        ${code("ivfpq")}
        ${predict("Going from 1 to 4 probed lists scans about four times as many codes. What happens to recall?", "<p>It rises from 0.85 to 1.00 in our index. Past 4 lists, more scanning buys nothing here.</p>")}
        ${demo("ivf", "Demo 6 · Lists probed against recall", "move the slider")}
        <p><b>Iso-recall</b> compares with the same index searched over every list; <b>nearest-neighbor recall</b> asks whether the true nearest vector is among the k returned.</p>` },
      { id: "ivfpq-results", title: "IVF-PQ: judged, and results", html: `
        <p>The index is fixed; the public workloads use 8,192 lists, 16 codes per vector and k = 100 on SIFT, and hidden ones reach k = 1,024. Every timed call needs iso-recall 0.99, and to pass each workload must be faster than the reference with both recalls no lower. 8 of 16 passed.</p>
        <table><tr><th>Run</th><th>Iso-recall</th><th>NN recall</th><th>Latency (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>1</td><td>0.967</td><td>151</td><td>75.6</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>1</td><td>0.967</td><td>1.73</td><td>80.5</td><td>${pass}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>1</td><td>0.967</td><td>3.41</td><td>79.8</td><td>${pass}</td></tr>
        <tr><td>DeepSeek V4.1 Flash</td><td>1</td><td>0.967</td><td>19.4</td><td>78.7</td><td>${fail}</td></tr></table>
        <p class="meta">As of October 26, 2026. <a href="${TASK}ivf-pq-kernel" target="_blank" rel="noopener">Full table ↗</a></p>
        <p><b>Claude Opus 5.5</b> grouped the query–list pairs by list, so each list's codes are decoded once and compared with every query that probes it as one matrix product. Every fast pass carries an error bound, and anything near a boundary is recomputed with the plain search's own arithmetic, so its output matches the slow search exactly.</p>
        ${callout("pattern", "EXACT, BUT FAST", "<p>The FlashLib passes share one move: a fast approximate pass with a proven error bound, then exact arithmetic only near the boundary. The answer is the plain version's, bit for bit, and the bound decides how little must be recomputed.</p>")}` },
    ],
    takeaways: ["ARI ignores numbering; check noise too.", "Probe few lists, look codes up in a table.", "Approximate, bound, then exact."],
  },
  {
    slug: "6-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>SVG-EAR</h3><ul><li>Estimate skipped blocks from centroids</li><li>Rank blocks by error</li><li>48 checks; nobody passed</li></ul></div>
        <div class="card"><h3>Continuum</h3><ul><li>Hold the KV cache for a TTL</li><li>Serve conversations in order</li><li>Mean and three tails; nobody passed</li></ul></div>
        <div class="card"><h3>FlashLib</h3><ul><li>Never store the big table</li><li>Bound, then recompute exactly</li><li>Score = L(S) over the naive starter</li></ul></div></div>` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★ (modify)</h3>
        <p>In the one-query example, give cluster A's two keys scores 0.5 and 1.5. Which cluster should SVG-EAR compute now?</p>
        <h3>Exercise 2 ★ (experiment)</h3>
        <p>In the routing model, rank by error but drop the rest instead of estimating it. Where does it land between the other rules?</p>
        <h3>Exercise 3 ★★ (experiment)</h3>
        <p>In the Continuum model, double the cache to 28,000 tokens. How much does the TTL still help, and why?</p>
        <details class="reveal"><summary>Hint</summary><p>With room for every conversation, vLLM's least-recently-used cache rarely evicts anything. What is left for Continuum is its ordering.</p></details>
        <h3>Exercise 4 ★★ (think)</h3>
        <p>In the k-NN bound, why must a group whose second value is below the bound be rescanned in full, not only its two kept rows?</p>
        <details class="reveal"><summary>Solution</summary><p>Only the two smallest values were kept. If the second is below the bound, the third, fourth and later rows of that group may be too, and they were never recorded.</p></details>
        <h3>Exercise 5 ★ (modify)</h3>
        <p>In the IVF-PQ model, use <code>m = 2</code> parts instead of 4. How do the recalls change at <code>nprobe = 16</code>?</p>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li>X. Zhou, Q. Mang, S. Yang, H. Xi, J. Zhang, H. Mao, J. E. Gonzalez, K. Keutzer, I. Stoica, A. Cheung. <em>SVG-EAR: Parameter-Free Linear Compensation for Sparse Video Generation via Error-aware Routing.</em> ECCV 2026. <a href="https://arxiv.org/abs/2603.08982" target="_blank" rel="noopener">arXiv 2603.08982</a></li>
        <li>S. Yang, H. Xi, Y. Zhao and others. <em>Sparse VideoGen2: Accelerate Video Generation with Sparse Attention via Semantic-Aware Permutation.</em> 2025. <a href="https://arxiv.org/abs/2505.18875" target="_blank" rel="noopener">arXiv 2505.18875</a></li>
        <li><em>Continuum: Efficient and Robust Multi-Turn LLM Agent Scheduling with KV Cache Time-to-Live.</em> 2025. <a href="https://arxiv.org/abs/2511.02230" target="_blank" rel="noopener">arXiv 2511.02230</a></li>
        <li><em>FlashLib: Bringing Flash Magic to Classical Machine Learning Operators.</em> <a href="https://flashml-org.github.io/" target="_blank" rel="noopener">flashml-org.github.io</a></li>
        <li><em>Flash-KMeans: Fast and Memory-Efficient Exact K-Means.</em> 2026. <a href="https://arxiv.org/abs/2603.09229" target="_blank" rel="noopener">arXiv 2603.09229</a></li>
        <li>FrontierCS 2 case study: <a href="${CASE}" target="_blank" rel="noopener">SVG-EAR: The Baseline No Model Could Beat</a></li>
        <li>Task pages: <a href="${TASK}svg-ear" target="_blank" rel="noopener">SVG-EAR</a>, <a href="${TASK}continuum" target="_blank" rel="noopener">Continuum</a>, <a href="${TASK}knn-kernel" target="_blank" rel="noopener">FlashLib KNN</a>, <a href="${TASK}dbscan-kernel" target="_blank" rel="noopener">FlashLib DBSCAN</a>, <a href="${TASK}kmeans-kernel" target="_blank" rel="noopener">FlashLib K-Means</a>, <a href="${TASK}ivf-pq-kernel" target="_blank" rel="noopener">FlashLib IVF-PQ</a></li></ul>` },
    ],
    takeaways: ["Estimate, and rank by error.", "Every workload, every metric.", "Bound, then be exact."],
  },
];

const QUIZ = [
  { q: "A skipped cluster has two keys with scores 0 and 2. SVG-EAR estimates it from the average key. How does the estimate compare with the true weight?",
    opts: ["It is exact", "It is too low: e<sup>x</sup> bends upward, so the average of e<sup>s</sup> exceeds e<sup>s̄</sup>", "It is too high", "It is zero"],
    a: 1, why: "True weight 1 + e² ≈ 8.39; the estimate 2e¹ ≈ 5.44. The centroid always guesses low; Astra's variance term corrects most of it." },
  { q: "With room to compute one of two clusters, why does SVG-EAR compute the one whose estimate is worst?",
    opts: ["It has the most keys", "Estimating the other costs nothing in accuracy if its estimate is good", "It has the largest weight", "It is the first in video order"],
    a: 1, why: "A cluster whose keys score alike is estimated exactly, so computing it wastes the budget. Ranking by error spends it where the estimate fails." },
  { q: "GPT-6 Astra beat the SVG-EAR reference on all four means. Why did it fail?",
    opts: ["It was slower on average", "The pass rule is clip by clip: it missed five of the 48 checks", "It cost too much", "Its score was below the reference's"],
    a: 1, why: "A pass needs all 48 checks. Astra missed PSNR, SSIM and LPIPS on Wan clip 3 and two more on Wan clip 6." },
  { q: "What does Continuum keep for a time-to-live after a turn ends?",
    opts: ["The model weights", "The conversation's KV cache, so the next turn need not compute the context again", "The tool's output", "The request queue"],
    a: 1, why: "After a tool call the next turn extends the same context. Keeping its cache saves recomputing it." },
  { q: "In the k-NN bound, groups keep their two smallest distances. Why is the k-th smallest group minimum a safe bound?",
    opts: ["It is an average", "Those k minima are k real rows, so the true k-th distance is at most that value", "It is always the true k-th distance", "It is computed in double precision"],
    a: 1, why: "Any k real rows give an upper bound on the k-th nearest distance. Rows above the bound cannot be in the answer." },
];
