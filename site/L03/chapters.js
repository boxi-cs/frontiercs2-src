// L03 content, adapted from frontiercs2/notes/L03-architecture.md (checked by tools/check.py).

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
  number: 3,
  title: "Architecture",
  tagline: "A branch predictor, a GPU kernel and a sparse multiply",
  lead: "The three Architecture tasks of FrontierCS 2. For each one: the paper's idea, the part the task removed, how a run is judged, and what the agents wrote back. Every idea runs in your browser, as a small model you can change.",
  heroDemo: "predictorMini",
  heroLabel: "Branch prediction · a loop of 8",
  heroCaption: "A counter misses every loop exit. A table indexed by the last seven outcomes learns where the exit is.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the Architecture tasks teach about doing research with agents",
  why: [
    ["Find the bottleneck first", "KAMI's small blocks are bound by <b>memory</b>, not arithmetic. SpGEMM's cost is the <b>reads of B</b>, which clusters share."],
    ["A margin changes the target", "\"15% faster\" means a speed-up of <b>1.18</b>. \"Every trace, with 1% noise\" means a few percent on <b>each one</b>."],
    ["A tuned reference is hard to beat", "RUNLTS's reference won its competition. <b>No model passed</b>, and all sixteen landed within 2% of its score."],
  ],
  ctaTitle: "Ready to predict a branch?",
  minutes: "About 70 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-predict", nav: "Branches", title: "RUNLTS: Predicting Branches",
    subtitle: "Counters, history, and a value the history cannot see",
    abstract: "A processor guesses each branch's direction before it knows it; a wrong guess wastes the work fetched since. A counter learns a bias, a history table learns patterns, and RUNLTS adds register values for branches that follow data.",
    tags: ["two-bit counter", "branch history", "TAGE", "register values"],
    hero: "code:counter", heroCaption: "A two-bit counter, the smallest predictor",
    sections: [
      { id: "guess", title: "Why a processor guesses", html: `
        <p>A processor fetches instructions far ahead of the ones it is executing. When it meets a conditional branch, it cannot wait to learn the direction; it <b>predicts</b> it and goes on. A wrong guess means the work fetched since then is thrown away. The task counts both costs per 1,000 instructions: <b>mispredictions</b> (BrMisPKI) and the <b>cycles spent on the wrong path</b> (CycWpPKI).</p>
        <p>The simplest predictor keeps one <b>two-bit counter</b> per branch, from 0 to 3. It predicts taken at 2 or 3, and moves one step toward each outcome. One surprise does not flip it.</p>
        ${predict("A loop runs 8 times, so its exit test goes taken 7 times, then not taken, again and again. How often does a two-bit counter miss?", "<p>Once per loop: it stays at \"taken\" and misses every exit, 100 times in 800 branches. On a branch that alternates, it misses half.</p>")}
        ${code("counter")}` },
      { id: "history", title: "Remembering history", html: `
        <p>Both branches are regular, so a predictor that remembers <b>history</b> can do better. The next one keeps a counter for each pattern of the branch's last <code>h</code> outcomes.</p>
        ${code("history")}
        <p>One outcome of history is enough for the alternating branch. The loop needs seven: only after seven takens in a row is the exit next. Real predictors such as <b>TAGE</b> keep several tables with histories of different lengths, from a few branches to thousands, and use the longest one that has seen the pattern before. A <b>statistical corrector</b> then adds votes from other small tables and can overturn TAGE's guess.</p>
        ${demo("predictor", "Demo 1 · Three branches, three predictors", "step through a trace", "Try the loop with history 6, then 7. Then pick x % 3 == 0 and compare History with History + register.")}` },
      { id: "values", title: "Values, not just history", html: `
        <p>Some branches follow data. <code>if x % 3 == 0</code> on a loaded value <code>x</code> looks random to any history. But if the instruction that loads <code>x</code> has already run when the branch is predicted, the value itself predicts the branch. This is the idea of <b>RUNLTS</b> (Koizumi et al., CBP 2025), which won the 2025 Championship Branch Prediction. It is TAGE with a statistical corrector, plus a component that learns how branch directions follow <b>register values</b>.</p>
        <p>Our toy branch tests <code>x % 3 == 0</code> on a value from 0 to 63. In three cases out of four, the value is ready when the branch is predicted; otherwise the predictor falls back to history.</p>
        ${code("register")}
        <p>History is no better than one counter here: it misses about two branches in five. With the value, the predictor is right almost every time the value is ready; most of the remaining misses are the quarter of branches that had to fall back.</p>` },
    ],
    takeaways: ["A counter learns a bias; history learns a pattern.", "A loop of 8 needs 7 outcomes of history.", "Some branches follow data, not history."],
  },
  {
    slug: "2-runlts", nav: "RUNLTS", title: "RUNLTS: Register Values and a Hard Bar",
    subtitle: "Use only the newest value, and win on every trace",
    abstract: "The task removes RUNLTS's register-value component, and the agent writes it. Values arrive out of order, so only the newest producer's value may be used. A pass needs fewer mistakes on all 105 traces, and the noise of one trace is about 1%. No model passed.",
    tags: ["out-of-order", "newest producer", "192 KiB", "FDI 88.8"],
    hero: "producer", heroCaption: "Eight events on one register, in the order the processor delivers them.",
    sections: [
      { id: "newest", title: "Only the newest value counts", html: `
        <p>A real processor runs instructions <b>out of order</b>. When the branch is predicted, the producer of a register may not have run yet, and an older producer of the same register may run late, after a newer one. The task gives the predictor two callbacks: <code>decode_notify</code> when an instruction is decoded and claims a destination register, and <code>execute_notify</code> when it runs and the value is known. A value may be used only if it comes from the newest claimant.</p>
        ${code("newest")}
        ${demo("producer", "Demo 2 · The newest producer of r3", "step through the events", "Watch the fourth column: a predictor that keeps \"the last value written\" uses 9 at prediction #14, a value instruction 12 has already replaced.")}
        ${callout("pattern", "USE ONLY WHAT THE HARDWARE WOULD KNOW", "<p>The predictor may read a value only after its producer has run, and only if no newer instruction has claimed the register. Anything else is a look into the future, and the task rejects it.</p>")}` },
      { id: "removed", title: "What the task removes", html: `
        <p>The task keeps TAGE, the rest of the statistical corrector and the simulator. It removes the register-value component of the corrector, and the agent writes it in nine marked regions of one C++ file: its state, its snapshot at prediction time, how it observes decode and execute events, its vote (<code>pv.LSUM</code>) and its training. Which registers to use, how to represent a value, how big the tables are and how much the vote weighs are all the agent's choice. The whole predictor must fit <b>192 KiB</b> of declared state; the reference uses 1,570,890 of the 1,572,864 bits.</p>` },
      { id: "judged", title: "How it is judged", html: `
        <p>Each submission runs a cycle-aware simulator over the <b>105 traces</b> of CBP 2025, in six groups of programs (compression, floating point, infrastructure, integer, media, web). Only the second half of each trace is measured. The score combines the two means:</p>
        ${code("runltsScore")}
        <p>The paper's own averages give the reference's score of 31.5. Five percent fewer of both errors would add only about one point: the score moves slowly.</p>
        <p>To pass, a predictor must make strictly fewer mispredictions <b>and</b> lose strictly fewer wrong-path cycles than the reference, on <b>every one of the 105 traces</b>. A tie anywhere fails. The task statement warns how noisy a single trace is: shifting the predictor's random stream by one call, which has nothing to do with quality, moves one trace's mispredictions by about 1% (standard deviation). Our model: if each trace's change is spread around the average gain with that 1% deviation, what is the chance of winning all 105?</p>
        ${predict("A new predictor is 2% better on average, with 1% noise per trace. What is its chance of winning on all 105 traces?", "<p>About 9%. Each trace is a win with probability 0.977, and 0.977<sup>105</sup> ≈ 0.09. It takes about 3% better on average to be fairly safe.</p>")}
        ${code("allWin")}
        <p>A predictor 1% better on average almost surely loses somewhere. It takes about 3% better on average to be fairly safe, and RUNLTS is already the competition's winner. Our model checks mispredictions only; the wrong-path cycles must also win on every trace, so the real chance is lower.</p>
        ${demo("allwin", "Demo 3 · Winning on every trace", "move the gain and the noise", "Set the gain to 1% and draw a few times: a few red dots are enough to fail. At 4%, red dots become rare.")}` },
      { id: "agents", title: "What the agents did", html: `
        <p>No model passed, and none scored above the human reference (31.5). Every one of the sixteen runs scored between 30.9 and 31.3. With an FDI of 88.8, RUNLTS is the fifth-hardest of the 48 tasks.</p>
        <table><tr><th>Run</th><th>Mispredictions / 1K</th><th>Wrong-path cycles / 1K</th><th>Storage (KiB)</th><th>Score</th><th></th></tr>
        <tr><td>Human reference</td><td>3.2</td><td>140</td><td>192</td><td>31.5</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>3.24</td><td>141</td><td>191</td><td>31.3</td><td>${fail}</td></tr>
        <tr><td>GPT-6 Astra</td><td>3.26</td><td>142</td><td>192</td><td>31.2</td><td>${fail}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>3.26</td><td>141</td><td>192</td><td>31.2</td><td>${fail}</td></tr></table>
        <p class="meta">Means over the 105 final traces, as of October 26, 2026. <a href="${TASK}runlts" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Claude Opus 5.5 came closest. Its component, from the task page:</p>
        <ol><li><b>Tracking the newest producer.</b> For 33 registers (the 31 general ones, the stack pointer and the flags) it records which instruction last claimed each one at decode, and stores a value only if it comes from that claimant, as in our <code>newest_producer</code>.</li>
        <li><b>Picking recent registers.</b> At each prediction it takes the six registers with the most recent usable values and hashes each with the branch address into one shared table of small signed counters.</li>
        <li><b>Exact and coarse lookups.</b> Each register is looked up twice: by its exact value, and by a coarse class (magnitude, sign and two low bits), so that nearby values share what they learn.</li>
        <li><b>Joining the vote.</b> The counters' sum, with saturated counters counted three times, is added to the corrector's sum, with a trained weight per lookup group.</li></ol>
        ${callout("pitfall", "REBUILDING THE PAPER IS NOT ENOUGH", "<p>The reference is, by every sign, the paper's own component: its storage and the paper's averages match the leaderboard's 31.5. A good reconstruction lands close to it, about 1% worse, and the pass rule asks for a clear win on every trace.</p>")}` },
    ],
    takeaways: ["Use a value only from its newest producer.", "Every trace, strictly, with ~1% noise per trace.", "No model passed; the best scored 31.3 against 31.5."],
  },
  {
    slug: "3-kami", nav: "KAMI", title: "KAMI: A Matrix Multiply Inside One Thread Block",
    subtitle: "Small double-precision products, bound by memory",
    abstract: "KAMI brings communication-avoiding matrix multiplication into one GPU thread block: the warps split the work to exchange little data, and compute on the FP64 tensor cores. The task removes the kernel. Seven of sixteen models passed.",
    tags: ["thread block", "warps", "tensor cores", "arithmetic intensity"],
    hero: "kami", heroCaption: "Pick a shape and a number of warps.",
    sections: [
      { id: "idea", title: "Many small products", html: `
        <p>A GPU runs threads in <b>thread blocks</b>. A block runs on one streaming multiprocessor, and its threads come in <b>warps</b> of 32. Many HPC and AI workloads need a great number of <em>small</em> matrix products, one per block: general, low-rank, batched and sparse multiplication. <b>KAMI</b> (Wang et al., SC 2025) brings ideas from <b>communication-avoiding</b> matrix multiplication, first built for clusters of machines, into a single block: the warps split the work so that they exchange as little data as possible through shared memory, and they compute on the double-precision <b>tensor cores</b>.</p>` },
      { id: "memory", title: "Memory or compute?", html: `
        <p>Each block computes <code>C = A Bᵀ + 0.5 C</code> on its own matrices, in double precision (8 bytes per number). The task's four public shapes, with the batch of blocks it launches for each:</p>
        ${predict("A 16×16×24 block does 12,288 floating-point operations and moves 10,240 bytes. An H100 needs about 20 operations per byte to keep its FP64 tensor cores busy. What limits this block?", "<p>Memory. At 1.2 operations per byte, the bound is 1.2 × 3.35 TB/s ≈ 4.0 TFLOPS, far below the 67 TFLOPS peak.</p>")}
        ${code("gemm")}
        <p>The operation counts and the data sizes match the task's table. The <b>arithmetic intensity</b>, the operations per byte moved, is 1 to 5. An H100 needs about 20 to keep its FP64 tensor cores busy (67 TFLOPS against 3.35 TB/s, NVIDIA's figures for the SXM card; the task does not name the variant). So every shape is bound by <b>memory bandwidth</b>. The kernel's first job is to keep memory busy.</p>` },
      { id: "warps", title: "How the warps share the work", html: `
        <p>Inside a block, the tensor cores work on fragments of 16×8 outputs. Suppose the block's warps form a <code>rows × cols</code> grid over C. Each warp must read its strip of A (its rows, all of K) and its strip of B from shared memory. More warps compute in parallel, but read more in total; the shape of the grid decides how much more.</p>
        ${code("warps")}
        <p>The 16×16 block has only two fragments, so at most two warps can share it evenly. For 128×64, eight warps read least as 4×2 (32,768 loads), not 8×1 or 1×8; with four warps, 2×2 and 4×1 tie. This is the kind of choice KAMI makes at compile time for each shape.</p>
        ${demo("kami", "Demo 4 · Shapes, bounds and warp layouts", "pick a shape, warps and a layout", "With 128×64×64 and 8 warps, compare 4×2 with 8×1 and 1×8. Then try 16×16×24 with 4 warps.")}` },
      { id: "judged", title: "What the task removes, and how it is judged", html: `
        <p>The task removes KAMI's FP64 kernel, the code each block runs, and the agent writes it. A fixed harness gives every block its own slices of A, B and C, launches the kernel once, and checks every output element against a CPU result. The final run adds four hidden shapes to the four public ones.</p>
        <p>Speed is <code>TFLOPS = 2·M·N·K·batch / (time in ms × 10⁹)</code>. Candidate and reference run six times each, in alternating order: three pairs with the candidate first, three with the reference first. A launch's position can change its time, so each side's value is the geometric mean of its median in each order. With balanced orders, a steady position effect cancels:</p>
        ${code("crossover")}
        <p>The task statement says an earlier version of the harness did show such a position bias. A shape passes only if the candidate's ratio is above a threshold measured from the reference's own timing noise; a pass needs all eight shapes. The score is <code>100·G / (G + 20)</code>, with <code>G</code> the geometric mean of the eight values in TFLOPS:</p>
        ${code("kamiScore")}
        <p>A geometric mean of about 4.4 TFLOPS gives the reference's 18.0, and about 6.0 gives the best run's 23.0. The leaderboard's TFLOPS column is an ordinary mean over the eight shapes, so it is higher: 4.89 and 6.54.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <p>Seven of sixteen models passed, and fourteen scored above the reference.</p>
        <table><tr><th>Run</th><th>TFLOPS</th><th>Score</th><th></th></tr>
        <tr><td>Human reference</td><td>4.89</td><td>18.0</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>6.54</td><td>23.0</td><td>${pass}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>6.56</td><td>23.0</td><td>${pass}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>6.11</td><td>21.7</td><td>${pass}</td></tr>
        <tr><td>Muse Wonder 1.0</td><td>6.01</td><td>21.7</td><td>${fail}</td></tr>
        <tr><td>GLM 5.3</td><td>5.96</td><td>21.5</td><td>${pass}</td></tr></table>
        <p class="meta">Means over the eight final shapes, as of October 26, 2026. <a href="${TASK}kami" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Claude Opus 5.5's kernel, from the task page:</p>
        <ol><li><b>Streaming the inputs.</b> Since the batch is bound by memory, it copies A and B into shared memory with asynchronous 16-byte copies: all of K at once when they fit in 48 KiB, otherwise in a pipeline of stages over K.</li>
        <li><b>Fusing the old C.</b> Each thread loads its part of C straight into its accumulator registers and halves it before the products start, so the read of C overlaps the reads of A and B.</li>
        <li><b>Tensor cores, laid out at compile time.</b> The FP64 tensor-core instruction works on 16×8×8 fragments. It lays the warps over them so that as many warps as divide the grid evenly take part, with the fewest shared-memory loads per product, as in <code>best_layout</code>.</li>
        <li><b>Conflict-free loads.</b> Inside each step of 8 in K, it reorders the K positions a thread needs so that each pair becomes one 16-byte load, and swizzles rows so that simultaneous reads hit different memory banks.</li>
        <li><b>Reverse launch order, its own idea.</b> Block <code>b</code> takes the <code>b</code>-th slice from the end. The first blocks then start on the end of the batch that was written last, which is still in cache.</li></ol>
        ${callout("pitfall", "A GOOD SCORE DOES NOT MEAN A PASS", "<p>Muse Wonder 1.0 scored 21.7 and failed; GPT-6.1 Sol also scored 21.7 and passed, and GLM 5.3 passed at 21.5. The score averages the shapes; the pass needs every shape above the noise threshold.</p>")}` },
    ],
    takeaways: ["Small FP64 products are bound by memory.", "The warp layout decides the shared-memory traffic.", "Balanced launch order cancels a position effect."],
  },
  {
    slug: "4-spgemm", nav: "SpGEMM", title: "Clusterwise SpGEMM: Eight Rows at a Time",
    subtitle: "Read each row of B once per cluster",
    abstract: "A sparse multiply reads one row of B for every stored entry of A. Grouping eight similar rows lets one read serve all eight. The task removes the clustered format and its multiply; a pass needs a 15% margin on every matrix. Twelve of sixteen models passed.",
    tags: ["Gustavson", "reordering", "clusters", "15% margin"],
    hero: "code:spgemmScore", heroCaption: "The pass rule and score, in small",
    sections: [
      { id: "idea", title: "Row by row, or eight at a time", html: `
        <p>Multiplying two <b>sparse</b> matrices (SpGEMM) is a core step of graph analytics and scientific computing. The usual method, <b>Gustavson's</b>, works row by row: for each stored entry <code>A[i, k]</code>, it reads row <code>k</code> of B and adds <code>A[i, k] · B[k, :]</code> into row <code>i</code> of the result. Each stored entry of A costs one read of a row of B.</p>
        <p><em>Improving SpGEMM Performance Through Matrix-Reordering and Cluster-wise Computation</em> (Islam, Xu, Dai and Buluç, SC 2025) groups neighboring rows of A into <b>clusters</b>. For a cluster, it reads each needed row of B once and uses it for every row of the cluster. To make the rows of a cluster share columns, it first <b>reorders</b> the rows so that similar rows sit together. The paper compares 10 row orderings and 3 ways of forming clusters on 110 matrices; its best scheme, hierarchical clustering, is 1.39× faster on average. The task uses the simplest scheme: fixed clusters of eight consecutive rows after an RCM reordering.</p>` },
      { id: "reads", title: "Counting the reads", html: `
        <p>Our matrix is the 5-point stencil of an 8×8 grid: 64 rows, each with up to five entries. We count the rows of B read, one row at a time and eight at a time, in the grid's order, after shuffling the rows, and after a simple reordering of our own (sorting rows by their column lists).</p>
        ${code("reads")}
        <p>Row by row, the order does not matter: 288 reads. Eight at a time, the grid order needs 176, because neighboring rows share columns. Shuffled rows share fewer, and the reordering wins the sharing back. The task gives the order (a fixed RCM ordering per matrix); the agent's part is the format and the multiply.</p>
        ${demo("spgemm", "Demo 5 · Clusters on a stencil matrix", "pick an order and a width", "Compare widths 1 and 8 in grid order, then shuffle. Which width saves most?")}` },
      { id: "format", title: "The clustered format", html: `
        <p>For each group of eight rows, the format keeps one sorted list of column ids, and eight values per id, one per row (zero where a row has no entry). The multiply walks the list, reads row <code>k</code> of B once, and updates all eight lanes of every output column it reaches.</p>
        ${code("clusters")}
        <p>The output is clustered too: 261 column ids, each with eight values, hold the 676 nonzero results. Our integer values make both products equal exactly.</p>
        ${callout("pitfall", "MATCH THE REFERENCE'S ARITHMETIC, NOT JUST A·B", "<p>The task fixes the order of additions and a rule from the source: the first path to an output column always sets it, but a later path adds only when |A[i, k]| is at least about 10<sup>−6</sup>. So which rows share a cluster can change the values, and an ordinary product, correct as mathematics, can fail the check. Our toy leaves this rule out.</p>")}` },
      { id: "judged", title: "How it is judged", html: `
        <p>Each submission multiplies whole matrices from structural mechanics, numerical stencils, irregular systems and directed graphs, on 60 CPU threads. The time counts everything from loading the file to the end of the process, over seven alternating pairs of runs. To pass, on every matrix the median time must be <b>below 0.85 times</b> the reference's, and the throughput above the reference's divided by 0.85. The score is <code>100·G / (1 + G)</code>, with <code>G</code> the geometric mean of the speed-ups.</p>
        ${predict("A submission is exactly 1.15× faster than the reference on every matrix. Does it pass the \"15% faster\" rule?", "<p>No. Its time is 1/1.15 ≈ 0.870 of the reference's, not below 0.85. It needs a speed-up above 1/0.85 ≈ 1.176.</p>")}
        ${code("spgemmScore")}
        <p>"More than 15% faster in time" means a speed-up above 1/0.85 ≈ 1.176, so 1.15× everywhere fails and 1.18× passes. A run three times faster on seven matrices, but only 1.1× on the eighth, scores 72.6 and fails.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <p>Twelve of sixteen models passed, and thirteen scored above the reference (50.0). With an FDI of 10.3, it is the third-easiest task of the 48.</p>
        <table><tr><th>Run</th><th>Time (s)</th><th>MFLOP/s</th><th>Score</th><th></th></tr>
        <tr><td>Human reference</td><td>6.17</td><td>127</td><td>50.0</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>2.87</td><td>213</td><td>66.9</td><td>${pass}</td></tr>
        <tr><td>GPT-6 Astra</td><td>3.13</td><td>208</td><td>65.5</td><td>${pass}</td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>3.1</td><td>197</td><td>65.2</td><td>${pass}</td></tr>
        <tr><td>Kimi K3</td><td>4.84</td><td>157</td><td>56.7</td><td>${fail}</td></tr></table>
        <p class="meta">Means over the hidden matrices, as of October 26, 2026. <a href="${TASK}clusterwise-spgemm" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Claude Opus 5.5's version, from the task page:</p>
        <ol><li><b>Building the format</b> in two passes: one counts each cluster's list, one fills it.</li>
        <li><b>Counting output columns first</b>, with a hash table or a bitmap, so the output is allocated exactly.</li>
        <li><b>Eight rows at once.</b> For each column id, it reads row <code>k</code> of B once and adds each product into the eight lanes with one 512-bit vector instruction where the processor has it, keeping the reference's order of additions so the values match.</li>
        <li><b>Streaming the output.</b> A cluster accumulates in scratch memory that stays in cache, then is copied out with stores that bypass the cache; large arrays use huge memory pages.</li>
        <li><b>Balancing the threads.</b> Each cluster's work is estimated from the rows of B it reads. Heavy clusters run first, each on its own; the rest run in runs of about equal work.</li></ol>
        <p>Kimi K3 scored 56.7 (4.84 s on average) and still failed: faster on average, but not by 15% on every matrix. Three runs scored 0.</p>` },
    ],
    takeaways: ["One read of B serves a whole cluster.", "\"15% faster\" means a speed-up above 1.176.", "Match the reference's arithmetic exactly."],
  },
  {
    slug: "5-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>RUNLTS</h3><ul><li>Counter → history → register values</li><li>Only the newest producer's value</li><li>Every trace, strictly; ~1% noise each</li></ul></div>
        <div class="card"><h3>KAMI</h3><ul><li>Intensity 1–5 FLOP/byte: memory bound</li><li>Warp grid sets the shared-memory loads</li><li>Balanced launch order, score 100·G/(G+20)</li></ul></div>
        <div class="card"><h3>Clusterwise SpGEMM</h3><ul><li>One read of B per cluster</li><li>Reorder so rows share columns</li><li>Time below 0.85× on every matrix</li></ul></div></div>` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★★ (model)</h3>
        <p>Write a predictor that keeps one history of the last <code>h</code> outcomes of <em>all</em> branches (global history), and run the loop and alternating branches interleaved. How long must <code>h</code> be now?</p>
        <h3>Exercise 2 ★ (experiment)</h3>
        <p>In <code>data_branch</code>, make the value ready only one time in two. How many mispredictions does <code>with_register</code> make? Predict the number before you run it.</p>
        <h3>Exercise 3 ★ (compute)</h3>
        <p>Compute the arithmetic intensity of a 256×256×256 block. Is it still bound by memory on an H100?</p>
        <details class="reveal"><summary>Solution</summary><p>2 × 256³ = 33,554,432 operations; 8 × (4 × 65,536) = 2,097,152 bytes; 16 operations per byte. The bound is 16 × 3.35 ≈ 53.6 TFLOPS, still below the 67 TFLOPS peak, but close: much larger blocks become compute bound.</p></details>
        <h3>Exercise 4 ★★ (experiment)</h3>
        <p>In the SpGEMM count, use clusters of 4 and of 16 rows (Demo 5 does this too). How do the reads of B change? Why might the task fix the width at eight?</p>
        <h3>Exercise 5 ★★★ (open)</h3>
        <p>Find a sparse matrix on which clustering eight rows stores <em>more</em> values in the cluster format than plain rows do. What makes the format wasteful there?</p>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li>T. Koizumi, T. Maekawa, M. Mizuno, M. Kuroki, T. Tsumura, R. Shioya. <em>RUNLTS: Register-value-aware Predictor Utilizing Nested Large Tables.</em> CBP 2025. <a href="https://ericrotenberg.wordpress.ncsu.edu/files/2025/06/cbp2025-final44-Koizumi.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li>Wang et al. <em>KAMI: Communication-Avoiding General Matrix Multiplication within a Single GPU.</em> SC 2025. <a href="https://www.ssslab.cn/assets/papers/2025-wang-KAMI.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li>A. A. R. Islam, H. Xu, D. Dai, A. Buluç. <em>Improving SpGEMM Performance Through Matrix Reordering and Cluster-wise Computation.</em> SC 2025. <a href="https://arxiv.org/abs/2507.21253" target="_blank" rel="noopener">arXiv</a></li>
        <li>Task pages: <a href="${TASK}runlts" target="_blank" rel="noopener">RUNLTS</a>, <a href="${TASK}kami" target="_blank" rel="noopener">KAMI</a>, <a href="${TASK}clusterwise-spgemm" target="_blank" rel="noopener">Clusterwise SpGEMM</a>.</li></ul>` },
    ],
    takeaways: ["Find the bottleneck first.", "A margin changes the target.", "A tuned reference is hard to beat."],
  },
];

