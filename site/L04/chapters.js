// L04 content, adapted from frontiercs2/notes/L04-network.md (checked by tools/check.py).

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
  number: 4,
  title: "Network",
  tagline: "A packet queue, a routing gap and a GPU scheduler",
  lead: "The three Network tasks of FrontierCS 2. For each one: the paper's idea, the part the task removed, how a run is judged, and what the agents wrote back. Every idea runs in your browser, as a small model you can change.",
  heroDemo: "bbqMini",
  heroLabel: "BBQ · removing the best packet",
  heroCaption: "Follow the first 1 at each level, then subtract one from each counter on the way.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the Network tasks teach about doing research with agents",
  why: [
    ["Find the wait", "In BBQ, both passing designs removed <b>the same wait</b>, a memory read on the back-to-back path, in two different ways."],
    ["Generalize past the feedback", "The hidden workloads include cases the train calls <b>never show</b>. Designs tuned only to the feedback failed."],
    ["Every metric counts", "A pass needs <b>every metric on every workload</b>. In Shockwave, the run with the best fairness failed on makespan."],
  ],
  ctaTitle: "Ready to remove the best packet by hand?",
  minutes: "About 60 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-rules", nav: "The rules", title: "How a FrontierCS 2 Task Works",
    subtitle: "Remove a paper's key idea, and ask an agent to write it back",
    abstract: "Each task starts from a paper and its released code. The task removes the key contribution, and an agent writes it back in five hours. It passes only if it beats the authors' code on every metric of every hidden workload.",
    tags: ["human reference", "hidden workloads", "pass rule", "train calls"],
    hero: "toc",
    sections: [
      { id: "task", title: "A task in one paragraph", html: `
        <p>Each task starts from a paper and the code its authors released. The task removes the paper's key contribution from that code. An agent gets the rest of the code, the task statement and five hours, and writes the missing part back. The authors' code is the <b>human reference</b>.</p>
        <p>The judge runs the agent's final version on <b>hidden workloads</b>. A run <b>passes</b> only if it beats the human reference on every metric, on every hidden workload. Each task also gives a continuous <b>score</b>, but the score does not decide a pass.</p>
        ${predict("A candidate doubles the throughput on one workload but is one unit worse in latency on another. Does it pass?", "<p>No. One metric on one workload is enough to fail. The program below checks exactly this.</p>")}` },
      { id: "rule", title: "The pass rule as code", html: `
        ${code("passes")}
        <p>The first candidate is much faster on average, but its latency on the second workload is one unit worse, so it fails. The second improves everything by a little, and it passes.</p>
        <p>This toy is strict on every metric. Some tasks allow a tie on a metric: in BBQ the worst latency may equal the reference's, and in MetaOpt an equal gap passes. Each task page states its own rule.</p>
        <p>The agent also gets <b>train calls</b>: it can submit a version and see its score and how many public workloads it beats. The hidden workloads are not the public ones. In BBQ they include a bitmap width that train feedback never shows.</p>` },
      { id: "tasks", title: "The three Network tasks", html: `
        <table><tr><th>Task</th><th>What the agent writes</th><th>Scored on</th><th>Pass</th><th>Best final score</th></tr>
        <tr><td><a href="${TASK}bbq" target="_blank" rel="noopener">BBQ</a><br><small>NSDI 2024</small></td><td>the logic of each level of a hardware priority queue</td><td>throughput, latency</td><td>5 of 16</td><td>42.2 (reference 26.0)</td></tr>
        <tr><td><a href="${TASK}metaopt" target="_blank" rel="noopener">MetaOpt</a><br><small>NSDI 2024</small></td><td>a search for traffic on which a heuristic does worst</td><td>gap found</td><td>4 of 16</td><td>52.0 (reference 47.8)</td></tr>
        <tr><td><a href="${TASK}shockwave" target="_blank" rel="noopener">Shockwave</a><br><small>NSDI 2023</small></td><td>each round's choice of jobs on four GPUs</td><td>makespan, completion time, fairness</td><td>4 of 16</td><td>47.3 (reference 41.9)</td></tr></table>
        <p class="meta">Results from the 16-model leaderboard on frontier-cs.org, as of October 26, 2026.</p>` },
    ],
    takeaways: ["Remove the key idea; the agent writes it back.", "Beat the reference on every metric of every hidden workload.", "The score does not decide a pass."],
  },
  {
    slug: "2-bbq", nav: "BBQ queue", title: "BBQ: A Priority Queue Built from Bitmaps",
    subtitle: "How a circuit finds the best packet",
    abstract: "A network card needs a priority queue to schedule packets, millions of times a second. BBQ keeps the priorities in a tree of small bitmaps, each bit with a counter. Removing the best packet means following the first 1 at each level.",
    tags: ["priority queue", "bitmap tree", "counter", "back-to-back"],
    hero: "bbqMini", heroCaption: "The notes' example: five packets, three removals.",
    sections: [
      { id: "queue", title: "Sixteen priorities, two levels", html: `
        <p>A network card or a switch needs a <b>priority queue</b> to schedule packets. Each packet gets an integer priority, and the queue must hand out the best one next, millions of times a second. <b>BBQ</b> (Atre, Sadok and Sherry, NSDI 2024) builds that queue as a circuit.</p>
        <p>Take 16 priorities, 0 to 15, with 0 the best. BBQ keeps them in a tree of 4-bit bitmaps. The bottom level has four rows of four bits, one bit per priority. The top level has one row; its bit <code>i</code> is 1 when row <code>i</code> below holds a 1. Each bit also has a <b>counter</b> of the packets below it. A bit is 1 exactly when its counter is above 0, so the program keeps only the counters.</p>
        ${code("bbq")}` },
      { id: "remove", title: "Removing the best packet", html: `
        <p>To remove the best packet, follow the first 1 at each level: bit 0 at the top, so row 0; bit 1 in row 0, so priority 1. Then subtract one from each counter on the way. A bit turns to 0 when its counter does.</p>
        ${predict("Which of the three removals changes no bit at all?", "<p>The first. Priority 1 has two packets, so its counter goes 2 → 1 and its bit stays 1. The second removal empties it; the third empties all of row 0.</p>")}
        ${code("dequeue")}
        ${demo("bbq", "Demo 1 · A BBQ queue of 16 priorities", "enqueue · dequeue", "Try Dequeue max too: it follows the <em>last</em> 1 at each level. Then enqueue a packet into an empty row and watch two bits turn on.")}
        ${callout("pattern", "EACH REMOVAL MUST KNOW WHETHER A COUNT WAS 1", "<p>That decides whether a bit clears. The next removal comes one clock cycle later and must already see the result. This back-to-back dependency is what the whole task is about.</p>")}
        <p>With width 4, two levels give 16 priorities and three give 64. The hidden workloads go up to three levels of width 16: 4,096 priorities.</p>` },
      { id: "removed", title: "What the task removes", html: `
        <p>The task keeps the circuit around the queue and removes the logic of its tree levels. That logic is a Python program that writes the circuit (SystemVerilog), and the agent writes it back. Each level must serve enqueue, dequeue-min and dequeue-max, even when operations arrive back to back.</p>
        <p>The judge simulates every design on nine operation traces at five tree sizes. Every response must match a correct queue. Then it measures two speeds on each workload: <b>operations per second</b>, and the <b>latency</b> of the slowest operation. To pass, throughput must beat the reference and the worst latency must be no longer, on every workload.</p>` },
    ],
    takeaways: ["A bit is 1 when its counter is above 0.", "Follow the first 1 at each level.", "The next operation must see this one's result."],
  },
  {
    slug: "3-clock", nav: "BBQ clock", title: "BBQ: The Clock, and Two Faster Designs",
    subtitle: "Where the reference waits, and how two agents removed the wait",
    abstract: "The clock period is the slowest stretch of logic between two registers. In the reference, that stretch starts at a memory read. Gemini 4 Argon decided before the read landed; Claude Opus 5.5 removed the memory.",
    tags: ["clock period", "lookup table", "memory read", "registers"],
    hero: "code:period", heroCaption: "The task's timing model in three lines",
    sections: [
      { id: "model", title: "How the clock is set", html: `
        <p>A circuit works in ticks of a clock. Between ticks, values wait in <b>registers</b>. In each tick, values leave the registers, pass through logic, and must settle in the next registers before the next tick. The <b>clock period</b> is the time of the slowest such stretch.</p>
        <p>The task times every design with a fixed model. Synthesis cuts the logic into <b>lookup tables</b> (LUTs), the basic gate of an FPGA. Each LUT on a stretch costs 500 ps, every period carries a fixed 300 ps, a stretch that starts at a memory read costs 1,000 ps more, and one that starts at a FIFO status flag costs 500 ps more.</p>
        ${code("period")}
        <p>Speed is operations per second: operations per cycle divided by the period. Every design in the case study finishes about 0.68 operations per cycle, so the period decides.</p>
        ${code("opsps")}
        ${demo("clock", "Demo 2 · The clock period", "change the stretch", "No design can go below 1,800 ps: a fixed stage outside the agent's part reads a memory and passes one LUT.")}` },
      { id: "wait", title: "Where the human reference waits", html: `
        <p>The reference keeps the top level in registers. Below it, the counters sit in <b>memory blocks</b>, which pack thousands of values into little space. A lower level takes three stages: search the row and ask memory for the counter; receive the counter; update it and write it back.</p>
        <p>A memory read lands late in its cycle. By then, an operation just ahead may have changed the same counter. So after the read, the level compares the counter with what the operations ahead wrote and keeps the newest value. That comparison costs three LUTs after the memory: <b>2,800 ps</b> on the three smallest trees. On the two largest, the search for the first 1 is slower still: 3,300 and 3,800 ps.</p>
        ${predict("The reference's slowest stretch is memory → 3 LUTs → register. Which change would help more: one LUT fewer after the memory, or no memory at all?", "<p>No memory. One LUT fewer gives 300 + 1,000 + 2 × 500 = 2,300 ps; the same three LUTs after a register give 1,800 ps. Gemini 4 Argon · Pi went further on the memory side and cut two LUTs (1,800 ps on width 4); Claude Opus 5.5 removed the memory.</p>")}` },
      { id: "two", title: "Two ways to remove the wait", html: `
        <p><b>Gemini 4 Argon · Pi</b> (the case study calls it Gemini 4 Argon) kept every memory. It noticed that <em>which</em> value is newest does not depend on the value; it depends on which operations ahead touched the same counter, and registers already hold that. So it computes the choice from registers while the read is in flight. When the counter lands, one LUT picks it or a newer value: memory → 1 LUT, the floor of 1,800 ps.</p>
        <p><b>Claude Opus 5.5</b> removed the memory. Each bucket gets three registers: its bit, its count, and a flag for "count is 1". Registers can be read at any moment, so a level needs one stage, not three. An operation leaves the level before the next one enters it, so there is no newer value to look for.</p>
        <table><tr><th>Tree</th><th>Reference (ps)</th><th>Gemini 4 Argon · Pi (ps)</th><th>Claude Opus 5.5 (ps)</th></tr>
        <tr><td>2 levels, width 4</td><td>2,800</td><td>1,800</td><td>1,800</td></tr>
        <tr><td>2 levels, width 8</td><td>2,800</td><td>2,300</td><td>1,800</td></tr>
        <tr><td>3 levels, width 4</td><td>2,800</td><td>1,800</td><td>1,800</td></tr>
        <tr><td>3 levels, width 8</td><td>3,300</td><td>2,300</td><td>1,800</td></tr>
        <tr><td>3 levels, width 16</td><td>3,800</td><td>2,800</td><td>2,300</td></tr></table>
        <p>At the same operations per cycle, the speed-up is the ratio of the periods.</p>
        ${code("ratios")}
        <p>The measured speed-ups in the case study are 1.22–1.56× for Gemini and 1.56–1.84× for Opus. They differ from these ratios in the second decimal, because the designs do not finish exactly the same operations per cycle.</p>` },
      { id: "cost", title: "What the speed cost", html: `
        ${callout("pitfall", "SPEED IS NOT FREE", "<p>At 4,096 priorities, Opus's design uses 26,763 LUTs and 48,454 registers, against 1,694 and 2,431 for the reference; Gemini's uses 2,126 and 2,295. The task scores speed and correctness, not size. Three other models also moved the counters into registers, but ran at 5,300 to 8,300 ps at width 16 and failed. Registers alone did not make a fast clock; the short single stage did.</p>")}
        ${callout("pitfall", "THE HIDDEN WORKLOADS ARE WIDER THAN THE FEEDBACK", "<p>GPT-6 Astra scored 40.4, reached 1,800 ps on every tree of the feedback, and still failed: at width 16 its clock rose to 4,800 ps, slower than the reference's 3,800. Opus had written a second form for bottom levels of more than 1,024 buckets.</p>")}
        <p>The full story, with figures and every model's clock at width 16, is in the case study <a href="https://frontier-cs.org/blog/bbq-two-faster-clocks/" target="_blank" rel="noopener">Two Faster Clocks for a Hardware Priority Queue ↗</a>.</p>` },
    ],
    takeaways: ["period = 300 + offset + 500 × LUTs.", "Gemini: decide during the read. Opus: no read.", "Test beyond the feedback."],
  },
  {
    slug: "4-metaopt", nav: "MetaOpt", title: "MetaOpt: Traffic That Defeats a Heuristic",
    subtitle: "Search for the inputs on which a fast shortcut does worst",
    abstract: "Operators route wide-area traffic with fast heuristics instead of the optimal linear program. MetaOpt finds the traffic on which a heuristic falls furthest behind. The task removes that search.",
    tags: ["linear program", "POP", "demand pinning", "adversarial input"],
    hero: "metaopt", heroCaption: "Pick a demand for each pair; the page solves the LPs.",
    sections: [
      { id: "idea", title: "Optimal routing and two shortcuts", html: `
        <p>A wide-area network routes traffic between many pairs of sites. The best routing solves a <b>linear program</b> (LP), which can be slow, so operators use <b>heuristics</b>. A heuristic is fast but sometimes far from optimal. <b>MetaOpt</b> (NSDI 2024) asks: <em>on which traffic does the heuristic do worst?</em> The answer tells an operator how much the heuristic can cost.</p>
        <p>The heuristic in the task keeps the better of two shortcuts:</p>
        <ul><li><b>POP</b> splits the pairs into groups. Each group gets an equal share of every link and is solved on its own.</li>
        <li><b>Demand pinning</b> (DP) sends every small demand (at most 6) on its shortest path, then optimizes the rest with what is left.</li></ul>
        <p>The <b>gap</b> of a traffic matrix <code>d</code> is <code>OPT(d) − max(POP(d), DP(d))</code>. The task removes MetaOpt's search for traffic with a large gap, and the agent writes it.</p>` },
      { id: "lp", title: "A small LP solver", html: `
        <p>To compute OPT, we need an LP solver. This one maximizes <code>c·x</code> subject to <code>Ax ≤ b</code> and <code>x ≥ 0</code>, with <code>b ≥ 0</code>, using the simplex method on exact fractions.</p>
        ${code("simplex")}` },
      { id: "net", title: "A four-site network", html: `
        <p>Our network has four sites, five links and five pairs. Each pair has two paths, shortest first. POP uses two groups here; the task uses three.</p>
        ${code("network")}
        <p>Why does this matrix hurt both shortcuts? Pinning puts the small A&gt;C demand on A–B–C, the two links that the big A&gt;B and B&gt;C demands need most; the optimum would send A&gt;C the other way, round A–D–C. POP gives each group only half of every link, so A&gt;B and B&gt;C, which share a group, each get only half of their direct link.</p>
        ${demo("metaopt", "Demo 3 · The gap on four sites", "pick demands", "Start from A>C = 6, A>B = 18 and add B>C = 18. Then move the 6 to another pair and watch the gap.")}` },
      { id: "search", title: "Searching for the worst traffic", html: `
        <p>Like the task, we allow demand levels 0, 6 and 18. Five pairs give 3<sup>5</sup> = 243 matrices, few enough to try them all.</p>
        ${code("search")}
        <p>In our network no pinned load can overload a link, so all 243 matrices are valid. The task has 27 pairs, at most nine of them nonzero, and only 256 calls to the exact checker per instance. There are far too many matrices to try them all:</p>
        ${code("count")}
        <p>The human reference solves one large mixed-integer program, MetaOpt's own method. <b>Claude Opus 5.5</b> (final score 52.0, ${pass}; three other runs tied at 52.0 and passed too) wrote its own small simplex solver to score candidates privately, then ran a local search with four threads. Its own idea was to seed the search from <b>cuts</b>: small sets of links that every path of the big demands must cross, crowded with small pinned demands, just like the A–B–C links above. Eleven of sixteen models scored above the reference; four passed every instance.</p>` },
    ],
    takeaways: ["gap = OPT − max(POP, DP).", "Crowd the links the big demands need.", "Score candidates privately; spend the oracle calls well."],
  },
  {
    slug: "5-shockwave", nav: "Shockwave", title: "Shockwave: Sharing GPUs Fairly",
    subtitle: "Choose which training jobs run each round, on four counts at once",
    abstract: "A cluster scheduler chooses which jobs run on the GPUs each round. Shockwave plans for jobs whose batch sizes, and speeds, change as they train. A pass must beat the reference on makespan, completion time and two fairness counts.",
    tags: ["makespan", "JCT", "finish-time fairness", "round-based"],
    hero: "sched", heroCaption: "Six jobs on four GPUs, three simple policies.",
    sections: [
      { id: "counts", title: "Four counts", html: `
        <p>A shared cluster runs many machine-learning training jobs. Each round (120 seconds in the task), a <b>scheduler</b> chooses which jobs run on the cluster's GPUs. Many jobs change their batch size as they train, and with it their speed. <b>Shockwave</b> (NSDI 2023) plans for these changes ahead, to finish jobs fast while treating each one fairly.</p>
        <p>The task judges a schedule on two hidden traces of eight jobs each, on four counts, and a pass must beat the reference strictly on all four, on both traces:</p>
        <ul><li><b>makespan</b>: when the last job finishes;</li>
        <li><b>average JCT</b>: the mean job completion time (finish minus arrival);</li>
        <li><b>worst ρ</b>: a job's finish-time fairness ρ is its JCT divided by the time it would take with a fair share of the cluster (its time alone times <code>max(1, jobs / GPUs)</code>, so 2 for eight jobs on four GPUs); the worst ρ is the largest;</li>
        <li><b>unfair jobs</b>: the share of jobs with ρ above 1.05.</li></ul>` },
      { id: "sim", title: "A small cluster", html: `
        <p>Our cluster has four GPUs and six jobs. Each job needs a fixed number of GPUs, and its epochs get shorter as its batch size grows.</p>
        ${code("simulate")}
        <p>A policy returns the live jobs in order of preference. The simulator packs them onto the free GPUs in that order and skips a job that does not fit.</p>
        ${predict("Shortest remaining time first is known to minimize average completion time. Will it also win on makespan and fairness?", "<p>No. In the run below it has the best average JCT and the fewest unfair jobs, but the longest makespan, and FIFO and Fairest beat it on other counts.</p>")}
        ${code("policies")}
        ${demo("sched", "Demo 4 · Three policies on four GPUs", "pick a policy", "Each bar is one job on one GPU for one round; a short bar is a job that finished mid-round.")}
        <p>Each policy wins somewhere and loses somewhere. FIFO and Fairest finish the trace first. SRTF has the shortest average JCT and the fewest unfair jobs. Fairest has the best worst ρ, but every one of its six jobs ends above 1.05. Beating a reference on all four at once is much harder than on any one.</p>` },
      { id: "agents", title: "What the agents did", html: `
        ${callout("pitfall", "THREE OUT OF FOUR IS A FAIL", "<p>Claude Opus 5.5 had the best fairness of all sixteen runs (12.5% unfair jobs, worst ρ 1.18, against 62.5% and 1.51 for the reference) and a shorter average JCT. But its mean makespan was 16,700 s, against 16,100 s for the reference, so it failed. Its final score, 47.1, is third of sixteen: level with Gemini 4 Argon · Antigravity, which passed, and above GPT-6.1 Terra, which passed with 46.5.</p>")}
        <p>Opus kept its own copy of every job's state, copied the simulator's batch-size rules to forecast how long each job still needs, and searched over job orders for the one with the best combined score. That score gave the two fairness terms three times their base weight.</p>
        <table><tr><th>Run</th><th>Average JCT (s)</th><th>Makespan (s)</th><th>Unfair jobs</th><th>Worst ρ</th><th></th></tr>
        <tr><td>Human reference</td><td>8,970</td><td>16,100</td><td>62.5%</td><td>1.51</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>7,690</td><td>15,300</td><td>18.8%</td><td>1.24</td><td>${pass}</td></tr>
        <tr><td>GPT-6 Astra</td><td>7,700</td><td>15,500</td><td>18.8%</td><td>1.24</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>7,660</td><td>16,700</td><td>12.5%</td><td>1.18</td><td>${fail}</td></tr></table>
        <p class="meta">Selected rows; means over the two hidden traces, as of October 26, 2026. Four models passed; all sixteen scored above the reference. <a href="${TASK}shockwave" target="_blank" rel="noopener">Full table ↗</a></p>` },
    ],
    takeaways: ["Four counts, all must improve.", "Each simple policy wins one and loses another.", "A weighted score can hide a lost metric."],
  },
  {
    slug: "6-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>The rules</h3><ul><li>Remove the key idea; write it back</li><li>Human reference = the authors' code</li><li>Every metric, every hidden workload</li></ul></div>
        <div class="card"><h3>BBQ</h3><ul><li>Bitmap tree with counters</li><li>period = 300 + offset + 500 × LUTs</li><li>Decide during the read, or drop the memory</li></ul></div>
        <div class="card"><h3>MetaOpt and Shockwave</h3><ul><li>gap = OPT − max(POP, DP)</li><li>Seed the search from crowded cuts</li><li>Four counts; no simple policy wins all</li></ul></div></div>` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★ (modify)</h3>
        <p>Write <code>dequeue_max</code>, which removes the worst packet. Check it on the five packets of the example: it should return 9, 9, 2, 1, 1. (Demo 1's <b>Dequeue max</b> does the same.)</p>
        <h3>Exercise 2 ★ (compute)</h3>
        <p>A design's slowest stretch starts at a FIFO flag and passes two LUTs. What is its period, and how many operations per second does it reach at 0.68 operations per cycle?</p>
        <details class="reveal"><summary>Solution</summary><p>300 + 500 + 2 × 500 = 1,800 ps, the floor. 0.68 / 1.8 ns ≈ 3.78 × 10<sup>8</sup> operations per second.</p></details>
        <h3>Exercise 3 ★★ (experiment)</h3>
        <p>In the MetaOpt network, change the capacity of link BD from 6 to 12. Find the largest gap again. Does the worst matrix change?</p>
        <h3>Exercise 4 ★★ (model)</h3>
        <p>Let SRTF guess each job's remaining time from its <em>current</em> epoch length only, as a scheduler would that does not know the batch size will grow. Which counts change?</p>
        <h3>Exercise 5 ★★★ (open)</h3>
        <p>Write a policy that beats SRTF on all four counts on our six jobs, or explain why you think none exists. This is the Shockwave task in miniature.</p>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li>N. Atre, H. Sadok, J. Sherry. <em>BBQ: A Fast and Scalable Integer Priority Queue for Hardware Packet Scheduling.</em> NSDI 2024. <a href="https://www.usenix.org/system/files/nsdi24-atre.pdf" target="_blank" rel="noopener">PDF</a></li>
        <li>P. Namyar et al. <em>Finding Adversarial Inputs for Heuristics using Multi-level Optimization.</em> NSDI 2024.</li>
        <li>P. Zheng et al. <em>Shockwave: Fair and Efficient Cluster Scheduling for Dynamic Adaptation in Machine Learning.</em> NSDI 2023.</li>
        <li>FrontierCS 2 case study: <a href="https://frontier-cs.org/blog/bbq-two-faster-clocks/" target="_blank" rel="noopener">Two Faster Clocks for a Hardware Priority Queue</a>.</li>
        <li>Task pages: <a href="${TASK}bbq" target="_blank" rel="noopener">BBQ</a>, <a href="${TASK}metaopt" target="_blank" rel="noopener">MetaOpt</a>, <a href="${TASK}shockwave" target="_blank" rel="noopener">Shockwave</a>.</li></ul>` },
    ],
    takeaways: ["Find the wait.", "Generalize past the feedback.", "Every metric counts."],
  },
];

