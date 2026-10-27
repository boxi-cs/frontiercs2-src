// L06 content, adapted from frontiercs2/notes/L06-bioinformatics.md (checked by tools/check.py).

const demo = (name, title, instr, hint = "") =>
  `<div class="card demo" data-demo="${name}"><div class="head"><span class="title">${title}</span><span>${instr}</span></div>
   <div class="demo-body"></div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const callout = (kind, label, body) => `<div class="callout ${kind}"><b>${label}</b>${body}</div>`;
const predict = (q, a) => callout("predict", "PREDICT", `<p>${q}</p><details class="reveal"><summary>Show the answer</summary>${a}</details>`);
const out = (name) => codeBlock(OUT[name], "out");
const code = (name) => codeBlock(CODE[name]) + (OUT[name] ? out(name) : "");
const pass = '<span class="chip pass">Pass</span>', fail = '<span class="chip fail">Fail</span>';
const TASK = "https://frontier-cs.org/task/#";
const SLUG = "exact-sequence-alignment";

const LECTURE = {
  number: 6,
  title: "Bioinformatics",
  tagline: "Exact DNA alignment: 64 cells per word, and a path from two rows",
  lead: "The Bioinformatics task of FrontierCS 2: Edlib, exact sequence alignment by edit distance. We build up from the dynamic-programming table to Myers's bit-vector algorithm and the band, recover the alignment in linear memory with Hirschberg's method, then look at how the task is judged and what the agents wrote.",
  heroDemo: "hirschbergAuto",
  heroLabel: "Hirschberg's method · GATTACAGA against GCATGCAGTA",
  heroCaption: "Each split meets in the middle row; only two pieces of the table remain.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the Bioinformatics task teaches",
  why: [
    ["Speed from structure", "Myers's algorithm does <b>64 cells per word</b>, the band skips cells no cheap path reaches, and every answer stays <b>exact</b>."],
    ["Memory against time", "Hirschberg's method needs <b>two rows</b> for about <b>twice the time</b>. Here memory is judged with zero tolerance."],
    ["A noisy race", "Reconstruction takes under a millisecond, and a pass needs a strict win on <b>all 60</b> workloads. One model of sixteen passed."],
  ],
  ctaTitle: "Ready to align?",
  minutes: "About 60 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-dp", nav: "Edit distance", title: "Edit Distance by Dynamic Programming",
    subtitle: "A table of costs, and a path traced back through it",
    abstract: "The edit distance counts substitutions, insertions and deletions. A table with one cell per pair of prefixes gives it; walking back from the last cell gives an optimal alignment, written as operation bytes or an extended CIGAR string. Edlib's three modes differ only in which ends of the target are free.",
    tags: ["edit distance", "dynamic programming", "traceback", "CIGAR", "NW / SHW / HW"],
    hero: "code:traceback", heroCaption: "Tracing an alignment back and writing it as CIGAR",
    sections: [
      { id: "idea", title: "Edit distance", html: `
        <p>The <b>edit distance</b> between a query <code>q</code> and a target <code>t</code> is the smallest number of single-letter edits that turn one into the other. There are three edits, each costing one: a <b>substitution</b> (a mismatch), an <b>insertion</b> (a query letter with no partner in the target) and a <b>deletion</b> (a target letter with no partner in the query). Biologists use it to compare DNA reads with a genome: mutations and sequencing errors are exactly these edits.</p>
        <p>FrontierCS 2 has one Bioinformatics task, <b>Edlib</b>, from Šošić and Šikić's paper <em>Edlib: a C/C++ library for fast, exact sequence alignment using edit distance</em> (Bioinformatics 2017). Edlib finds the exact edit distance and an alignment that achieves it, with Myers's bit-vector algorithm, a band that grows until it holds the answer, and Hirschberg's method, which recovers the alignment without storing the whole table. The task removes that last part, the path recovery. With one task, this lecture goes deeper than the others. The Python programs are ours; every output shown is the real output.</p>` },
      { id: "table", title: "The table", html: `
        <p>Let <code>D[i][j]</code> be the distance between the first <code>i</code> letters of the query and the first <code>j</code> letters of the target. The first row and column are <code>j</code> and <code>i</code>: an empty string needs that many edits. Every other cell takes the best of three moves: diagonal (match or mismatch), down (insertion) or right (deletion).</p>
        ${code("table")}
        <p>The answer is the bottom-right cell: <code>ACGT</code> and <code>ACCT</code> are one edit apart. Filling the table costs one step per cell, so two strings of 30,000 letters need 900 million cells.</p>` },
      { id: "traceback", title: "Tracing the alignment back", html: `
        <p>The distance alone does not say which letters pair up. To get an <b>alignment</b>, start at the bottom-right cell and walk back: at each cell, take a move that explains its value. Edlib writes each step as a byte: 0 match, 1 insertion, 2 deletion, 3 mismatch. Runs of equal steps make an <b>extended CIGAR</b> string, such as <code>2=1X1=</code> (two matches, one mismatch, one match).</p>
        ${code("traceback")}
        <p>This is the example in the task statement: distance 1, operations <code>0,0,3,0</code>, CIGAR <code>2=1X1=</code>. Often several paths have the same cost; the task accepts any of them.</p>
        ${demo("table", "Demo 1 · The edit table", "type two strings, switch modes", "Try GATTACA / GCATGCA: several optimal paths exist, and this one prefers the diagonal.")}` },
      { id: "modes", title: "Three alignment modes", html: `
        <p>Edlib has three modes, which differ only in what is free (from the library's README):</p>
        <ul><li><b>NW</b> (global, Needleman–Wunsch): the whole query against the whole target.</li>
        <li><b>SHW</b> (prefix): the query against the start of the target; skipping the target's end is free.</li>
        <li><b>HW</b> (infix): the query anywhere inside the target; skipping its start and its end is free.</li></ul>
        <p>A free target start means the first row is all zeros; a free target end means the answer is the smallest value in the last row, and every column holding it is an <b>end location</b>. One row at a time is enough for the distance:</p>
        ${code("modes")}
        <p>In SHW mode <code>AACT</code> fits the start of <code>AACTGGC</code> exactly; in HW mode <code>ACT</code> fits inside <code>CGACTGAC</code> exactly, ending at position 4. In the task, SHW inputs have an extra target suffix and HW inputs have flanks on both sides. Once the end (and, for HW, the start) is known, Edlib cuts out that part of the target, and path recovery is always a global (NW) problem.</p>` },
      { id: "dna", title: "Our DNA pairs", html: `
        <p>The task's inputs are DNA cores of 10,000 and 30,000 bases, 60% to 99% similar. Its public generator mutates 60% of the edited bases by substitution, 20% by insertion and 20% by deletion. Ours does the same with 1,000 bases, so Python stays quick:</p>
        ${code("dna")}
        <p>At 99% the pair is 17 edits apart; at 60% the distance is over a third of the length.</p>` },
    ],
    takeaways: ["One cell per pair of prefixes; three moves.", "Trace back for the path: 0 =, 1 I, 2 D, 3 X.", "SHW and HW free the target's ends."],
  },
  {
    slug: "2-myers", nav: "Myers & band", title: "Myers's Bit-Vector Algorithm and the Band",
    subtitle: "64 cells per word, and only the cells a cheap path can reach",
    abstract: "Neighbouring cells differ by at most one, so a column is a vector of +1, 0 and −1 deltas. Myers's algorithm updates a column of deltas with a few bitwise operations per word of 64 rows. A band skips cells no path of cost k can reach; Edlib doubles k from 64 until the band holds the answer.",
    tags: ["bit-parallel", "Myers 1999", "Ukkonen band", "k doubling"],
    hero: "code:myers", heroCaption: "Myers's algorithm: a column per target letter",
    sections: [
      { id: "deltas", title: "Columns of +1, 0 and −1", html: `
        <p>Neighbouring cells of the table differ by at most one. So a column can be stored as the <b>deltas</b> going down it: +1, 0 or −1 per row. Myers (1999) keeps them in two bit vectors, <code>pv</code> (the rows where the delta is +1) and <code>mv</code> (the rows where it is −1), and computes the next column from the current one with a handful of bitwise operations per word of 64 rows: 64 cells per operation. <code>peq</code> gives, for each letter, the rows where the query has that letter.</p>
        ${code("myers")}
        <p>Myers's original version searches for the query anywhere in a text, so its top row is all zeros. For the global distance the top row grows by 1 per column; that is the <code>| 1</code> shifted in at the top, as Edlib does in NW mode. The line <code>((eq &amp; pv) + pv) ^ pv</code> is the trick: one addition carries information down a run of rows, as a chain of matches carries a low value down a diagonal. Here it is on our first example. Read the deltas from the top: column 1 starts at 1 (the top row holds <code>j</code>), then 1 − 1 = 0, then 1, 2, 3.</p>
        ${code("trace")}
        ${demo("myers", "Demo 2 · Myers column by column", "step through", "Each cell shows its value and, small, its delta from the cell above. Blue: +1; amber: −1.")}
        <p>The four columns match the table of the first chapter, and the five long pairs give the same distances as the full table. Edlib cuts a long query into <b>blocks</b> of 64 rows and passes the carry from one block to the next, so a column of a 30,000-base query takes 469 blocks.</p>` },
      { id: "band", title: "The band", html: `
        <p>A path that passes through cell <code>(i, j)</code> must make up the gap <code>|i − j|</code> to get there and the gap <code>|(m − i) − (n − j)|</code> to leave. If the distance is at most <code>k</code>, any cell where these two gaps add up to more than <code>k</code> can be skipped. The cells left form a <b>band</b> around the diagonal (Ukkonen, 1985). Edlib does not know the distance in advance, so it tries <code>k = 64</code> and doubles <code>k</code> until the band holds an answer:</p>
        ${code("band")}
        ${code("doubling")}
        ${predict("At 60% similarity the distance is 355. How many tries does doubling from k = 64 need?", "<p>Four: 64, 128 and 256 are too small, and 512 holds the answer. The failed tries cost almost as much as the last one.</p>")}
        ${demo("band", "Demo 3 · The band and k doubling", "pick a pair")}
        <p>For similar pairs the band is a small part of the table; at 60% the doubling ends up computing most of it. Edlib bands Myers's algorithm by whole blocks of 64 rows, so it skips blocks rather than cells. Path recovery has one advantage over the first pass: the distance is already known, so <code>k</code> can be set to it and no doubling is needed.</p>` },
    ],
    takeaways: ["pv and mv hold a column's +1 and −1 deltas.", "One addition carries along runs of matches.", "Band: skip cells no cost-k path can reach."],
  },
  {
    slug: "3-hirschberg", nav: "Linear memory", title: "Recovering the Path in Linear Memory",
    subtitle: "Meet in the middle, then solve two smaller pieces",
    abstract: "A direct traceback needs the whole table: 269 MiB for two 30,000-base strings. Hirschberg's method computes the top half forward and the bottom half backward, finds where an optimal path crosses the middle row, and recurses. It keeps two rows and costs about twice the table in time.",
    tags: ["Hirschberg 1975", "divide and conquer", "linear memory", "path check"],
    hero: "code:middle", heroCaption: "Meeting in the middle: the task page's example",
    sections: [
      { id: "memory", title: "The full table is too big", html: `
        <p>Tracing back needs the whole table, or at least all of Myers's columns. Edlib's own rule, in the library source the agent reads, estimates that storage as 2 words and an <code>int</code> per block per column, plus 8 bytes per column, and traces back directly only below 1 MiB. Here is the estimate for the task's sizes, with one column of blocks for comparison:</p>
        ${code("memory")}
        <p>Our 1,000-base pairs fit under 1 MiB, so Edlib would trace them back directly. The task's pairs need 30 MiB and 269 MiB. The human reference in the task uses 80 KiB.</p>` },
      { id: "middle", title: "Meeting in the middle", html: `
        <p>Hirschberg (1975) found a way, for the longest common subsequence, to get the path with two rows of working memory (plus the recursion and the path itself); the same trick works for edit distance. Cut the query at its middle row. Compute the top half's last row going forward, as before. Compute the bottom half's costs going <b>backward</b>, by running the same code on both strings reversed. At each column, the two numbers add up to the best cost of a path that crosses the middle row there; the smallest sum is the distance, and it marks where an optimal path crosses. This is the picture on the task page:</p>
        ${code("middle")}
        ${predict("Why is the smallest sum always the distance?", "<p>Every path from the top-left to the bottom-right crosses the middle row somewhere. The sum at a column is the cheapest path forced through that column, so the cheapest of them is the cheapest path of all.</p>")}` },
      { id: "divide", title: "Divide and conquer", html: `
        <p>Once the crossing is known, the top-left and bottom-right pieces (rectangles cut at the crossing, of any shape) are two smaller alignment problems, and the other two pieces can be dropped. Solve each the same way, and stop when a piece is one row or one column, where a tiny table is enough.</p>
        ${code("hirschberg")}
        <p>The task checks a path the way this function does: it must use up the whole query and the whole target interval, every match must really match, and its cost must equal the exact distance.</p>
        ${code("pathcost")}
        ${demo("hirschberg", "Demo 4 · Hirschberg's method", "step through the splits", "Grey cells are dropped; the amber piece is being split; blue cells are on the path so far.")}
        <p>The price of linear memory is time. The first split computes the whole table once; the pieces below it add half as much, then a quarter, and so on, so the total is about <b>twice</b> the table. Edlib makes two changes: it splits the <b>target</b> in half, because Myers's algorithm runs column by column and gives a whole column of costs at once, and it bands every half by the known distance. Edlib also solves each half through <code>obtainAlignment</code>, the rule of the first section, so a piece whose traceback estimate is under 1 MiB is traced back directly. Under this task's memory rule, where the reference peaks at 80 KiB, 1 MiB is far too much: a solution must choose a much smaller budget.</p>` },
    ],
    takeaways: ["Forward top + backward bottom = cost through each column.", "Recurse on two pieces; drop the rest.", "Two rows of memory, about twice the time."],
  },
  {
    slug: "4-task", nav: "Task & results", title: "The Task: Path Recovery, Judged on Time and Memory",
    subtitle: "What the agent writes, the 60 workloads, and what the agents did",
    abstract: "The task removes the body of obtainAlignmentHirschberg. A pass must recover a valid optimal path faster than the reference, with no more memory, on all 60 workloads; reconstruction time is a difference of two minima and is noisy. One of sixteen models passed.",
    tags: ["path recovery", "pass rule", "noisy timing", "FDI 74.5"],
    hero: "code:timing", heroCaption: "Our model of the task's timing rule",
    sections: [
      { id: "writes", title: "What the agent writes", html: `
        <p>The task keeps all of Edlib except the body of one function, <code>obtainAlignment&shy;Hirschberg</code>. The agent gets the query, the target interval, their reversed copies and the exact distance, and must return an optimal path as an array of operation bytes, allocated as the library expects. Any optimal path is accepted. The function may use local helpers and its own data structures, but nothing outside its body may change, and it may not touch files, the clock, other processes or threads.</p>` },
      { id: "judged", title: "How it is judged", html: `
        <p>There are 60 workloads: cores of 10,000 and 30,000 bases, similarities 60%, 70%, 80%, 90% and 99%, and the three modes, once with public seeds and once with held-out seeds. Every output is checked: the exact distance, the exact locations and a valid path of that cost, as in <code>path_cost</code>. A wrong answer anywhere scores zero.</p>
        <p><b>Reconstruction time.</b> Each implementation runs every workload fifteen times with the path and fifteen times with locations only, each in a fresh process, measured from outside. The locations-only run does the same work except the path, so the reconstruction time is the fastest path run minus the fastest locations-only run, which leaves recovering the path and printing it. That difference is small and noisy. Here is our model of it, with a 6 ms process and random delays of up to 0.5 ms (our numbers):</p>
        ${code("timing")}
        ${demo("timing", "Demo 5 · A small, noisy difference", "move the sliders")}
        <p>A difference that is not positive is not a reconstruction time and fails the workload. The human reference, measured afresh in every run, averaged 0.86 ms, so the noise is not small next to it.</p>
        <p><b>Memory.</b> The peak storage of the reconstruction call, counted in heap, stack and writable static data, must be no greater than the reference's on every workload. Moving memory from the heap to the stack does not help: all three are counted.</p>` },
      { id: "score", title: "The pass rule and the score", html: `
        <p><b>Pass rule.</b> To pass, a run must be strictly faster than the reference and use no more memory on <b>every</b> one of the 60 workloads. The <b>score</b> is separate. It is the mean over workloads of <code>100 × A / (A + T)</code>, where <code>T</code> is the median time of a whole path run and <code>A</code> is a constant: <code>(length / 100,000)²</code> seconds, 0.01 s for 10,000 bases and 0.09 s for 30,000.</p>
        ${code("score")}
        <p><code>T</code> is the whole process: reading the input, finding the distance and locations, and recovering and printing the path. The agent can change only the last part. Take a run that needs 10 ms for 10,000 bases and 25 ms for 30,000 (our numbers): it scores 64.1, near the reference's 65.5. Half a millisecond more on its 10 ms runs moves their term from 50.0 to 48.8. So the scores of good runs sit close together.</p>` },
      { id: "results", title: "What the agents did", html: `
        <p>One of sixteen models passed; three scored above the human reference (65.5). FDI 74.5 (the task difficulty index; see L00) puts the task 13th hardest of 48.</p>
        <div class="bi-scroll"><table><tr><th>Run</th><th>Peak memory (KiB)</th><th>CPU time (ms)</th><th>Memory won</th><th>Time won</th><th>Score</th><th></th></tr>
        <tr><td>Human reference</td><td>80</td><td>0.86</td><td></td><td></td><td>65.5</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>22.7</td><td>0.509</td><td>60 of 60</td><td>60 of 60</td><td>66.9</td><td>${pass}</td></tr>
        <tr><td>GPT-6 Astra</td><td>39.4</td><td>0.406</td><td>60 of 60</td><td>59 of 60</td><td>66.8</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>45.8</td><td>0.455</td><td>58 of 60</td><td>59 of 60</td><td>65.9</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>174</td><td>1.41</td><td>0 of 60</td><td>10 of 60</td><td>65.3</td><td>${fail}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>31.5</td><td>1.4</td><td>60 of 60</td><td>11 of 60</td><td>65.3</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Terra</td><td>41.7</td><td>−0.369</td><td>60 of 60</td><td>39 of 60</td><td>59.3</td><td>${fail}</td></tr></table></div>
        <p class="meta">Means over the 60 final workloads (30 public, 30 held out), as of October 26, 2026. "CPU time" is the reconstruction time defined above. <a href="${TASK}${SLUG}" target="_blank" rel="noopener">Full table ↗</a></p>
        <p><b>Gemini 4 Argon · Antigravity</b> passed, with under a third of the reference's memory. <b>GPT-6 Astra</b> had the fastest positive mean reconstruction time but was slower than the reference on one workload, and failed. <b>GPT-6.1 Terra</b>'s mean reconstruction time is below zero: on many workloads its path runs were faster than its locations-only runs. In other runs, the reference's own mean came out as −0.021, 0.172 and 0.457 ms instead of about 0.86. That is the noise of the previous section.</p>` },
      { id: "solution", title: "Claude Opus 5.5's solution", html: `
        <p>The task page describes the solution of <b>Claude Opus 5.5</b>, which did not pass (score 65.3). It has five parts:</p>
        <ol><li><em>A banded pass with checkpoints.</em> Since the distance is known, one forward pass covers only the band a path of that cost can reach. It runs Myers's algorithm on blocks of 64 rows and saves its state at sparse checkpoint columns.</li>
        <li><em>Strips traced right to left.</em> From the end cell, it resolves the strips between checkpoints from right to left. A narrow strip is recomputed from its checkpoint with full storage, within a small memory budget, and traced back directly, skipping runs of matches along the diagonal.</li>
        <li><em>Splitting wide strips.</em> For a wide strip, a short backward pass from the exit cell meets the checkpoint column; the row where forward and backward costs add up to the known cost is where an optimal path enters, and the part between is solved recursively, as in Hirschberg's method.</li>
        <li><em>A shortcut for similar pairs,</em> below.</li>
        <li><em>Columns in parallel.</em> The bit-parallel kernel runs as a skewed wavefront over several neighbouring columns at once, so their carry chains share AVX-512 or AVX2 vector registers.</li></ol>
        <p>Its peak memory, 174 KiB on average, was above the reference's 80 KiB on all 60 workloads, so it could not pass however fast it was. Our reading: checkpoints and strips stored in full buy speed with memory, and this metric allows no tolerance.</p>` },
      { id: "diagonal", title: "A shortcut for similar pairs", html: `
        <p>When the distance <code>d</code> is small next to the length, there is a faster way than the band, the <b>diagonal transition</b> method (Ukkonen 1985, Myers 1986). For each cost 0, 1, 2, …, keep how far each diagonal can be reached; from there, slide along the diagonal while the letters match, for free. Only <code>d + 1</code> rounds of at most <code>2d + 1</code> diagonals are needed, plus the slides.</p>
        ${code("diagonal")}
        <p>At 99% similarity it takes 1,384 steps where the band took 64,008 cells. Its work grows with the square of the distance, so the gain shrinks fast: at 60% it takes 169,358 steps, while Myers's algorithm covers the band for the known distance, 322,780 cells, as about 5,000 words of 64 cells, each a dozen bit operations (our rough comparison). Claude Opus 5.5 switches to this method when the cost is small next to the length, and traces back from the end cell.</p>
        ${callout("pitfall", "FAST ON AVERAGE IS NOT A PASS", "<p>GPT-6 Astra had the fastest positive mean reconstruction time, 0.406 ms, and lost one workload of 60. GPT-6.1 Sol lost one on time and two on memory. Claude Opus 5.5, Gemini 4 Argon · Pi and Muse Wonder 1.0 scored 65.3, near the reference's 65.5, but won on time on only 10, 11 and 7 workloads.</p>")}` },
    ],
    takeaways: ["The agent writes obtainAlignmentHirschberg.", "Faster and no more memory, on all 60 workloads.", "1 of 16 passed: Gemini 4 Argon · Antigravity, 66.9."],
  },
  {
    slug: "5-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>Edit distance</h3><ul><li>Table of prefix distances</li><li>Trace back for the path, CIGAR</li><li>NW, SHW, HW: which ends are free</li></ul></div>
        <div class="card"><h3>Myers and the band</h3><ul><li>Deltas in two bit vectors</li><li>64 cells per word, blocks of 64 rows</li><li>Band of cost k; double k from 64</li></ul></div>
        <div class="card"><h3>Hirschberg</h3><ul><li>Forward top + backward bottom</li><li>Smallest sum marks the crossing</li><li>Two rows; about twice the time</li></ul></div>
        <div class="card"><h3>The task</h3><ul><li>Write obtainAlignment&shy;Hirschberg</li><li>Faster, no more memory, all 60 workloads</li><li>1 of 16 passed; best 66.9</li></ul></div></div>
        ${callout("pattern", "THREE LESSONS FROM THE BIOINFORMATICS TASK", `<ol><li><em>Speed comes from structure, not from skipping work.</em> Myers's algorithm does 64 cells per word, the band skips cells no cheap path can reach, and diagonal transition skips runs of matches. Every answer stays exact.</li>
        <li><em>Memory and time trade against each other.</em> Hirschberg's method gets a path with two rows of memory for about twice the time; storing more (checkpoints, strips) is faster but costs memory, and here memory is judged with zero tolerance.</li>
        <li><em>A small, noisy measurement must win everywhere.</em> Reconstruction takes under a millisecond, the time is a difference of two minima, and a pass needs a strict win on all 60 workloads.</li></ol>`)}` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★ (by hand)</h3>
        <p>Fill the table for <code>GATTACA</code> and <code>GCATGCA</code> by hand, then check it with <code>edit_table</code>. Find two different optimal paths. (Demo 1 shows one.)</p>
        <h3>Exercise 2 ★ (by hand)</h3>
        <p>Run <code>myers</code> with <code>trace=True</code> on <code>GATTACA</code> and <code>GCATGCA</code>, and rebuild the last column of your table from its deltas.</p>
        <h3>Exercise 3 ★★ (experiment)</h3>
        <p>Change <code>doubling</code> to start at <code>k = 16</code>. How many cells does each pair need now?</p>
        <details class="reveal"><summary>Solution</summary><p>For the 99% pair (distance 17), k = 16 fails and k = 32 holds the answer: 49,704 cells instead of 64,008. For the 60% pair, the extra tries at 16 and 32 add 49,548 cells: 924,084 instead of 874,536. Starting small helps only similar pairs.</p></details>
        <h3>Exercise 4 ★★ (modify)</h3>
        <p>Change <code>hirschberg</code> to trace a piece back directly when its table has at most 4,096 cells. How many cells does it compute for the 60% pair, and what is the largest table it keeps?</p>
        <details class="reveal"><summary>Solution</summary><p>1,931,909 cells instead of 1,991,045, and its largest piece has 4,032 cells, still a valid path of cost 355. The saving in time is small; the largest table now sets the memory, which is the trade the task's budget is about.</p></details>
        <h3>Exercise 5 ★ (by hand)</h3>
        <p>A run's reconstruction takes 0.3 ms less than the reference's and uses 1 KiB more memory on one workload. Does it pass? What happens to its score?</p>
        <details class="reveal"><summary>Solution</summary><p>It fails: memory must be no greater than the reference's on every workload, with no tolerance. Its score goes up a little, since the score counts only the whole path-run time; 0.3 ms less on a 10 ms run of 10,000 bases moves that term from 50.0 to 50.8.</p></details>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li>M. Šošić, M. Šikić. <em>Edlib: a C/C++ library for fast, exact sequence alignment using edit distance.</em> Bioinformatics 2017. <a href="https://doi.org/10.1093/bioinformatics/btw753" target="_blank" rel="noopener">doi 10.1093/bioinformatics/btw753</a></li>
        <li>G. Myers. <em>A fast bit-vector algorithm for approximate string matching based on dynamic programming.</em> Journal of the ACM 1999.</li>
        <li>D. S. Hirschberg. <em>A linear space algorithm for computing maximal common subsequences.</em> Communications of the ACM 1975.</li>
        <li>E. Ukkonen. <em>Algorithms for approximate string matching.</em> Information and Control 1985.</li>
        <li>E. W. Myers. <em>An O(ND) difference algorithm and its variations.</em> Algorithmica 1986.</li>
        <li>The library: <a href="https://github.com/Martinsos/edlib" target="_blank" rel="noopener">Martinsos/edlib</a></li>
        <li>Task page: <a href="${TASK}${SLUG}" target="_blank" rel="noopener">Edlib</a></li></ul>` },
    ],
    takeaways: ["Speed comes from structure.", "Memory and time trade against each other.", "A noisy measurement must win everywhere."],
  },
];

