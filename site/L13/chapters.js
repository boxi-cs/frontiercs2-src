// L13 content, adapted from frontiercs2/notes/L13-robotics.md (checked by tools/check.py).

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
  number: 13,
  title: "Robotics",
  tagline: "Actions from noise, and a walker on a deadline",
  lead: "The two Robotics tasks of FrontierCS 2: the loop that samples a robot's next moves by removing noise, and a recipe that trains a four-legged robot to follow joystick commands in twelve minutes. For each one: the idea, the part the agent writes, how a run is judged, and what the agents did.",
  heroDemo: "flowMini",
  heroLabel: "Diffusion Policy · from noise to two good actions",
  heroCaption: "The clean guess of thirty samples over 100 noise levels: each starts at the average, 0, then commits to left or right.",
  whyTitle: "Why this lecture matters",
  whySub: "Three lessons the Robotics tasks teach",
  why: [
    ["Average the right thing", "Regression averages <b>two good actions into a bad one</b>. A denoising sampler keeps both, because each step commits a little more."],
    ["Calls are the cost", "Five well-placed network calls with a <b>second-order step</b> do the work of a hundred, about <b>19 times faster</b>."],
    ["Every metric, every workload", "In both tasks every run beat the reference's score, and <b>none passed</b>: one group of episodes, or one penalty, was enough to fail."],
  ],
  ctaTitle: "Ready to turn noise into a plan?",
  minutes: "About 60 minutes",
  videos: {},
};