const QUIZ = [
  { q: "A loop runs 8 times per visit. How many outcomes of the branch's own history does a table need to predict its exit every time?",
    opts: ["1", "4", "7", "8"],
    a: 2, why: "Only seven takens in a row tell the predictor that the exit is next; with fewer, the history before the exit looks like the history before an ordinary iteration." },
  { q: "Instruction 12 writes r3 = 5. Then the older instruction 10, which also writes r3, runs late with r3 = 9. What may the predictor use for r3?",
    opts: ["9, the last value written", "5, the value of the newest producer", "Nothing until instruction 10 retires", "The average, 7"],
    a: 1, why: "Instruction 12 is the newest claimant of r3. Instruction 10's value is stale and must be ignored." },
  { q: "Why did no model pass RUNLTS, though all scored within 2% of the reference?",
    opts: ["The predictors were too large", "A pass needs strictly fewer mistakes and wrong-path cycles on every one of 105 traces, and one trace's noise is about 1%", "The simulator was not deterministic", "The score formula rewards only wrong-path cycles"],
    a: 1, why: "Winning everywhere needs a gain clearly above the per-trace noise. The best run was about 1% behind the competition-winning reference on average." },
  { q: "A 128×64×64 FP64 block moves 229,376 bytes for 1,048,576 operations. On an H100, what limits it?",
    opts: ["The FP64 tensor-core peak", "Memory bandwidth: 4.57 FLOP/byte × 3.35 TB/s ≈ 15.3 TFLOPS", "The number of warps", "The CPU that checks the result"],
    a: 1, why: "An H100 needs about 20 operations per byte to reach its FP64 peak; at 4.57 the block is bound by memory. That is why the best kernel was built around streaming the inputs." },
  { q: "Clusterwise SpGEMM must be \"more than 15% faster\" on every matrix. Which speed-up on every matrix passes?",
    opts: ["1.10×", "1.15×", "1.18×", "Any speed-up above 1"],
    a: 2, why: "The time must be below 0.85 of the reference's, so the speed-up must exceed 1/0.85 ≈ 1.176. At 1.15× the time is 0.870 of the reference's." },
];
