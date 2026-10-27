// L10 content, adapted from frontiercs2/notes/L10-software-engineering.md (checked by tools/check.py).

const demo = (name, title, instr, hint = "") =>
  `<div class="card demo" data-demo="${name}"><div class="head"><span class="title">${title}</span><span>${instr}</span></div>
   <div class="demo-body"></div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const callout = (kind, label, body) => `<div class="callout ${kind}"><b>${label}</b>${body}</div>`;
const predict = (q, a) => callout("predict", "PREDICT", `<p>${q}</p><details class="reveal"><summary>Show the answer</summary>${a}</details>`);
const out = (name) => codeBlock(OUT[name], "out");
const code = (name) => codeBlock(CODE[name]) + (OUT[name] ? out(name) : "");
const video = (k, title, about) => ({ id: "video", title: `Watch: ${title}`, html: `
        <p>${about}</p>
        <div class="card video" data-video="media/L10-${k}.mp4"></div>` });
const fail = '<span class="chip fail">Fail</span>';
const TASK = "https://frontier-cs.org/task/#";
const SLUG = "crest";
const PAPER = "https://www2.eecs.berkeley.edu/Pubs/TechRpts/2008/EECS-2008-123.pdf";

const LECTURE = {
  number: 10,
  title: "Software Engineering",
  tagline: "Which branch to flip next, when the paths outnumber any budget",
  lead: "The Software Engineering task of FrontierCS 2: the search strategy of CREST, a concolic tester for C. We run a tiny program concolically, race four search strategies on it, and then look at how the task is judged and why no model passed.",
  heroDemo: "raceAuto",
  heroLabel: "Four search strategies · 100 runs · mean of 20 seeds",
  heroCaption: "Blue: CFG-directed. Amber: random branch. Red: bounded DFS. Grey: random testing.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the Software Engineering task teaches",
  why: [
    ["Paths explode; branches do not", "A loop of six checks turns <b>10 header paths into 640</b> without adding a branch. A good strategy hunts for new branches."],
    ["Static structure guides the search", "The control-flow graph says which flip can lead somewhere new: <b>20.55 of 22 branches</b> in 100 runs, against 13.70 for DFS."],
    ["Two measurements pull apart", "Coverage and search time, on two programs. <b>No run passed</b>; the two best each lost one overhead rule."],
  ],
  ctaTitle: "Ready to flip a branch?",
  minutes: "About 60 minutes",
  subtitles: ["en"],
  videos: {
    "media/L10-1.mp4": "Part 1 of 3 · Concolic testing: flip one condition · 4 min · narrated by Boxi Yu",
    "media/L10-2.mp4": "Part 2 of 3 · Search strategies: which condition to flip next · 5 min · narrated by Boxi Yu",
    "media/L10-3.mp4": "Part 3 of 3 · The task: a strategy for CREST · 4 min · narrated by Boxi Yu",
  },
};

const CHAPTERS = [
  {
    slug: "1-concolic", nav: "Concolic testing", title: "Concolic Testing on a Tiny Program",
    subtitle: "Run on real inputs, record the conditions, flip one",
    abstract: "A concolic tester runs a program on concrete inputs and records the path constraint: the conditions the run depended on. Negating one condition and solving gives inputs for a new path. On our toy parser, that reaches in five runs a branch random inputs hit 2 times in 100,000.",
    tags: ["concolic testing", "path constraint", "constraint solving", "random testing"],
    hero: "code:solve", heroCaption: "Flip one condition: keep the prefix, negate, solve",
    sections: [
      video(1, "Concolic testing: flip one condition", "Part 1 of 3 of this lecture's video: concolic testing: flip one condition."),
      { id: "idea", title: "Concrete and symbolic", html: `
        <p><b>Concolic</b> testing (concrete + symbolic) runs a program on real inputs and, at the same time, records every condition along the path that depended on those inputs. The conjunction of those conditions is the run's <b>path constraint</b>: any input that satisfies it takes the same path. To reach new code, keep the first <code>k</code> conditions, negate condition <code>k</code>, and ask a solver for inputs that satisfy the result. The next run follows the old path up to condition <code>k</code> and then takes the other side.</p>
        <p>FrontierCS 2 has one Software Engineering task, <b>CREST</b>, from Burnim and Sen's paper <em>Heuristics for Scalable Dynamic Test Generation</em> (ASE 2008). A real program has far more paths than any testing budget, so the <b>search strategy</b>, the rule that picks which condition to flip next, decides how much of the program gets tested. The task removes CREST's strategies; the agent writes one. With one task, this lecture goes deeper than the others. The Python programs are ours; every output shown is the real output.</p>` },
      { id: "program", title: "A program and its path constraint", html: `
        <p>Our program is a toy packet parser over twelve small integers, each 0 to 15. Every condition goes through <code>t.cond</code>, which plays CREST's instrumentation: it evaluates the condition on the concrete inputs, and records the branch taken, which inputs it read, and the condition itself. Condition <code>s</code> has two branches: <code>2s</code> when it holds and <code>2s + 1</code> when it does not. There are 11 conditions, so 22 branches.</p>
        ${code("tracer")}
        <p>The payload loop runs six times, so condition 0 appears six times on every path, with the same two branch ids. That is how loops look to a concolic tester.</p>` },
      { id: "flip", title: "Flipping one condition", html: `
        <p>Our solver is the simplest one that works: it changes only the inputs that the negated condition reads, plus any input tied to them by an earlier condition, and tries every value from 0 to 15 in order. CREST narrows in the same way: its <code>YicesSolver::IncrementalSolve</code>, which the task's harness calls, keeps the old inputs and solves only the constraints linked to the negated one. Here we negate condition 3, <code>not x2 == x1 + 4</code>. The earlier condition <code>x1 == 7</code> reads <code>x1</code>, so <code>x1</code> is tied in and must stay 7:</p>
        ${code("solve")}
        <p>The new run follows the old path up to that condition and takes its other side, which reaches a condition, <code>x3 &gt; 13</code>, no earlier run had seen. If no values work, the negation is <b>infeasible</b>: the solver returns <code>None</code>, and no run is spent.</p>
        ${predict("On a path through <code>x3 == 2*x4</code> and <code>x5 == 15</code>, you negate <code>not x4 &gt; 7</code>. What happens?", "<p>It is infeasible. <code>x4 &gt; 7</code> with <code>x3 == 2*x4</code> needs <code>x3 ≥ 16</code>, but inputs stop at 15. The solver tries every pair and returns <code>None</code>: one solver call, no run. Try it in the demo with x0 = 12, x3 = 0, x4 = 0, x5 = 15.</p>")}
        ${demo("concolic", "Demo 1 · Concolic testing by hand", "negate a condition", "Each line is one condition of the current run. The grid shows the session's coverage: T and F are the two branches of each condition; amber is new in the last run.")}` },
      { id: "random", title: "Why not random inputs?", html: `
        <p>A random input reaches <code>x1 == 7</code> only if <code>x0 == 3</code> too: 1 chance in 256. Each further equality divides by 16 again. Concolic testing reaches the deepest branch from all zeros, CREST's starting input, in four flips. Each line shows a run's input and the last header condition it reached:</p>
        ${code("walk")}
        <p>For a random input, <code>x3 &gt; 13</code> holds at the end of that chain with chance 2 in 65,536 (two of 100,000 here, against about 3 expected); concolic testing needed five runs.</p>` },
    ],
    takeaways: ["Path constraint: the conditions a run depended on.", "Keep a prefix, negate one, solve: a new path.", "Equality checks defeat random inputs."],
  },
  {
    slug: "2-search", nav: "Search strategies", title: "Search Strategies",
    subtitle: "Bounded DFS, random branch and CFG-directed search, on a budget",
    abstract: "Our toy has 640 paths for 21 reachable branches. Depth-first search spends its budget on the payload loop's 64 variations. Random branch search does better; CFG-directed search, which flips the condition whose other side is closest to uncovered code, covers the most with the fewest solver calls.",
    tags: ["path explosion", "bounded DFS", "random branch search", "control-flow graph", "CfgDirectedSearch"],
    hero: "code:race", heroCaption: "Four strategies, 20 seeds, 100 runs",
    sections: [
      video(2, "Search strategies: which condition to flip next", "Part 2 of 3 of this lecture's video: search strategies: which condition to flip next."),
      { id: "paths", title: "Paths, not branches", html: `
        <p>Every run takes one path. Unbounded depth-first search explores every feasible path exactly once:</p>
        ${code("paths")}
        <p>Ten paths through the header, times 2<sup>6</sup> = 64 ways through the payload loop, gives 640 paths for 21 reachable branches. Branch 20, <code>x4 &gt; 7</code>, is unreachable: with <code>x3 == 2*x4</code>, <code>x4 &gt; 7</code> would need <code>x3 ≥ 16</code>. Real programs are much worse: GNU grep 2.2 has about 15,000 lines of C and 4,184 branches (paper, Section 5.3), and its paths cannot be counted. The paper's key observation is that full branch coverage needs at most as many runs as there are branches. So a strategy should hunt for paths that expose a new branch, not try to visit them all.</p>` },
      { id: "harness", title: "The harness", html: `
        <p>A testing <b>session</b> has a budget of runs. The strategy can <b>restart</b> on random inputs, or <b>negate</b> condition <code>k</code> of an earlier run. Both cost one run, except that an infeasible negation costs only a solver call. Coverage counts the distinct branches over the whole session.</p>
        ${code("tester")}
        <p>Random testing never gets past the equality checks.</p>` },
      { id: "dfs", title: "Bounded depth-first search", html: `
        <p>The classic concolic strategy (DART, CUTE) is depth-first search. CREST's <b>BoundedDFS</b> explores every path that differs from the first run in at most <code>depth</code> negations, in depth-first order. The task's score uses it, with depth 12, as its baseline. (Ours is simplified: CREST's version also counts sibling flips against the bound, and does not restart. In our toy neither changes the result.)</p>
        ${code("dfs")}
        <p>Depth-first search dives once along the path, flipping each condition in turn, and then always backtracks to the most recent fork first. On every path the last six forks are the payload loop's, so after one dive through the header it spends the rest of the budget on the 64 ways through the loop: 100 runs, 6 header paths, 14 branches. On grep, the paper's DFS and random testing were both beaten by the CFG-directed and random searches (Section 5.3, Figure 2), and its depth-12 DFS stopped after fewer than 2<sup>12</sup> iterations, since some runs had fewer than 12 feasible conditions.</p>` },
      { id: "randbranch", title: "Random branch search", html: `
        <p>The paper's simplest fix is <b>random branch search</b>: negate a random condition of the current run, move to the new run, and restart on fresh inputs after a stretch with no new coverage.</p>
        ${code("randbranch")}
        <p>It is slow at first, because most conditions on a path are the payload's six, but it does not get stuck.</p>` },
      { id: "cfg", title: "Distances in the control-flow graph", html: `
        <p>CREST's new strategy uses the program's <b>control-flow graph</b>. CREST builds it from the C source with CIL: which branch can come next after each branch, with calls followed into the callee. For a branch <code>b</code>, <code>dist[b]</code> is the number of branches on the shortest static path from <code>b</code> to a branch not yet covered. One breadth-first search on the reversed graph, from all uncovered branches at once, gives every distance:</p>
        ${code("cfg")}
        <p>The check matters: the graph must allow every step a real run takes, or the distances lie. After one run of all zeros, the run took branch 5 (<code>not x0 == 3</code>). Its other side, branch 4, is uncovered (distance 0), so it is a first flip CFG-directed search can try. Branch 5 itself is 1 step from the uncovered branch 12 (<code>x1 &gt; x2</code>).</p>` },
      { id: "cfgsearch", title: "CFG-directed search", html: `
        <p><b>CfgDirectedSearch</b> negates the condition whose other side is closest to uncovered code. It adds to the distance <code>tries</code>, how often that side was already forced without finding anything new, so a close but hopeless target sinks in the ranking. A run with new coverage becomes the current run; a run of failed attempts triggers a restart. (Two simplifications: the paper also follows the static path after a successful flip, "SearchAlongPath", where ours just ranks again; and CREST's code forgets its coverage on every restart, so its distances point to branches not covered in the current epoch, where ours use the whole session's coverage.)</p>
        ${code("cfgsearch")}
        ${demo("session", "Demo 2 · One session, run by run", "pick a strategy, step through", "Seed 1, 100 runs. The second line is the run's header conditions, then its six payload checks (T: the byte was 0).")}` },
      { id: "race", title: "The race", html: `
        <p>Twenty seeds of each strategy, 100 runs each:</p>
        ${code("race")}
        ${demo("race", "Demo 3 · The race", "replay, or pick one seed")}
        <p>The final order matches the paper's grep plot: CFG-directed and random branch ahead, random testing and DFS behind. In the paper random branch search also rose fast from the start; ours starts slowly because six of every path's conditions are payload checks. CFG-directed search also asks the solver less often than random branch search, because it skips conditions whose other side leads nowhere new. That second number matters in the task, where solver time counts against the strategy.</p>
        ${predict("Move the payload loop to the start of the program. Which strategy gains the most?", "<p>Bounded DFS. It backtracks to the deepest forks first, and those are now the header's: its mean over 20 seeds jumps from 13.55 to 21.00 branches after 25 runs, every reachable branch. Where the path explosion sits decides how DFS does; CFG-directed search does not care. (Exercise 2.)</p>")}` },
    ],
    takeaways: ["640 paths, 21 reachable branches.", "DFS drowns in the loop; random branch does not stick.", "CFG distance + tries: most coverage, fewer solver calls."],
  },
  {
    slug: "3-task", nav: "The task", title: "The Task: A Strategy for CREST",
    subtitle: "What the agent writes, the programs, the score and the pass rule",
    abstract: "The agent writes one search strategy behind CREST's Host interface. Each run has 4,000 iterations. The score ranks coverage against bounded DFS; a pass needs more coverage and less search overhead than the paper's CFG-directed search on both final programs, Vim 5.7 and sed 3.02, each by three standard errors.",
    tags: ["Host interface", "4,000 iterations", "search overhead", "pass margin"],
    hero: "code:score", heroCaption: "The score and the margin",
    sections: [
      video(3, "The task: a strategy for CREST", "Part 3 of 3 of this lecture's video: the task: a strategy for CREST."),
      { id: "writes", title: "What the agent writes", html: `
        <p>The task keeps CREST: the CIL instrumentation, the concolic library, the solver and the harness. Its search strategies are removed and replaced by an interface. The agent writes one strategy class in <code>src/frontier_solution/</code>; the starter only restarts on random inputs, like our <code>random_testing</code>. The strategy drives a run through a <code>Host</code>:</p>
        <ul><li><code>Restart()</code> runs the program on fresh random inputs (one iteration).</li>
        <li><code>Negate(e, k)</code> keeps the first <code>k</code> constraints of execution <code>e</code>, negates constraint <code>k</code>, solves, and runs the program. An infeasible request returns <code>NULL</code> and costs no iteration. (The harness rejects some requests without a solver attempt: when an earlier constraint of the path is identical to constraint <code>k</code>.) The new run does not always follow the predicted path; the strategy must compare the paths.</li>
        <li><code>Release(e)</code> gives an execution back; at most 64 may be held.</li></ul>
        <p>The strategy sees each execution's path of branch ids and which positions are constraints, and the program's static description: the branch ids, <code>paired[b]</code> (the other arm), <code>function_of[b]</code> and <code>successors[b]</code>, the branch-level control-flow graph, as in our <code>SUCC</code>. It never sees the constraints, the inputs or the solver. Branch ids are relabelled with a secret permutation in every run, so nothing can be tuned to one program's ids. The code runs in a sandbox with no files, clock, network, environment or child processes, and no randomness other than <code>Host::Random()</code> and <code>Host::Uniform(n)</code>.</p>` },
      { id: "judged", title: "How it is judged", html: `
        <p>Each run of the strategy is one session with a budget of 4,000 iterations, on a real C program with a small symbolic input. The development program is GNU grep 2.2 (3,982 branches in this instrumentation). The final programs are not in the agent's workspace; the task page names them: <b>Vim 5.7</b> and <b>sed 3.02</b>. Two measurements are taken per run: <b>branches covered</b>, and <b>search overhead</b>, the CPU time of the strategy plus the solver time its <code>Negate</code> requests cost (running the program itself does not count). Safety caps (wall-clock time, overhead, solver attempts, requests) end a run early but keep it valid.</p>
        <p>The <b>score</b>, averaged over the programs, is <code>100 × max(0, C − B) / (T − B)</code>, where <code>C</code> is the mean coverage over 30 seeds, <code>B</code> the mean coverage of bounded DFS with depth 12, and <code>T</code> the program's number of branches. It uses no reference measurement and ignores overhead. It is far below 100 for any realistic strategy, because much of a program is unreachable from one entry point within the budget.</p>` },
      { id: "rule", title: "The pass rule", html: `
        <p>The judge runs the candidate and the reference, the paper's CFG-directed search, on the same 30 seeds of each program, interleaved on the same machine. On <b>every</b> program the candidate must have more coverage and less overhead, each by more than three standard errors of the difference of the two means, <code>3 × s × √(2/30)</code>, where <code>s²</code> is the mean of the two sample variances:</p>
        ${code("score")}
        <p>The margin is about 0.77 standard deviations of one seed. Margins differ from run to run: the 16 runs' Vim coverage margins on the task page range from +102 to +335. Because <code>s</code> includes the candidate's own spread, a noisy strategy needs a bigger win.</p>
        ${demo("rule", "Demo 4 · One rule, one program", "pick a case or edit the numbers")}` },
    ],
    takeaways: ["Restart, Negate, Release; ids relabelled every run.", "Score: coverage above DFS, as a share of what is left.", "Pass: coverage and overhead, both programs, by 3 standard errors."],
  },
  {
    slug: "4-results", nav: "Results", title: "What the Agents Did",
    subtitle: "No pass; the two best runs each lost one overhead rule",
    abstract: "No model passed; three scored above the human reference's 13.3, best GPT-6.1 Terra with 16.2. Five runs cleared three of the four rules. Claude Opus 5.5's patch, a CFG-directed chain search, never asks for the same negation twice and skips targets that were never feasible.",
    tags: ["0 of 16 pass", "FDI 56.0", "chain search", "prefix hashing"],
    hero: "code:verdict", heroCaption: "Four rules each, from the task page",
    sections: [
      { id: "table", title: "The results", html: `
        <p>No model passed. Three of sixteen scored above the human reference (13.3). FDI 56.0 puts the task 25th hardest of 48.</p>
        <table><tr><th>Run</th><th>Covered, Vim 5.7</th><th>Covered, sed 3.02</th><th>Overhead, Vim 5.7 (s)</th><th>Overhead, sed 3.02 (s)</th><th>Score</th><th></th></tr>
        <tr><td>Human reference</td><td>7,710</td><td>659</td><td>113</td><td>33.9</td><td>13.3</td><td></td></tr>
        <tr><td>GPT-6.1 Terra</td><td>8,930</td><td>711</td><td>78.5</td><td>31.4</td><td>16.2</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>8,200</td><td>731</td><td>104</td><td>32</td><td>15.5</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>8,290</td><td>699</td><td>103</td><td>39.8</td><td>15.0</td><td>${fail}</td></tr>
        <tr><td>GPT-6 Astra</td><td>7,660</td><td>659</td><td>109</td><td>35.5</td><td>13.2</td><td>${fail}</td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>7,240</td><td>687</td><td>87.5</td><td>32</td><td>13.1</td><td>${fail}</td></tr></table>
        <p class="meta">Means over 30 seeds per program, as of October 26, 2026. The reference is measured again in every run; its row shows the median. <a href="${TASK}${SLUG}" target="_blank" rel="noopener">Full table ↗</a></p>` },
      { id: "verdict", title: "Four rules per run", html: `
        <p>Each run faces four rules: coverage and overhead, on two programs. The hover text gives the reference in that run and the margin needed. The two best runs each missed one rule:</p>
        ${code("verdict")}
        <p>GPT-6.1 Terra covered 1,230 more Vim branches than the reference, and its Vim overhead cleared by about 0.4 s, but on sed it spent about 1.6 s more than the reference (both from the page's rounded figures; the judge compares whole milliseconds). Claude Opus 5.5 lost the other way: faster than the reference on Vim, but not by the 26.3 s needed. Five runs cleared three of the four rules (also GPT-6.1 Sol, DeepSeek V4.1 Flash 1017 and Step 5 Preview); none cleared all four.</p>` },
      { id: "ideas", title: "The best runs' ideas", html: `
        <p>The task page shows <b>Claude Opus 5.5</b>'s patch, a CFG-directed "chain search" of 385 added lines. From its comments:</p>
        <ol><li><em>Epochs.</em> Each epoch starts from a fresh random input and forgets which branches the epoch has covered. It follows a chain: from the current run, try constraints in order of the CFG distance of their other arm to code not covered in this epoch, and move to the first run that covers something new for the epoch. An epoch ends when the chain stops finding new code.</li>
        <li><em>Along the graph.</em> After a negation that only gets closer, keep negating along the path toward the uncovered code, as the paper's SearchAlongPath does.</li>
        <li><em>Never ask twice.</em> Hash every path prefix. A negation whose negated prefix was already requested, or already seen on an executed path, is never sent again.</li>
        <li><em>Statistics per target.</em> Skip targets that were never feasible, rank lower the targets whose runs seldom found new code, and drop targets that got the program killed.</li>
        <li><em>Uncovered first.</em> Targets not yet covered anywhere in the session get a bonus.</li></ol>
        <p>Ideas 3 and 4 cut search overhead directly: a request that is never sent costs no solver time. Here they are, added to our CFG-directed search:</p>
        ${code("memo")}
        <p>Slightly more coverage (20.70 against 20.55) for a fifth of the solver calls. In our toy a repeated request is cheap; on Vim, where each solver call is real CPU time, the savings decide the overhead rule. (Tick "with the two ideas" in Demo 2 to watch one session.)</p>
        ${callout("pitfall", "BOTH MEASUREMENTS, EVERY PROGRAM", "<p>Thirteen of sixteen runs cleared the Vim overhead rule, but only three cleared Vim coverage, and the three that did each lost an overhead rule. Muse Spark 1.3 had the lowest overhead on both programs (24.4 s and 7.26 s) and covered 5,670 Vim branches, far below the reference. A strategy that spends less time searching usually finds less.</p>")}` },
    ],
    takeaways: ["0 of 16 pass; best score 16.2, GPT-6.1 Terra.", "Five runs cleared three of four rules.", "Never ask twice; skip what was never feasible."],
  },
  {
    slug: "5-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>Concolic testing</h3><ul><li>Concrete run, recorded conditions</li><li>Keep a prefix, negate one, solve</li><li>Infeasible: a solver call, no run</li></ul></div>
        <div class="card"><h3>The search problem</h3><ul><li>640 paths, 21 reachable branches</li><li>Hunt branches, not paths</li><li>DFS drowns in loops</li></ul></div>
        <div class="card"><h3>CFG-directed search</h3><ul><li>BFS distances to uncovered code</li><li>Rank by distance + tries</li><li>Most coverage, fewer solver calls</li></ul></div>
        <div class="card"><h3>The task</h3><ul><li>Write the strategy behind Host</li><li>Beat coverage and overhead on Vim and sed</li><li>0 of 16 passed; best 16.2</li></ul></div></div>` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★ (by hand)</h3>
        <p>Change the walk to always flip the <em>last</em> condition of the path (a payload check). How many runs does it take to reach <code>x3 &gt; 13</code>, and why? (Demo 1 lets you try it.)</p>
        <details class="reveal"><summary>Solution</summary><p>It never gets there. The last condition is always <code>x11 == 0</code>, so each flip changes only <code>x11</code> and the header never changes.</p></details>
        <h3>Exercise 2 ★★ (modify)</h3>
        <p>Move the payload loop to the start of <code>program</code> (and update <code>SUCC</code>: the loop's branches lead to the loop or to branches 2 and 3, and the header's last branches lead nowhere). How does bounded DFS do now, and why?</p>
        <details class="reveal"><summary>Solution</summary>${code("solutions")}<p>DFS covers all 21 reachable branches within 25 runs on every seed (mean 21.00), since it backtracks to the deepest forks first and those are now the header's. CFG-directed search reaches 20.20 after 100 runs. Where the explosion sits decides how DFS does.</p></details>
        <h3>Exercise 3 ★★ (experiment)</h3>
        <p>Change <code>x4 &gt; 7</code> to <code>x4 &gt; 6</code>. Which strategies find branch 20, and after how many runs?</p>
        <details class="reveal"><summary>Solution</summary><p>Now <code>x3 = 14, x4 = 7</code> works. Over seeds 1 to 20 (the “Exercise 3” lines of the output under Exercise 2's solution): CFG-directed finds it in 16 sessions (mean first run 14.1), bounded DFS in 8 (21.8), random branch in 5 (55.4), random testing in none.</p></details>
        <h3>Exercise 4 ★★ (modify)</h3>
        <p>In <code>random_branch</code>, negate only conditions whose other side is uncovered. Compare with CFG-directed search.</p>
        <h3>Exercise 5 ★ (by hand)</h3>
        <p>A candidate covers 8,000 Vim branches with a per-seed spread of 300; the reference covers 7,700 with a spread of 240. Does it clear the coverage rule?</p>
        <details class="reveal"><summary>Solution</summary><p>s = √((300² + 240²) / 2) = 271.7, so the margin is 0.7746 × 271.7 = 210.4. The gain of 300 clears it (the last line of the output under Exercise 2's solution). Demo 4 checks this.</p></details>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li>J. Burnim, K. Sen. <em>Heuristics for Scalable Dynamic Test Generation.</em> ASE 2008. <a href="${PAPER}" target="_blank" rel="noopener">Technical report UCB/EECS-2008-123</a></li>
        <li>P. Godefroid, N. Klarlund, K. Sen. <em>DART: Directed Automated Random Testing.</em> PLDI 2005.</li>
        <li>K. Sen, D. Marinov, G. Agha. <em>CUTE: A Concolic Unit Testing Engine for C.</em> ESEC/FSE 2005.</li>
        <li>The tool: <a href="https://github.com/jburnim/crest" target="_blank" rel="noopener">jburnim/crest</a></li>
        <li>Task page: <a href="${TASK}${SLUG}" target="_blank" rel="noopener">CREST</a></li></ul>` },
    ],
    takeaways: ["Paths explode; branches do not.", "Static structure guides the search.", "Two measurements pull apart."],
  },
];