const CHAPTERS = [
  {
    slug: "1-diffusion", nav: "Actions from noise", title: "Diffusion Policy: Actions from Noise",
    subtitle: "Why averaging fails when there are two good ways to act",
    abstract: "Diffusion Policy generates a robot's actions the way image models generate pictures: start from noise and remove it step by step, a trained network guiding each step. Unlike regression, it keeps every way the demonstrators solved the task.",
    tags: ["multimodal actions", "regression", "denoising", "DDPM"],
    hero: "code:denoise", heroCaption: "The network's job: guess the clean action from a noisy one",
    sections: [
      { id: "idea", title: "Generating actions", html: `
        <p>A robot policy maps what the robot sees to what it does next. The usual way to learn one from human demonstrations is regression: predict the demonstrated action, with the squared error as the loss. <em>Diffusion Policy</em> (Chi et al., RSS 2023) instead learns to <b>generate</b> actions the way image models generate pictures: start from random noise and remove it step by step, with a trained network guiding each step. The paper's point is that demonstrations are often <b>multimodal</b>: people solve the same situation in different ways, and regression averages those ways into one that nobody used.</p>` },
      { id: "average", title: "Two good ways around an obstacle", html: `
        <p>Our toy has a one-number action. An obstacle stands straight ahead; the demonstrators steer around it to the left (action −1) or to the right (+1), with a little spread. A regression policy learns the mean of the demonstrations.</p>
        ${code("demos")}
        <p>The regression answer, 0.112, steers almost straight into the obstacle. No demonstrator did that.</p>` },
      { id: "denoise", title: "Denoising, one step at a time", html: `
        <p>Diffusion training adds noise to demonstrated actions at many levels <code>t</code>, from 0 (clean) to 100 (pure noise). At level <code>t</code> a clean action <code>a</code> becomes <code>x = sqrt(ab) · a + sqrt(1 − ab) · noise</code>, where <code>ab</code> (alpha-bar) falls from 1 to 0 along a <b>schedule</b>; Diffusion Policy uses the cosine schedule below. The network learns to guess the clean action from <code>x</code> and <code>t</code>.</p>
        <p>We skip the training and use the best possible guess, which for our two-mode data can be written in closed form: the expected clean action given <code>x</code>. A trained network approximates this function.</p>
        ${code("denoise")}
        ${predict("At level 100 no signal is left. What should the best guess be, whatever x is?", "<p>The average of the data, 0 here: with no information, the guess that minimizes the squared error is the mean. That is the regression answer, and it is why a single network call is not enough.</p>")}
        <p>At full noise, the best guess is the average of the two modes, 0: the regression answer for balanced demonstrations. As the noise falls, the guess commits to the nearer mode. A sampler exploits this: it starts from pure noise, asks for a guess, moves the sample a little toward it, adds back a little fresh noise, and repeats at the next lower level. This is the <b>DDPM</b> sampler; the authors' loop takes all 100 steps, one network call each.</p>
        ${code("ddpm")}
        ${demo("flow", "Demo 1 · Noise to two actions", "press Sample", "Each line is one sample's clean guess at every level, from full noise on the left to its final plan on the right.")}
        <p>Of 1,000 sampled actions, about half go left and half go right, and none goes into the obstacle. The robot then executes the first few actions of the plan and samples again.</p>` },
    ],
    takeaways: ["Regression averages the modes.", "At full noise the best guess is the mean.", "100 small steps commit to one mode."],
  },
  {
    slug: "2-fewer-calls", nav: "Fewer calls", title: "Diffusion Policy: Fewer Network Calls",
    subtitle: "The task removes the sampler; the agent writes a faster one",
    abstract: "A hundred network calls per plan are slow. Deterministic jumps, well-placed levels and a second-order update do the same work in five calls. The task scores quality gained over a 20-step sampler times speed, and passes only a sampler at least as good as the reference everywhere.",
    tags: ["DDIM", "DPM-Solver++", "Push-T", "latency"],
    hero: "code:dpm2", heroCaption: "A second-order jump reuses the previous guess",
    sections: [
      { id: "ddim", title: "A deterministic shortcut", html: `
        <p>A hundred network calls per plan are slow. On the task's CPU, the authors' sampler takes 1,150 ms per prediction. Most of that work is spent at high noise levels, where the guess barely changes.</p>
        <p>The <b>DDIM</b> update drops the fresh noise. It splits the current sample into a clean guess and the noise that the guess implies, then rebuilds the sample at a much lower level with the same noise. The levels can then be far apart. <code>levels(k)</code> spreads <code>k</code> calls evenly.</p>
        ${code("ddim")}
        <p>One call returns the guess at full noise, which is the average again: all 1,000 samples go into the obstacle. Ten calls are already about as good as a hundred.</p>` },
      { id: "placement", title: "Where the calls go, and a second-order step", html: `
        <p>With few calls, placement matters. Evenly spaced levels waste calls at the top of the cosine schedule, where almost no signal is left, and stop at level 20, where the last guess is still blurred. A <b>second-order</b> update (DPM-Solver++) also reuses the previous guess: it measures the jump in log signal-to-noise ratio <code>lam</code> and extrapolates from the last two guesses, at no extra network call.</p>
        ${code("dpm2")}
        ${demo("steps", "Demo 2 · Fewer calls", "pick a preset or type levels", "Try Exercise 3 here: find three levels that leave fewer than 30 plans in the middle with second order on.")}
        <p>Three well-placed calls beat three even ones by a wide margin, and the second-order step halves the misses of five calls. The levels 95, 70, 45, 22 and 5 are the ones Claude Opus 5.5 chose (see below). In our toy, "middle" is a miss; in the task, a blurred plan pushes the T-block less accurately.</p>` },
      { id: "writes", title: "What the agent writes", html: `
        <p>The task removes the body of <code>conditional_sample</code>, the sampling loop. The trained transformer, the normalization, the observation window and the controller around the loop stay fixed. The agent decides how many denoising steps to take (at least 1 and at most 200 network calls per prediction), where to place them and how each step updates the sample. The loop must keep one contract: the entries of the plan fixed by the observations (selected by <code>condition_mask</code>) must come back unchanged, and every entry must be finite. The statement's own example:</p>
        ${code("mask")}
        <p>(<code>r == r</code> is false only for NaN.) Fixing the seed, looking up answers for known starting states or inspecting the environment is forbidden; the sampler runs in a separate process that can only ask for network evaluations and fresh random numbers.</p>` },
      { id: "judged", title: "How it is judged", html: `
        <p>A simulated robot pushes a T-shaped block into a target region (<b>Push-T</b>). Each episode runs at most 300 control steps; the controller observes 2 steps, plans 10 and executes 8 before planning again. The reward of a step is the share of the target the block covers, divided by 0.95 and capped at 1; an episode succeeds when the coverage passes 95%. Candidate and reference get the same episodes and the same diffusion seeds, three repetitions per condition, on 2 CPUs.</p>
        <p>To <b>pass</b>, on every group of episodes the sampler must match or beat the authors' 100-step sampler on mean best reward and on success rate, and be strictly faster both per prediction and for the whole run. The <b>score</b> is separate. It compares each workload with a "naive" anchor, a plain 20-step DDPM sampler measured on the same machine (<code>qn</code>, <code>ln</code>, <code>tn</code> below): quality gained over the anchor, times the worse of two speed ratios.</p>
        ${code("dpscore")}
        <p>The anchor values are ours; the real ones are measured privately. The shape is what matters: being as good as the anchor scores zero however fast the sampler is, and a slow sampler scores little however good it is. Both speed ratios must improve for the score to rise.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <div class="tablewrap"><table><tr><th>Run</th><th>Wall time, whole workload (s)</th><th>Success rate</th><th>Mean best reward</th><th>Prediction time (ms)</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>51.9</td><td>0.25</td><td>0.924</td><td>1,150</td><td>14.0</td><td></td></tr>
        <tr><td>GLM 5.3</td><td>10.8</td><td>0.25</td><td>0.94</td><td>42.5</td><td>59.8</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>11.8</td><td>0.167</td><td>0.921</td><td>60.4</td><td>57.1</td><td>${fail}</td></tr>
        <tr><td>Muse Wonder 1.0</td><td>12.9</td><td>0.333</td><td>0.935</td><td>87.2</td><td>55.4</td><td>${fail}</td></tr>
        <tr><td>Kimi K3.1 Pro</td><td>13.4</td><td>0.333</td><td>0.966</td><td>120</td><td>55.2</td><td>${fail}</td></tr>
        <tr><td>Step 5 Preview</td><td>14.2</td><td>0.417</td><td>0.966</td><td>132</td><td>54.1</td><td>${fail}</td></tr></table></div>
        <p class="meta">Means over the hidden workloads; the reference row shows medians. As of October 26, 2026. No model passed. <a href="${TASK}diffusion-policy" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>No model passed, and all sixteen scored above the human reference (14.0). Every run was much faster than the 100-step loop; what failed the pass rule was success or reward in some group of episodes. Step 5 Preview had the highest success rate of these, 0.417, and still failed. GLM 5.3 had the best final score, 59.8.</p>
        <p><b>Claude Opus 5.5</b> (57.1) called the network five times, at levels 95, 70, 45, 22 and 5, starting from Gaussian noise at the first. At each level it made a clean guess, clipped to the range the scheduler allows, and wrote the observed entries back in before each call. Between levels it took second-order DPM-Solver++ jumps along the deterministic path, measured in log signal-to-noise ratio, and corrected each landing point with the UniPC corrector, which reuses the guess just made, so the correction costs no extra call. Its last guess became the plan. At 60.4 ms against 1,150 ms, that is about 12 ms per network call for both samplers (our division).</p>
        ${callout("pitfall", "FAST IS NOT ENOUGH", "<p>The pass rule asks for reward and success at least as high in every group, and success is a coin with few tosses per group. A five-call sampler that is 19 times faster can still lose one group by one episode.</p>")}` },
    ],
    takeaways: ["One call gives the average.", "Place the calls; reuse the last guess.", "All 16 beat the score; none passed."],
  },
  {
    slug: "3-walker", nav: "Joystick walker", title: "MuJoCo Playground: A Walker That Follows a Joystick",
    subtitle: "A reward for tracking a command, and training by trial",
    abstract: "MuJoCo Playground trains a Go1 quadruped to follow joystick commands in minutes on one GPU. The reward pays for tracking the commanded speed and turn, and charges for effort. Our two-legged walker learns the same kind of policy by random search.",
    tags: ["reinforcement learning", "tracking reward", "random search", "Go1"],
    hero: "code:train", heroCaption: "Random search: try both directions, move toward the better",
    sections: [
      { id: "idea", title: "Training in a GPU simulator", html: `
        <p><em>MuJoCo Playground</em> (Zakka et al., RSS 2025) trains robot controllers in a GPU physics simulator within minutes, running thousands of simulated robots at once. One of its examples teaches a Unitree Go1 quadruped to follow joystick commands. The policy reads the robot's own sensors and the commanded forward, sideways and turning speeds, and outputs target angles for its twelve joints. It is trained by reinforcement learning (PPO) for 200 million simulation steps.</p>` },
      { id: "reward", title: "The reward", html: `
        <p>The Go1 environment pays, at every control step (50 per second), for tracking the command and charges for effort. Tracking uses a bell curve, <code>exp(−error² / 0.25)</code>, worth 1.0 for linear speed and 0.5 for turning; the action-rate penalty (−0.01 × squared change of the action) keeps motion smooth, and the energy penalty (−0.001 × |joint speed × torque|) keeps it cheap. There are more terms, for posture, feet and falls. The step reward is multiplied by the time step and clipped at zero.</p>
        <p>Our walker is a body on a plane with two legs. The average leg push sets its forward speed, the difference sets its turning speed, and the right leg is 20% weaker, which the policy must discover. Speeds follow the push with a lag of a quarter second, and the speed the robot senses is noisy. A command is resampled every 5 seconds; an episode is 1,000 steps (20 s). The policy is linear: each leg's push is a weighted sum of the two commands and the two tracking errors, eight weights in all.</p>
        ${code("walker")}
        <p>A perfect walker would earn 1.5 × 0.02 × 1,000 = 30 in our toy. Standing still earns 14.19, since commands near zero are partly met by doing nothing. The hand-made policy ignores the weak leg and the errors, and turns poorly.</p>` },
      { id: "search", title: "Learning by trial", html: `
        <p>PPO is too large for one screen. <b>Random search</b> shows the same loop in small: try the policy with small random changes to its weights, in both directions, on the same episode; move the weights toward the changes that earned more. Each iteration costs eight episodes.</p>
        ${code("train")}
        ${demo("walker", "Demo 3 · Train the walker", "press Train", "The lower panel replays the 20-second test episode with the current weights: the walker's speed (blue) against the command (dashed).")}
        <p>The learned weights feed the speed command to the right leg with weight 1.25 and to the left with 0.98, close to the 1.25 : 1 that makes up for the weaker leg, and use the tracking errors as feedback. The curve rises fast, then flattens near the ceiling: late gains are small.</p>` },
    ],
    takeaways: ["Pay for tracking, charge for effort.", "Learn by trying both directions.", "Late gains are small."],
  },
  {
    slug: "4-recipe", nav: "Same clock", title: "MuJoCo Playground: Same Clock, Better Recipe",
    subtitle: "Train within 720 seconds and beat the authors' recipe on five counts",
    abstract: "Nothing is removed: the authors' 200-million-step recipe is the bar. The agent's procedure gets the same 720 seconds on one H100. The score uses only the mean reward; a pass needs all five metrics strictly better in all 15 workloads, which no run, and not even the reference against itself, achieved.",
    tags: ["PPO", "time budget", "strict comparison", "training noise"],
    hero: "code:compare", heroCaption: "Count, per metric, the workloads won",
    sections: [
      { id: "writes", title: "What the agent writes", html: `
        <p>Here nothing is removed. The authors' training recipe is the bar: Brax PPO on the flat-ground environment with the repository's settings, 200 million environment steps, which takes about 445 to 465 seconds on one H100. The agent writes its own training procedure, <code>train(seed, deadline_seconds)</code>, which must return a policy within <b>720 seconds</b>, counted from the call and including environment building and compilation. It may change the training rewards, the command distribution, pushes and terrain, the network, the PPO settings, or the learning algorithm. The policy must be learned inside the run: shipping trained weights is forbidden, and a size check on the patch backs this up. The robot model, the observation and action interface and the whole evaluation stay fixed. The agent has three development submissions, each 20 to 40 minutes.</p>` },
      { id: "judged", title: "How it is judged", html: `
        <p>A workload is one training seed and one test condition: flat ground, flat ground with pushes, or rough terrain. The final suite trains five seeds on each side, the agent's procedure and the reference, and tests each policy in all three conditions: 15 workloads. Each test runs 2,048 robots for 1,000 steps (20 seconds) with the environment's own rewards. Five metrics are measured: episode reward, linear-speed tracking, turn tracking, energy and action rate.</p>
        <p>The score uses only the mean episode reward <code>r</code>:</p>
        ${code("pgscore")}
        <p>The reference earns close to 30, so it scores close to 50; one more unit of reward is worth less than a point. To <b>pass</b>, a policy must be strictly better than the reference trained in the same run on all five metrics in all 15 workloads, with no tolerance. The statement warns that no such submission is known: the reference, run against itself, did not meet the rule.</p>` },
      { id: "clock", title: "Using the whole clock", html: `
        <p>The reference stops after 200 million steps, with four minutes left. A procedure can instead train in short compiled chunks and stop when the next chunk would no longer finish before the deadline, with a margin. Our timings below are assumptions, not measurements: one minute of setup and compilation, then 10 million steps every 19.75 seconds, the pace at which the reference's 200 million steps end near 455 seconds.</p>
        ${code("deadline")}
        <p>In our walker, the same idea is more iterations of random search in the same clock. We compare a 20-iteration recipe (the "reference") with a 32-iteration one, both trained from seeds 1, 2 and 3, each tested on flat ground and with pushes.</p>
        ${code("compare")}
        ${predict("The 32-iteration walker earns more reward in all six workloads. Will it pass?", "<p>No. It tracks better by pushing harder, so its energy penalty is worse in all six workloads and its action rate in five. Every metric must be strictly better everywhere.</p>")}
        ${demo("strict", "Demo 4 · Every metric, every workload", "move the slider", "Each row is one workload; each cell compares our walker with the 20-iteration reference. At 20 the two are the same walker and win nothing: a tie is not strictly better.")}
        <p>The longer-trained walker earns more reward and tracks better in every workload, so its score rises. But it tracks better by pushing harder: it uses more energy in all six workloads, and its actions change faster in five of the six. Under a "beat it on every metric" rule, a better policy is not enough; it has to be better at no cost.</p>` },
      { id: "agents", title: "What the agents did", html: `
        <div class="tablewrap"><table><tr><th>Run</th><th>Action-rate penalty (×10⁻³)</th><th>Energy penalty</th><th>Episode reward</th><th>Turn tracking</th><th>Speed tracking</th><th>Final score</th><th></th></tr>
        <tr><td>Human reference</td><td>4.96</td><td>0.0913</td><td>29.6</td><td>467</td><td>899</td><td>49.6</td><td></td></tr>
        <tr><td>GPT-6 Astra</td><td>4.96</td><td>0.0837</td><td>30.7</td><td>474</td><td>907</td><td>50.6</td><td>${fail}</td></tr>
        <tr><td>Claude Opus 5.5</td><td>5.06</td><td>0.0885</td><td>30.1</td><td>471</td><td>906</td><td>50.1</td><td>${fail}</td></tr>
        <tr><td>Muse Wonder 1.0</td><td>5.21</td><td>0.0903</td><td>30.1</td><td>471</td><td>907</td><td>50.1</td><td>${fail}</td></tr>
        <tr><td>GPT-6.1 Sol</td><td>3.79</td><td>0.0822</td><td>29.9</td><td>471</td><td>918</td><td>49.9</td><td>${fail}</td></tr>
        <tr><td>Qwen 3.8 Max</td><td>4.6</td><td>0.0889</td><td>27.5</td><td>466</td><td>821</td><td>47.9</td><td>${fail}</td></tr></table></div>
        <p class="meta">Means over the hidden workloads; the reference row shows medians. Penalties are shown as positive numbers, so lower is better for them. As of October 26, 2026. No model passed. <a href="${TASK}mujoco-playground" target="_blank" rel="noopener">Full table ↗</a></p>
        <p>No model passed; ten scored above the human reference (49.6) and three level with it. GPT-6 Astra had the best final score, 50.6. Two runs (Gemini 4 Argon · Pi and DeepSeek V4.1 Flash 1017) scored 0.0. The spread is narrow: the reference recipe is already good.</p>
        <p><b>Claude Opus 5.5</b> (50.1) kept Brax's PPO loss, networks and observation normalizer but wrote its own training loop, collecting rollouts from 8,192 simulated robots. It trained on the authors' flat-ground environment, reward and randomization, with pushes left off. Over the last 60% of the budget, it lowered the learning rate and the entropy bonus linearly to a tenth of their starting values, so the final policy settles instead of being a snapshot of noisy updates. Its own idea was to use the deadline: it trained in short compiled chunks, timed each one, stopped when the next would not finish a safety margin before the deadline, and skipped evaluation rollouts. In its own estimate, that gave about 360 million environment steps instead of 200 million. It earned more reward and tracked better, but its action-rate penalty (5.06 × 10⁻³) was higher than the reference's (4.96 × 10⁻³): as in our walker, better tracking came with a penalty that got worse.</p>
        ${callout("pitfall", "NOISE DECIDES CLOSE RACES", "<p>Across training seeds, the reference's flat-ground reward varies by about 0.2 to 0.3, and the same seed does not reproduce exactly on a GPU. With three development submissions, each one a single noisy sample, an agent cannot tell a gain of 0.5 from luck.</p>")}` },
    ],
    takeaways: ["720 s, same as the reference.", "Score from reward; pass needs all five.", "Better tracking can cost a penalty."],
  },
  {
    slug: "5-review", nav: "Review", title: "Review and Exercises",
    subtitle: "Check yourself, then change the models",
    abstract: "A map of the lecture, five self-check questions, and five exercises on the programs from the notes.",
    tags: ["knowledge map", "self-check", "exercises"],
    hero: "toc",
    sections: [
      { id: "map", title: "Knowledge map", html: `<div class="map">
        <div class="card"><h3>Diffusion Policy</h3><ul><li>Regression averages the modes</li><li>Denoising commits step by step</li><li>5 placed calls, second order</li><li>Score: gain × speed; pass: never worse</li></ul></div>
        <div class="card"><h3>MuJoCo Playground</h3><ul><li>Reward: track the command, little effort</li><li>Train within 720 s</li><li>Score from reward; pass on all five metrics</li><li>Use the whole clock</li></ul></div></div>` },
      { id: "check", title: "Check your understanding", html: `<div data-demo="quiz"><div class="demo-body"></div></div>` },
      { id: "exercises", title: "Exercises", html: `
        <p>The exercises use the programs from the notes. Copy them from the earlier chapters and run them with Python 3.</p>
        <h3>Exercise 1 ★ (modify)</h3>
        <p>Change the demonstrations to 70% left and 30% right. What is the regression answer now, and how does the 100-call sampler split?</p>
        <h3>Exercise 2 ★ (experiment)</h3>
        <p>Run <code>ddim</code> with one call at level 50 instead of 100 (<code>[50]</code>). What do the samples look like, and why?</p>
        <details class="reveal"><summary>Solution</summary><p>470 of 1,000 land in the middle. A single guess at level 50 still blends the two modes for any sample near 0, and the start, pure noise, is treated as if it were half signal. One call is not enough at any level.</p></details>
        <h3>Exercise 3 ★★ (search)</h3>
        <p>Find three levels for <code>dpm2</code> that leave fewer than 30 of 1,000 samples in the middle. (Demo 2 runs it for you.)</p>
        <h3>Exercise 4 ★★ (modify)</h3>
        <p>Make the walker's right leg weaker still (<code>STRENGTH = (1.0, 0.6)</code>). How does the hand-made policy do, and which weights does random search change?</p>
        <h3>Exercise 5 ★ (think)</h3>
        <p>In <code>compare</code>, add a 1% tolerance for energy. Does the 32-iteration walker pass now?</p>
        <details class="reveal"><summary>Solution</summary><p>Check it: energy is not the only loss. The action rate is also worse in five of six workloads, so a tolerance on energy alone cannot make it pass.</p></details>` },
      { id: "reading", title: "Papers and further reading", html: `
        <ul><li>C. Chi et al. <em>Diffusion Policy: Visuomotor Policy Learning via Action Diffusion.</em> RSS 2023. <a href="https://arxiv.org/abs/2303.04137" target="_blank" rel="noopener">arXiv 2303.04137</a></li>
        <li>K. Zakka et al. <em>Demonstrating MuJoCo Playground.</em> RSS 2025. <a href="https://arxiv.org/abs/2502.08844" target="_blank" rel="noopener">arXiv 2502.08844</a></li>
        <li>J. Song, C. Meng, S. Ermon. <em>Denoising Diffusion Implicit Models.</em> ICLR 2021. <a href="https://arxiv.org/abs/2010.02502" target="_blank" rel="noopener">arXiv 2010.02502</a></li>
        <li>C. Lu et al. <em>DPM-Solver++: Fast Solver for Guided Sampling of Diffusion Probabilistic Models.</em> <a href="https://arxiv.org/abs/2211.01095" target="_blank" rel="noopener">arXiv 2211.01095</a></li>
        <li>Task pages: <a href="${TASK}diffusion-policy" target="_blank" rel="noopener">Diffusion Policy</a>, <a href="${TASK}mujoco-playground" target="_blank" rel="noopener">MuJoCo Playground</a></li></ul>` },
    ],
    takeaways: ["Average the right thing.", "Calls are the cost.", "Every metric, every workload."],
  },
];

