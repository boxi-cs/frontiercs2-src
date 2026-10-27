// L07 content, adapted from frontiercs2/notes/L07-machine-learning.md (checked by tools/check.py).

const demo = (name, title, instr, hint = "") =>
  `<div class="card demo" data-demo="${name}"><div class="head"><span class="title">${title}</span><span>${instr}</span></div>
   <div class="demo-body"></div>${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const callout = (kind, label, body) => `<div class="callout ${kind}"><b>${label}</b>${body}</div>`;
const predict = (q, a) => callout("predict", "PREDICT", `<p>${q}</p><details class="reveal"><summary>Show the answer</summary>${a}</details>`);
const out = (name) => codeBlock(OUT[name], "out");
const code = (name) => codeBlock(CODE[name]) + (OUT[name] ? out(name) : "");
const video = (k, title, about) => ({ id: "video", title: `Watch: ${title}`, html: `
        <p>${about}</p>
        <div class="card video" data-video="media/L07-${k}.mp4"></div>` });
const pass = '<span class="chip pass">Pass</span>', fail = '<span class="chip fail">Fail</span>';
const TASK = "https://frontier-cs.org/task/#";
const full = (slug) => `<a href="${TASK}${slug}" target="_blank" rel="noopener">Full table ↗</a>`;

const LECTURE = {
  number: 7,
  title: "Machine Learning",
  tagline: "A smaller cache, cleaner batches and a few good polynomials",
  lead: "The nine Machine Learning tasks of FrontierCS 2: compacting a KV cache, building reinforcement-learning batches, losses over whole populations, sampling a world model, a robust tokenizer, a learned tanh and the matrix polar factor. For each one: the idea, the part the task removed, how a run is judged, and what the agents did.",
  heroDemo: "kvAuto",
  heroLabel: "KV Compaction · one attention head",
  heroCaption: "Keep 6 of 48 keys: chosen at random, by attention, then with fitted biases and values.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the Machine Learning tasks teach",
  why: [
    ["Every workload decides", "Claude Opus 5.5's KV Compaction run was <b>108 times faster</b> than the reference, with higher mean accuracy, and failed on 2 articles of 24."],
    ["Fit the method to the measurement", "Short runs left <b>speed</b> to decide most scores in DeTok and DyT; averaging sixteen samples suited the world model's PSNR and SSIM."],
    ["Training data must be exactly right", "Masks, rewards, replayed log-probabilities and queue gradients <b>fail silently</b> when they are wrong."],
  ],
  ctaTitle: "Ready to compact one attention head?",
  minutes: "About 85 minutes",
  subtitles: ["en"],
  videos: {
    "media/L07-1.mp4": "Part 1 of 4 · KV Compaction: the hardest task · 3 min · narrated by Boxi Yu",
    "media/L07-2.mp4": "Part 2 of 4 · RAGEN and Flow-OPD: building the batches · 3 min · narrated by Boxi Yu",
    "media/L07-3.mp4": "Part 3 of 4 · Populations and a world model: Fréchet loss, LeJEPA, NanoWM · 3 min · narrated by Boxi Yu",
    "media/L07-4.mp4": "Part 4 of 4 · Short runs and an easy task: DeTok, DyT, Polar Express · 3 min · narrated by Boxi Yu",
  },
};

const CHAPTERS = [
  {
    slug: "1-kv-compaction", nav: "KV Compaction", title: "KV Compaction: Attention Matching",
    subtitle: "Keep a few keys, give them biases, fit their values",
    abstract: "A language model keeps a key and a value for every token it has read. Attention Matching shrinks this cache one head at a time: it keeps a few keys, gives each a bias so they draw the attention the dropped keys drew, and fits new values by least squares.",
    tags: ["KV cache", "attention mass", "nonnegative least squares", "least squares"],
    hero: "code:kvhead", heroCaption: "One head: template keys, 48 article keys, sample and test queries",
    sections: [
      video(1, "KV Compaction: the hardest task", "Part 1 of 4 of this lecture's video: kV Compaction: the hardest task."),
      { id: "idea", title: "The cache grows with the document", html: `
        <p>A language model that reads a long document keeps a <b>KV cache</b>: for every token, in every layer and head, a key and a value. Later tokens attend to these keys. The cache grows with the document. <b>Attention Matching</b> (<em>Fast KV Compaction via Attention Matching</em>, ICML 2026) shrinks it one head at a time. It keeps a few keys, gives each kept key a bias so that together they draw the attention the dropped keys drew, and fits new values by least squares so that attention returns the same output for a set of sample queries. It needs no training, and it runs in seconds.</p>` },
      { id: "toy", title: "One head, three steps", html: `
        <p>Our head has 4 template keys, which always stay, and 48 article keys, each with a value. Queries come from one focus direction plus noise: 64 sample queries to fit with and 32 test queries to check on. A query <code>q</code> gives key <code>k</code> the weight <code>e^{q·k/√d + b}</code>, where <code>b</code> is the key's bias (0 in a full cache), and the output is the weighted average of the values. We measure a small cache by the mean gap between its output and the full cache's, on the test queries.</p>
        <p>The task's starting point keeps a random subset of article keys per head. The first step of Attention Matching keeps the keys that draw the most attention from any sample query.</p>
        ${code("kvhead")}
        <p>Choosing keys by attention about halves the gap, or better, at every size. But the kept keys draw less weight than the 48 keys did, so the template keys get too large a share. And each kept value stands for itself only, not for the keys dropped near it.</p>
        ${predict("Keeping 6 of 48 keys by attention leaves a gap of 0.28. Which do you expect to help more: fitting a bias per kept key, or fitting new values?", "<p>Both help; the values help more. With biases the gap falls to 0.22, and with biases and fitted values to 0.14.</p>")}
        <p>The second and third steps fix both. The <b>bias</b> <code>β_j = log w_j</code> scales key <code>j</code>'s weight. The weights <code>w_j ≥ 0</code> are fitted so that, for every sample query, the kept keys' weights add up to the whole article's (nonnegative least squares, here by multiplicative updates). Then the <b>values</b> are fitted by least squares: with the biased weights, the kept keys' output should match the whole article's output, for every sample query. A small ridge (our choice) pulls them toward the original values.</p>
        ${code("kvfit")}
        ${demo("kv", "Demo 1 · Compact one head", "move the slider, pick a method")}
        <p>Each step helps on queries it was not fitted to. At 6 of 48 keys, the gap falls from 0.96 (random) to 0.28 (chosen keys) to 0.14 (with biases and fitted values). The sample queries matter: the fit is only as good as the questions it was fitted on.</p>` },
      { id: "writes", title: "What the agent writes", html: `
        <p>Everything under <code>compaction/</code> is the agent's. The evaluator calls <code>compact(state, request)</code> once per article, after its own prefill. The request holds the prompt (chat template plus article), the article's token range and the full cache: 36 layers, each with keys and values of shape (1, 8 heads, S tokens, 128) in bf16. The method returns, per layer, smaller keys and values and an optional <code>attention_bias</code> per kept key. All heads of a layer keep the same number of tokens <code>t</code>, but <code>t</code> may differ between layers. A literal <code>TARGET_SIZE</code> in (0, 0.1] sets the budget: every template token plus that fraction of the article. The model, its decoding and the questions stay fixed, and the method never sees the questions.</p>` },
    ],
    takeaways: ["Keep the keys that draw attention.", "Fit biases so the kept keys draw the whole mass.", "Fit values so the output matches."],
  },
  {
    slug: "2-kv-results", nav: "Hardest task", title: "KV Compaction: The Hardest Task",
    subtitle: "108 times faster than the reference, and still a fail",
    abstract: "KV Compaction has the highest FDI (FrontierCS's difficulty index; see L00) of the 48 tasks, 103.0. Qwen3-4B answers multiple-choice questions on long stories from the compacted cache. Every run that finished was far faster and smaller than the reference; none kept its accuracy on every article.",
    tags: ["QuALITY", "Qwen3-4B", "time mode", "FDI 103.0"],
    hero: "code:kvscore", heroCaption: "The statement's score for one article",
    sections: [
      { id: "judged", title: "How it is judged", html: `
        <p>The workload is QuALITY: long Project Gutenberg stories, each with 13 to 20 multiple-choice questions. The model is Qwen3-4B on one H100. Each article is compacted once, and every question is answered from the compacted cache alone, with thinking on and up to 2,048 new tokens. Final grading uses 24 articles: the 12 public ones and 12 hidden ones.</p>
        <p>Three measurements per article: <b>qa_correct</b>, the questions answered correctly (in final, the lowest of three repetitions); <b>compaction_seconds</b>, the median of three wall times from handing over the article to receiving the result; and <b>compact_cache_bytes</b>, the bytes returned.</p>
        <p>To pass, every article must keep its correct count within <code>max(1, ceil(5% of its questions))</code> of the reference's median, and improve one axis. At <code>TARGET_SIZE = 0.1</code> (time mode) the compaction must be strictly faster than the reference with no more bytes. Below 0.1 (bytes mode) it must use strictly fewer bytes and be no slower. The statement's continuous score per article is <code>100 · ln S / (ln 10 + ln S)</code>, where <code>S</code> is the improvement on the chosen axis, and 0 when the article fails:</p>
        ${code("kvscore")}
        <p>A tenfold gain scores 50, and the score never reaches 100. The third line uses Claude Opus 5.5's compaction time against the reference's in its run, 505 ms against 54,700 ms. The leaderboard's final score is the benchmark's own 0–100 measure, on which the human reference scores 60.6.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <table><tr><th>Run</th><th>Cache (MiB)</th><th>Compaction (ms)</th><th>Correct per article</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>312</td><td>55,800</td><td>12.9</td><td>60.6</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>268</td><td>505</td><td>13.2</td><td>68.2</td><td>${fail}</td></tr>
        <tr><td>Muse Wonder 1.0</td><td>92.7</td><td>386</td><td>12.3</td><td>63.7</td><td>${fail}</td></tr>
        <tr><td>DeepSeek V4.1 Flash 1017</td><td>272</td><td>637</td><td>12</td><td>62.0</td><td>${fail}</td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>92.9</td><td>738</td><td>12.1</td><td>61.9</td><td>${fail}</td></tr></table>
        <p class="meta">Means over the 24 graded articles, as of October 26, 2026. Selected rows; the full table is on the task page. Four of 16 models scored above the human reference; none passed. ${full("kv-compaction")}</p>
        <p>Every run with results beat the reference on time and size on all 24 articles. Accuracy decided everything: <b>Claude Opus 5.5</b> answered more questions than the reference on average, 13.2 against 12.9, and still fell short on 2 of the 24 articles. Muse Wonder 1.0 kept a third of the bytes and fell short on 8.</p>
        <p>Claude Opus 5.5's run (the task page shows its patch in full) was pure key selection:</p>
        <ul><li><b>Scores from the article's own queries.</b> It records the queries of the article's tokens during the prefill, rotates them as if they sat just after the article, and scores each article key by its mean attention from them. Custom GPU kernels compute these scores without forming the full matrix.</li>
        <li><b>Spread over the article.</b> It divides each score by its local average, so the kept tokens are not all bunched in one part of the story.</li>
        <li><b>A budget per layer.</b> It gives each layer between half and twice the uniform share, by where the scores are highest, and keeps about three times the target's article tokens (its <code>budget_scale</code> is 2.95) while staying below the reference's cache size.</li></ul>
        <p>It keeps the chosen keys with their original values and no bias. The patch also contains self-study queries (generated with the vLLM engine) and the bias and value fitting of our toy, but its final settings turn them off (<code>use_ss=False</code>, and the fitting runs only with self-study queries). The best run on the hardest task chose keys well and spent the bytes on more of them.</p>
        ${callout("pitfall", "A MEAN IS NOT EVERY ARTICLE", "<p>Opus's mean accuracy beat the reference, but a pass is decided article by article. Two stories where the compacted cache fell more than one question below the reference (in the worst of three repetitions) sank a run that was 108 times faster.</p>")}` },
    ],
    takeaways: ["Keep accuracy on every article.", "Then improve time or bytes.", "Choose keys well; spend the bytes on more of them."],
  },
  {
    slug: "3-rl-batches", nav: "RAGEN · Flow-OPD", title: "Reinforcement Learning: Building the Batches",
    subtitle: "Multi-turn games into rows, and image trajectories that replay",
    abstract: "Two tasks write the part of a reinforcement-learning loop that turns what a model did into training data. RAGEN packs Sokoban games into token rows with masks and rewards. Flow-OPD samples an image model's trajectories with a log-probability that replay must reproduce.",
    tags: ["PPO", "loss mask", "group normalization", "flow matching", "on-policy distillation", "OCR"],
    hero: "code:ragen", heroCaption: "Parse, pack, place the reward, normalize in a group",
    sections: [
      video(2, "RAGEN and Flow-OPD: building the batches", "Part 2 of 4 of this lecture's video: rAGEN and Flow-OPD: building the batches."),
      { id: "ragen", title: "RAGEN: games into rows", html: `
        <p><b>RAGEN</b> (arXiv 2025) trains language models to act over many turns. The model sees a puzzle, replies with moves, gets the next view and a reward, and so on. Training needs each game packed into one token row, with a mask that marks what the model wrote (the loss is taken only there) and the reward on the right token. Four games from the same start form a group, and each game's reward is compared with its group's.</p>
        ${code("ragen")}
        <p>The reward values are ours. The solved game stands out in its group; a group whose games all failed the same way teaches nothing, so its advantages are all 0.</p>
        ${demo("ragen", "Demo 2 · A row and a group", "click the games")}` },
      { id: "ragen-judged", title: "RAGEN: writes, judged, results", html: `
        <p><b>What the agent writes.</b> The task removes the context manager: building each prompt from the real history, parsing replies, packing rows with masks, placing and normalizing rewards, and keeping each group together. The judge checks the batch's provenance exactly: every executed move must come from the model's own text for that turn, and prompts may keep all past turns or a recent suffix, but never invented or rewritten ones.</p>
        <p><b>How it is judged.</b> One PPO training step on Sokoban with Qwen2.5-0.5B-Instruct: six groups of four games, three model turns of at most 96 tokens each. The score rewards solved games <code>s</code> and average reward <code>r</code> per group:</p>
        ${code("ragenscore")}
        <p>These match the leaderboard's 11.7 and 18.5. Each of the 3 graded workloads is one such run of six groups. To pass, every group must beat the reference on <b>both</b> success rate and reward, strictly.</p>
        <p><b>What the agents did.</b> No model passed; the best final score is 18.5, shared by Claude Opus 5.5 and GPT-6.1 Sol, against the reference's 11.7. Both solved some games (success 0.0833) and beat the reference on 1 of 3 workloads. The reference solved none, so a pass needs a solved game in every group from a 0.5B model in three turns. Opus's own idea: the small model copies whatever earlier answer it sees, broken ones included, so its prompt keeps the previous turn only when that turn produced valid moves. In its own offline runs this raised well-formed later answers from about 45% to 75%, and solved games from 5.5% to 9.6%. ${full("ragen")}</p>` },
      { id: "flow", title: "Flow-OPD: a step that replays", html: `
        <p><b>Flow-OPD</b> (arXiv 2026) teaches Stable Diffusion 3.5 Medium to render the words a prompt quotes. A flow-matching model makes an image by moving noise through a chain of latent states. The student draws its own chains, and a teacher tuned for text supervises each step: <b>on-policy distillation</b>. Each step is a Gaussian: the student's velocity sets its mean, and noise sets its spread. The trainer replays every recorded step later, so the step must give the same mean and log-probability again, and the log-probability must have a gradient through the velocity.</p>
        ${code("sde")}
        <p>How much can one step teach? If the teacher's velocity differs from the student's by 1, the two step Gaussians differ by a KL divergence that we can compute per step. Near pure noise the spread is wide, so a step says little about the velocity:</p>
        ${code("signal")}
        ${demo("signal", "Demo 3 · Signal per step", "move the cap")}
        <p>In our schedule the first step carries about 130 times less signal than the last. Capping the noise raises the early steps' share.</p>` },
      { id: "flow-judged", title: "Flow-OPD: writes, judged, results", html: `
        <p><b>What the agent writes.</b> The task removes the trajectory sampler <code>pipeline_with_logprob</code> and the step <code>sde_step_with_logprob</code>. The sampler runs the student from noise and returns the images, all 11 states and the 10 log-probabilities; the step returns the next state, its log-probability (the mean over latent elements of the Gaussian log-density, as in our toy), the mean and the noise coefficient. Replay must match within an absolute tolerance of about 1.9 × 10⁻⁶.</p>
        <p><b>How it is judged.</b> Eight optimizer updates of the student, then held-out prompts rendered in 40 steps without noise, read by OCR. A workload's reward is <code>1 − d / len(t)</code>, where <code>d</code> is the edit distance between the target text <code>t</code> and what OCR read (0 if the target appears inside it):</p>
        ${code("ocr")}
        <p>The score is 100 times the mean reward. To pass, each of the 8 hidden workloads must score strictly higher than the reference, unless both are already perfect.</p>
        <table><tr><th>Run</th><th>OCR reward</th><th>Workloads won</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>0.618</td><td></td><td>61.8</td><td></td></tr>
        <tr><td>GLM 5.3</td><td>0.861</td><td>6 of 8</td><td>86.1</td><td>${fail}</td></tr>
        <tr><td>Step 5 Preview</td><td>0.855</td><td>7 of 8</td><td>85.5</td><td>${fail}</td></tr>
        <tr><td>Kimi K3</td><td>0.751</td><td>5 of 8</td><td>75.1</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>0.559</td><td>2 of 8</td><td>55.9</td><td>${fail}</td></tr></table>
        <p class="meta">As of October 26, 2026. Selected rows; the full table is on the task page. No model passed; 10 of 16 scored above the human reference. ${full("ocr-distillation-trajectory-sampling")}</p>
        <p>The task page describes Claude Opus 5.5's run: one guided model call per step, a reverse-SDE Gaussian step with the log-probability in double precision, a two-step DPM-Solver++ for the noiseless evaluation images, and, its own idea, the capped early noise of our second toy. In its own analysis, the uncapped early steps carry hundreds of times less signal than the last.</p>` },
    ],
    takeaways: ["Mask the model's tokens; reward the last one.", "Normalize rewards within a group.", "A step must replay to the same log-probability."],
  },
  {
    slug: "4-population-losses", nav: "Fréchet · LeJEPA", title: "Losses over Whole Populations",
    subtitle: "A feature queue that keeps gradients, and a loss that recovers a hidden state",
    abstract: "Two tasks write a loss that looks at many samples at once: their mean, their covariance, their distribution. The Fréchet loss needs population statistics with gradients through the current batch only. LeJEPA's losses must recover a hidden 2-D state up to a rotation.",
    tags: ["Fréchet distance", "feature queue", "SIGReg", "whitening", "identifiability"],
    hero: "code:queue", heroCaption: "A ring buffer of past features as the population",
    sections: [
      video(3, "Populations and a world model: Fréchet loss, LeJEPA, NanoWM", "Part 3 of 4 of this lecture's video: populations and a world model: Fréchet loss, LeJEPA, NanoWM."),
      { id: "frechet", title: "Representation Fréchet Loss: a queue that keeps gradients", html: `
        <p>The <b>Fréchet distance</b> compares two sets of images by the mean and covariance of their features; FID is the Fréchet distance in Inception features. <em>Representation Fréchet Loss for Visual Generation</em> (arXiv 2026) turns it into a training loss for image generators. The statistics must cover many generated images, but only the current batch has a computation graph. So a <b>feature queue</b> keeps past features, or running sums of them, without gradients, and mixes in each new batch with its gradient.</p>
        <p>Our generator has one feature, <code>x = m + s·z</code>, and the target is a standard normal, so the Fréchet distance is <code>(μ − 0)² + (σ − 1)²</code>. A ring buffer of <code>window</code> past features is the population. The gradient flows into the batch's rows only. We scale each step by <code>window / batch</code>, so every window takes steps of the same size and only the lag differs.</p>
        ${code("queue")}
        ${demo("queue", "Demo 4 · The lag of a long window", "pick a window")}
        <p>The target mean is 0. With a long window the population mean lags the generator: it still sees the old features, keeps pushing, and the generator overshoots (to −1.64 with 512 features). A short window tracks the generator but estimates the statistics from few samples.</p>` },
      { id: "frechet-judged", title: "Fréchet loss: writes, judged, results", html: `
        <p><b>What the agent writes.</b> The bodies of <code>FeatureQueue</code>: <code>build_feats_stats(new)</code> returns a mean and covariance that are differentiable in the new batch; <code>build_feats_snapshot(new)</code> returns the stored rows with the new ones in front; <code>enqueue(new)</code> updates the state without keeping a graph; and the state must save and load with the model. Three modes: a plain ring buffer, a ring with running sums, and moving averages (EMA).</p>
        <p><b>How it is judged.</b> Each workload post-trains the authors' pMF-B generator (128 or 512 updates) from a 50,000-image warm start, then scores fresh images in six feature spaces: Inception, ConvNeXt, DINOv2, MAE, SigLIP and CLIP. Each distance is divided by a published constant (<code>FDr</code>), and <code>score = 100 / (1 + mean FDr)</code>. To pass, all six must be strictly lower than the reference's on every one of three workloads.</p>
        ${code("fdscore")}
        <p>These match the leaderboard's 3.8 and 7.2, computed from the table's rounded means.</p>
        <p><b>What the agents did.</b> No model passed; 9 of 16 scored above the reference. <b>Claude Opus 5.5</b> had the best final score, 7.2. It beat the reference in Inception and MAE space on all 3 workloads, and in the other four spaces on 2 of 3. Its queue forms every statistic in 64-bit floats: in single precision, its comments say, the covariance of a 50,000-row population loses its small eigenvalues. Its own idea is our toy's lesson: a long window lags the generator, which then overshoots, so it replaces it with an exponential window, started from the warm start and holding about 1.5 times as many features as the feature dimension. ${full("differentiable-population-statistics")}</p>` },
      { id: "lejepa", title: "LeJEPA: recover the state, up to a rotation", html: `
        <p><b>LeJEPA</b> trains an encoder without labels: two noisy views of one hidden state should give matching outputs. Alone, that is easy to cheat: map everything to one point. A regularizer, <b>SIGReg</b>, pushes the outputs toward a standard Gaussian so they cannot collapse. <em>When Does LeJEPA Learn a World Model?</em> (arXiv 2026) asks when this recovers the hidden state, up to a rotation.</p>
        <p>The task's world: a 2-D Gaussian state <code>z</code>, two views <code>0.95 z + 0.31 η</code>, and an observation that turns each view by π times its distance from the origin, a spiral. Our model scores four fixed encoders by the two losses and by the task's recovery measures: affine fits in both directions (R²) and how far the fitted map <code>A</code> is from a rotation (<code>‖AᵀA − I‖ / √2</code>).</p>
        ${code("jepa")}
        ${demo("jepa", "Demo 5 · Four encoders", "pick an encoder")}
        <p>Alignment alone prefers the collapsed encoder (0.000). Whitening rules out collapse and the wrong scale. The spiral itself is perfectly Gaussian, but its views are far apart, and a linear map recovers almost nothing from it (R² 0.012). Only the rotation is good on both losses, and it is what the task rewards: R² near 1 both ways and an orthogonal map.</p>` },
      { id: "lejepa-judged", title: "LeJEPA: writes, judged, results", html: `
        <p><b>What the agent writes.</b> The loss bodies in <code>losses.py</code>: alignment between the two views, SIGReg and whitening (InfoNCE too, though the scored path does not call it). No loss may keep state between calls. The encoder, optimizer, data and metrics stay fixed.</p>
        <p><b>How it is judged.</b> Three seeded runs of 1,001 updates on fresh batches of 256. The score is the mean of <code>Q</code> (our toy's formula, up to 90) plus a time bonus, <code>5 · T_ref / T</code>, capped at 10 (5 points at equal speed). To pass, each run must beat the reference on six measures: R² in both directions, orthogonality error, covariance deviation <code>ε = ‖Cov h − I‖</code>, the alignment gap <code>δ</code>, and the error after the best rotation.</p>
        <p><b>What the agents did.</b> 3 of 16 models passed and 15 scored above the reference (86.4): GPT-6 Astra and Gemini 4 Argon · Antigravity, both with the best final score, 99.5, and Claude Opus 5.5 with 99.4. DeepSeek V4.1 Flash also scored 99.5 but failed. The measure that separated runs was the alignment gap <code>δ</code>: DeepSeek V4.1 Flash and Gemini 4 Argon · Pi beat the reference's 0.00602 on 2 of 3 seeds, and the other runs that failed on 1 or none. ${full("lejepa")}</p>
        <p>Opus measured alignment in the metric of the batch covariance (the gap between whitened views), so it cannot trade scale against alignment. Its SIGReg has three parts: a moment penalty from two independent half-batches, an Epps–Pulley test along eight fixed directions, and a radial-tail test. Its own idea: a small InfoNCE term whose critic is the exact Gaussian log-density of one view given the other.</p>` },
    ],
    takeaways: ["Gradients through the batch, statistics from the population.", "A long window lags and overshoots.", "Alignment needs a regularizer against collapse."],
  },
  {
    slug: "5-nano-world-model", nav: "World model", title: "Nano World Model: The One Pass",
    subtitle: "Per-frame noise schedules, and sixteen samples averaged",
    abstract: "A world model predicts the frames that follow a frame and a list of actions. NanoWM denoises each future frame on its own schedule. Only one model passed: it averaged sixteen short samplers and denoised the average once more.",
    tags: ["world model", "diffusion", "DDIM", "PSNR", "SSIM", "LPIPS"],
    hero: "code:schedule", heroCaption: "One rule for three schedules",
    sections: [
      { id: "idea", title: "Each frame has its own noise level", html: `
        <p>A <b>world model</b> is a learned simulator: given a frame and a list of actions, it predicts the frames that follow. <b>NanoWM</b> (<em>Nano World Models</em>, arXiv 2026) uses a diffusion model on compressed images. Each future frame starts as noise, which the model removes step by step, guided by the actions. Each frame has its own noise level, so some frames can finish before others.</p>` },
      { id: "schedule", title: "One rule for three schedules", html: `
        <p>The sampler decides, row by row, each future frame's noise level (1 is pure noise, 0 is clean). One rule covers the common schedules: frame <code>f</code> starts <code>lag · f</code> rows late.</p>
        ${code("schedule")}
        ${demo("schedule", "Demo 6 · Noise levels, row by row", "move the lag")}
        <p>With a lag of the whole schedule, frame 1 finishes before frame 2 starts: the <b>sequential</b> mode the task uses, with 250 steps. The real context frame stays at a low noise level, 0.02, to keep the history steady.</p>
        <p><b>What the agent writes.</b> The sampler, its schedule utilities, the DDIM transition and the sampling hooks. For each clip it gets the encoded first frame and 20 actions and returns a latent video of shape (1, 4, 4, 32, 32). The trained NanoWM-B/2 model and the image encoder and decoder stay fixed.</p>
        <p><b>How it is judged.</b> Each clip is a point moving through a simulated maze; the three future frames are compared with the recorded ones by PSNR, SSIM and LPIPS. Each measure is mapped to [0, 1] (PSNR from 20 to 50 dB, SSIM from 0.8 to 1, LPIPS from 0.25 to 0), averaged and scaled to 100. The score averages only the suite's two original clips, while the pass rule checks all six. To pass, on all six graded clips PSNR and SSIM must be strictly higher and LPIPS strictly lower than the reference's.</p>` },
      { id: "average", title: "Sixteen samples, averaged", html: `
        <p>A diffusion sample is random. Part of its error is shared by every sample (what the model gets wrong), and part differs from sample to sample. Averaging cancels the second part. Our "frame" has 256 pixels; each sample adds a shared error and its own noise:</p>
        ${code("average")}
        ${demo("average", "Demo 7 · Average the samples", "move the slider")}
        <p>Each doubling gains less, because the shared error stays. The average is also blurrier than any one sample, which PSNR rewards; a perceptual measure like LPIPS may not.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <table><tr><th>Run</th><th>LPIPS</th><th>PSNR (dB)</th><th>SSIM</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>0.0198</td><td>36.6</td><td>0.9837</td><td>79.1</td><td></td></tr>
        <tr><td>Claude Opus 5.5</td><td>0.0171</td><td>38.4</td><td>0.9856</td><td>81.4</td><td>${pass}</td></tr>
        <tr><td>GPT-6 Astra</td><td>0.0179</td><td>38.3</td><td>0.9852</td><td>81.2</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>0.0192</td><td>38.1</td><td>0.9850</td><td>81.1</td><td>${fail}</td></tr>
        <tr><td>Kimi K3</td><td>0.0176</td><td>38.2</td><td>0.9853</td><td>80.9</td><td>${fail}</td></tr></table>
        <p class="meta">Means over the six graded clips, as of October 26, 2026. Selected rows; the full table is on the task page. 13 of 16 models scored above the reference; one passed. ${full("nano-world-model")}</p>
        <p>Only <b>Claude Opus 5.5</b> passed. Most runs beat the reference's PSNR on all six clips; LPIPS decided the passes. GPT-6 Astra, Kimi K3 and GLM 5.3 each lost only LPIPS, on 1 of 6 clips.</p>
        <p>Opus wrote one rule for all schedules (our first toy), a per-frame DDIM update that estimates every clean frame from the model's output, and a lightly noised history. Its own idea is our second toy: for each clip it runs 16 independent samplers of 50 steps and averages their latent videos. It then re-noises the average slightly and denoises it once more, frame by frame, in 10 steps, so the result leans toward what most samples agree on and is sharp again.</p>
        ${callout("pattern", "SPEND THE BUDGET ON AGREEMENT", "<p>Sixteen short samplers instead of one long one: the average removes what samples disagree on, and a short final denoise restores detail.</p>")}` },
    ],
    takeaways: ["Frame f starts lag · f rows late.", "Averaging removes what samples disagree on.", "LPIPS on one clip decided the passes."],
  },
  {
    slug: "6-short-runs", nav: "DeTok · DyT", title: "Short Runs: DeTok and DyT",
    subtitle: "A short run leaves little room on quality; speed decided most scores",
    abstract: "Two tasks train a model briefly and score it. DeTok corrupts latents to train a tokenizer; with 16 updates at a tiny learning rate, most runs matched the reference's PSNR and time decided the score. DyT replaces LayerNorm with a learned tanh; with accuracy at chance, the race was on speed too.",
    tags: ["image tokenizer", "latent denoising", "masking", "LayerNorm", "Dynamic Tanh"],
    hero: "code:dyt", heroCaption: "LayerNorm and DyT on one token with an outlier",
    sections: [
      video(4, "Short runs and an easy task: DeTok, DyT, Polar Express", "Part 4 of 4 of this lecture's video: short runs and an easy task: DeTok, DyT, Polar Express."),
      { id: "detok", title: "DeTok: how much to corrupt", html: `
        <p>An image tokenizer turns a photo into latent tokens and decodes them back. <b>DeTok</b> (<em>Latent Denoising Makes Good Tokenizers</em>, ICLR 2026) trains the tokenizer as a denoiser: it hides many image patches and mixes noise into the latents (<code>(1 − τ) x + τ γ ε</code>), and the decoder must still rebuild the clean image. The paper's aim is a tokenizer that a generative model can use well.</p>
        <p>Our tokenizer's "images" are 16 smooth tokens. Our decoder rebuilds each token from itself, its neighbors, a hidden flag and a constant, fitted by least squares on corrupted copies. We test it on clean tokens, as the task does, and on noisy ones.</p>
        ${code("detok")}
        ${predict("In our model, scored on clean tokens as the task scores clean reconstructions, which corruption does best?", "<p>Light corruption. Heavy corruption buys robustness to noisy latents (48.6 against 359.9) but costs clean accuracy (48.4 against 0.9).</p>")}
        <p>In our model, heavy corruption buys robustness to noisy latents but costs clean accuracy, and light corruption keeps almost all of it. The task's reconstructions are clean.</p>
        <p><b>What the agent writes.</b> The corruption, in training only: which patches to hide, how to add noise to the latents, and what fills each hidden position so the decoder gets a full sequence in order. Skipping the corruption altogether is invalid; it is part of the contract.</p>
        <p><b>How it is judged.</b> Each workload continues training on 64 photos for one epoch: 16 AdamW updates at learning rate 10⁻⁶. Then it reconstructs 64 others, with the model and with an average of its weights (EMA), scored by PSNR. <code>score = 70 · (O + E) / 80 + 30 · mean(T_r / T_c)</code>, from the two PSNRs and the time ratio. To pass, both PSNRs must be strictly higher and the whole process strictly faster than the reference's, on each of three workloads.</p>
        <p><b>What the agents did.</b> 3 of 16 models passed. Gemini 4 Argon · Pi had the best final score, 78.3, with 27 dB on both PSNRs against the reference's 24.4 and 24.5, and 46.9 s against 50.3 s; its method is not described on the task page. With 16 updates at learning rate 10⁻⁶, most runs ended at the reference's 24.4 and 24.5 dB, so wall time decided most scores. Claude Opus 5.5 (75.5) is one of them: the same PSNRs, a pass on time (47.5 s), and a miss on the EMA PSNR of 1 of 3 workloads. The page describes its run: it hides at most a tenth of the configured share of patches, mixes in noise with a weight between 0.5% and 5%, and appends the learned mask token at hidden positions before undoing the shuffle. Its own idea is where its score came from, time: building the model draws about 343 million random numbers one at a time, and it reproduces the same stream faster with Mersenne Twister jump-ahead, bit for bit. ${full("robust-image-tokenizer")}</p>` },
      { id: "dyt", title: "DyT: a learned tanh instead of LayerNorm", html: `
        <p>Transformers normalize activations with LayerNorm, which computes a mean and a variance over each token's features. <em>Transformers without Normalization</em> (CVPR 2025) replaces it with one element-wise function, <b>DyT</b>: <code>γ · tanh(α x) + β</code>, with a learned scalar <code>α</code> and learned per-channel <code>γ</code> and <code>β</code>. The paper observed that trained LayerNorms map inputs to outputs along an S-shaped curve much like tanh: linear in the middle, squashing the extremes.</p>
        ${code("dyt")}
        <p>LayerNorm uses the outlier to rescale every feature; DyT treats each feature alone and caps the outlier at <code>γ</code>. With no statistics to compute, DyT can be faster.</p>
        <p><b>What the agent writes.</b> The DyT layer, with its own <code>α</code>, <code>γ</code> and <code>β</code> at every site, and the conversion that replaces every LayerNorm in the model. Outputs, gradients and optimizer updates must match the authors' layer closely.</p>
        <p><b>How it is judged.</b> A ViT-Base classifier trained briefly from scratch on 20 flower photos of five kinds, three workloads. The score is <code>0.6 · quality + 0.4 · latency</code>, where quality is <code>50 + 2 (A − A*)</code> for top-1 accuracy and latency is <code>50 + 200 log₂(T* / T)</code> for the training step, each clamped to [0, 100]. To pass, accuracy must be at least the reference's, and training and inference strictly faster.</p>
        ${code("dytscore")}
        <p>At equal accuracy the score stops at 70 once the step is about 1.19 times faster. Top-1 accuracy was 20% for the reference and for most runs: with 20 photos and a short run, the classifiers are at chance for five classes. So the race was on speed.</p>
        <p><b>What the agents did.</b> 3 of 16 models passed: Gemini 4 Argon · Antigravity and Gemini 4 Argon · Pi, with the ceiling score of 70.0, and Claude Opus 5.5, with 69.6. GPT-6 Astra also scored 70.0 but failed: its inference was slower than the reference's on 1 of the 3 workloads. Opus's patch fuses the forward and the backward pass of DyT into one small kernel each, and rounds every multiply and add as the plain formula does, so outputs and gradients match the reference's layer bit for bit. Its own idea: record the converted block stack's kernels once into CUDA graphs and replay them, which removes the cost of launching hundreds of small kernels. ${full("dyt")}</p>
        ${callout("pitfall", "THE TOP SCORE CAN FAIL", "<p>GPT-6 Astra tied for DyT's top score, 70.0, and failed: the score counts only the training step, but the pass rule also checks inference time on every workload.</p>")}` },
    ],
    takeaways: ["A short run leaves the race to speed.", "The score's ceiling can hide a failed check.", "Match the reference bit for bit, then go faster."],
  },
  {
    slug: "7-polar-express", nav: "Polar Express", title: "Polar Express: The Second-Easiest Task",
    subtitle: "A schedule of best polynomials beats one fixed polynomial",
    abstract: "The polar factor of a matrix sets every singular value to 1. Polar Express gets there with a few odd polynomials, each the best one for the interval the step before leaves. 14 of 16 models passed; it is the second easiest task in the benchmark, in the same field as the hardest.",
    tags: ["polar factor", "Muon", "Newton–Schulz", "minimax polynomial", "Remez"],
    hero: "code:polar", heroCaption: "The best odd cubic on an interval, step after step",
    sections: [
      { id: "idea", title: "A scalar question", html: `
        <p>A matrix's <b>polar factor</b> keeps its singular vectors but sets every singular value to 1. The Muon optimizer needs it at every step, where an SVD is too slow. An odd polynomial <code>p(x) = a x + b x³ + c x⁵</code> applied to a matrix (<code>a X + b X Xᵀ X + …</code>) acts on each singular value separately, using matrix products only. So the question is scalar: which polynomials push every value in <code>[l, 1]</code> toward 1, fastest? <b>Polar Express</b> (ICLR 2026) chooses each step's polynomial as the best one, in the worst case, for the interval the previous steps leave.</p>` },
      { id: "schedule", title: "A schedule beats a fixed polynomial", html: `
        <p>The classical Newton–Schulz iteration applies the same cubic, <code>1.5 x − 0.5 x³</code>, every time. For an odd cubic the best polynomial on <code>[lo, hi]</code> has a closed form: its error is the same, <code>E</code>, at both ends and at its peak, with alternating signs. After the step, every value lies in <code>[1 − E, 1 + E]</code>, and the next cubic is the best one for that interval. The task uses fifth-degree polynomials; the idea is the same.</p>
        ${code("polar")}
        ${demo("polar", "Demo 8 · Squeeze the singular values", "move the slider")}
        <p>Newton–Schulz multiplies a small singular value by only 1.5 per step; the greedy schedule grows it about 5 times on the first step and about 2.5 times per step after that, then closes in fast. After ten steps its worst error is 3.5 × 10⁻⁶.</p>` },
      { id: "judged", title: "Writes, judged, results", html: `
        <p><b>What the agent writes.</b> The whole method: <code>optimal_quintic(l, u)</code>, the best fifth-degree odd polynomial for an interval; <code>optimal_composition(l, steps, …)</code>, a schedule of them; and <code>PolarExpress</code>, the matrix iteration.</p>
        <p><b>How it is judged.</b> Twelve square, tall and wide matrices with three to six steps each; six of them have hidden spectra from the paper's experiments (<code>σ_min / σ_max</code> down to about 10⁻⁴·⁵). The score counts decimal digits: of the schedule's worst scalar error (12 digits for full marks) and of the relative matrix error (8 digits), on the six original matrices only. To pass, on every matrix five quantities must beat the reference: the worst scalar error, three distances from the true factor, and the cosine similarity.</p>
        <table><tr><th>Run</th><th>Relative error</th><th>Cosine</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>0.355</td><td>0.923</td><td>26.3</td><td></td></tr>
        <tr><td>Gemini 4 Argon · Pi</td><td>2.54 × 10⁻⁸</td><td>0.97</td><td>71.7</td><td>${pass}</td></tr>
        <tr><td>Kimi K3.1 Pro</td><td>2.55 × 10⁻⁸</td><td>0.97</td><td>71.7</td><td>${pass}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>2.86 × 10⁻⁶</td><td>0.983</td><td>67.8</td><td>${pass}</td></tr></table>
        <p class="meta">As of October 26, 2026. Selected rows; the full table is on the task page. 14 of 16 models passed; 15 scored above the reference. ${full("polar-express")}</p>
        <p>Its FDI is 1.6, the second easiest of the 48 tasks, and it sits in the same field as the hardest. Claude Opus 5.5 found each polynomial by the Remez exchange, built the greedy schedule in double precision (so the paper's safety margins for low precision are not needed), and estimated the spectrum from a few products. Its own idea: spend the products differently. A degree-17 polynomial costs five matrix products through a nested evaluation scheme, and it mixes degrees up to 17 for each step count.</p>
        ${callout("pattern", "A KNOWN ANSWER IS A CLEAR TARGET", "<p>Polar Express has an exact oracle (the SVD), an optimal polynomial with a classical algorithm (Remez), and a check that needs no GPU. Nearly every model passed. KV Compaction has none of these, and nobody did.</p>")}` },
    ],
    takeaways: ["A polynomial acts on each singular value.", "Pick each step's best polynomial for the interval left.", "Exact oracles make tasks easy to pass."],
  },
  {
    slug: "8-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>KV Compaction</h3><ul><li>Keep keys, fit biases, fit values</li><li>Accuracy on every article</li><li>Hardest task; nobody passed</li></ul></div>
        <div class="card"><h3>Training data and losses</h3><ul><li>RAGEN: masks, rewards, groups</li><li>Flow-OPD: a step that replays</li><li>Fréchet: gradients via the batch</li><li>LeJEPA: align, but don't collapse</li></ul></div>
        <div class="card"><h3>Models and numerics</h3><ul><li>World model: average 16 samples</li><li>DeTok and DyT: speed decided</li><li>Polar Express: 14 of 16 passed</li></ul></div></div>` },
      { id: "summary", title: "Three lessons", html: `
        ${callout("pattern", "THREE LESSONS FROM THE MACHINE LEARNING TASKS", `<ol>
          <li><b>Every workload decides.</b> Claude Opus 5.5's KV Compaction run was 108 times faster with higher mean accuracy and failed on 2 articles of 24. GPT-6 Astra had DyT's top score and failed on one workload's inference time.</li>
          <li><b>Fit the method to the measurement.</b> Short runs left speed to decide most scores in DeTok and DyT; averaging sixteen samples suited the world model's PSNR and SSIM.</li>
          <li><b>Training data must be exactly right.</b> RAGEN's masks and rewards, Flow-OPD's replayed log-probabilities and the Fréchet queue's gradients fail silently when they are wrong.</li></ol>`)}` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★★ (experiment)</h3>
        <p>In the KV model, fit the bias and values on only 8 sample queries instead of 64. What happens to the test gap at 12 of 48 keys, and why?</p>
        <details class="reveal"><summary>Hint</summary><p>With 12 kept keys there are 12 values to fit from 8 queries. The ridge keeps the system solvable, but the fit follows those 8 queries.</p></details>
        <h3>Exercise 2 ★ (compute)</h3>
        <p>Use the KV score: how many times faster than the reference must a run be to score 60 on an article?</p>
        <details class="reveal"><summary>Solution</summary><p><code>ln S / (ln 10 + ln S) = 0.6</code> gives <code>ln S = 1.5 ln 10</code>, so <code>S = 10^1.5 ≈ 31.6</code>.</p></details>
        <h3>Exercise 3 ★ (modify)</h3>
        <p>In the Flow-OPD signal table, cap the noise at 0.35. Which steps change, and what is the ratio of the first step's signal to the last's now?</p>
        <h3>Exercise 4 ★★ (modify)</h3>
        <p>In the Fréchet model, replace the ring buffer with an exponential moving average of the mean and second moment. Which decay rate behaves like a window of 64?</p>
        <h3>Exercise 5 ★ (experiment)</h3>
        <p>Run the Newton–Schulz and greedy cubic iterations from <code>l = 0.1</code>. How many steps does each need to bring the worst error below 10⁻³?</p>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li><em>Fast KV Compaction via Attention Matching.</em> ICML 2026. <a href="https://arxiv.org/abs/2602.16284" target="_blank" rel="noopener">arXiv 2602.16284</a></li>
        <li><em>RAGEN: Understanding Self-Evolution in LLM Agents via Multi-Turn Reinforcement Learning.</em> 2025. <a href="https://arxiv.org/abs/2504.20073" target="_blank" rel="noopener">arXiv 2504.20073</a></li>
        <li><em>Flow-OPD: On-Policy Distillation for Flow Matching Models.</em> 2026. <a href="https://arxiv.org/abs/2605.08063" target="_blank" rel="noopener">arXiv 2605.08063</a></li>
        <li><em>Representation Fréchet Loss for Visual Generation.</em> 2026. <a href="https://arxiv.org/abs/2604.28190" target="_blank" rel="noopener">arXiv 2604.28190</a></li>
        <li><em>When Does LeJEPA Learn a World Model?</em> 2026. <a href="https://arxiv.org/abs/2605.26379" target="_blank" rel="noopener">arXiv 2605.26379</a></li>
        <li><em>Nano World Models: A Minimalist Implementation of Future Video Prediction.</em> 2026. <a href="https://arxiv.org/abs/2605.23993" target="_blank" rel="noopener">arXiv 2605.23993</a></li>
        <li><em>Latent Denoising Makes Good Tokenizers.</em> ICLR 2026. <a href="https://arxiv.org/abs/2507.15856" target="_blank" rel="noopener">arXiv 2507.15856</a></li>
        <li><em>Transformers without Normalization.</em> CVPR 2025. <a href="https://arxiv.org/abs/2503.10622" target="_blank" rel="noopener">arXiv 2503.10622</a></li>
        <li><em>The Polar Express: Optimal Matrix Sign Methods and Their Application to the Muon Algorithm.</em> ICLR 2026. <a href="https://arxiv.org/abs/2505.16932" target="_blank" rel="noopener">arXiv 2505.16932</a></li>
        <li>Task pages: <a href="${TASK}kv-compaction" target="_blank" rel="noopener">KV Compaction</a>, <a href="${TASK}ragen" target="_blank" rel="noopener">RAGEN</a>, <a href="${TASK}ocr-distillation-trajectory-sampling" target="_blank" rel="noopener">Flow-OPD</a>, <a href="${TASK}differentiable-population-statistics" target="_blank" rel="noopener">Representation Fréchet Loss</a>, <a href="${TASK}lejepa" target="_blank" rel="noopener">LeJEPA</a>, <a href="${TASK}nano-world-model" target="_blank" rel="noopener">Nano World Model</a>, <a href="${TASK}robust-image-tokenizer" target="_blank" rel="noopener">DeTok</a>, <a href="${TASK}dyt" target="_blank" rel="noopener">DyT</a>, <a href="${TASK}polar-express" target="_blank" rel="noopener">Polar Express</a></li></ul>` },
    ],
    takeaways: ["Every workload decides.", "Fit the method to the measurement.", "Training data must be exactly right."],
  },
];

