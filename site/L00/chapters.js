// L00 content, adapted from frontiercs2/notes/L00-introduction.md (checked by tools/check.py).

const demo = (name, title, instr, hint = "") =>
  `<div class="card demo" data-demo="${name}"><div class="head"><span class="title">${title}</span><span>${instr}</span></div>
   <div class="demo-body"></div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const callout = (kind, label, body) => `<div class="callout ${kind}"><b>${label}</b>${body}</div>`;
const predict = (q, a) => callout("predict", "PREDICT", `<p>${q}</p><details class="reveal"><summary>Show the answer</summary>${a}</details>`);
const out = (name) => codeBlock(OUT[name], "out");
const code = (name) => codeBlock(CODE[name]) + (OUT[name] ? out(name) : "");
const SITE = "https://frontier-cs.org/";

const LECTURE = {
  number: 0,
  title: "Introduction",
  tagline: "How FrontierCS 2 turns papers into research tasks",
  lead: "How a task is built from a paper, what the agent sees in its five hours, what counts as a pass, and how to read the leaderboard: pass rate, score against the human reference, FCI and test-time scaling. Each idea comes with a small model you can change.",
  heroDemo: "anatomy",
  heroLabel: "The life of a task",
  heroCaption: "From a paper's code to a pass or a fail.",
  whyTitle: "Why start here",
  whySub: "Three ideas every later lecture relies on",
  why: [
    ["A task is a paper", "Each task removes a paper's <b>key contribution</b> from its own code. The authors' code is the bar to beat."],
    ["Pass means every metric", "Beat the reference on <b>every metric of every hidden workload</b>. A high average is not enough."],
    ["Difficulty is measured", "One fit gives every model an <b>FCI</b> and every task an <b>FDI</b>, so hard tasks count for more."],
  ],
  ctaTitle: "Ready to see how a task is built?",
  minutes: "About 40 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-measures", nav: "What it measures", title: "What FrontierCS 2 Measures",
    subtitle: "Research, not bug fixing",
    abstract: "Most coding benchmarks check a known answer. FrontierCS 2 asks an agent to rebuild a paper's contribution and beat the paper's own code. It has 48 tasks from 13 fields, run by 16 models.",
    tags: ["benchmark", "48 tasks", "13 fields", "harness"],
    hero: "toc",
    sections: [
      { id: "research", title: "A benchmark for research", html: `
        <p>Most coding benchmarks ask an agent to fix a bug or pass a test that already has an answer. FrontierCS 2 asks for research: each task takes a paper and the code its authors released, removes the paper's key contribution, and asks an agent to write it back. To pass, the agent's version must beat the authors' own code on every metric of the task's hidden workloads.</p>
        ${code("fields")}` },
      { id: "harness", title: "Models and harnesses", html: `
        <p>Each model runs in its own agent harness: Claude Opus 5.5 in Claude Code, GPT-6 models in Codex CLI, Gemini 4 Argon in Antigravity and in Pi, and so on. So a leaderboard row is a model <em>and</em> its harness. A private set of more than 100 further tasks is kept back, to be announced later.</p>
        ${predict("Gemini 4 Argon appears twice on the leaderboard, with pass rates of 54% and 40%. How can the same model score so differently?", "<p>The two rows use different harnesses, Antigravity and Pi. The harness decides how the model reads files, runs commands and uses its five hours, so it is part of what is measured. One sourced example: under Pi, the provider's content filter refused a request and Pi ended the run in 10 of its 48 runs; Antigravity retries refused requests.</p>")}` },
    ],
    takeaways: ["Rebuild a paper's contribution.", "Beat the authors' code.", "A row is a model plus its harness."],
  },
  {
    slug: "2-task", nav: "A task", title: "How a Task Is Built",
    subtitle: "What the agent sees, and what stays with the judge",
    abstract: "The builders delete a paper's contribution from its own repository. The agent gets the rest, five hours and a score for each patch it tries. It must pick one version as its final submission, and only that version meets the hidden workloads.",
    tags: ["human reference", "train call", "development workloads", "final submission"],
    hero: "anatomyStill", heroCaption: "Click a step.",
    sections: [
      { id: "built", title: "Delete the contribution", html: `
        <p>A task starts from a paper's own repository. The builders delete the paper's contribution: the queue logic in BBQ, the search in MetaOpt, the scheduling decision in Shockwave. The rest of the code stays, so the agent works inside a real research codebase. The authors' code is the <b>human reference</b>.</p>` },
      { id: "sees", title: "What the agent sees", html: `
        <p>During a run, which has a wall-clock budget of five hours, the agent sees:</p>
        <ul><li>its repository and the task statement;</li>
        <li>for each patch it submits as a <b>train call</b>, a score on the <b>development workloads</b> and one message.</li></ul>
        <p>The evaluator, the <b>hidden workloads</b> and the reference stay with the judge. The hidden evaluation adds workloads the agent never sees. At the end, the agent picks one of its versions as its <b>final submission</b>, and only that version is scored on the hidden workloads.</p>` },
      { id: "pick", title: "Picking the final version", html: `
        <p>Choosing which version to submit is part of the work. Here is a toy run with five submissions. The development score is what the agent saw; the hidden score is what the judge measures later.</p>
        ${code("run")}
        ${demo("pick", "Demo 1 · Pick the final submission", "choose a version", "In the toy, the hidden score stands in for the whole pass check.")}
        <p>The version with the best development score was fitted to the development workloads and does worse on the hidden ones. The benchmark reports what the agent chose, as it is: an agent may end on a version that fails although an earlier one would have passed.</p>` },
    ],
    takeaways: ["The authors' code is the reference.", "Train calls see development workloads only.", "Only the chosen final version is judged."],
  },
  {
    slug: "3-pass", nav: "Pass", title: "What Counts as a Pass",
    subtitle: "Every metric, every hidden workload, with a margin",
    abstract: "A pass needs the final submission to beat the human reference on every metric and every hidden workload, by the margin the task's rule sets. A score above the reference is not enough.",
    tags: ["pass rule", "margin", "quality band", "SVG-EAR", "KV Compaction"],
    hero: "code:check", heroCaption: "One workload of a pass rule with a margin",
    sections: [
      { id: "rule", title: "The rule", html: `
        <p>A run <b>passes</b> only when its final submission beats the human reference on every metric the task checks and on every hidden workload. The criteria are set from the reference's own measurements, and some ask for a margin. For SVG-EAR, a video model's sparse attention, the latency must be at most 0.96 of the reference's, and three image-quality measures must stay within small margins of the reference's scores: PSNR at most 0.25 dB lower, SSIM at most 0.01 lower, LPIPS at most 0.005 higher.</p>
        ${code("check")}
        <p>The first candidate is 3% faster, but the rule asks for 4%. The second is 10% faster but loses too much quality. Only the third passes.</p>
        ${demo("margin", "Demo 2 · A rule with a margin", "move the sliders")}
        <p>A task counts every such check on every hidden workload: on SVG-EAR there are 48 (four measures on each of twelve clips). No model passed SVG-EAR (0 of 16 as of October 26, 2026); in the case study's twelve runs (October 19), the closest, GPT-6 Astra's, passed 43. (<a href="${SITE}blog/svg-ear-measured-error/" target="_blank" rel="noopener">case study ↗</a>)</p>` },
      { id: "fail", title: "Above the reference, and still a fail", html: `
        ${callout("pitfall", "A SCORE ABOVE THE REFERENCE CAN STILL FAIL", "<p>The final score averages over every metric and every workload, so a large gain in one place can hide a loss in another. On KV Compaction, Claude Opus 5.5 has the top score and sits above the human reference, but its answers fall short of the reference's accuracy on 2 of the 24 articles, so the run fails. The benchmark wants a result the paper's authors would accept as better, not a gain on one metric bought with another.</p>")}` },
    ],
    takeaways: ["Every metric, every hidden workload.", "Some rules ask for a margin.", "The average score can hide a loss."],
  },
  {
    slug: "4-leaderboard", nav: "Leaderboard", title: "Reading the Leaderboard",
    subtitle: "Pass rate, score against the reference, FCI and FDI",
    abstract: "Pass rate counts tasks passed. The mean score shows how far runs are above or below the reference. FCI and FDI come from one fit that weighs each pass by how hard the task is.",
    tags: ["pass rate", "mean score", "FCI", "FDI", "Epoch AI ECI"],
    hero: "fit", heroCaption: "A toy version of the FCI fit. Click cells to change it.",
    sections: [
      { id: "rate", title: "Pass rate", html: `
        <p>The leaderboard's main number is <b>pass rate</b>: the share of a model's runs that pass. With one run per task, it is the number of tasks passed out of 48.</p>
        ${code("passed")}` },
      { id: "score", title: "Score against the human reference", html: `
        <p>Each task's evaluator also scores the final submission on the hidden suite, from 0 to 100. A run that ends without a final submission scores 0. The <b>mean score</b> chart averages each run's score minus the human reference's score on the same task, so 0 means level with the reference. Claude Opus 5.5 leads at +9.2; Step 5 Preview is at −10.8.</p>` },
      { id: "fci", title: "FCI and FDI", html: `
        <p>Pass rate treats every task the same, but some tasks are much harder than others. The <b>FrontierCS Capabilities Index</b> (FCI) applies the idea of Epoch AI's ECI: one fit gives every model an ability and every task a difficulty, the <b>FDI</b>. A model beats a task's checks more often the more its ability exceeds the task's difficulty.</p>
        <p>The fit below is the core of that idea on a toy table: three models, five tasks, 1 for a pass and 0 for a miss. The chance that model <code>m</code> passes task <code>t</code> is <code>sigmoid(ability[m] − difficulty[t])</code>, and gradient ascent finds the values that make the table most likely. A small <code>shrink</code> term keeps the values finite: without it, a task nobody passed would drift to infinite difficulty. Like the real FCI, one model is the zero point.</p>
        ${code("fit")}
        ${predict("T3 and T5 were each passed only by Model A. Will they get the same difficulty?", "<p>Yes: in this table they look identical, so the fit cannot tell them apart. Both come out at 2.7.</p>")}
        ${demo("fit", "Demo 3 · Fit abilities and difficulties", "click cells", "Try making Model Z pass T4. T4 drops from the hardest task to level with T3 and T5, and Model Z, the zero point, now ties with Model B, so B falls to 0.0.")}
        <p>The real fit is richer than the toy. It models each metric a task checks, with its own difficulty, and each run, with an effect of its own; a task's FDI is then the strength at which a model passes it half the time. It also counts how far each final score lands above or below the reference's; a run that fails but scores above the reference counts only as at least level with it (the KV Compaction case in chapter 3). Its runs include those of Kimi K2.7, the zero point, which is not on the leaderboard, and it reports 90% intervals from a bootstrap over tasks. On the real scale, Claude Opus 5.5 has an FCI of 54.0, and KV Compaction is the hardest task, with an FDI of 103.0.</p>` },
    ],
    takeaways: ["Pass rate: tasks passed out of 48.", "Mean score: minus the reference, 0 is level.", "FCI and FDI: one fit for models and tasks."],
  },
  {
    slug: "5-cost", nav: "Cost", title: "Test-Time Scaling and Cost",
    subtitle: "What a model would score if every run stopped at a budget",
    abstract: "A test-time scaling curve stops every run at a cost budget. Runs that finished count what they achieved; runs still going count as nothing. A full evaluation of Claude Opus 5.5 costs about US$1,400.",
    tags: ["test-time scaling", "budget", "API cost"],
    hero: "budget", heroCaption: "Six toy runs and a budget.",
    sections: [
      { id: "curve", title: "The scaling curve", html: `
        <p>Runs differ in cost: an agent that tries more ideas can spend more on its model's API. A <b>test-time scaling</b> curve asks: what would a model score if every run were stopped at a cost budget? A run that ended within the budget counts what it achieved; a run still going at the budget counts as one that ended there without a final submission, so it beats nothing. A curve can therefore never fall as the budget grows.</p>
        ${code("scaling")}
        ${demo("budget", "Demo 4 · Stop every run at a budget", "move the budget")}
        <p>The real curves plot FCI rather than pass rate, with each task's difficulty kept from the leaderboard fit, so a curve ends at the model's leaderboard value once the budget covers all its runs.</p>` },
      { id: "cost", title: "What an evaluation costs", html: `
        <p>A full evaluation is expensive. For Claude Opus 5.5, one pass over the 48 tasks costs about US$1,000 in API fees, US$300 in GPU time and US$100 in CPU time. The tasks, their evaluators and the judge are public as one evaluation environment (<a href="https://github.com/FrontierCS/FrontierCS-2" target="_blank" rel="noopener">github.com/FrontierCS/FrontierCS-2</a>), which installs into your own AWS account; GPU tasks also need Modal.</p>` },
    ],
    takeaways: ["Stop every run at the budget.", "Unfinished runs count as nothing.", "About US$1,400 for one full run of Claude Opus 5.5."],
  },
  {
    slug: "6-review", nav: "Review", title: "Review and How to Use the Course",
    subtitle: "Check yourself, then pick a field",
    abstract: "What every later lecture covers for each task, five self-check questions, and four exercises on the programs from the notes.",
    tags: ["self-check", "exercises", "course map"],
    hero: "toc",
    sections: [
      { id: "use", title: "How to use this course", html: `
        <p>Each later lecture covers one field. For every task in it, you will see:</p>
        <ol><li><b>The idea</b>: what the paper found, on a small example you can run.</li>
        <li><b>What the agent writes</b>: the part the task removed.</li>
        <li><b>How it is judged</b>: the metrics, the workloads and the pass rule.</li>
        <li><b>What the agents did</b>: the results, and the ideas behind the best runs.</li></ol>
        <p><a href="../L04/index.html">Lecture 4 (Network)</a> is a good place to start: BBQ, MetaOpt and Shockwave each show a different way a run can pass or fail.</p>` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <h3>Exercise 1 ★ (think)</h3>
        <p>In the toy run, which version should an agent pick if it can see only the development scores? What would make it trust the last version more than the best one?</p>
        <h3>Exercise 2 ★ (modify)</h3>
        <p>Change the margin in <code>check</code> from 0.96 to 0.98. Which candidates pass now? (Demo 2 has the same switch.)</p>
        <details class="reveal"><summary>Solution</summary><p>The bound becomes 98, so the first candidate (97, 30.4 dB) passes too. The second still fails on quality; the third still passes.</p></details>
        <h3>Exercise 3 ★★ (experiment)</h3>
        <p>Add a fourth model to <code>TABLE</code> that passes every task except T4, and fit again. Where does it land, and how do the difficulties change? (Demo 3's <b>Add Model D</b> button does this.)</p>
        <h3>Exercise 4 ★ (compute)</h3>
        <p>A run passes and costs US$40. At which budgets does it count in the scaling curve?</p>
        <details class="reveal"><summary>Solution</summary><p>At every budget of US$40 or more. Below that, it is stopped before its final submission and counts as nothing.</p></details>` },
      { id: "links", title: "Links", html: `
        <ul><li>FrontierCS 2: <a href="${SITE}" target="_blank" rel="noopener">overview, leaderboard and questions</a></li>
        <li>All 48 tasks: <a href="${SITE}task/" target="_blank" rel="noopener">task pages</a></li>
        <li>Case studies: <a href="${SITE}blog/bbq-two-faster-clocks/" target="_blank" rel="noopener">BBQ</a>, <a href="${SITE}blog/svg-ear-measured-error/" target="_blank" rel="noopener">SVG-EAR</a>, <a href="${SITE}blog/quarterpir-two-checksums/" target="_blank" rel="noopener">QuarterPIR</a></li>
        <li>Evaluation environment: <a href="https://github.com/FrontierCS/FrontierCS-2" target="_blank" rel="noopener">github.com/FrontierCS/FrontierCS-2</a></li></ul>` },
    ],
    takeaways: ["Idea, removed part, judging, results.", "Start with Lecture 4.", "Check the date on every result."],
  },
];

const QUIZ = [
  { q: "What is the human reference of a task?",
    opts: ["The best agent's submission so far", "The code released with the paper, which the task's removed part came from", "A solution written by the benchmark builders", "The average of all runs"],
    a: 1, why: "The task deletes the contribution from the authors' own repository; their code is the bar to beat." },
  { q: "Which of these does the agent <em>not</em> see during its run?",
    opts: ["Its repository", "A score on the development workloads for each train call", "The hidden workloads", "The task statement"],
    a: 2, why: "The evaluator, the hidden workloads and the reference stay with the judge." },
  { q: "A rule says latency must be at most 0.96 of the reference's. A run is 3% faster on every workload and equal in quality. Does it pass?",
    opts: ["Yes, it is faster everywhere", "No, it needs to be at least 4% faster", "Only if its final score is above the reference", "Yes, if its development score was the best"],
    a: 1, why: "0.97 > 0.96. Margins are part of the pass rule." },
  { q: "In the toy fit, why does T4 get the highest difficulty?",
    opts: ["It has the longest task statement", "No model passed it", "Model Z failed it", "It costs the most to run"],
    a: 1, why: "A task nobody passes pushes its difficulty above every ability; the shrink term keeps it finite." },
  { q: "On a test-time scaling curve, how does a run that is still going at the budget count?",
    opts: ["As its best development score", "As a pass, if it would pass later", "As a run with no final submission: it beats nothing", "It is left out of the average"],
    a: 2, why: "So the curve can never fall as the budget grows." },
];