const QUIZ = [
  { q: "A run scores 47.1 on Shockwave, as high as a run that passed. How can it fail?",
    opts: ["Its code did not build", "It lost to the reference on one metric (makespan), and a pass needs every metric", "Its score was computed on the public traces only", "Scores above 47 are capped"],
    a: 1, why: "The pass rule compares every metric on every hidden workload. Claude Opus 5.5 was better on three counts and worse on makespan." },
  { q: "In the 16-priority BBQ with packets 1, 1, 2, 9, 9, which removal turns a top-level bit to 0?",
    opts: ["The first", "The second", "The third", "None of the first three"],
    a: 2, why: "The third removal takes priority 2, the last packet in row 0, so row 0's counter at the top reaches 0." },
  { q: "Under the task's model, a stretch starts at a memory read and passes three LUTs. What is its period?",
    opts: ["1,800 ps", "2,300 ps", "2,800 ps", "3,300 ps"],
    a: 2, why: "300 + 1,000 + 3 × 500 = 2,800 ps: the reference's slowest stretch on the small trees." },
  { q: "How did Gemini 4 Argon · Pi reach 1,800 ps on width-4 trees while keeping every memory?",
    opts: ["It used a faster memory", "It decided from registers, during the read, which value is newest, so one LUT follows the memory", "It skipped the correctness checks", "It moved all counters into registers"],
    a: 1, why: "Which value is newest depends on which operations ahead touched the counter, and that is in registers. Moving the counters into registers was Opus's route." },
  { q: "In our MetaOpt network, why does a small A>C demand of 6 enlarge the gap?",
    opts: ["It overloads link BD", "Pinning puts it on A–B–C, the links the big A>B and B>C demands need, while OPT would route it via D", "POP ignores small demands", "It makes the LP infeasible"],
    a: 1, why: "Pinned on its shortest path, it takes capacity on the crowded links. The optimum sends it the other way. Opus seeded its search from such crowded cuts." },
];