const QUIZ = [
  { q: "In the edit table, cell D[3][5] is 2. What does that number mean?",
    opts: ["The first 3 query letters and the first 5 target letters are 2 edits apart", "The 3rd and 5th letters differ by 2", "Two paths reach the cell", "The band is 2 wide there"],
    a: 0, why: "D[i][j] is the edit distance between the prefixes q[:i] and t[:j]." },
  { q: "In HW (infix) mode, what changes in the table?",
    opts: ["The first column is all zeros", "Mismatches cost two", "The first row is all zeros, and the answer is the smallest value of the last row", "Nothing; only the output format"],
    a: 2, why: "A free target start makes the first row zero; a free target end lets the alignment end at any column of the last row." },
  { q: "Myers's algorithm keeps two bit vectors per column. What do they hold?",
    opts: ["The query and the target", "Matches and mismatches", "The band's edges", "The rows where the value goes up by 1 and the rows where it goes down by 1"],
    a: 3, why: "pv marks +1 deltas and mv marks −1 deltas; the rest are 0. One word covers 64 rows." },
  { q: "In Hirschberg's method, the top half forward gives 2 1 0 1 2 and the bottom half backward gives 3 2 1 1 2 on the middle row. Where does an optimal path cross?",
    opts: ["Column 0", "Column 2, where the sum 1 is smallest", "Column 4", "It cannot be told without the full table"],
    a: 1, why: "The sums are 5 3 1 2 4. The smallest, 1, is the distance, and it is at column 2." },
  { q: "GPT-6 Astra had the fastest positive mean reconstruction time (0.406 ms) and used half the reference's memory. Why did it fail?",
    opts: ["Its paths were wrong", "Its score was below 65.5", "It was not faster than the reference on 1 of the 60 workloads", "It used too much stack"],
    a: 2, why: "A pass needs a strict win on time and no more memory on every workload. One slower workload is enough to fail." },
];