const QUIZ = [
  { q: "A run took <code>x0 &lt; 8</code>, <code>not x0 == 3</code>, <code>not x1 &gt; x2</code>. To reach new code by negating the second condition, what must the new input satisfy?",
    opts: ["x0 == 3 only", "x0 &lt; 8 and x0 == 3", "x0 &lt; 8, x0 == 3 and not x1 &gt; x2", "not x0 &lt; 8"],
    a: 1, why: "Keep the prefix (the first condition) and negate the second. Conditions after it are dropped: the new run may go anywhere from there." },
  { q: "Why does bounded DFS cover so little of the toy program in 100 runs?",
    opts: ["It backtracks to the most recent fork first, and the last six forks are the payload loop's", "Its solver is slower", "It never restarts", "It only negates infeasible conditions"],
    a: 0, why: "After one dive through the header, DFS backtracks to the deepest forks first. The payload loop sits at the end of every path, so DFS spends its budget on its 64 variations: 6 header paths in 100 runs." },
  { q: "In CFG-directed search, why add <code>tries</code> to the distance?",
    opts: ["To prefer long paths", "To count solver time", "So a close but hopeless target sinks in the ranking after failed attempts", "To make the search deterministic"],
    a: 2, why: "A target can be close in the graph but infeasible or barren. Each failed attempt raises its rank key, so the search moves on to other targets." },
  { q: "GPT-6.1 Terra covered far more Vim branches than the reference. Why did it fail?",
    opts: ["Its score was below 13.3", "It crashed on sed", "Its Vim coverage was inside the margin", "Its sed overhead was 1.6 s above the reference's"],
    a: 3, why: "A pass needs all four rules. On sed it spent 31.4 s against the reference's 29.8 s in that run; it needed to be 0.572 s faster." },
  { q: "A strategy never sends a negation whose negated prefix it already requested. Which measurement does that help most?",
    opts: ["Search overhead", "The score", "The number of branches in the program", "The DFS baseline B"],
    a: 0, why: "A request never sent costs no solver time. In our toy, the two ideas cut solver calls from 56.60 to 11.50 per session, with no loss of coverage." },
];
