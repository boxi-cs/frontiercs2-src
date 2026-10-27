// L11 content, adapted from frontiercs2/notes/L11-cryptography.md (checked by tools/check.py).

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
  number: 11,
  title: "Cryptography",
  tagline: "A hard secret, a noisy computation and a private lookup",
  lead: "The three Cryptography tasks of FrontierCS 2: recovering learning-with-errors secrets, predicting the precision of encrypted computation, and reading a database privately with fewer bytes. For each one: the idea, the part the task removed, how a run is judged, and what the agents did.",
  heroDemo: "pirAuto",
  heroLabel: "QuarterPIR · reading one entry privately",
  heroCaption: "Swap the wanted entry for a spare, ask for the parity, XOR twice.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the Cryptography tasks teach",
  why: [
    ["The bar can be absolute", "Structured LWE asks for <b>all 200 secrets</b>. The best run solved 84%, and nobody passed."],
    ["Right and fast", "CKKS Noise passes only if the predictions are <b>as accurate as the reference's</b> on every setting and the estimator runs <b>faster</b>."],
    ["Redesign the message", "In QuarterPIR, the biggest byte cut came from <b>two checksums</b>, an idea from RAID-6 disk arrays."],
  ],
  ctaTitle: "Ready to find a secret by brute force?",
  minutes: "About 60 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-lwe", nav: "Structured LWE", title: "Structured LWE: Find the Secret",
    subtitle: "The hard problem beneath post-quantum cryptography, and its shortcuts",
    abstract: "Given A and b = As + e mod q, find the small secret s. Structure such as a sparse secret opens shortcuts. The task has 200 instances in ten families, and a pass means solving every one; nobody did.",
    tags: ["learning with errors", "sparse secret", "lattice reduction", "FDI 97.4"],
    hero: "code:valid", heroCaption: "The task's acceptance check, in small",
    sections: [
      { id: "idea", title: "Learning with errors", html: `
        <p><b>Learning with errors</b> (LWE) is the hard problem beneath much post-quantum cryptography. Given a public matrix <code>A</code> and a vector <code>b = A s + e (mod q)</code>, find the secret <code>s</code>. Both <code>s</code> and the error <code>e</code> are small. Without the error, Gaussian elimination would find <code>s</code> at once; the error is what makes it hard. Extra <b>structure</b>, such as a sparse matrix or a secret with few nonzero entries, can open shortcuts. <em>A Systematic Study of Sparse LWE</em> (CRYPTO 2024) studies these structured variants.</p>` },
      { id: "instance", title: "A small instance", html: `
        <p>Our instance has <code>n = 12</code> unknowns, <code>m = 20</code> equations and modulus <code>q = 97</code>. The secret is ternary (−1, 0 or 1) with exactly two nonzero entries, and each error is −1, 0 or 1. A small generator, exact in JavaScript too, makes everything reproducible.</p>
        ${code("lwe")}
        <p>The task checks a candidate exactly the way its public rules say: the right length, entries from the allowed alphabet, the right number of nonzeros, and a small residual <code>b − A s</code> in every row, after centering mod <code>q</code>. Any secret that passes counts, not only the one that was planted.</p>
        ${code("valid")}` },
      { id: "search", title: "The shortcut of a sparse secret", html: `
        <p>With two nonzero entries, there are only C(12, 2) × 2² = 264 candidates. We can try them all.</p>
        ${code("search")}
        ${demo("lwe", "Demo 1 · Guess the secret", "click entries", "The residual bars are the 20 rows of b − As. Green bars are within ±1.")}
        <p>A dense ternary secret of the same length would have 3<sup>12</sup> = 531,441 candidates. At realistic sizes neither search is possible, but sparsity still shrinks the space enormously:</p>
        ${code("space")}
        <p>Real attacks combine <b>lattice reduction</b>, which turns <code>b = A s + e</code> into a short-vector problem, with combinatorial guessing of the sparse part. The sizes <code>n = 256</code> and the weights here are our examples.</p>` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>Here there is no solver to restore. The agent writes its own attacks and submits one secret per instance. There are 200 public instances in ten families of matrix and secret structure: dense or sparse matrices, with binary, ternary, small or unrestricted mod-<code>q</code> secrets. Each submitted secret is checked directly against the published rules. The score is the share of instances solved; a pass means solving all 200.</p>
        <table><tr><th>Run</th><th>Instances solved</th><th>Final score</th><th></th></tr>
        <tr><td>GPT-6 Astra</td><td>84%</td><td>84.0</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Terra</td><td>84%</td><td>84.0</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>80.5%</td><td>80.5</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>72% (144 of 200)</td><td>72.0</td><td>${fail}</td></tr></table>
        <p class="meta">As of October 26, 2026. No model passed. <a href="${TASK}structured-lwe" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Claude Opus 5.5 solved all 20 in six families and the first six in each of the other four. With an FDI of 97.4, Structured LWE is the second-hardest task of the benchmark.</p>
        ${callout("pitfall", "SOME FAMILIES ARE HARD BY DESIGN", "<p>LWE with a uniform secret and no extra structure is believed to be hard even for quantum computers. A family that is solvable at its size still needs the right attack, and an agent has five hours.</p>")}` },
    ],
    takeaways: ["b = As + e mod q; find a valid s.", "Sparsity shrinks the search.", "Pass = all 200; best run 84%."],
  },
  {
    slug: "2-ckks", nav: "CKKS Noise", title: "CKKS Noise: Predicting Precision",
    subtitle: "How many correct bits survive an encrypted computation?",
    abstract: "CKKS computes on encrypted vectors, approximately: every operation adds noise. The paper's estimator replays the computation in the clear with modeled noise. The task removes seven of its kernels; a pass must be as accurate as the reference everywhere and faster.",
    tags: ["homomorphic encryption", "precision in bits", "rescaling", "noise estimator"],
    hero: "ckksMini", heroCaption: "0 to 5 squarings: each one costs about a bit.",
    sections: [
      { id: "idea", title: "Approximate encrypted computation", html: `
        <p><b>Homomorphic encryption</b> lets a server compute on encrypted data. <b>CKKS</b> computes on encrypted vectors of real or complex numbers, thousands of <em>slots</em> at once, and its results are approximate: every operation adds a little noise. How many correct bits survive a long computation? The paper <em>Accurate and Composable Noise Estimates for CKKS</em> (IACR CiC 2025) answers with an <b>estimator</b> that replays the computation on clear values, adding modeled noise at each step, instead of running it encrypted.</p>` },
      { id: "bits", title: "Precision in bits", html: `
        <p>A slot's <b>precision</b> is <code>−log2 |error|</code>: an error of 2<sup>−16</sup> means 16 correct bits after the point. The task asks for the mean and the spread (standard deviation) of the precision over all slots.</p>
        <p>Our toy works like a fixed-point CKKS. A value <code>x</code> is stored as <code>x × Δ</code> plus a little Gaussian noise (standard deviation 3.2, a usual choice); squaring multiplies two noisy values, divides by <code>Δ</code> (<b>rescaling</b>) and adds rounding and key-switching noise.</p>
        ${code("ckks")}
        ${predict("Squaring doubles the relative error. How many bits of precision should each squaring cost?", "<p>One: doubling an error removes one bit. The table shows 19.3 → 18.2 → 17.3 → 16.3 bits.</p>")}
        ${demo("ckks", "Demo 2 · Precision after squarings", "move the slider")}
        <p>In the toy, "actual" and "estimator" run the same model with different noise samples; in the task, "actual" is a real encrypted Lattigo run, and the estimator must get within a few hundredths of a bit of it.</p>` },
      { id: "judged", title: "What the agent writes, and how it is judged", html: `
        <p>The task removes seven of the estimator's kernels: the noise of multiplication, summed products, relinearization, rescaling, division with rounding, and two key-switching methods. The agent writes them and may redesign how the estimator represents a noisy value.</p>
        <p>Each submission predicts nine encrypted computations, from one product to bootstrapping, under 29 settings. Real encrypted runs give the true mean and spread of precision. To pass, on every setting it must predict both as well as the human reference, within a band for run-to-run variation, and its estimator must run <b>faster</b>. The score depends only on accuracy:</p>
        ${code("score")}
        <p>With the reference's mean errors on the leaderboard (0.0389 and 0.0435 bits), the formula gives its score of 96.0. Small errors leave little room: the best run scored 97.1.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <table><tr><th>Run</th><th>Mean error (bits)</th><th>Spread error (bits)</th><th>Estimator time (ms)</th><th>Score</th><th></th></tr>
        <tr><td>Human reference</td><td>0.0389</td><td>0.0435</td><td>486</td><td>96.0</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>0.0285</td><td>0.0322</td><td>102</td><td>97.1</td><td>${pass}</td></tr>
        <tr><td>Kimi K3.1 Pro</td><td>0.0296</td><td>0.0452</td><td>60.9</td><td>96.4</td><td>${pass}</td></tr>
        <tr><td>DeepSeek V4.1 Flash 1017</td><td>0.0538</td><td>0.034</td><td>413</td><td>95.8</td><td>${fail}</td></tr></table>
        <p class="meta">Means over the hidden settings, as of October 26, 2026. Eleven of sixteen passed. <a href="${TASK}ckks-noise" target="_blank" rel="noopener">Full table ↗</a></p>
        <p><b>Claude Opus 5.5</b> kept each noisy value in ordinary double precision instead of arbitrary precision, split the noise into terms attached to 1, <code>s</code> and <code>s²</code> as in a real ciphertext, and skipped key-switching digits too small to matter. Its own idea was to carry <b>16 noise replicas</b>, each with its own sampled secret key, and keep the one whose statistics lie closest to the average of all 16, so that one unlucky sample does not skew the prediction.</p>
        ${code("replicas")}
        <p>A single replica can miss by a quarter of a bit; the one nearest the average misses by 0.06.</p>` },
    ],
    takeaways: ["Precision = −log2 |error|.", "Each squaring costs about a bit.", "Accurate on every setting, and faster."],
  },
  {
    slug: "3-pir", nav: "QuarterPIR", title: "QuarterPIR: A Private Lookup",
    subtitle: "Read one entry without the server learning which",
    abstract: "The client streams the database once and keeps hints: parities of one entry per row. A lookup swaps the wanted entry for a spare and asks for the parity. The task asks for fewer bytes per lookup, faster, with no more client memory.",
    tags: ["private information retrieval", "hint", "parity", "XOR"],
    hero: "pir", heroCaption: "Click an entry of the hint to read it.",
    sections: [
      { id: "idea", title: "Private information retrieval", html: `
        <p><b>Private information retrieval</b> (PIR) lets a client read one database entry without the server learning which. <b>QuarterPIR</b> (Ghoshal, Zhou and Shi, EUROCRYPT 2024) needs no public-key cryptography. The client streams the database once and keeps <b>hints</b>; each later lookup then needs one short request and reply.</p>` },
      { id: "hint", title: "A hint", html: `
        <p>Picture the database as rows of entries: 16 entries A to P in four rows of four. A hint is one entry per row, such as B, G, I and O, and the client stores only the XOR of their values, the hint's <b>parity</b>. To read G, the client asks for the parity of B, F, I and O, with G swapped for a spare entry F whose value it stored. XORing the reply with the parity leaves <code>G ⊕ F</code>, and one more XOR gives G.</p>
        ${code("pir")}
        ${demo("pir", "Demo 3 · One private lookup", "click B, G, I or O")}
        <p>The client keeps many hints, enough that every entry lies in some hint, and each hint serves one lookup. After a lookup it replaces the used hint with a <b>backup hint</b> for the same row.</p>` },
      { id: "bytes", title: "Keys, groups and the bytes", html: `
        <p>A real database has thousands of rows, so a request cannot name an entry in each. QuarterPIR puts the rows in groups (128 rows to a group at full size). A 16-byte <b>key</b> expands into one position per row of a group. A request sends one key per group, except the wanted entry's group, which goes as an explicit <b>list</b> of positions with random bytes in place of its key.</p>
        <p>The server XORs what each key picks, the <b>group parity</b> of each group; it tries the list in every group, giving one <b>candidate</b> per group; and it returns all candidates and all group parities. The client keeps the candidate of its own group. It needs the group parities to correct the error that a refreshed hint leaves, and it cannot ask for just the one it needs without revealing its last read. So every reply carries every group parity.</p>
        ${code("bytes")}
        <p>These are the reference's counts in the task statement. At full size, half the reply (512 bytes) is group parities.</p>` },
    ],
    takeaways: ["A hint: one entry per row, stored as a parity.", "Swap the wanted entry for a spare.", "Half the reference reply is group parities."],
  },
  {
    slug: "4-checksums", nav: "Two checksums", title: "QuarterPIR: Two Checksums and the Results",
    subtitle: "A RAID-6 idea cuts 27% of every lookup",
    abstract: "The server's and the client's group parities differ in exactly two known groups. A plain sum and a weighted sum then give both differences, so two checksums replace 32 parities. Privacy needs no new proof: the server sees only a public function of the authors' request.",
    tags: ["checksum", "RAID-6", "reduction", "privacy"],
    hero: "code:sums", heroCaption: "Two sums, two unknowns",
    sections: [
      { id: "sums", title: "The two checksums", html: `
        <p>The task's goal is strictly fewer bytes per lookup, while also being faster and using no more client memory. <b>Muse Wonder 1.0</b> found the biggest cut, with a trick from RAID-6 disk arrays: two checksums can rebuild two lost values. The server's group parities and the client's own parities agree in every group but two, and the client knows which two. So the server sends only a plain sum and a weighted sum of its group parities, and the client compares them with the same sums of its own. Two equations give the two differences.</p>
        <p>The real scheme adds with XOR and weights in the finite field with 2<sup>128</sup> elements; here is the same step with ordinary numbers, as in the case study.</p>
        ${code("sums")}
        ${demo("sums", "Demo 4 · Solve two differences from two sums", "edit the server row")}
        <p>Two 16-byte checksums replace 32 group parities, so at full size the reply falls from 1,024 bytes to 544 and the lookup from 1,760 bytes to 1,280: 27% fewer. The client stores one extra value per backup hint. (<a href="https://frontier-cs.org/blog/quarterpir-two-checksums/" target="_blank" rel="noopener">case study ↗</a>)</p>` },
      { id: "privacy", title: "Privacy without a proof", html: `
        <p>A new message format would normally need a new security proof. The task makes privacy checkable instead. For every lookup, the trusted harness computes the request the authors' client would send, <code>R</code>, and passes it alone to the agent's <code>ReduceRequest</code> in a separate process, with no index, no client state and no randomness. The server receives only <code>f(R)</code>. Since its view is a public function of the authors' server's view, it learns nothing more. The reply is free: the server computes it from the database and the request, so it carries no privacy content.</p>
        ${predict("Could ReduceRequest add a hint about the wanted index to make the server's job easier?", "<p>No. It sees only R, the authors' request, so anything it outputs is a function of R. It can drop or re-encode parts of R, never add information about the index.</p>")}` },
      { id: "results", title: "Results", html: `
        <table><tr><th>Run</th><th>Bytes per lookup</th><th>Client storage (MiB)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>994</td><td>41.7</td><td>27.3</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Antigravity</td><td>835</td><td>41.5</td><td>62.8</td><td>${pass}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>854</td><td>40.8</td><td>58.2</td><td>${pass}</td></tr>
        <tr><td>Muse Wonder 1.0</td><td>666</td><td>25.9</td><td>58.1</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>914</td><td>40.8</td><td>55.3</td><td>${pass}</td></tr>
        <tr><td>Kimi K3</td><td>418</td><td>291</td><td>54.7</td><td>${fail}</td></tr></table>
        <p class="meta">Means over the two database sizes, from the task page, as of October 26, 2026 (the reference's 994 is the mean of 228 and 1,760). Eleven of sixteen passed. <a href="${TASK}quarterpir" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>Gemini 4 Argon · Antigravity had the best final score, mostly from speed. Muse Wonder 1.0 cut the most bytes and was also much faster: at 67 million entries, server time per lookup fell from 856 µs to 100 µs and client setup from 122.2 s to 18.7 s. Claude Opus 5.5 instead dropped some keys from the request and stored the parities those keys would give, as client memory allowed.</p>
        ${callout("pitfall", "EVERY METRIC COUNTS, MEMORY TOO", "<p>Kimi K3 sent only 736 bytes per lookup at 67 million entries, the fewest of any run, but kept 606.8 MB on the client against the reference's 85.3 MB, so it failed.</p>")}` },
    ],
    takeaways: ["Two sums give two unknowns.", "1,760 → 1,280 bytes, 27% fewer.", "The server sees only f(R)."],
  },
  {
    slug: "5-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>Structured LWE</h3><ul><li>b = As + e mod q</li><li>Sparse secrets shrink the search</li><li>Pass = all 200; nobody did</li></ul></div>
        <div class="card"><h3>CKKS Noise</h3><ul><li>Precision = −log2 |error|</li><li>Replay in the clear with modeled noise</li><li>As accurate, and faster</li></ul></div>
        <div class="card"><h3>QuarterPIR</h3><ul><li>Hint = parity of one entry per row</li><li>Two checksums replace 32 parities</li><li>Privacy by reduction: f(R)</li></ul></div></div>` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★ (modify)</h3>
        <p>In the LWE instance, allow secrets with weight 1 to 3 instead of exactly 2. How many candidates are there now, and does the search still find only the planted secret?</p>
        <h3>Exercise 2 ★ (experiment)</h3>
        <p>Run the CKKS toy with <code>SIGMA = 6.4</code>. By how much does the precision fall, and why?</p>
        <details class="reveal"><summary>Solution</summary><p>By about one bit at every step: the starting error doubles, and each squaring doubles the relative error as before.</p></details>
        <h3>Exercise 3 ★ (by hand)</h3>
        <p>In the PIR toy, read entry O with the same hint. Which spare entry do you need? (Demo 3 shows it.)</p>
        <h3>Exercise 4 ★★ (modify)</h3>
        <p>Change <code>server</code> so that groups 1 and 3 differ from <code>client</code>, and solve for the two differences with <code>g, h = 1, 3</code>.</p>
        <h3>Exercise 5 ★★ (think)</h3>
        <p>The weighted checksum uses weights 1, 2, 3, 4. Why would weights 1, 1, 1, 1 not work?</p>
        <details class="reveal"><summary>Solution</summary><p>Then both sums are the same equation, d<sub>g</sub> + d<sub>h</sub>, and one equation cannot give two unknowns. The weights must differ in the two groups.</p></details>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li><em>A Systematic Study of Sparse LWE.</em> CRYPTO 2024. <a href="https://eprint.iacr.org/2024/1589" target="_blank" rel="noopener">IACR ePrint 2024/1589</a></li>
        <li><em>Accurate and Composable Noise Estimates for CKKS with Application to Exact HE Computation.</em> IACR CiC 2025. <a href="https://eprint.iacr.org/2024/853" target="_blank" rel="noopener">IACR ePrint 2024/853</a></li>
        <li>A. Ghoshal, M. Zhou, E. Shi. <em>Efficient Pre-processing PIR Without Public-Key Cryptography.</em> EUROCRYPT 2024. <a href="https://eprint.iacr.org/2023/1574" target="_blank" rel="noopener">IACR ePrint 2023/1574</a></li>
        <li>FrontierCS 2 case study: <a href="https://frontier-cs.org/blog/quarterpir-two-checksums/" target="_blank" rel="noopener">Two Checksums Shrink Private Lookups by 27%</a></li>
        <li>Task pages: <a href="${TASK}structured-lwe" target="_blank" rel="noopener">Structured LWE</a>, <a href="${TASK}ckks-noise" target="_blank" rel="noopener">CKKS Noise</a>, <a href="${TASK}quarterpir" target="_blank" rel="noopener">QuarterPIR</a></li></ul>` },
    ],
    takeaways: ["The bar can be absolute.", "Right and fast.", "Redesign the message."],
  },
];

