// L08 content, adapted from frontiercs2/notes/L08-database.md (checked by tools/check.py).

const demo = (name, title, instr, hint = "") =>
  `<div class="card demo" data-demo="${name}"><div class="head"><span class="title">${title}</span><span>${instr}</span></div>
   <div class="demo-body"></div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const callout = (kind, label, body) => `<div class="callout ${kind}"><b>${label}</b>${body}</div>`;
const predict = (q, a) => callout("predict", "PREDICT", `<p>${q}</p><details class="reveal"><summary>Show the answer</summary>${a}</details>`);
const out = (name) => codeBlock(OUT[name], "out");
const code = (name) => codeBlock(CODE[name]) + (OUT[name] ? out(name) : "");
const pass = '<span class="chip pass">Pass</span>', fail = '<span class="chip fail">Fail</span>';
const TASK = "https://frontier-cs.org/task/#";
const asOf = (slug, extra = "") => `<p class="meta">As of October 26, 2026.${extra} <a href="${TASK}${slug}" target="_blank" rel="noopener">Full table ↗</a></p>`;
const SAME_REF = " The reference is measured again in every run, so compare a run with its own reference, not with this row.";

const LECTURE = {
  number: 8,
  title: "Database",
  tagline: "Drop rows early, stop probing in time, and keep every version",
  lead: "The nine Database tasks of FrontierCS 2: join-tree rewriting for the Yannakakis algorithm, boosted trees trained in SQL, inner-product search with FARGO, local and approximate graph-pattern counting, checkpoints and branch prediction for blockchain execution, and a persistent treap under concurrent updates. For each one: the idea, the part the task removed, how a run is judged, and what the agents did.",
  heroDemo: "yannAuto",
  heroLabel: "Yannakakis · one join tree, four roots",
  heroCaption: "Every root of the join tree gives a valid plan; their costs differ.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the Database tasks teach",
  why: [
    ["Do the cheap pass first", "Yannakakis drops rows before joining, FARGO stops once more probes are <b>unlikely</b> to help, and SCOPE counts easy homomorphisms instead of copies."],
    ["Reorganize the data", "The best JoinBoost and Spectrum runs changed how the data were <b>stored</b>: side tables per branch, pages shared between checkpoints."],
    ["The pass rule decides", "On FARGO Query Stopping the top scores failed on recall; on Yannakakis, 39 strict per-query wins were too many for <b>every</b> model."],
  ],
  ctaTitle: "Ready to root a join tree by hand?",
  minutes: "About 90 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-yannakakis", nav: "Joins", title: "Yannakakis: Semijoins Before Joins",
    subtitle: "Drop the rows that cannot match, then join the rest",
    abstract: "Binary join plans can build intermediate results far larger than the answer. The Yannakakis algorithm first drops rows with semijoins, then joins. A column-store engine runs it, but only for join trees of one shape; the agent writes the rewrite into that shape.",
    tags: ["acyclic joins", "semijoin", "join tree", "query plans", "FDI 83.0"],
    hero: "code:rebuild", heroCaption: "A join tree, rebuilt from any root",
    sections: [
      { id: "idea", title: "Rows that cannot match", html: `
        <p>A database joins tables two at a time. A plan built this way can produce intermediate results far larger than the final answer. For acyclic joins, the <b>Yannakakis algorithm</b> avoids this. It first runs a bottom-up pass of <b>semijoins</b> (keep the rows of one table that have a partner in another), which drops every row with no partner below it in the join tree, then joins top-down. The paper (PVLDB 2025) engineers this for a column store, so that it never runs much slower than the binary plan and often runs much faster.</p>
        <p>Our tables follow the task page's example from Stack Overflow data. <code>u</code> holds users (after a selective filter, four are left), <code>p</code> posts with their owner, and <code>c</code> comments with their post. Attribute 0 is a post id and attribute 1 a user id. The optimizer's plan joins comments with posts first, then with users.</p>
        ${code("semijoin")}
        <p>The binary plan builds 600 rows to keep 60. After the semijoins, no intermediate result is larger than the answer. One bottom-up pass does not remove every row that cannot match: 1 of the 15 kept posts has no comment. It does guarantee that every row of the root, here the comments, extends to an answer, which keeps the joins small; a second, top-down pass of semijoins would remove the rest.</p>` },
      { id: "shape", title: "Which trees convert", html: `
        <p>The system turns a binary join tree into a nested-semijoin plan, but only trees of one shape convert. For every join, its keys must appear in the <b>leftmost table</b> of both sides. Our plan adds votes <code>v</code> to the task page's example. Its middle join is on key 0, but the leftmost table of its left side is <code>u</code>, which holds only key 1.</p>
        ${code("leaf")}` },
      { id: "writes", title: "What the agent writes", html: `
        <p>The task removes the policy that reshapes the tree, <code>rewrite_plan</code> in one Python file, and the agent writes it. It receives one optimizer tree per query and returns a new tree of the same leaf and join types. The new tree must keep every table with the same attributes and estimate, have one join fewer than tables, give each join the attributes its two sides share, and pass the leftmost-table rule. The lowering, the engine and the data stay fixed.</p>
        <p><b>Claude Opus 5.5</b>'s rewrite started from a simple observation. Each binary join links two tables: on each side, the leftmost table that holds the join's keys. These links form a <b>join tree</b>, and any table can be its root. A left-deep spine from the root, with each child's subplan joined onto it, always passes the rule: the root holds the keys it shares with each child, and each child is the leftmost table of its own subplan.</p>
        ${code("rebuild")}
        <p>Which root is best? In the plan, each child is hashed and its parent probes it. Opus priced a plan as tuples hashed, at three times the cost, plus tuples probed, with children taken most selective first. Our model runs phase 1 for real and counts both.</p>
        ${code("roots")}
        ${predict("Which root should be cheapest, and why?", "<p>The comments table, the largest input. As the root it is only probed, never hashed: cost 1,680 against 3,247 when rooted at the users.</p>")}
        ${demo("yann", "Demo 1 · Rewrite and root a join tree", "pick a root")}
        <p>Every root gives a valid plan, and the costs differ by a factor of two. Rooting at the largest table is cheapest here, because it is never hashed. That is also Opus's rule for schemas it had no statistics for.</p>` },
    ],
    takeaways: ["Semijoins drop rows before any join.", "Only trees with keys in the leftmost tables convert.", "Any root of the join tree gives a valid plan."],
  },
  {
    slug: "2-yannakakis-results", nav: "No pass", title: "Yannakakis: No Pass",
    subtitle: "39 queries, each strictly faster than the reference",
    abstract: "Every query must return the original result and run strictly faster than with the human reference's rewrite. Thirteen models beat the reference's score; none passed.",
    tags: ["Stats-CEB", "Join Order Benchmark", "median latency", "strict per-query pass"],
    sections: [
      { id: "judged", title: "How it is judged", html: `
        <p>The plans come from three benchmarks: Stats-CEB on Stack Overflow data, the Join Order Benchmark on IMDB, and a graph benchmark for cardinality estimation. Each joins five to fourteen tables. Train uses 20 public plans; the final run adds 19 hidden ones, so 39 queries in all.</p>
        <p>Each query runs ten times for each of three plans: the original binary plan, the human reference and the candidate. The score compares with the binary plan: per query <code>S_q = B_q / C_q</code> of the median times, then the mean of <code>L(S_q)</code> over the queries, where <code>L</code> is the latency score from Lecture 01 (0 up to 1x, 50 at 10x). The pass rule compares with the reference instead. Every query must return exactly the original result, and its median time must be strictly lower than the reference's. There is no margin, and a plan identical to the reference's fails.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <p>No model passed; 13 of 16 scored above the human reference (10.2), and one matched it.</p>
        <table><tr><th>Run</th><th>Exact result</th><th>Median latency (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>1</td><td>231</td><td>10.2</td><td></td></tr>
        <tr><td>Kimi K3.1 Pro</td><td>1</td><td>261</td><td>12.5</td><td>${fail}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>1</td><td>216</td><td>12.2</td><td>${fail}</td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>1</td><td>213</td><td>12.1</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>1</td><td>220</td><td>11.8</td><td>${fail}</td></tr></table>
        ${asOf("yannakakis", " Means over the hidden queries; the reference's row is a median of its measurements in every run.")}
        <p>A score of 12.5 is what a speedup of about 1.4x on every query would give. Kimi K3.1 Pro has the best score but not the lowest latency: the score averages per-query gains over the binary plan, so a few large gains can lift it. The pass needs something harder: 39 strict wins, query by query, against plans that already run fast.</p>
        <p>Besides the join-tree rewrite, <b>Claude Opus 5.5</b> stored, for the Stack Overflow and IMDB schemas, each table's size and the entity each join column refers to. From these it estimated how much each semijoin shrinks its parent. A hill climb then swapped tree edges for others on the same keys, tried every root and ordered children by selectivity, within 6,000 candidate trees. A check confirmed every new plan keeps each table and key and has no cross product; any failure fell back to a plain conversion.</p>
        ${callout("pitfall", "STRICT PER-QUERY TIMING", "<p>With 39 queries and no margin, a single query that runs a few milliseconds slower than the reference fails the run. A rewrite that helps on average is not enough.</p>")}` },
    ],
    takeaways: ["Score: mean gain over the binary plan.", "Pass: 39 strict per-query wins over the reference.", "No model passed."],
  },
  {
    slug: "3-joinboost", nav: "JoinBoost", title: "JoinBoost: Residuals Without the Join",
    subtitle: "Boosted trees trained in SQL over normalized tables",
    abstract: "JoinBoost trains gradient-boosted trees inside a database and never builds the join of its tables. After each tree, every sales row must subtract its leaf's scaled value; the agent writes that update, and ten models passed.",
    tags: ["gradient boosting", "residuals", "SQL", "DuckDB", "FDI 26.3"],
    hero: "code:identity", heroCaption: "The judge's check on every residual update",
    sections: [
      { id: "idea", title: "Boosting over normalized tables", html: `
        <p><b>JoinBoost</b> (PVLDB 2023) trains decision trees and boosted ensembles inside a database, using only SQL. The data stay in normalized tables: a large fact table of sales and small dimension tables for items, stores and dates. JoinBoost never builds their join, and only small aggregates leave the database.</p>
        <p>Gradient boosting with squared error fits each tree to the <b>residuals</b> that earlier trees leave. After a tree, every sales row subtracts the learning rate times the value of the leaf it falls in. The leaf depends on features in other tables, so finding it needs the join, one row at a time. Our data: 400 sales rows, 20 items with a feature <code>f1</code>, 5 stores with a feature <code>f4</code>.</p>
        ${code("boost")}
        <p>The task's judge checks each update with an identity. If a leaf holds <code>h</code> rows whose residuals sum to <code>g</code>, its value is <code>g / h</code>, and subtracting <code>lr · g / h</code> from each of them lowers the sum of squared residuals by exactly <code>(2 lr − lr²) g² / h</code>.</p>
        ${code("identity")}` },
      { id: "pass", title: "One pass instead of one per leaf", html: `
        <p>In SQL, the obvious update issues one <code>UPDATE</code> per leaf, each scanning the sales rows and joining their features to test the leaf's predicate. A batched update issues one <code>UPDATE</code> with a <code>CASE</code> over the leaves: one scan.</p>
        ${code("update")}
        ${demo("boost", "Demo 2 · Residual updates", "move the sliders")}
        <p>The task removes <code>GradientBoosting._update_error</code>, the step that advances the residuals after each tree, and the agent writes it, with changes allowed in five files of the package. The rules keep the paper's setting. Joins and aggregations run in DuckDB, through a fixed executor. Only small results may return to Python: at most 10,000 rows per query and 250,000 values per fit. No table with at least 10% of the sales rows may carry more than 4 columns beyond the sales table's own, so the join cannot be built.</p>` },
      { id: "judged", title: "How it is judged", html: `
        <p>Each of eight cases trains an ensemble on one to two million real grocery sales from the Corporación Favorita data, over one of three join layouts, with depth 1 to 5 and 3 to 24 trees. The model must match one trained on the joined table: RMSE within 10⁻³, and the sorted predictions within 10⁻⁶ per row. The score compares with the per-leaf version, <code>L = log10(B / T)</code> on summed fit times and <code>score = 100 L / (2 + L)</code>; the batched human reference is barely faster. The pass rule needs, on every case, a lower median fit time and a lower median update time than the reference, and an RMSE within 10⁻³.</p>
        ${code("jbscore")}` },
      { id: "agents", title: "What the agents did", html: `
        <p>10 of 16 models passed; 12 of 16 scored above the human reference (0.6).</p>
        <table><tr><th>Run</th><th>Run time (s)</th><th>Residual update time (ms)</th><th>RMSE (×10⁻¹⁰)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>9.57</td><td>787</td><td>5.99</td><td>0.6</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>7.7</td><td>422</td><td>9.53</td><td>33.4</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>14.4</td><td>451</td><td>12.6</td><td>27.0</td><td>${pass}</td></tr>
        <tr><td>DeepSeek V4.1 Flash</td><td>24.9</td><td>585</td><td>12.5</td><td>20.2</td><td>${pass}</td></tr></table>
        ${asOf("residual-state-advancement", SAME_REF)}
        <p><b>Claude Opus 5.5</b> reorganized the data, not just the update. Every table that sales joins, together with the tables behind it, forms a branch whose joins are many-to-one. It joined each branch once into a small side table with one row per key that appears in sales. The residuals lived in a slim table holding only the residual and the sales keys. After a tree, each sales row joined its keys to the side tables, where every split test was precomputed per key as bits, and one query subtracted the scaled leaf value. Split statistics came from per-key residual sums; for each split it aggregated only the smaller child and derived the sibling by subtraction.</p>` },
    ],
    takeaways: ["Each tree fits the residuals earlier trees leave.", "One batched pass, not one per leaf.", "Ten models passed; the best ran 10x the per-leaf baseline."],
  },
  {
    slug: "4-fargo", nav: "FARGO", title: "FARGO: When to Stop Probing",
    subtitle: "Inner-product search with hash tables probed in one global order",
    abstract: "FARGO hashes vectors into several tables and probes buckets across all of them by quantization distance. It stops when a better answer has become unlikely. Our model builds the order and the stop rule on 800 vectors.",
    tags: ["MIPS", "locality-sensitive hashing", "multi-probing", "quantization distance", "early stopping"],
    hero: "code:probe", heroCaption: "Every bucket of every table, in one global order",
    sections: [
      { id: "idea", title: "One global order of buckets", html: `
        <p><b>Maximum inner-product search</b> (MIPS) finds the stored vectors whose dot product with a query is largest; retrieval and recommendation depend on it. <b>FARGO</b> (PVLDB 2023) splits the vectors into partitions by length. Within a partition, one extra coordinate gives every vector the same length, so a large inner product means a small angle. Each partition is hashed into <code>L</code> tables of <code>K</code> sign bits, one per random projection.</p>
        <p>A query's own bucket in each table comes first. Flipping bit <code>i</code> costs the query's squared projection on that bit, normalized, so a bucket's <b>quantization distance</b> (QD) is the sum of the costs of the bits where it differs from the query's key. FARGO probes buckets across all tables in one global order of QD. Our data: 800 vectors in 12 dimensions, in 8 clusters, with 4 tables of 6 bits and 4 partitions.</p>
        ${code("fargo")}
        ${code("probe")}
        <p>The four home buckets come first, at QD 0; then the cheapest single flips, from whichever table offers them.</p>` },
      { id: "stop", title: "The stop rule", html: `
        <p>Let <code>I_k</code> be the k-th best inner product so far, <code>c</code> the approximation ratio and <code>U</code> the partition's largest possible inner product (its length times the query's). An unseen vector matters only if it beats <code>I_k / c</code>. If <code>I_k ≥ c U</code>, nothing in the partition can, and it stops at once. Otherwise such a vector lies within angle <code>θ = acos(I_k / (c U))</code> of the query, and each of its bits differs from the query's with chance <code>θ / π</code>. From that, <code>φ(d; θ)</code> is the chance that its bucket in one table has QD at most <code>d</code>, the next bucket's QD. The paper's test is <code>α₂ = 1 − φ^L &lt; p_τ</code>, with <code>p_τ = 0.1</code>: stop once it is unlikely that some table still holds the vector unseen. FARGO reads <code>φ</code> from a precomputed table; our model computes it for the query's own projections, one table at a time.</p>
        ${code("stop")}
        <p>We compare FARGO's rule with a fixed budget of vectors per partition, the task's starter, on 20 queries with <code>k = 10</code>.</p>
        ${code("rules")}
        ${predict("A budget of 50 vectors per partition verifies about 222 vectors per query. Will the adaptive rule at c = 0.8 need more or fewer to reach a higher recall?", "<p>Fewer: about 201 vectors for recall 0.970, against 0.845 for the budget. It stops early where the answer is settled and probes longer where it is not.</p>")}
        ${demo("fargo", "Demo 3 · Probing with a stop rule", "pick a query and a rule")}
        <p>At about the same work, the adaptive rule at <code>c = 0.8</code> finds more of the true top 10 than a budget of 50 per partition. A larger <code>c</code> asks for more and probes longer.</p>` },
    ],
    takeaways: ["Probe buckets across tables by quantization distance.", "Stop when the k-th result is settled or a miss is unlikely.", "c trades work for accuracy."],
  },
  {
    slug: "5-fargo-tasks", nav: "Two tasks", title: "FARGO: Two Tasks, One Paper",
    subtitle: "Choose the stop rule, or build the whole query core",
    abstract: "When agents chose the stop rule, the top scores stopped early and failed on recall. When the task fixed the rule and asked for the query core, twelve models passed by making the same search faster.",
    tags: ["FARGO Query Stopping", "FARGO Query Core", "recall", "query time", "FDI 60.3 and 18.4"],
    sections: [
      { id: "stopping", title: "FARGO Query Stopping", html: `
        <p>This task removes the stop rule, <code>should_stop</code> in <code>src/alg.cpp</code>, and the agent writes it. After each bucket, it sees the result heap, the bucket's score, the work done so far, the ratio and the bound, and the path to the authors' lookup table. The shipped rule stops after a fixed number of candidates.</p>
        <p>The workload is the Audio dataset, 54,387 vectors of 192 dimensions, with 150 public and 150 hidden queries, at <code>c</code> of 0.6, 0.8 and 0.9 and result-heap sizes of 100, 200, 400 and 800, scored on the first 50 results. Each of the 12 settings scores <code>100 Q E / (1 + E)</code>, where <code>Q</code> combines recall and the last result's inner-product ratio, and <code>E</code> the gains in query time and verified candidates over the fixed-budget starter. To pass, at all 12 settings: mean query time strictly lower than the human reference's, recall and last-result ratio no lower, and verified candidates no more.</p>
        <p>5 of 16 models passed; 13 of 16 scored above the human reference (80.8).</p>
        <table><tr><th>Run</th><th>Last-result ratio</th><th>Query time (ms)</th><th>Recall@50</th><th>Candidates</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>0.996</td><td>5.45</td><td>0.963</td><td>6,750</td><td>80.8</td><td></td></tr>
        <tr><td>GLM 5.3</td><td>0.992</td><td>1.18</td><td>0.921</td><td>2,970</td><td>86.7</td><td>${fail}</td></tr>
        <tr><td>Kimi K3</td><td>0.988</td><td>1.65</td><td>0.897</td><td>2,990</td><td>85.5</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>0.995</td><td>4.38</td><td>0.956</td><td>6,070</td><td>81.8</td><td>${pass}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>0.995</td><td>4.44</td><td>0.956</td><td>6,160</td><td>81.7</td><td>${pass}</td></tr></table>
        ${asOf("approximate-mips-query-stopping", " The top two scores came from stopping much earlier: three to five times faster, at a cost in recall the score allows and the pass rule does not.")}
        <p><b>Claude Opus 5.5</b> kept the fixed budget as an upper limit and added a probability test. From the k-th score, <code>c</code> and the partition's largest length it found the angle; if no angle qualified, the partition stopped at once. From the authors' lookup table it took the chance that one table had already probed a vector at that angle; with <code>L</code> tables, one minus the miss chance to the power <code>L</code> is the chance that at least one had. It stopped once that reached 90%. This is not the <code>α₂</code> rule from the previous chapter, which the Query Core task fixes: <code>α₂</code> asks that no table still hold the vector unseen. It read the lookup table's columns lazily and remembered, per angle, the first column that passes. Its own idea was the settled-partition stop: once k results reach the largest inner product a partition allows, neither it nor any partition of shorter vectors can enter the answer. It checked this only after 1, 2, 4, 8 and later powers of two probes, to keep it cheap.</p>` },
      { id: "core", title: "FARGO Query Core", html: `
        <p>This task removes the whole query core: the frontier that streams <code>(table, key, score)</code> buckets across all tables, each exactly once, with the score equal to the sum of squared projections on the differing bits, and the stop rule, which the statement fixes to the paper's <code>α₂ &lt; 0.1</code>. Searches run on Audio and MNIST (60,000 × 784), at <code>c</code> of 0.6, 0.8, 0.9 and <code>k</code> of 1, 10, 50, 100. To pass, every setting must equal or beat the human reference on recall and answer quality, verify no more candidates, and answer strictly faster.</p>
        <p>12 of 16 models passed; 15 of 16 scored above the human reference (50.9).</p>
        <table><tr><th>Run</th><th>Candidates verified</th><th>Overall ratio</th><th>Query time (ms)</th><th>Recall</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>7,060</td><td>0.983</td><td>9.48</td><td>0.76</td><td>50.9</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>7,060</td><td>0.983</td><td>6.64</td><td>0.76</td><td>52.6</td><td>${pass}</td></tr>
        <tr><td>GPT-6 Astra</td><td>7,060</td><td>0.983</td><td>6.56</td><td>0.76</td><td>52.5</td><td>${pass}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>7,060</td><td>0.983</td><td>6.26</td><td>0.76</td><td>52.5</td><td>${pass}</td></tr>
        <tr><td>Kimi K3</td><td>7,060</td><td>0.983</td><td>7.5</td><td>0.76</td><td>52.1</td><td>${fail}</td></tr></table>
        ${asOf("fargo-paper-aligned-query-core", " Every scored run reached the same rounded means (7,060 candidates, recall 0.76): with the rule fixed, the task became a race on speed.")}
        <p><b>Claude Opus 5.5</b> produced the early buckets from a small heap over all tables, growing sets of flipped bits by shift and expand moves over each table's sorted costs, so each bucket appears once, in order. For deep probing it switched to batches: each table's costs split into a low and a high half with precomputed sorted subset sums, and every bucket below the next threshold was emitted at once and sorted. For fixed inputs the stop rule is a cutoff distance, cached until the k-th result changes.</p>
        ${callout("pattern", "SAME PAPER, TWO TASKS", "<p>When the agent chose the rule, the best scores stopped early and failed. When the rule was fixed, nearly everyone passed by making the same search faster.</p>")}` },
    ],
    takeaways: ["A high score can come from lost recall.", "Every bar must hold at every setting.", "A fixed rule turns the task into a speed race."],
  },
  {
    slug: "6-graphs", nav: "Graphs", title: "Graph Patterns: SCOPE and ScaleGPM",
    subtitle: "Exact local counts in a batch, and picking the faster approximate engine",
    abstract: "SCOPE counts small patterns around every vertex; the best runs counted easy homomorphisms and shared work across the batch, about 43 times faster than one query at a time. ScaleGPM picks between sampling and sparsification, scored by runtime regret.",
    tags: ["subgraph counting", "orbits", "homomorphisms", "regret", "FDI 46.8 and 38.2"],
    hero: "code:formulas", heroCaption: "Local counts from degrees and common neighbors",
    sections: [
      { id: "local", title: "Local counts", html: `
        <p><b>SCOPE</b> (PVLDB 2024) counts small patterns around every vertex of a large graph: for each vertex, how many copies of a pattern place one chosen pattern vertex, the <b>orbit</b>, there. By definition the count is <code>|ISO(v)| · |θ| / |Aut(p)|</code>: the one-to-one edge-preserving maps that send the orbit vertex to <code>v</code>, times the size of its orbit under the pattern's symmetries, over the number of symmetries. Our graph has 40 vertices and 120 edges.</p>
        ${code("local")}
        <p>Counting maps one by one is slow. Formulas are fast, and two shared tables serve the whole batch: the degrees and the common-neighbor counts. The wedge end is a small case of the trick Opus used: a walk <code>v–u–w</code> counts <code>Σ deg(u)</code> maps, and subtracting the <code>deg(v)</code> walks that return to <code>v</code> leaves the one-to-one ones.</p>
        ${code("formulas")}
        ${demo("pattern", "Demo 4 · Local counts", "click a vertex")}` },
      { id: "scope", title: "SCOPE: the task and the runs", html: `
        <p>The task removes SCOPE's batch mode, which counts many patterns in one run with shared plans, in up to ten C++ files. Each submission counts two batches, 24 five-vertex patterns and 4 smaller ones, on three real graphs: web pages (4,767 vertices), movie ratings (7,601) and yeast proteins (6,008). Every count must equal an independent count exactly. On one core, the score is <code>L = median log2(B / C)</code> over five timing rounds against the independent one-query path, and <code>score = 100 L / (2 + L)</code>. To pass, each of the six graph-and-batch workloads must beat the human reference's time in every one of the five rounds.</p>
        <p>5 of 16 models passed; 10 of 16 scored above the human reference (20.1).</p>
        <table><tr><th>Run</th><th>Batch latency (s)</th><th>Exact counts</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>3.59</td><td>1</td><td>20.1</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>0.123</td><td>1</td><td>73.1</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>0.14</td><td>1</td><td>72.1</td><td>${pass}</td></tr>
        <tr><td>GPT-6 Astra</td><td>0.198</td><td>1</td><td>70.3</td><td>${pass}</td></tr>
        <tr><td>Kimi K3</td><td>2.21</td><td>1</td><td>37.6</td><td>${fail}</td></tr></table>
        ${asOf("scope", " Inverting the score, 20.1 is about 1.4x over the one-query path and 73.1 about 43x.")}
        <p><b>Claude Opus 5.5</b> rewrote each pattern's count as a signed sum of <b>homomorphism</b> counts (maps that need not be one-to-one) of the pattern's quotients, by Möbius inversion over vertex partitions. Homomorphisms are far easier to count. Each rooted shape got a canonical code, so equal sub-shapes of different queries were computed once. Trees reduce to sparse matrix–vector products; dedicated kernels counted the dense cores, from triangles to the 5-clique, with per-edge triangle counts, bitsets and a dense table of common-neighbor counts. Anything outside this class went to the original path.</p>` },
      { id: "scalegpm", title: "ScaleGPM: picking an engine", html: `
        <p><b>ScaleGPM</b> (PVLDB 2024) estimates how often a pattern occurs within a relative-error target, with two engines: neighborhood sampling (<code>NS</code>) and color-based graph sparsification (<code>GS</code>). Both meet the target; which is faster depends on the graph and the settings. The task removes the <code>threshold</code> function that picks one, and the agent writes it. It sees the graph's vertices, adjacency entries, triangle count and largest degree, the pattern (triangle or 4-clique), the error target, both engines' settings and the core count.</p>
        <p>The score uses measured runtimes for 112 settings on eight graphs. A pick's <b>regret</b> is its runtime over the faster engine's; <code>R</code> is the geometric mean, <code>B</code> the better constant pick's, and the score is <code>100 (B − R) / (B − 1)</code>. Our twelve settings and their times are made up.</p>
        ${code("regret")}
        ${demo("regret", "Demo 5 · Regret, not accuracy", "click the settings")}
        <p>Two selectors with the same accuracy land far apart: a wrong pick costs little where the engines are close and much where they are not. To pass, the picks must beat the human reference's geometric-mean runtime, separately for triangles and for 4-cliques.</p>
        <p>7 of 16 models passed; 9 of 16 scored above the human reference (86.9).</p>
        <table><tr><th>Run</th><th>Estimate accuracy</th><th>Run time (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>1</td><td>11.9</td><td>86.9</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>1</td><td>11.7</td><td>92.0</td><td>${pass}</td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>1</td><td>11.7</td><td>92.0</td><td>${pass}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>1</td><td>11.8</td><td>91.1</td><td>${pass}</td></tr>
        <tr><td>GPT-6.1 Terra</td><td>1</td><td>11.9</td><td>88.2</td><td>${fail}</td></tr></table>
        ${asOf("scalegpm")}
        <p><b>Claude Opus 5.5</b> predicted each engine's time with its own formula. Sampling grows with the sample count, the average degree and the graph size; sparsification with the vertices and edges, divided by powers of the number of colors, with triangle terms for 4-cliques. It fitted the coefficients to its own timings of the unmodified engines on generated small-world graphs, one set per pattern and core count, and picked the smaller prediction. Its own idea: small-world graphs with fewer random shortcuts have more triangles and more local neighbor lists, which merge faster. It inferred the share of rewired edges from the triangle count, against a regular lattice of the same degree, and added a locality term to both formulas.</p>` },
    ],
    takeaways: ["Local counts from shared degree and neighbor tables.", "Homomorphisms are easy; inversion recovers copies.", "Regret weighs a wrong pick by its cost."],
  },
  {
    slug: "7-blockchain", nav: "EVM", title: "Blockchain Execution: Spectrum and Seer",
    subtitle: "Cheap checkpoints on the EVM stack, and per-branch predictors",
    abstract: "Spectrum rolls conflicting smart-contract transactions back to checkpoints; the agent writes a stack that saves and restores them cheaply. Seer predicts branch directions; the agent writes one small predictor per branch.",
    tags: ["EVM", "checkpoints", "copy on write", "branch prediction", "FDI 64.6 and 53.7"],
    hero: "code:paged", heroCaption: "Pages of four, shared until written",
    sections: [
      { id: "stack", title: "Checkpoints on the stack", html: `
        <p><b>Spectrum</b> (PVLDB 2024) runs Ethereum smart-contract transactions in parallel but commits them in the order consensus fixed. When two conflict, it does not restart the later one; it rolls it back to a <b>checkpoint</b> taken partway through. A checkpoint saves the code position and the operand stack. Copying a deep stack at every checkpoint is slow and uses memory. Our second stack keeps items in pages of four: a checkpoint copies only the page table, a list of pointers that our model does not count (Opus delayed even that copy), and a page is copied only on its first write after a checkpoint.</p>
        ${code("copystack")}
        ${code("paged")}
        <p>The task's correctness trace, in small: push 200 items, keep 16 checkpoints, with 24 writes after each, then restore every one and compare with what it saw.</p>
        ${code("ctrace")}
        ${demo("stack", "Demo 6 · Two checkpointed stacks", "move the sliders")}
        <p>Saving and restoring copy nothing; the writes pay instead, a page at a time, and the 16 checkpoints share most of their pages.</p>` },
      { id: "spectrum", title: "Spectrum: the task and the runs", html: `
        <p>The task removes the checkpoint-capable stack, <code>StackTop</code> and <code>Checkpoint</code> in one C++ header, and the agent writes it. Indexed reads and writes count from the top; a checkpoint must be copyable and movable, and creating, restoring, copying or destroying one must not change any other. Allocation is tracked, and <code>malloc</code>, <code>operator new</code> and the like are banned from the added lines.</p>
        <p>A submission first passes checkpoint traces against a fixed-array oracle: 400 rounds of 1,000 pushes and 16 live checkpoints. Then it runs YCSB, SmallBank and a TPC-C-like workload for one second each. The score combines committed throughput <code>T</code>, creation and restore times <code>C</code> and <code>R</code>, and memory per checkpoint <code>M</code>, as <code>Q = T / (M √(C R))^(1/3)</code>, and gives <code>100 log10</code> of <code>Q</code> over the shipped stack's.</p>
        ${code("points")}
        <p>To pass, it must beat the human reference on all four: throughput, creation time, restore time and memory per checkpoint.</p>
        <p>2 of 16 models passed; 9 of 16 scored above the human reference (61.4).</p>
        <table><tr><th>Run</th><th>Create (ns)</th><th>Restore (ns)</th><th>Transactions/s</th><th>Memory per checkpoint (bytes)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>231</td><td>65</td><td>42,500</td><td>13,400</td><td>61.4</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>37</td><td>30</td><td>47,500</td><td>8,500</td><td>100.0</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>43</td><td>25</td><td>48,100</td><td>8,560</td><td>88.5</td><td>${pass}</td></tr>
        <tr><td>Kimi K3.1 Pro</td><td>99</td><td>309</td><td>43,600</td><td>10,700</td><td>83.7</td><td>${fail}</td></tr>
        <tr><td>GLM 5.3</td><td>39</td><td>428</td><td>47,900</td><td>4,300</td><td>78.6</td><td>${fail}</td></tr></table>
        ${asOf("spectrum", " GLM 5.3 used half Opus's memory and lost on restore time.")}
        <p><b>Claude Opus 5.5</b> stored the stack in pages of four with a page table, as in our model. Saving a deep stack shared the live table in constant time; the live stack copied the table, and then each page, only when it first wrote there. A stack of at most 63 items was copied flat instead. Restoring one of the stack's own checkpoints swapped its table back in. Pages and tables came from free lists carved out of the stack's own preallocated space, and a mark-and-sweep pass freed pages no table referred to.</p>` },
      { id: "seer", title: "Seer: predicting branches", html: `
        <p><b>Seer</b> (PVLDB 2024) speeds up Ethereum block execution by predicting which way smart-contract branches will go. Many branches test state that earlier transactions wrote. The task removes the branch predictor: one small predictor per branch, which answers taken, not taken or <b>unsure</b>, and then learns the direction the branch really took. Within a block, all predictions come before the observations. Our trace has 60 branches over 40 blocks: some always go one way, some switch once, some change from block to block, and a few are random.</p>
        ${code("btrace")}
        <p>Three predictors: always taken (the task's calibration), the last direction seen, and Opus's rule, which predicts the last direction only after it has held, unchanged, across two distinct blocks.</p>
        ${code("predictors")}
        ${demo("seer", "Demo 7 · Three branch predictors", "pick a predictor")}
        <p>Waiting for a second block halves the wrong guesses, at the price of more unsure answers.</p>` },
      { id: "seer-judged", title: "Seer: how it is judged", html: `
        <p>The predictor is a Go file, <code>core/vm/predictor.go</code>, with only the <code>math</code>, <code>math/bits</code>, <code>sort</code>, <code>sync</code> and <code>sync/atomic</code> packages allowed. The judge replays 600 consecutive blocks of Ethereum mainnet from height 14,650,000, with the authors' snapshot. Transactions using at least 100,000 gas are complex, the rest normal. Each block and category reports a transaction path accuracy (a ratio) <code>T</code> and a branch accuracy <code>B</code>. The score is <code>Q = 100 (0.8 B + 0.2 T)</code>, normalized against the always-taken predictor and squared. To pass, in each category and each of the three 200-block periods, the summed branch accuracy must rise by at least one printed hundredth over the human reference, and the summed path ratio must not fall.</p>
        <p>4 of 16 models passed; 14 of 16 scored above the human reference (80.4).</p>
        <table><tr><th>Run</th><th>Branch accuracy</th><th>Transaction path accuracy</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>0.954</td><td>0.873</td><td>80.4</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>0.96</td><td>0.893</td><td>81.5</td><td>${pass}</td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>0.96</td><td>0.893</td><td>81.4</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>0.96</td><td>0.892</td><td>81.3</td><td>${pass}</td></tr>
        <tr><td>GPT-6 Astra</td><td>0.959</td><td>0.891</td><td>81.2</td><td>${fail}</td></tr>
        <tr><td>Kimi K3</td><td>0.959</td><td>0.891</td><td>81.0</td><td>${pass}</td></tr></table>
        ${asOf("seer", " Ten runs reached the same rounded means and the pass split them: it is decided per category and period, so Kimi K3 passed with 81.0 while GPT-6 Astra failed with 81.2.")}
        <p><b>Claude Opus 5.5</b> used the two-block rule from our model. Observations within one block see nearly the same state, so it counted blocks, not observations, and found block boundaries from the replay order. It also kept the history of branches seen in two distinct blocks when the system swept away rarely seen predictors.</p>` },
    ],
    takeaways: ["Share pages between checkpoints; copy on first write.", "Throughput weighs most in the Spectrum score.", "An unsure answer avoids a wrong guess."],
  },
  {
    slug: "8-treap", nav: "Treap", title: "Persistent Treap: Every Version Stays",
    subtitle: "Path copying, concurrent updates and range sums on past versions",
    abstract: "A persistent treap keeps every version readable by copying only the path an update changes. The agent writes the concurrent update engine; Claude Opus 5.5 split the treap into units owned by workers and had the best score, 40.2.",
    tags: ["treap", "persistence", "path copying", "concurrency", "FDI 18.1"],
    hero: "code:treap", heroCaption: "An insert copies only its path",
    sections: [
      { id: "copy", title: "Path copying", html: `
        <p><b>Contreap</b> (PVLDB 2025) is an ordered index on a <b>treap</b>: a binary search tree that also keeps random priorities in heap order, which keeps it balanced. Each node stores a key, its multiplicity and the total multiplicity of its subtree, so range sums are fast. It is <b>persistent</b>: every transaction makes a new version, and every old version stays readable. An update copies only the path it changes; everything else is shared with the old version.</p>
        ${code("treap")}
        ${code("delete")}
        <p>A trace in the task's style: 500 even keys, then 3,000 transactions in the balanced mix, 42% inserts, 25% deletes and 33% range queries over 128 keys. Every version's root is kept, and we check range sums on random past versions against the multisets we recorded.</p>
        ${code("versions")}
        <p>About a dozen new nodes per update keep 3,001 complete versions alive.</p>` },
      { id: "units", title: "Units, workers and a hot range", html: `
        <p><b>Claude Opus 5.5</b> made updates parallel. Nodes with priority above a threshold form the <b>top</b> of the treap; each subtree below them, a <b>unit</b>, holds the keys between two consecutive top keys. Each update goes to the worker that owns its unit, and workers copy paths inside their units independently. A linker thread then copies the short top path of each update, in version order, and publishes the version.</p>
        ${code("units")}
        ${demo("treap", "Demo 8 · Past versions and worker loads", "move the sliders")}
        <p>In a hotspot, two workers do all the work and the linker's serial share grows. Opus's own idea answers this: it sampled recent update keys, and when 90% fell in a narrow range it raised the top node over that range to the root, so updates there stop copying ancestors on the other side.</p>` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task removes the update scheduler and the insert and delete routines, three C++ headers, and the agent writes them. A reader may ask for any version at any moment, while updates are still running, and must never see a half-built tree. Each trace has 80,000 to 89,999 initial keys and 450,000 to 539,999 transactions, in four mixes (balanced, read-heavy, update-heavy and hotspot), run with 4 to 6 server threads and 1 or 2 query clients. Concurrent checkers verify ordering, multiplicities, range sums and that no node comes from a future version.</p>
        <p>The score is <code>L(S)</code> (as for Yannakakis) of the geometric-mean throughput gain over a fixed serial scaffold. To pass, every one of the 24 case-and-thread groups must beat the human reference on three counts: throughput, peak memory, and the time of 100,000 range queries on random past versions.</p>
        <p>12 of 16 models passed; 15 of 16 scored above the human reference (10.2).</p>
        <table><tr><th>Run</th><th>Throughput (KTPS)</th><th>Historical query (µs)</th><th>Peak memory (MiB)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>1,540</td><td>2.67</td><td>548</td><td>10.2</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>5,100</td><td>2.83</td><td>465</td><td>40.2</td><td>${pass}</td></tr>
        <tr><td>GPT-6.1 Terra</td><td>4,200</td><td>1.79</td><td>406</td><td>34.2</td><td>${pass}</td></tr>
        <tr><td>Qwen 3.8 Max</td><td>3,250</td><td>2.48</td><td>469</td><td>34.2</td><td>${pass}</td></tr>
        <tr><td>DeepSeek V4.1 Flash</td><td>2,930</td><td>2.37</td><td>403</td><td>28.5</td><td>${fail}</td></tr></table>
        ${asOf("persistent-treap-update-engine", SAME_REF)}
        ${code("tscore")}
        <p>Besides the units and the hot range, <b>Claude Opus 5.5</b> copied paths top-down in one pass, writing each ancestor's subtree count once, and a delete first found its key, so a missing key created no nodes. Nodes are never freed, so path copies came from large regions by a bump allocator; a helper thread touched the next pages ahead of the linker, and unused tails were returned so they never counted toward peak memory.</p>` },
    ],
    takeaways: ["Copy the path; share the rest.", "Units let workers copy paths in parallel.", "Three bars per group: throughput, memory, history."],
  },
  {
    slug: "9-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>Query processing</h3><ul><li>Yannakakis: semijoins, then joins; no pass</li><li>JoinBoost: one-pass residual updates; 10 passes</li></ul></div>
        <div class="card"><h3>Vector search</h3><ul><li>Probe by quantization distance</li><li>Stop when a miss is unlikely</li><li>Chosen rule: 5 passes; fixed rule: 12</li></ul></div>
        <div class="card"><h3>Graph patterns</h3><ul><li>SCOPE: homomorphisms, shared work</li><li>ScaleGPM: picks scored by regret</li></ul></div>
        <div class="card"><h3>Blockchain</h3><ul><li>Spectrum: copy-on-write checkpoints</li><li>Seer: predict after two stable blocks</li></ul></div>
        <div class="card"><h3>Persistent index</h3><ul><li>Path copying keeps every version</li><li>Units owned by workers</li></ul></div></div>` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★ (modify)</h3>
        <p>In the Yannakakis model, filter users to 20 instead of 4. How do the binary plan's intermediate result and the cheapest root change?</p>
        <h3>Exercise 2 ★★ (think)</h3>
        <p>In the JoinBoost model, use a learning rate of 1.0. Check the identity, and explain why the SSE now drops by exactly <code>Σ g² / h</code>.</p>
        <details class="reveal"><summary>Hint</summary><p>With <code>lr = 1</code>, <code>2 lr − lr² = 1</code>: each leaf's residuals are moved to mean zero, which removes the leaf's share of the sum of squares, <code>g² / h</code>.</p></details>
        <h3>Exercise 3 ★ (experiment)</h3>
        <p>In the FARGO model, use <code>p_τ = 0.3</code>. How do recall and work change at <code>c = 0.8</code>?</p>
        <h3>Exercise 4 ★★ (think)</h3>
        <p>Derive the formula for the number of wedges with <code>v</code> at one end from homomorphisms, and say which maps the <code>− deg(v)</code> removes.</p>
        <details class="reveal"><summary>Solution</summary><p>A homomorphism of the path <code>o–a–b</code> with <code>o ↦ v</code> picks a neighbor <code>u</code> of <code>v</code> and then any neighbor of <code>u</code>: <code>Σ deg(u)</code>. It is one-to-one unless <code>b ↦ v</code>, which happens once per neighbor <code>u</code>: <code>deg(v)</code> maps. An end's orbit has two vertices and the wedge has two symmetries, so the count equals the number of one-to-one maps: <code>Σ deg(u) − deg(v)</code>.</p></details>
        <h3>Exercise 5 ★ (modify)</h3>
        <p>In the Spectrum model, use pages of 16 items. What happens to the items copied on write and the items kept, and why?</p>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li><em>Instance-Optimal Acyclic Join Processing Without Regret: Engineering the Yannakakis Algorithm in Column Stores.</em> PVLDB 2025. <a href="https://www.vldb.org/pvldb/vol18/p2413-vansummeren.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li><em>JoinBoost: Grow Trees over Normalized Data Using Only SQL.</em> PVLDB 2023. <a href="https://www.vldb.org/pvldb/vol16/p3071-huang.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li><em>FARGO: Fast Maximum Inner Product Search via Global Multi-Probing.</em> PVLDB 2023. <a href="https://www.vldb.org/pvldb/vol16/p1100-zheng.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li><em>Fast Local Subgraph Counting.</em> PVLDB 2024. <a href="https://www.vldb.org/pvldb/vol17/p1967-li.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li><em>Accurate and Fast Approximate Graph Pattern Mining at Scale.</em> PVLDB 2024. <a href="https://www.vldb.org/pvldb/vol18/p93-chen.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li><em>Spectrum: Speedy and Strictly-Deterministic Smart Contract Transactions for Blockchain Ledgers.</em> PVLDB 2024. <a href="https://www.vldb.org/pvldb/vol17/p2541-zhang.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li><em>Seer: Accelerating Blockchain Transaction Execution by Fine-Grained Branch Prediction.</em> PVLDB 2024. <a href="https://www.vldb.org/pvldb/vol18/p822-xiao.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li><em>Efficient Concurrent Updates to Persistent Randomized Binary Search Trees.</em> PVLDB 2025. <a href="https://www.vldb.org/pvldb/vol18/p1481-wang.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li>Task pages: <a href="${TASK}yannakakis" target="_blank" rel="noopener">Yannakakis</a>, <a href="${TASK}residual-state-advancement" target="_blank" rel="noopener">JoinBoost</a>, <a href="${TASK}approximate-mips-query-stopping" target="_blank" rel="noopener">FARGO Query Stopping</a>, <a href="${TASK}fargo-paper-aligned-query-core" target="_blank" rel="noopener">FARGO Query Core</a>, <a href="${TASK}scope" target="_blank" rel="noopener">SCOPE</a>, <a href="${TASK}scalegpm" target="_blank" rel="noopener">ScaleGPM</a>, <a href="${TASK}spectrum" target="_blank" rel="noopener">Spectrum</a>, <a href="${TASK}seer" target="_blank" rel="noopener">Seer</a>, <a href="${TASK}persistent-treap-update-engine" target="_blank" rel="noopener">Persistent Treap</a></li></ul>` },
    ],
    takeaways: ["Do the cheap pass first.", "Reorganize the data.", "The pass rule decides."],
  },
];

