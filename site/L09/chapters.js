// L09 content, adapted from frontiercs2/notes/L09-programming-languages.md (checked by tools/check.py).

const demo = (name, title, instr, hint = "") =>
  `<div class="card demo" data-demo="${name}"><div class="head"><span class="title">${title}</span><span>${instr}</span></div>
   <div class="demo-body"></div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const callout = (kind, label, body) => `<div class="callout ${kind}"><b>${label}</b>${body}</div>`;
const predict = (q, a) => callout("predict", "PREDICT", `<p>${q}</p><details class="reveal"><summary>Show the answer</summary>${a}</details>`);
const out = (name) => codeBlock(OUT[name], "out");
const code = (name) => codeBlock(CODE[name]) + (OUT[name] ? out(name) : "");
const pass = '<span class="chip pass">Pass</span>', fail = '<span class="chip fail">Fail</span>';
const TASK = "https://frontier-cs.org/task/#";
const AS_OF = "as of October 26, 2026";

const LECTURE = {
  number: 9,
  title: "Programming Languages",
  tagline: "One e-graph, three tasks, and two queries that disagree",
  lead: "The four Programming Languages tasks of FrontierCS 2: rebuilding an e-graph once per batch of merges, learning library functions by anti-unification, finding a database on which two SQL queries disagree, and tracking tensor shapes so a convolution can run on matrix hardware. For each one: the idea, the part the task removed, how a run is judged, and what the agents did.",
  heroDemo: "egraphAuto",
  heroLabel: "Egg · congruence after a merge",
  heroCaption: "Merge b and c; rebuilding then merges a + b with a + c, and their products.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the Programming Languages tasks teach",
  why: [
    ["One data structure, three tasks", "Egg maintains the <b>e-graph</b>, BABBLE mines it for functions, and Glenside attaches shapes to it. Union-find, the memo and congruence cover all three."],
    ["Every workload, every metric", "In Egg, <b>thirteen runs</b> beat the reference's score and <b>none passed</b>. In BABBLE the best score failed, and in Polygon the fastest run failed."],
    ["Write less, not faster", "In Glenside, the passing runs added <b>fewer than 50 nodes</b> instead of 55,200: a direct rewrite beat a big search."],
  ],
  ctaTitle: "Ready to merge two e-classes?",
  minutes: "About 75 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-egraph", nav: "E-graphs", title: "Egg: What an E-Graph Stores",
    subtitle: "Union-find, a hash-cons memo, parent lists, and congruence",
    abstract: "Equality saturation keeps every form a rewrite finds, in an e-graph, and picks the cheapest at the end. We build a small e-graph that runs, and watch congruence: when b = c, a + b and a + c must merge too.",
    tags: ["equality saturation", "e-class", "union-find", "congruence"],
    hero: "code:repair", heroCaption: "Repairing a merged class's parents",
    sections: [
      { id: "idea", title: "Equality saturation", html: `
        <p>A compiler that optimizes by rewriting has a problem: which rewrite to apply first? Rewriting <code>a * 2</code> to <code>a &lt;&lt; 1</code> inside <code>(a * 2) / 2</code> can block the rewrite that simplifies it to <code>a</code>. <b>Equality saturation</b> avoids the choice. It keeps every form it finds, applies all rewrites until nothing new appears (or a limit is hit), and only then <b>extracts</b> the cheapest form. The forms live in an <b>e-graph</b>, which shares them compactly. <em>egg: Fast and Extensible Equality Saturation</em> (POPL 2021) is the Rust library behind much recent work, including BABBLE and Glenside.</p>` },
      { id: "parts", title: "Three parts", html: `
        <p>An e-graph groups expressions into <b>e-classes</b> of equal values. Each class holds <b>e-nodes</b>: an operator and the classes of its children, not child expressions. Three parts keep it consistent:</p>
        <ul><li>a <b>union-find</b> over class ids, so that merged classes share one canonical id;</li>
        <li>a <b>hash-cons memo</b> from each e-node to its class, so the same node is never stored twice;</li>
        <li><b>parent lists</b>: for each class, the nodes that use it as a child.</li></ul>
        <p>Merging two classes can make two nodes identical. If <code>b = c</code>, then <code>a + b</code> and <code>a + c</code> have the same operator and the same child classes, so they must be equal too. This is <b>congruence</b>. Restoring it means visiting the parents of merged classes, putting their children in canonical form, and merging any parents that now collide in the memo. egg calls this <b>rebuilding</b>.</p>
        ${code("egraph")}
        <p>Rebuilding repairs every pending class. For each parent of the class, it removes the old memo entry, puts the node in canonical form and stores it again. Two parents that become the same node are congruent, so they are merged, which may queue more work.</p>
        ${code("repair")}` },
      { id: "congruence", title: "Congruence in action", html: `
        <p>We add <code>(a + b) * 2</code> and <code>(a + c) * 2</code>, then merge <code>b</code> and <code>c</code>. Right after the union, the two products are still in different classes. After rebuilding, they share one.</p>
        ${code("congruence")}
        ${predict("Right after <code>union(b, c)</code>, are the two sums in one class?", "<p>No. The union only joins the classes of <code>b</code> and <code>c</code>. The sums still point to the old ids until a rebuild puts them in canonical form and finds them equal.</p>")}
        ${demo("egraph", "Demo 1 · Merge, then rebuild", "click the steps")}
        <p>There are eight classes at the start: <code>a</code>, <code>b</code>, <code>c</code>, <code>2</code>, two sums and two products (<code>a</code> and <code>2</code> are stored once). The union leaves seven. Rebuilding finds that the two sums are congruent and merges them, and then finds the same for the two products: five classes.</p>` },
    ],
    takeaways: ["Classes of equal expressions; nodes point to classes.", "Union-find + memo + parent lists.", "Congruence: equal children, equal parents."],
  },
  {
    slug: "2-rebuild", nav: "Egg", title: "Egg: Rebuild Once per Batch",
    subtitle: "Deferred rebuilding, the task, and why nobody passed",
    abstract: "egg queues merged classes during a batch of rewrites and repairs them once. The task removes rebuilding; a pass must be 5% faster than the reference on every test, in total time and in congruence time. Thirteen runs beat the reference's score; none passed.",
    tags: ["deferred rebuilding", "worklist", "geometric mean", "3rd hardest of 48"],
    hero: "batch", heroCaption: "Repair after every union, or once per batch",
    sections: [
      { id: "work", title: "Counting the work", html: `
        <p>Before egg, e-graphs restored congruence after every union. egg's idea is to <b>defer</b>: apply a whole batch of rewrites, queue the merged classes, and rebuild once. A class that is merged many times in one batch then has its parents repaired once, not once per merge.</p>
        <p>Our workload: a class <code>x0</code> sits under <code>n</code> different operators <code>h0(x0)</code>, <code>h1(x0)</code>, …, and each <code>xj</code> sits under <code>hj</code>. One batch of rewrites merges <code>x1</code>, …, <code>x(n-1)</code> into <code>x0</code>. Each merge makes <code>hj(x0)</code> and <code>hj(xj)</code> congruent. We count parent entries repaired, our measure of work.</p>
        ${code("batch")}
        ${demo("batch", "Demo 2 · Immediate or deferred", "move the slider")}
        <p>Both ways end with the same e-graph: one class for all the <code>x</code>s and one per operator. Repairing after every union visits the parent list of <code>x0</code> each time: repair dedupes it back to <code>n</code> entries, so each of the <code>n − 1</code> unions visits <code>n + 1</code> and the total is <code>n² − 1</code>. Deferring visits the merged list once, <code>2n − 1</code> entries. The paper finds that rebuilding gives asymptotic speedups in practice; our numbers only show the shape of the saving.</p>
        ${callout("pitfall", "DEFERRING HAS A PRICE", "<p>Between rebuilds, the memo can hold stale nodes and two classes can be equal without knowing it. Anything that searches the e-graph must wait for a rebuild. egg rebuilds once per iteration of equality saturation, after all matches are applied.</p>")}` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task gives the agent egg's source with three methods removed: <code>process_unions</code>, which works through the pending merges and analysis updates; <code>rebuild_classes</code>, which puts every class's nodes in canonical form and removes duplicates; and <code>rebuild</code>, which runs both until no work is left. After <code>rebuild</code>, every id must be canonical, congruent nodes must share a class, the memo must agree, <b>analysis data</b> (facts attached to each class, such as a constant's value) must have flowed up to the parents, explanations must stay valid, and extraction must find the cheapest form.</p>
        <p>The workloads are tests from egg's arithmetic suite: three public ones (e-matching, differentiation with explanations, and associativity of addition) and three hidden ones of the same family. Each is run many times. To pass, on every test the agent's code must be at least 5% faster than the human reference in <b>two</b> measures: total wall-clock time, and congruence-maintenance time (the time spent applying matches and rebuilding). The score uses only the agent's own times: with <code>G</code> the geometric mean of its per-test median wall-clock times, <code>score = 100 × S / (S + G)</code> with <code>S = 20 ms</code>. Below, "mean time" means that geometric mean: the tests range from about 5 ms to about 390 ms, so it sits far below the plain average in the results table.</p>
        ${code("eggscore")}` },
      { id: "agents", title: "What the agents did", html: `
        <p>No model passed. Thirteen of sixteen scored above the human reference, yet none was 5% faster on both measures on all six tests.</p>
        <table><tr><th>Run</th><th>Congruence time (ms)</th><th>Wall-clock time (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>3.71</td><td>97.9</td><td>54.3</td><td></td></tr>
        <tr><td>Kimi K3.1 Pro</td><td>3.25 (won 4 of 6)</td><td>77.6 (won 2 of 6)</td><td>62.3</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Terra</td><td>3.21 (won 3 of 6)</td><td>80.8 (won 3 of 6)</td><td>61.8</td><td>${fail}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>2.78 (won 6 of 6)</td><td>74.2 (won 4 of 6)</td><td>61.7</td><td>${fail}</td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>2.84 (won 6 of 6)</td><td>77.2 (won 4 of 6)</td><td>61.6</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>3.98 (won 0 of 6)</td><td>99.6 (won 0 of 6)</td><td>52.8</td><td>${fail}</td></tr></table>
        <p class="meta">Selected rows; means over the six graded tests (three public, three hidden), ${AS_OF}. "Won" counts the tests on which the run beat the reference. <a href="${TASK}egg" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Gemini 4 Argon · Pi and Gemini 4 Argon · Antigravity came closest: each beat the reference on congruence time in all six tests and on wall-clock time in four. The task page describes the run of <b>Claude Opus 5.5</b>, which did not pass. It finds congruences through collisions in one global memo rather than a per-class <code>seen</code> map, then propagates analysis data: when a class's data changes, its parents go back on the queue. Both loops repeat until neither has work. Finally it visits every class once, sorts its nodes and removes duplicates, and rebuilds the index from each operator to the classes that contain it, which pattern matching uses.</p>
        ${callout("pitfall", "AN AVERAGE IS NOT A PASS", "<p>A run that is faster on average can still be slower on one test, or fast in total but slow in rebuilding. The pass rule asks for every test and both measures.</p>")}` },
    ],
    takeaways: ["Queue merges; rebuild once per batch.", "Pass: 5% faster on every test, two measures.", "0 of 16 passed; 13 beat the reference's score."],
  },
  {
    slug: "3-babble", nav: "BABBLE", title: "BABBLE: Learning a Library",
    subtitle: "Anti-unification over an e-graph finds functions that shrink a corpus",
    abstract: "Line up two program fragments and put a hole wherever they differ: that is anti-unification. Every pair of e-classes gives a candidate function; the best one shrinks the corpus most. The task removes the candidate step; one model passed.",
    tags: ["library learning", "anti-unification", "compression", "tree automaton"],
    hero: "code:au", heroCaption: "Anti-unifying two e-classes",
    sections: [
      { id: "idea", title: "Library learning", html: `
        <p>People who write many related programs factor out functions. <b>Library learning</b> does this automatically: given a corpus of programs, find functions whose use makes the corpus smallest. <em>babble: Learning Better Abstractions with E-Graphs and Anti-unification</em> (POPL 2023) finds candidate functions by <b>anti-unification</b> and keeps the corpus in an e-graph, so that equivalent forms of each fragment are considered too.</p>` },
      { id: "au", title: "Anti-unification", html: `
        <p>To anti-unify two fragments, line them up and put a <b>hole</b> wherever they differ. The result is the most specific pattern that matches both. Our corpus is four turtle drawings: two polygons, and two shapes made of a polygon and a line. We read them into the e-graph from the first chapter, where shared fragments such as <code>(move 10)</code> become one class.</p>
        ${code("parse")}
        <p>Anti-unification works on pairs of e-classes. If the two classes are the same, the pattern is that fragment. If their nodes have the same operator, the pattern has that operator and anti-unifies the children pair by pair. Otherwise the pair becomes a hole; the same pair always gets the same hole.</p>
        ${code("au")}
        <p>The two polygons give a polygon function with two holes. The other two shapes differ at the top, so their pattern is a single <code>seq</code> with two holes, which is too general to help.</p>` },
      { id: "choose", title: "Choosing a function", html: `
        <p>Every pair of classes gives a candidate. We keep those with at most two holes (the task's limit) and some structure. A candidate's value is the corpus size after rewriting every match into a call, plus the size of the function itself.</p>
        ${code("cands")}
        ${predict("The polygon pattern <code>(repeat ?x (seq (move 10) (turn ?y)))</code> is bigger than <code>(seq (move ?x) (turn ?y))</code>. Why does it save less?", "<p>It matches only the first two programs. The smaller pattern, one side of a polygon, matches all four.</p>")}
        ${code("best")}
        ${demo("au", "Demo 3 · Anti-unify, then learn a function", "pick two programs")}
        <p>BABBLE does more than this. It repeats the search for a second round, keeps a beam of 64 partial libraries, and, for the corpora that have domain <b>equations</b> (lists and physics) such as the commutativity of addition, runs equality saturation first, so a class holds several forms of a fragment. Anti-unifying two classes then gives a <em>set</em> of patterns, built from the pairs of forms of each child. The paper computes these sets across the whole e-graph by crossing its <b>tree automaton</b> (the e-graph seen as rules <code>op(classes) → class</code>) with itself.</p>` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task removes the candidate step: the body of <code>LearnedLibrary::new</code>, which turns the saturated e-graph into candidate patterns, and of <code>Dfta::cross_over</code>, which crosses the automaton with itself. Candidates must keep the meaning of what they replace, respect the hole limit of two, and the search must end on cyclic e-graphs. Everything after it (deduplication, choosing the library, extraction, measuring) is fixed.</p>
        <p>The development suite has five corpora, one per domain: lists, physics, text, logo drawings and block towers. The graded suite has ten others, two per domain. Each corpus is run three times. To pass, on every corpus the compression must be at least the human reference's, and the median run time must be strictly lower. The score is the mean percentage reduction, <code>100 × (1 − 1/r)</code> for a compression ratio <code>r</code>, so a ratio of 1.25 scores 20.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <p>One model passed: <b>Claude Opus 5.5</b>, with a compression ratio of 1.28 against the reference's 1.27, and 257 ms against 973 ms. Six of sixteen scored above the reference. Many runs were faster, but most fell short of the reference's compression on at least one corpus.</p>
        <table><tr><th>Run</th><th>Compression ratio</th><th>Run time (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>1.27</td><td>973</td><td>18.8</td><td></td></tr>
        <tr><td>DeepSeek V4.1 Flash</td><td>1.28 (7 of 10)</td><td>412 (4 of 10)</td><td>19.4</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Terra</td><td>1.28 (9 of 10)</td><td>162 (9 of 10)</td><td>19.0</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>1.28 (10 of 10)</td><td>257 (10 of 10)</td><td>18.9</td><td>${pass}</td></tr>
        <tr><td>GLM 5.3</td><td>1.27 (8 of 10)</td><td>74.2 (10 of 10)</td><td>18.3</td><td>${fail}</td></tr></table>
        <p class="meta">Selected rows; means over the ten graded corpora, ${AS_OF}. In brackets: the corpora on which the run met the reference. <a href="${TASK}babble" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Claude Opus 5.5 crossed every rule of the automaton with every rule of the same arity. A depth-first search then computed the patterns common to each pair of e-classes <b>once per pair</b>, as our <code>anti_unify</code> would with a memo. It kept all patterns in one table that stores each distinct subpattern once, skipped pairs of classes that can never occur in one program, named holes in order of first appearance and dropped repeats. On cyclic e-graphs, where many candidates match exactly the same places, it kept only the smallest candidate of each group, as the later deduplication would.</p>
        ${callout("pitfall", "THE BEST SCORE DID NOT PASS", "<p>DeepSeek V4.1 Flash had the best final score, 19.4, but its compression fell below the reference's on three of the ten corpora.</p>")}` },
    ],
    takeaways: ["A hole wherever two fragments differ.", "Value = corpus size after rewriting + the function.", "Pass: compress as well, run faster, every corpus."],
  },
  {
    slug: "4-polygon", nav: "Polygon", title: "Polygon: Two Queries That Disagree",
    subtitle: "A small database is a proof that two SQL queries are not equivalent",
    abstract: "A wrong SQL answer can pass every test case. Polygon encodes both queries over a few symbolic rows and asks an SMT solver for a database on which they differ, growing its search only where a conflict says to. Four of sixteen models passed.",
    tags: ["SQL equivalence", "counterexample", "NULL", "SMT", "under-approximation"],
    hero: "polygon", heroCaption: "Search small databases for one on which the queries differ.",
    sections: [
      { id: "idea", title: "Refuting equivalence", html: `
        <p>A student's SQL answer passes the test cases, but is it right? Two queries are <b>equivalent</b> if they return the same result on every database. Proving that is hard; refuting it needs only one <b>counterexample</b>: a database on which they differ. <em>Polygon: Symbolic Reasoning for SQL using Conflict-Driven Under-Approximation Search</em> (PLDI 2025) finds small ones. It encodes both queries as formulas over tables of a few symbolic rows, and asks an SMT solver for values that make the results differ.</p>` },
      { id: "pair", title: "A wrong answer that passed", html: `
        <p>The task's public example is a LeetCode problem: count, for each customer, the visits with no transaction. The reference uses <code>NOT IN</code>; a submitted answer uses a <code>LEFT JOIN</code> and keeps rows with a NULL amount. We write both as Python functions, with SQL's rules for NULL (<code>None</code>).</p>
        ${code("sql")}
        <p>On this database, the answer is right. Rows are <code>(visit_id, customer_id)</code> and <code>(transaction_id, visit_id, amount)</code>; results are compared as bags of rows, since there is no <code>ORDER BY</code>.</p>` },
      { id: "search", title: "Small databases first", html: `
        <p>Polygon's schema rules come with the problem: visit and transaction ids are unique, and every transaction's visit exists. We search all databases with at most <code>bound</code> rows per table, smallest first, from a few values per column.</p>
        ${code("search")}
        ${demo("polygon", "Demo 4 · Find a counterexample", "toggle NULLs")}
        <p>The answer has two bugs, and the search finds both. A visit with no customer counts 0 in the answer, because <code>COUNT(column)</code> skips NULL, and 1 in the reference. A transaction with a NULL amount keeps its visit in the answer's join. Without NULLs, the two queries agree on every database we tried: test data without such NULLs cannot catch either bug.</p>` },
      { id: "under", title: "Under-approximation", html: `
        <p>Brute force grows exponentially with the bound and the domains; Polygon instead lets the solver choose the values. But encoding every behavior of a query at once (every row present or absent, every branch of every join) makes a formula too big to solve fast. Polygon <b>under-approximates</b>: it commits to some choices, for example that some rows are absent, and solves the smaller formula. If that has no solution, the solver's unsat core names the choices that conflict; Polygon records the conflict, backs off and widens only those choices.</p>
        <p>The second kind of workload asks for one database that splits 50 or 100 queries into two groups of equal size by their results. A tiny version, with one row:</p>
        ${code("split")}` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task removes Polygon's search, end to end: the body of <code>Environment.check</code>, which parses and encodes the two queries, searches, and decodes the solver's model into a database; the parallel disambiguation path; and the conflict-driven bodies behind them. The parser, encoders, SMT interface and the MariaDB check stay. A refutation counts only if MariaDB runs both queries on the decoded database and sees different results.</p>
        <p>Each suite has 16 wrong LeetCode answers (four each at row bounds 2, 3, 4 and 5, with a 2-second budget), three splitting tasks of 50 or 100 queries, and two paper-scale hard pairs with 20-second budgets. To pass, on each of the 19 ordinary workloads it must refute wherever the reference does and take at most <code>max(0.03 s, 20%)</code> longer; on the two hard pairs it must be more than twice as fast and must also refute wherever the reference does. The score counts refutations first, then total time in steps of 0.5:</p>
        ${code("pscore")}
        <p>With every workload refuted, the score lies between 95 and 100. A missed refutation costs 5 points, more than any speedup can win back. By the formula, the reference's 95.6 means about 10 time units, and 98.0 about 2.5: our arithmetic, not a published figure.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <p>Four of sixteen models passed. Ten scored above the human reference. GPT-6.1 Terra and Kimi K3.1 Pro shared the best final score.</p>
        <table><tr><th>Run</th><th>Pairs refuted</th><th>Wall time (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>1</td><td>1,210</td><td>95.6</td><td></td></tr>
        <tr><td>GPT-6.1 Terra</td><td>1 (21 of 21)</td><td>253 (21 of 21)</td><td>98.0</td><td>${pass}</td></tr>
        <tr><td>Kimi K3.1 Pro</td><td>1 (21 of 21)</td><td>274 (21 of 21)</td><td>98.0</td><td>${pass}</td></tr>
        <tr><td>GLM 5.3</td><td>1 (21 of 21)</td><td>307 (21 of 21)</td><td>97.7</td><td>${pass}</td></tr>
        <tr><td>DeepSeek V4.1 Flash 1017</td><td>1 (21 of 21)</td><td>314 (21 of 21)</td><td>97.7</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>1 (21 of 21)</td><td>831 (10 of 21)</td><td>95.5</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>0.952 (20 of 21)</td><td>242 (21 of 21)</td><td>93.0</td><td>${fail}</td></tr></table>
        <p class="meta">Selected rows; shares and means over the 21 graded workloads, ${AS_OF}. In brackets: the workloads on which the run met the reference's bar. <a href="${TASK}polygon" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>The task page describes the run of <b>Claude Opus 5.5</b>. It grows the row bound from one row per table up to the limit, each bound a fresh, smaller formula, as our <code>search</code> does. Within a bound, each table starts with few live rows, given to the Z3 solver as assumptions; on failure, the unsat core names the tables whose sizes took part, and only those grow by one row. Preferences such as dates inside the database's range stay until a conflict blames them. Several schedules run in parallel, each with its own Z3, and the first model found stops the rest. It refuted all 21 workloads but was too slow on 11 of them.</p>
        ${callout("pitfall", "FAST IS NOT ENOUGH", "<p>GPT-6.1 Sol was faster than every passing run, at 242 ms, but missed one refutation, and its score fell to 93.0.</p>")}` },
    ],
    takeaways: ["One database refutes equivalence.", "NULLs hide bugs from test cases.", "Commit to choices; widen only where a conflict points."],
  },
  {
    slug: "5-glenside", nav: "Glenside", title: "Glenside: Shapes Through Rewrites",
    subtitle: "Access patterns, an e-graph analysis, and a convolution as a matrix product",
    abstract: "Glenside views every tensor as an access pattern: an outer shape of items and an item shape. An e-graph analysis tracks these shapes so that rewrites can turn a convolution into the matrix product an accelerator runs. The task removes the analysis; twelve of sixteen passed.",
    tags: ["access pattern", "e-class analysis", "im2col", "systolic array"],
    hero: "im2col", heroCaption: "Each window becomes one row of a matrix.",
    sections: [
      { id: "idea", title: "Convolutions on matrix hardware", html: `
        <p>Matrix accelerators, such as a <b>systolic array</b> of multiply-and-add units, run matrix products. A neural network's <b>convolution</b> is not one, but it can be rewritten as one, a trick called <b>im2col</b>. <em>Pure Tensor Program Rewriting via Access Patterns</em> (MAPS 2021) introduces Glenside, a language in which such rewrites are pure and local, so that an e-graph can explore them and a fixed rule can spot forms the accelerator runs.</p>` },
      { id: "access", title: "Access patterns", html: `
        <p>In Glenside, a tensor is viewed as an <b>access pattern</b>: an <b>outer shape</b> that indexes a collection of items, and an <b>item shape</b>, the shape of each item. <code>(access x 1)</code> on a tensor of shape <code>[2, 3, 4]</code> is a collection of 2 items of shape <code>[3, 4]</code>. Operators work on items: <code>access-windows</code> makes one item per window, <code>cartesian-product</code> pairs every left item with every right item, and <code>dot-product</code> multiplies each pair and sums.</p>
        <p>The e-graph needs to know these shapes for every class: the rewrites and the accelerator rule depend on them. That is an <b>analysis</b>: <code>make</code> builds a node's fact from its children's facts, and <code>merge</code> combines the facts of two classes that join. Here is <code>make</code> for the operators of the task's public example, a 2×2 convolution of a 3×3 image:</p>
        ${code("make")}
        <p>These are the shapes the task statement lists for this expression. The windows give 2 × 2 items of shape <code>[1, 2, 2]</code>, one per output pixel; the product pairs each with the one kernel; the dot product leaves one number per pixel.</p>` },
      { id: "im2col", title: "A convolution as a matrix product", html: `
        <p>The accelerator rule looks for a dot product over a Cartesian product whose items are flat vectors: a matrix times a matrix. Flattening each window gives the <b>im2col</b> matrix: one row per output pixel, one column per kernel weight. With the task's public numbers:</p>
        ${code("im2col")}
        ${demo("im2col", "Demo 5 · im2col", "pick a size and a row")}
        <p>The output <code>[-4, -4, -4, -4]</code> is the one the task statement gives. In the e-graph, rewrites that flatten and reshape accesses add equal forms to the convolution's class, until one of them has the shape the accelerator rule wants. Without correct shape facts, no rewrite can fire safely.</p>
        <p>When two classes join, <code>merge</code> combines their facts. Both must cover the same number of elements; a <b>settled</b> shape wins over an unsettled one; and accelerator use is kept if either side has it. It returns which side changed, so the e-graph revisits only what moved.</p>
        ${code("merge")}` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task removes Glenside's analysis: <code>make</code> and <code>merge</code> for every operator, with facts for outer and item shapes, known zero regions, whether the shape is settled, and accelerator use. Four generic rewrites are also editable. The accelerator rules, their order and the extraction are fixed, and lookup tables for the workloads are not allowed.</p>
        <p>There are 14 workloads: 12 small convolutions (in two layouts, with padding, strides and surrounding axis operations) and two concatenations of Cartesian products under a dot product. Each search runs up to 30 iterations, 100,000 nodes or 10 seconds. A workload counts as <b>discovered</b> if the extracted program uses the accelerator and gives the right numbers on test inputs. To pass, on every workload it must discover whenever the reference does, with no more rewrite time and no more e-graph growth (new nodes). The score rewards discovery (60 points) and then time and growth:</p>
        ${code("gscore")}
        <p>The first line is the statement's own check: 80 points. The other two plug the leaderboard's mean time and growth into the formula; the real score is a mean over workloads, but here it comes out at the listed 82.8 and 91.0.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <p>Twelve of sixteen models passed, the most in the field; three runs scored 0. The best final score, 91.0, was shared by seven runs. They found the accelerator form on every workload, adding about 18 new nodes in about 0.11 ms on average, where the reference grew the e-graph by 55,200 nodes and took 178 ms.</p>
        <table><tr><th>Run</th><th>E-graph growth</th><th>Finds im2col</th><th>Rewrite time (µs)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>55,200</td><td>1</td><td>178,000</td><td>82.8</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>17.4</td><td>1</td><td>110</td><td>91.0</td><td>${pass}</td></tr>
        <tr><td>GPT-6 Astra</td><td>17.4</td><td>1</td><td>113</td><td>91.0</td><td>${pass}</td></tr>
        <tr><td>GLM 5.3 Flash</td><td>41</td><td>1</td><td>468</td><td>90.1</td><td>${pass}</td></tr>
        <tr><td>Muse Spark 1.3</td><td>55,200</td><td>1</td><td>167,000</td><td>82.9</td><td>${fail}</td></tr></table>
        <p class="meta">Selected rows; means over the 14 graded workloads, ${AS_OF}. <a href="${TASK}glenside" target="_blank" rel="noopener">Full table ↗</a></p>
        <p><b>Claude Opus 5.5</b> built a fact for every operator, marked accelerator nodes and let every parent inherit the mark, and merged facts as our <code>merge</code> does. Its own idea was in the rewrites. A dot product of a Cartesian product is rebuilt over flattened operands, so the accelerator rule sees a plain matrix product at once. A concatenation of two such dot products becomes one dot product of block operands, padded with zeros so that the extra products add nothing. Each rule skips classes it has already rewritten, which keeps the e-graph small.</p>
        ${callout("pitfall", "EQUAL IS NOT BETTER", "<p>Muse Spark 1.3 grew the e-graph exactly as much as the reference, but was slower on 4 of the 14 workloads, so it failed.</p>")}` },
    ],
    takeaways: ["Access pattern = outer shape + item shape.", "make builds facts; merge joins them.", "12 of 16 passed with ~18 new nodes."],
  },
  {
    slug: "6-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>Egg</h3><ul><li>Union-find, memo, parent lists</li><li>Rebuild once per batch</li><li>0 of 16 passed</li></ul></div>
        <div class="card"><h3>BABBLE</h3><ul><li>Anti-unify pairs of e-classes</li><li>Value = smaller corpus</li><li>1 of 16 passed</li></ul></div>
        <div class="card"><h3>Polygon</h3><ul><li>One database refutes equivalence</li><li>Under-approximate, learn conflicts</li><li>4 of 16 passed</li></ul></div>
        <div class="card"><h3>Glenside</h3><ul><li>Outer shape + item shape</li><li>im2col: a convolution as a matrix product</li><li>12 of 16 passed</li></ul></div></div>` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★★ (modify)</h3>
        <p>In <code>batch</code>, merge the <code>x</code>s in pairs (<code>x0</code> with <code>x1</code>, <code>x2</code> with <code>x3</code>, …) and then the pairs. How do the immediate and deferred work counts change?</p>
        <h3>Exercise 2 ★ (by hand)</h3>
        <p>Anti-unify the first and third programs of the corpus by hand, then check with <code>anti_unify</code>.</p>
        <details class="reveal"><summary>Solution</summary><p>A lone hole, <code>?x</code>: the first program starts with <code>repeat</code>, the third with <code>seq</code>, so they differ at the top.</p></details>
        <h3>Exercise 3 ★ (experiment)</h3>
        <p>Allow three holes in the candidate search. Which function wins now, and what does the corpus cost? (Demo 3 can check you.)</p>
        <details class="reveal"><summary>Solution</summary><p><code>(repeat ?x (seq (move ?y) (turn ?z)))</code>, a regular polygon, at cost 29 instead of 31. The task allows only two holes, so this function is out of reach there.</p></details>
        <h3>Exercise 4 ★ (modify)</h3>
        <p>Add a NOT NULL rule to <code>customer_id</code> only. What is the smallest counterexample now, and which bug does it show? (Demo 4 can check you.)</p>
        <h3>Exercise 5 ★ (by hand)</h3>
        <p>With <code>im2col</code>, compute the output of the same kernel on a 4×4 image of the numbers 1 to 16, with stride 2. What shape does the output have?</p>
        <details class="reveal"><summary>Solution</summary><p>A 2×2 output, <code>[-5, -5, -5, -5]</code>: each window's top-left minus its bottom-right, and those differ by 5 in every window.</p></details>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li>M. Willsey, C. Nandi, Y. R. Wang, O. Flatt, Z. Tatlock, P. Panchekha. <em>egg: Fast and Extensible Equality Saturation.</em> POPL 2021. <a href="https://arxiv.org/abs/2004.03082" target="_blank" rel="noopener">arXiv 2004.03082</a></li>
        <li>D. Cao, R. Kunkel, C. Nandi, M. Willsey, Z. Tatlock, N. Polikarpova. <em>babble: Learning Better Abstractions with E-Graphs and Anti-unification.</em> POPL 2023. <a href="https://arxiv.org/abs/2212.04596" target="_blank" rel="noopener">arXiv 2212.04596</a></li>
        <li>P. Zhao, Y. Wang, X. Wang. <em>Polygon: Symbolic Reasoning for SQL using Conflict-Driven Under-Approximation Search.</em> PLDI 2025. <a href="https://arxiv.org/abs/2504.06542" target="_blank" rel="noopener">arXiv 2504.06542</a></li>
        <li>G. H. Smith, A. Liu, S. Lyubomirsky, S. Davidson, J. McMahan, M. Taylor, L. Ceze, Z. Tatlock. <em>Pure Tensor Program Rewriting via Access Patterns (Representation Pearl).</em> MAPS 2021. <a href="https://arxiv.org/abs/2105.09377" target="_blank" rel="noopener">arXiv 2105.09377</a></li>
        <li>Task pages: <a href="${TASK}egg" target="_blank" rel="noopener">Egg</a>, <a href="${TASK}babble" target="_blank" rel="noopener">BABBLE</a>, <a href="${TASK}polygon" target="_blank" rel="noopener">Polygon</a>, <a href="${TASK}glenside" target="_blank" rel="noopener">Glenside</a></li></ul>` },
    ],
    takeaways: ["One data structure, three tasks.", "Every workload, every metric.", "Write less, not faster."],
  },
];

const QUIZ = [
  { q: "Classes of <code>b</code> and <code>c</code> were just merged. Why must <code>a + b</code> and <code>a + c</code> end up in one class?",
    opts: ["The memo stores sums only once", "Congruence: same operator, and their children are now in the same classes", "Addition is commutative", "Union-find merges every parent"],
    a: 1, why: "Equal children under the same operator give equal parents. Rebuilding finds such pairs and merges them." },
  { q: "What does egg's deferred rebuilding save?",
    opts: ["Memory for the memo", "Pattern matching time", "Extraction time", "Repairing the same parents again after every union in a batch"],
    a: 3, why: "It queues merged classes and repairs each once per batch. In our workload: 2n − 1 entries instead of n² − 1." },
  { q: "Anti-unify <code>(move 10)</code> and <code>(move 5)</code>.",
    opts: ["<code>(move ?x)</code>", "<code>?x</code>", "<code>(move 10)</code>", "They cannot be anti-unified"],
    a: 0, why: "Same operator, so the pattern keeps <code>move</code>; the differing arguments become a hole." },
  { q: "In the visits example, what does every counterexample we found contain?",
    opts: ["A NULL: a customer with no id, or a transaction with no amount", "Two customers", "More than two rows per table", "A transaction for a missing visit"],
    a: 0, why: "Both bugs need a NULL: COUNT(column) skips NULL, and a NULL amount keeps a visit in the join. Without NULLs, the queries agree on every database we tried." },
  { q: "Glenside: <code>(access x 1)</code> with <code>x</code> of shape <code>[2, 3, 4]</code>. What are its outer and item shapes?",
    opts: ["outer [2, 3, 4], item []", "outer [2], item [3, 4]", "outer [2, 3], item [4]", "outer [], item [2, 3, 4]"],
    a: 1, why: "The split comes after the first dimension: 2 items, each of shape [3, 4]." },
];