const QUIZ = [
  { q: "In LWE, <code>b = A s + e (mod q)</code>. Why can't Gaussian elimination recover <code>s</code>?",
    opts: ["A is not square", "The small error e breaks the exact linear equations", "q is prime", "s is too long"],
    a: 1, why: "Without e, elimination solves it at once. The error is what makes LWE hard." },
  { q: "Our toy secret has 12 entries, two of them nonzero (±1). How many candidates does brute force try?",
    opts: ["24", "132", "264", "531,441"],
    a: 2, why: "C(12, 2) = 66 position pairs × 4 sign choices = 264. 531,441 = 3<sup>12</sup> is the dense ternary count." },
  { q: "A CKKS slot's error is 2<sup>−18</sup>. What is its precision?",
    opts: ["−18 bits", "18 bits", "2<sup>18</sup> bits", "0.18 bits"],
    a: 1, why: "Precision is −log2 |error| = 18 bits." },
  { q: "What must a CKKS Noise submission do to pass?",
    opts: ["Score above 96.0", "Predict mean and spread as well as the reference on every setting, and run faster", "Run faster on average", "Match the reference's code"],
    a: 1, why: "Accuracy on every setting and both statistics, and a faster estimator. Score alone does not decide a pass." },
  { q: "Why does the QuarterPIR server learn nothing new from a redesigned request?",
    opts: ["The request is encrypted", "It receives only f(R), a public function of the authors' request, computed without the index", "The server deletes requests", "The client lies about the index"],
    a: 1, why: "The harness passes only R to ReduceRequest; the server's view is a function of the authors' server's view." },
];