const QUIZ = [
  { q: "Attention Matching gives each kept key a bias. What is the bias fitted to?",
    opts: ["The question's answer", "The attention mass: the kept keys' weights should add up to the whole article's, for every sample query", "The key's position in the document", "The value's length"],
    a: 1, why: "Without it the kept keys draw too little weight, and the template and question tokens get too large a share." },
  { q: "Claude Opus 5.5's KV Compaction run was 108 times faster than the reference with higher mean accuracy. Why did it fail?",
    opts: ["It used too many bytes", "It was slower on one article", "It returned no attention bias", "Its accuracy fell short of the reference on 2 of the 24 articles"],
    a: 3, why: "A pass is decided article by article: each must keep its correct count within max(1, ceil(5%)) of the reference's median." },
  { q: "In RAGEN, all four games of a group failed with the same reward. What does group normalization give them?",
    opts: ["Advantage 0 for every game: the group teaches nothing", "A large negative advantage", "The raw reward", "A random advantage"],
    a: 0, why: "The advantage is the reward minus the group mean, over the spread. With equal rewards the spread is 0, and the advantage is set to 0." },
  { q: "Why can a long feature window make a Fréchet-loss generator overshoot?",
    opts: ["It has too few samples", "It uses double precision", "The population still holds old features, so its statistics lag the generator, which keeps being pushed after it has reached the target", "Its gradient reaches old rows"],
    a: 2, why: "In our toy, with 512 features the mean overshoots the target 0 down to −1.64. Opus used an exponential window of about 1.5 times the feature dimension." },
  { q: "Why does the greedy best-cubic schedule beat Newton–Schulz from l = 0.001?",
    opts: ["It uses more matrix products per step", "Each step's cubic is the best one for the interval left, so small singular values grow about 5 times on the first step and about 2.5 times per step after that, instead of 1.5", "It uses an SVD", "It runs in higher precision"],
    a: 1, why: "Both cost the same per step. After ten steps the greedy schedule's worst error is 3.5 × 10⁻⁶; Newton–Schulz's is still 0.94." },
];