const QUIZ = [
  { q: "What does the first phase of the Yannakakis algorithm do?",
    opts: ["Sorts every table", "Drops, with semijoins, rows that have no partner further down the join tree", "Builds all binary joins", "Estimates the result size"],
    a: 1, why: "Semijoins keep only rows with a partner. After them, no intermediate join result is larger than the answer: 600 rows shrank to 60 in our model." },
  { q: "A join on key 0 has, as the leftmost table of its left side, a users table that holds only key 1. What happens?",
    opts: ["The plan does not lower: the keys must be in the leftmost table of both sides", "Nothing; the plan lowers", "The engine adds a cross product", "The query returns no rows"],
    a: 0, why: "That is the task's lowerability rule. Rebuilding the plan from a join tree, with each child joined onto its parent, always satisfies it." },
  { q: "In JoinBoost, a leaf holds h rows with residuals summing to g. With learning rate lr, by how much does the sum of squared residuals drop?",
    opts: ["lr · g", "g² / h always", "(2 lr − lr²) g² / h", "It may rise"],
    a: 2, why: "Each row moves by lr · g / h. Expanding the squares gives a drop of (2 lr − lr²) g² / h; the judge checks it after every update." },
  { q: "On FARGO Query Stopping, GLM 5.3 had the best score, 86.7, and failed. Why?",
    opts: ["It was slower than the reference", "It crashed on hidden queries", "It verified more candidates", "It stopped early: more than four times faster, but its recall fell below the reference's"],
    a: 3, why: "The score rewards speed and fewer candidates and tolerates some lost recall; the pass rule does not. Its recall@50 was 0.921 against 0.963." },
  { q: "Two ScaleGPM selectors each pick the faster engine on 10 of 12 settings. Why can their scores differ widely?",
    opts: ["The score uses regret: a wrong pick costs little where the engines are close and much where they are not", "Ties are broken at random", "Only 4-cliques count", "The score rounds accuracy"],
    a: 0, why: "In our model, wrong on two close calls scores 91.5 and wrong on two wide gaps 18.2, with the same accuracy." },
];