const QUIZ = [
  { q: "Half the demonstrations steer left (−1) and half right (+1). What does a regression policy output?",
    opts: ["−1 or +1 at random", "About 0, straight into the obstacle", "+1, the larger value", "Whatever the last demonstration did"],
    a: 1, why: "Regression with a squared-error loss predicts the mean, about 0: an action no demonstrator took." },
  { q: "A sampler makes a single network call at full noise. What does it return?",
    opts: ["A sample from one of the two modes", "The average of the data", "Pure noise", "The last training example"],
    a: 1, why: "At full noise the input carries no information, so the best guess is the mean of the data, the regression answer." },
  { q: "Why can five well-placed calls do the work of a hundred?",
    opts: ["The network is retrained for five steps", "Deterministic jumps can skip far, few calls are wasted at levels with no signal, and a second-order step reuses the previous guess", "Five calls use a bigger network", "The robot moves five times slower"],
    a: 1, why: "DDIM-style jumps allow large strides; placement avoids the flat top of the schedule; DPM-Solver++ adds accuracy at no extra call." },
  { q: "In the MuJoCo Playground task, what decides the score, and what decides a pass?",
    opts: ["Both depend only on mean reward", "Score: mean episode reward; pass: all five metrics strictly better than the reference on all 15 workloads", "Score: training time; pass: reward above 30", "Score: energy; pass: tracking"],
    a: 1, why: "score = 100 r / (r + 30); the pass rule compares every metric on every workload with no tolerance." },
  { q: "Claude Opus 5.5's policy earned more reward and tracked better than the reference. Why did it fail?",
    opts: ["It trained past the 720-second deadline", "It shipped pretrained weights", "Its action-rate penalty was higher than the reference's", "It never tested on rough terrain"],
    a: 2, why: "5.06 × 10⁻³ against 4.96 × 10⁻³ on the task page. A metric that is worse in any workload is enough to fail." },
];
