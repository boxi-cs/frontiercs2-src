---
title: "Lecture 07: Machine Learning"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has nine Machine Learning tasks. **KV Compaction** shrinks a language model's cached
context to a tenth (ICML 2026) and is the hardest task in the benchmark. Two tasks build the data
for reinforcement learning: **RAGEN** packs multi-turn games into training batches (arXiv 2025) and
**Flow-OPD** samples an image model's own trajectories so a teacher can correct them (arXiv 2026).
Two write losses over whole populations: the **Representation Fréchet Loss** (arXiv 2026) and
**LeJEPA**'s world-model objective (arXiv 2026). **Nano World Model** samples future video frames
(arXiv 2026), **DeTok** corrupts latents to train a tokenizer (ICLR 2026), **DyT** replaces
LayerNorm with a learned tanh (CVPR 2025), and **Polar Express** orthogonalizes a matrix with a few
polynomials (ICLR 2026). For each one, these notes explain the idea, the part the task removed, how a
run is judged, and what the agents did.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library on a CPU. They show the arithmetic, not the GPU work. Every program in these notes
has been run, and every output shown is the real output.

::: instructor
**Sources.** Task pages and results: <https://frontier-cs.org/> (as of October 26, 2026). The task
statements are the public ones an agent reads. The "what the agents did" parts follow each task
page's "Solution" section, which shows one run per task; for KV Compaction we read the run's patch
on the task page, including the settings it was submitted with. There is no case study for these tasks yet. Nothing here comes from the hidden
workloads or the human reference patches.

**Numbers.** Pass counts and scores are from the 16-model leaderboard. Where we recompute a final
score from the table's means, the means are rounded, so the result can differ in the last digit.
All toy sizes (48 article keys, four Sokoban games, a 1-D generator, 2,000 latent points, 256
pixels, 16-token images, 2 × 2 schedules) are ours.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Compact one attention head by keeping keys, fitting biases for attention mass and fitting values by least squares.
2. Explain why KV Compaction's best run, 108 times faster than the reference, still failed.
3. Pack a multi-turn game into a training row with masks and a reward, and normalize rewards in a group.
4. Write a Gaussian transition with a log-probability that replay reproduces, and say where its training signal is weak.
5. Explain how a long population window lags a generator, and what SIGReg and whitening prevent.
6. Say why averaging samples raises PSNR, why light corruption suits a short run, and why a polynomial schedule beats a fixed polynomial.

# KV Compaction: attention matching

A language model that reads a long document keeps a **KV cache**: for every token, in every layer
and head, a key and a value. Later tokens attend to these keys. The cache grows with the document.
**Attention Matching** (*Fast KV Compaction via Attention Matching*, ICML 2026) shrinks it one head
at a time. It keeps a few keys, gives each kept key a bias so that together they draw the attention
the dropped keys drew, and fits new values by least squares so that attention returns the same
output for a set of sample queries. It needs no training, and it runs in seconds.

## One head, three steps

Our head has 4 template keys, which always stay, and 48 article keys, each with a value. Queries
come from one focus direction plus noise: 64 sample queries to fit with and 32 test queries to
check on. A query `q` gives key `k` the weight `e^{q·k/√d + b}`, where `b` is the key's bias (0 in a
full cache), and the output is the weighted average of the values. We measure a small cache by the
mean gap between its output and the full cache's, on the test queries.

The task's starting point keeps a random subset of article keys per head. The first step of
Attention Matching keeps the keys that draw the most attention from any sample query.

```python
from math import exp, log


class Rng:
    """Park-Miller generator: small, and exact in JavaScript too."""

    def __init__(self, seed):
        self.state = seed

    def uniform(self):
        self.state = self.state * 48271 % 2147483647
        return self.state / 2147483647

    def normal(self):
        """Close to a standard normal: the sum of 12 uniforms, minus 6."""
        s = 0.0
        for _ in range(12):
            s += self.uniform()
        return s - 6


def total(xs):
    """A plain left-to-right sum, so JavaScript gets the same digits."""
    s = 0.0
    for x in xs:
        s += x
    return s


D = 4


def make_head(seed):
    """4 template keys, 48 article keys with values, 64 sample queries, 32 test queries."""
    rng = Rng(seed)

    def vec(scale):
        return [scale * rng.normal() for _ in range(D)]

    template = [(vec(1.0), vec(1.0)) for _ in range(4)]
    article = [(vec(1.0 + (i % 7 == 0)), vec(1.0)) for i in range(48)]
    focus = vec(1.0)
    queries = [[f + x for f, x in zip(focus, vec(1.5))] for _ in range(96)]
    return template, article, queries[:64], queries[64:]


def score(q, k):
    return total(a * b for a, b in zip(q, k)) / D ** 0.5


def attend(q, keys):
    """keys: (key, bias, value) triples. The attention output, and the total weight."""
    w = [exp(score(q, k) + b) for k, b, _ in keys]
    mass = total(w)
    return [total(wi * v[i] for wi, (_, _, v) in zip(w, keys)) / mass for i in range(D)], mass


def cache(template, article, kept=None, bias=None, values=None):
    """The template keys, plus all article keys or only the kept ones."""
    kept = list(range(len(article))) if kept is None else kept
    bias = bias or [0.0] * len(kept)
    values = values or [article[j][1] for j in kept]
    return ([(k, 0.0, v) for k, v in template]
            + [(article[j][0], b, v) for j, b, v in zip(kept, bias, values)])


def error(small, template, article, queries):
    """Mean absolute gap between the small cache's output and the full cache's."""
    full = cache(template, article)
    gaps = [total(abs(x - y) for x, y in zip(attend(q, small)[0], attend(q, full)[0])) / D
            for q in queries]
    return total(gaps) / len(gaps)


def keep_random(article, t, seed):
    rng, order = Rng(seed), list(range(len(article)))
    for i in range(len(order) - 1, 0, -1):          # Fisher-Yates shuffle
        j = int(rng.uniform() * (i + 1))
        order[i], order[j] = order[j], order[i]
    return sorted(order[:t])


def keep_top(template, article, queries, t):
    """The t article keys with the highest attention share from any sample query."""
    full, best = cache(template, article), [0.0] * len(article)
    for q in queries:
        mass = attend(q, full)[1]
        for j, (k, _) in enumerate(article):
            best[j] = max(best[j], exp(score(q, k)) / mass)
    return sorted(sorted(range(len(article)), key=lambda j: -best[j])[:t])


template, article, sample, test = make_head(7)
print("kept      random  top attention")
for t in (3, 6, 12, 24):
    rand = error(cache(template, article, keep_random(article, t, 11)), template, article, test)
    top = error(cache(template, article, keep_top(template, article, sample, t)),
                template, article, test)
    print(f"{t:2} of 48  {rand:6.4f}  {top:13.4f}")
```

```{.text .output}
kept      random  top attention
 3 of 48  0.9767         0.5116
 6 of 48  0.9583         0.2762
12 of 48  0.8254         0.1910
24 of 48  0.9221         0.0376
```

Choosing keys by attention about halves the gap, or better, at every size. But the kept keys draw less
weight than the 48 keys did, so the template keys get too large a share. And each kept value stands
for itself only, not for the keys dropped near it.

The second and third steps fix both. The **bias** `β_j = log w_j` scales key `j`'s weight. The
weights `w_j ≥ 0` are fitted so that, for every sample query, the kept keys' weights add up to the
whole article's (nonnegative least squares, here by multiplicative updates). Then the **values** are
fitted by least squares: with the biased weights, the kept keys' output should match the whole
article's output, for every sample query. A small ridge (our choice) pulls them toward the original values.

```python
def fit_bias(article, kept, queries, steps=200):
    """Weights w >= 0 so that the kept keys draw the attention mass of all article keys."""
    a = [[exp(score(q, article[j][0])) for j in kept] for q in queries]
    mass = [total(exp(score(q, k)) for k, _ in article) for q in queries]
    w = [1.0] * len(kept)
    for _ in range(steps):                    # multiplicative updates keep w nonnegative
        fit = [total(x * y for x, y in zip(row, w)) for row in a]
        w = [w[j] * total(a[i][j] * mass[i] for i in range(len(a)))
             / total(a[i][j] * fit[i] for i in range(len(a))) for j in range(len(kept))]
    return [log(x) for x in w]


def solve(m, rhs):
    """Gauss-Jordan elimination: m x = rhs, for every column of rhs."""
    n = len(m)
    a = [m[i][:] + rhs[i][:] for i in range(n)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(a[r][c]))
        a[c], a[p] = a[p], a[c]
        for r in range(n):
            if r != c:
                f = a[r][c] / a[c][c]
                a[r] = [x - f * y for x, y in zip(a[r], a[c])]
    return [[x / a[i][i] for x in a[i][n:]] for i in range(n)]


def fit_values(article, kept, bias, queries, ridge=0.1):
    """New values whose attention output matches the whole article's, by least squares."""
    p = []
    for q in queries:
        w = [exp(score(q, article[j][0]) + b) for j, b in zip(kept, bias)]
        p.append([x / total(w) for x in w])
    y = [attend(q, [(k, 0.0, v) for k, v in article])[0] for q in queries]
    t = len(kept)
    gram = [[total(row[i] * row[j] for row in p) for j in range(t)] for i in range(t)]
    lam = ridge * total(gram[i][i] for i in range(t)) / t
    rhs = [[total(p[r][i] * y[r][c] for r in range(len(p))) + lam * article[kept[i]][1][c]
            for c in range(D)] for i in range(t)]
    for i in range(t):
        gram[i][i] += lam
    return solve(gram, rhs)


print("kept      top only  + bias  + bias + values")
for t in (3, 6, 12, 24):
    kept = keep_top(template, article, sample, t)
    bias = fit_bias(article, kept, sample)
    values = fit_values(article, kept, bias, sample)
    row = [error(c, template, article, test) for c in (
        cache(template, article, kept), cache(template, article, kept, bias),
        cache(template, article, kept, bias, values))]
    print(f"{t:2} of 48  {row[0]:8.4f}  {row[1]:6.4f}  {row[2]:15.4f}")
```

```{.text .output}
kept      top only  + bias  + bias + values
 3 of 48    0.5116  0.5085           0.4518
 6 of 48    0.2762  0.2175           0.1438
12 of 48    0.1910  0.1545           0.1084
24 of 48    0.0376  0.0317           0.0206
```

Each step helps on queries it was not fitted to. At 6 of 48 keys, the gap falls from 0.96 (random)
to 0.28 (chosen keys) to 0.14 (with biases and fitted values). The sample queries matter: the fit is
only as good as the questions it was fitted on.

## What the agent writes

Everything under `compaction/` is the agent's. The evaluator calls `compact(state, request)` once
per article, after its own prefill. The request holds the prompt (chat template plus article), the
article's token range and the full cache: 36 layers, each with keys and values of shape
(1, 8 heads, S tokens, 128) in bf16. The method returns, per layer, smaller keys and values and an
optional `attention_bias` per kept key. All heads of a layer keep the same number of tokens `t`,
but `t` may differ between layers. A literal `TARGET_SIZE` in (0, 0.1] sets the budget: every
template token plus that fraction of the article. The model, its decoding and the questions stay
fixed, and the method never sees the questions.

# KV Compaction: the hardest task

KV Compaction has an FDI (FrontierCS's difficulty index; see L00) of 103.0, the highest of the 48 tasks. No model passed. The best run was
more than a hundred times faster than the reference and still failed.

## How it is judged

The workload is QuALITY: long Project Gutenberg stories, each with 13 to 20 multiple-choice
questions. The model is Qwen3-4B on one H100. Each article is compacted once, and every question is
answered from the compacted cache alone, with thinking on and up to 2,048 new tokens. Final grading
uses 24 articles: the 12 public ones and 12 hidden ones.

Three measurements per article: **qa_correct**, the questions answered correctly (in final, the
lowest of three repetitions); **compaction_seconds**, the median of three wall times from handing
over the article to receiving the result; and **compact_cache_bytes**, the bytes returned.

To pass, every article must keep its correct count within `max(1, ceil(5% of its questions))` of
the reference's median, and improve one axis. At `TARGET_SIZE = 0.1` (time mode) the compaction
must be strictly faster than the reference with no more bytes. Below 0.1 (bytes mode) it must use
strictly fewer bytes and be no slower. The statement's continuous score per article is
`100 · ln S / (ln 10 + ln S)`, where `S` is the improvement on the chosen axis, and 0 when the
article fails:

```python
def article_score(s):
    """The statement's score for one article that keeps its accuracy; s = improvement ratio."""
    return 0.0 if s <= 1 else 100 * log(s) / (log(10) + log(s))


for s in (2, 10, 54700 / 505, 1000):
    print(f"S = {s:7.1f}: score {article_score(s):5.1f}")
```

```{.text .output}
S =     2.0: score  23.1
S =    10.0: score  50.0
S =   108.3: score  67.0
S =  1000.0: score  75.0
```

A tenfold gain scores 50, and the score never reaches 100. The third line uses Claude Opus 5.5's
compaction time against the reference's in its run, 505 ms against 54,700 ms. The leaderboard's
final score is the benchmark's own 0–100 measure, on which the human reference scores 60.6.

## What the agents did

| Run | Cache (MiB) | Compaction (ms) | Correct per article | Final score | |
|---|---:|---:|---:|---:|---|
| Human reference | 312 | 55,800 | 12.9 | 60.6 | |
| Claude Opus 5.5 | 268 | 505 | 13.2 | 68.2 | fail |
| Muse Wonder 1.0 | 92.7 | 386 | 12.3 | 63.7 | fail |
| DeepSeek V4.1 Flash 1017 | 272 | 637 | 12 | 62.0 | fail |
| Gemini 4 Argon · Pi | 92.9 | 738 | 12.1 | 61.9 | fail |

As of October 26, 2026. Selected rows; the full table is on the task page. Four of 16 models scored
above the human reference; none passed. Every run
with results beat the reference on time and size on all 24 articles. Accuracy decided everything:
**Claude Opus 5.5** answered more questions than the reference on average, 13.2 against 12.9, and
still fell short on 2 of the 24 articles. Muse Wonder 1.0 kept a third of the bytes and fell short
on 8.

Claude Opus 5.5's run (the task page shows its patch in full) was pure key selection:

- **Scores from the article's own queries.** It records the queries of the article's tokens during
  the prefill, rotates them as if they sat just after the article, and scores each article key by
  its mean attention from them. Custom GPU kernels compute these scores without forming the full
  matrix.
- **Spread over the article.** It divides each score by its local average, so the kept tokens are
  not all bunched in one part of the story.
- **A budget per layer.** It gives each layer between half and twice the uniform share, by where
  the scores are highest, and keeps about three times the target's article tokens (its
  `budget_scale` is 2.95) while staying below the reference's cache size.

It keeps the chosen keys with their original values and no bias. The patch also contains
self-study queries (generated with the vLLM engine) and the bias and value fitting of our toy, but
its final settings turn them off (`use_ss=False`, and the fitting runs only with self-study
queries). The best run on the hardest task chose keys well and spent the bytes on more of them.

::: pitfall
**A mean is not every article.** Opus's mean accuracy beat the reference, but a pass is decided
article by article. Two stories where the compacted cache fell more than one question below the
reference (in the worst of three repetitions) sank a run that was 108 times faster.
:::

# Reinforcement learning: building the batches

Two tasks write the part of a reinforcement-learning loop that turns what a model did into training
data. Small mistakes here do not crash anything; they quietly teach the wrong thing.

## RAGEN: games into rows

**RAGEN** (arXiv 2025) trains language models to act over many turns. The model sees a puzzle,
replies with moves, gets the next view and a reward, and so on. Training needs each game packed
into one token row, with a mask that marks what the model wrote (the loss is taken only there) and
the reward on the right token. Four games from the same start form a group, and each game's reward
is compared with its group's.

```python
import re


def parse_reply(reply, sep="||", limit=2):
    """The moves inside <answer>...</answer>, at most `limit`; none if malformed."""
    m = re.search(r"<answer>(.*?)</answer>", reply, re.S)
    if not m:
        return []
    return [a.strip() for a in m.group(1).split(sep) if a.strip()][:limit]


def pack(turns, width):
    """One game as a left-padded row of (token, mask); mask 1 marks the model's tokens."""
    row = []
    for view, reply in turns:
        row += [(w, 0) for w in view.split()] + [(w, 1) for w in reply.split()]
    return [("<pad>", 0)] * (width - len(row)) + row


def place_reward(row, reward):
    """The game's reward goes on the last token the model wrote."""
    last = max(i for i, (_, m) in enumerate(row) if m == 1)
    return [reward if i == last else 0.0 for i in range(len(row))]


def normalize(group):
    """Each game's reward minus the group mean, over the group's spread; 0 if all equal."""
    mean = total(group) / len(group)
    spread = (total((r - mean) ** 2 for r in group) / len(group)) ** 0.5
    return [0.0 if spread == 0 else (r - mean) / spread for r in group]


print(parse_reply("<think>push it</think><answer>Right || Up || Left</answer>"))
print(parse_reply("Right, Up"))
game = [("view: P B . G", "<answer> Right </answer>"), ("view: . P B G", "<answer> Right </answer>")]
row = pack(game, 20)
print("mask  ", [m for _, m in row])
print("reward", place_reward(row, 10.8)[-4:])
print([round(a, 3) for a in normalize([10.8, -0.3, -0.3, -0.2])])
print(normalize([-0.3, -0.3, -0.3, -0.3]))
```

```{.text .output}
['Right', 'Up']
[]
mask   [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1]
reward [0.0, 0.0, 0.0, 10.8]
[1.732, -0.584, -0.584, -0.563]
[0.0, 0.0, 0.0, 0.0]
```

The reward values are ours. The solved game stands out in its group; a group whose games all
failed the same way teaches nothing, so its advantages are all 0.

**What the agent writes.** The task removes the context manager: building each prompt from the
real history, parsing replies, packing rows with masks, placing and normalizing rewards, and
keeping each group together. The judge checks the batch's provenance exactly: every executed move
must come from the model's own text for that turn, and prompts may keep all past turns or a recent
suffix, but never invented or rewritten ones.

**How it is judged.** One PPO training step on Sokoban with Qwen2.5-0.5B-Instruct: six groups of four
games, three model turns of at most 96 tokens each. The score rewards solved games `s` and average
reward `r` per group:

```python
def ragen_score(s, r):
    """Per-group success s and reward r, as the statement's formula (on the table's means)."""
    q = min(1.0, max(0.0, (r + 1) / 12))
    return min(100.0, max(0.0, 10 + 60 * s + 30 * q))


print(f"reference {ragen_score(0.0, -0.325):.2f}, Claude Opus 5.5 {ragen_score(0.0833, 0.383):.2f}")
```

```{.text .output}
reference 11.69, Claude Opus 5.5 18.46
```

These match the leaderboard's 11.7 and 18.5. Each of the 3 graded workloads is one such run of six
groups. To pass, every group must beat the reference on **both** success rate and reward, strictly.

**What the agents did.** No model passed; the best final score is 18.5, shared by Claude Opus 5.5
and GPT-6.1 Sol, against the reference's 11.7. Both solved some games (success 0.0833) and beat the
reference on 1 of 3 workloads. The reference solved none, so a pass needs a solved game in every
group from a 0.5B model in three turns. Opus's own idea: the small model copies whatever earlier
answer it sees, broken ones included, so its prompt keeps the previous turn only when that turn
produced valid moves. In its own offline runs this raised well-formed later answers from about 45%
to 75%, and solved games from 5.5% to 9.6%.

## Flow-OPD: a step that replays

**Flow-OPD** (arXiv 2026) teaches Stable Diffusion 3.5 Medium to render the words a prompt quotes. A
flow-matching model makes an image by moving noise through a chain of latent states. The student
draws its own chains, and a teacher tuned for text supervises each step: **on-policy distillation**.
Each step is a Gaussian: the student's velocity sets its mean, and noise sets its spread. The
trainer replays every recorded step later, so the step must give the same mean and log-probability
again, and the log-probability must have a gradient through the velocity.

```python
from math import pi

SIGMAS = [1 - i / 10 for i in range(11)]       # ours: ten even steps from noise (1) to image (0)


def noise_scale(sigma, noise_level=0.7, cap=None):
    """Flow-GRPO's noise for a step from sigma (at sigma = 1 it borrows the next level)."""
    s = sigma if sigma < 1 else SIGMAS[1]
    scale = noise_level * (s / (1 - s)) ** 0.5
    return scale if cap is None else min(scale, cap)


def sde_step(x, v, sigma, sigma_next, z=None, prev=None, cap=None):
    """One reverse-SDE step: draw the next state from noise z, or score a given prev."""
    dt = sigma_next - sigma
    a = noise_scale(sigma, cap=cap)
    mean = [xi + (vi + a * a / (2 * sigma) * (xi + (1 - sigma) * vi)) * dt
            for xi, vi in zip(x, v)]
    std = a * (-dt) ** 0.5
    nxt = prev if prev is not None else [m + std * zi for m, zi in zip(mean, z)]
    lp = total(-0.5 * ((n - m) / std) ** 2 - log(std) - 0.5 * log(2 * pi)
               for n, m in zip(nxt, mean))
    return nxt, lp / len(x), mean


x, v, z = [0.3, -1.2, 0.8], [0.5, 0.1, -0.4], [0.2, -0.7, 1.1]
nxt, lp, _ = sde_step(x, v, 0.5, 0.4, z=z)
print("sampled", [round(n, 4) for n in nxt], "log-prob", round(lp, 4))
print("replay                           log-prob", round(sde_step(x, v, 0.5, 0.4, prev=nxt)[1], 4))
```

```{.text .output}
sampled [0.2673, -1.3086, 1.0541] log-prob 0.299
replay                           log-prob 0.299
```

How much can one step teach? If the teacher's velocity differs from the student's by 1, the two
step Gaussians differ by a KL divergence that we can compute per step. Near pure noise the spread is
wide, so a step says little about the velocity:

```python
def signal(sigma, sigma_next, cap=None):
    """KL between two step Gaussians whose velocities differ by 1, per latent element."""
    dt = sigma_next - sigma
    a = noise_scale(sigma, cap=cap)
    shift = (1 + a * a * (1 - sigma) / (2 * sigma)) * dt
    return shift ** 2 / (2 * a * a * -dt)


print("step  sigma  noise  signal  | noise capped at 0.7: signal")
for i in range(10):
    s, n = SIGMAS[i], SIGMAS[i + 1]
    print(f"{i + 1:4}  {s:5.1f}  {noise_scale(s):5.2f}  {signal(s, n):6.3f}  |"
          f"  {signal(s, n, cap=0.7):26.3f}")
```

```{.text .output}
step  sigma  noise  signal  | noise capped at 0.7: signal
   1    1.0   2.10   0.011  |                       0.102
   2    0.9   2.10   0.018  |                       0.108
   3    0.8   1.40   0.040  |                       0.115
   4    0.7   1.07   0.068  |                       0.125
   5    0.6   0.86   0.105  |                       0.138
   6    0.5   0.70   0.158  |                       0.158
   7    0.4   0.57   0.237  |                       0.237
   8    0.3   0.46   0.369  |                       0.369
   9    0.2   0.35   0.633  |                       0.633
  10    0.1   0.23   1.423  |                       1.423
```

In our schedule the first step carries about 130 times less signal than the last. Capping the noise
raises the early steps' share.

**What the agent writes.** The task removes the trajectory sampler `pipeline_with_logprob` and the
step `sde_step_with_logprob`. The sampler runs the student from noise and returns the images, all
11 states and the 10 log-probabilities; the step returns the next state, its log-probability (the
mean over latent elements of the Gaussian log-density, as in our toy), the mean and the noise
coefficient. Replay must match within an absolute tolerance of about 1.9 × 10⁻⁶.

**How it is judged.** Eight optimizer updates of the student, then held-out prompts rendered in 40
steps without noise, read by OCR. A workload's reward is `1 − d / len(t)`, where `d` is the edit
distance between the target text `t` and what OCR read (0 if the target appears inside it):

```python
def ocr_reward(target, read):
    t, s = target.lower().replace(" ", ""), read.lower().replace(" ", "")
    if t in s:
        return 1.0
    prev = list(range(len(s) + 1))                 # Levenshtein distance, row by row
    for i, a in enumerate(t, 1):
        cur = [i]
        for j, b in enumerate(s, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a != b)))
        prev = cur
    return 1 - min(prev[-1], len(t)) / len(t)


for read in ("TAKE WITH FOOD", "Take Wth Food", "Tke Wih Fod", "Pizza"):
    print(f"{read!r:16} {ocr_reward('Take With Food', read):.3f}")
```

```{.text .output}
'TAKE WITH FOOD' 1.000
'Take Wth Food'  0.917
'Tke Wih Fod'    0.750
'Pizza'          0.083
```

The score is 100 times the mean reward. To pass, each of the 8 hidden workloads must score strictly
higher than the reference, unless both are already perfect.

**What the agents did.**

| Run | OCR reward | Workloads won | Final score | |
|---|---:|---:|---:|---|
| Human reference | 0.618 | | 61.8 | |
| GLM 5.3 | 0.861 | 6 of 8 | 86.1 | fail |
| Step 5 Preview | 0.855 | 7 of 8 | 85.5 | fail |
| Kimi K3 | 0.751 | 5 of 8 | 75.1 | fail |
| Claude Opus 5.5 | 0.559 | 2 of 8 | 55.9 | fail |

As of October 26, 2026. Selected rows; the full table is on the task page. No model passed; 10 of
16 scored above the human reference. The task
page describes Claude Opus 5.5's run (55.9, 2 of 8): one guided model call per step, a reverse-SDE
Gaussian step with the log-probability in double precision, a two-step DPM-Solver++ for the
noiseless evaluation images, and, its own idea, the capped early noise of our second toy. In its
own analysis, the uncapped early steps carry hundreds of times less signal than the last.

# Losses over whole populations

Two tasks write a loss that looks at many samples at once: their mean, their covariance, their
distribution. The hard part is to measure a population while the gradient reaches only the current
batch.

## Representation Fréchet Loss: a queue that keeps gradients

The **Fréchet distance** compares two sets of images by the mean and covariance of their features;
FID is the Fréchet distance in Inception features. *Representation Fréchet Loss for Visual
Generation* (arXiv 2026) turns it into a training loss for image generators. The statistics must
cover many generated images, but only the current batch has a computation graph. So a **feature
queue** keeps past features, or running sums of them, without gradients, and mixes in each new batch
with its gradient.

Our generator has one feature, `x = m + s·z`, and the target is a standard normal, so the Fréchet
distance is `(μ − 0)² + (σ − 1)²`. A ring buffer of `window` past features is the population. The
gradient flows into the batch's rows only. We scale each step by `window / batch`, so every window
takes steps of the same size and only the lag differs.

```python
def train(window, steps=160, batch=8, rate=0.05, seed=3):
    """Generator x = m + s z; a ring buffer of `window` past features is the population."""
    rng = Rng(seed)
    m, s = 1.0, 0.5
    ring = [m + s * rng.normal() for _ in range(window)]       # warm start
    head, path = 0, []
    for _ in range(steps):
        z = [rng.normal() for _ in range(batch)]
        x = [m + s * zi for zi in z]
        pop = [ring[(head + i) % window] for i in range(batch, window)] + x   # stored, then new
        n = len(pop)
        mu = total(pop) / n
        sd = (total((p - mu) ** 2 for p in pop) / n) ** 0.5
        gm = gs = 0.0
        for xi, zi in zip(x, z):                   # the gradient reaches the new rows only
            g = (2 * mu + 2 * (sd - 1.0) * (xi - mu) / sd) / n
            gm, gs = gm + g, gs + g * zi
        m, s = m - rate * n / batch * gm, s - rate * n / batch * gs
        for i in range(batch):                     # the batch, detached, replaces the oldest rows
            ring[(head + i) % window] = x[i]
        head = (head + batch) % window
        path.append((m, s))
    return path


print("window  lowest m  distance, last 80 steps")
for window in (16, 64, 256, 512):
    path = train(window)
    late = total(m * m + (s - 1) ** 2 for m, s in path[80:]) / 80
    print(f"{window:6}  {min(m for m, _ in path):8.3f}  {late:23.4f}")
```

```{.text .output}
window  lowest m  distance, last 80 steps
    16    -0.190                   0.0114
    64    -0.222                   0.0142
   256    -0.962                   0.0250
   512    -1.641                   1.4733
```

The target mean is 0. With a long window the population mean lags the generator: it still sees the
old features, keeps pushing, and the generator overshoots (to −1.64 with 512 features). A short
window tracks the generator but estimates the statistics from few samples.

**What the agent writes.** The bodies of `FeatureQueue`: `build_feats_stats(new)` returns a mean
and covariance that are differentiable in the new batch; `build_feats_snapshot(new)` returns the
stored rows with the new ones in front; `enqueue(new)` updates the state without keeping a graph;
and the state must save and load with the model. Three modes: a plain ring buffer, a ring with
running sums, and moving averages (EMA).

**How it is judged.** Each workload post-trains the authors' pMF-B generator (128 or 512 updates)
from a 50,000-image warm start, then scores fresh images in six feature spaces: Inception, ConvNeXt,
DINOv2, MAE, SigLIP and CLIP. Each distance is divided by a published constant (`FDr`), and
`score = 100 / (1 + mean FDr)`. To pass, all six must be strictly lower than the reference's on
every one of three workloads.

```python
TABLE = {"Human reference": [26.3, 5.01, 14.6, 7.71, 56.8, 39.8],
         "Claude Opus 5.5": [20.2, 3.79, 12.4, 6.45, 9.88, 25.1]}  # CLIP, ConvNeXt, DINOv2, ...
for run, fdr in TABLE.items():
    print(f"{run}: score {100 / (1 + total(fdr) / 6):.2f}")
```

```{.text .output}
Human reference: score 3.84
Claude Opus 5.5: score 7.16
```

These match the leaderboard's 3.8 and 7.2, computed from the table's rounded means.

**What the agents did.** No model passed; 9 of 16 scored above the reference. **Claude Opus 5.5**
had the best final score, 7.2. It beat the reference in Inception and MAE space on all 3 workloads,
and in the other four spaces on 2 of 3. Its queue forms every statistic in 64-bit floats: in single precision, its comments say,
the covariance of a 50,000-row population loses its small eigenvalues. Its own idea is our toy's
lesson: a long window lags the generator, which then overshoots, so it replaces it with an
exponential window, started from the warm start and holding about 1.5 times as many features as
the feature dimension.

## LeJEPA: recover the state, up to a rotation

**LeJEPA** trains an encoder without labels: two noisy views of one hidden state should give
matching outputs. Alone, that is easy to cheat: map everything to one point. A regularizer,
**SIGReg**, pushes the outputs toward a standard Gaussian so they cannot collapse. *When Does LeJEPA
Learn a World Model?* (arXiv 2026) asks when this recovers the hidden state, up to a rotation.

The task's world: a 2-D Gaussian state `z`, two views `0.95 z + 0.31 η`, and an observation that
turns each view by π times its distance from the origin, a spiral. Our model scores four fixed
encoders by the two losses and by the task's recovery measures: affine fits in both directions
(R²) and how far the fitted map `A` is from a rotation (`‖AᵀA − I‖ / √2`).

```python
from math import cos, sin


def rotate(p, angle):
    c, s = cos(angle), sin(angle)
    return [c * p[0] - s * p[1], s * p[0] + c * p[1]]


def spiral(p):
    """The task's world: turn each point by pi times its distance from the origin."""
    return rotate(p, pi * (p[0] ** 2 + p[1] ** 2) ** 0.5)


def make_world(seed, n=2000, rho=0.95):
    rng = Rng(seed)
    z = [[rng.normal(), rng.normal()] for _ in range(n)]
    c = (1 - rho * rho) ** 0.5
    views = [[[rho * a + c * rng.normal() for a in p] for p in z] for _ in range(2)]
    return z, views


def affine_fit(xs, ys):
    """Least squares y = A x + b. Returns A and R squared."""
    rows = [[x[0], x[1], 1.0] for x in xs]
    gram = [[total(r[i] * r[j] for r in rows) for j in range(3)] for i in range(3)]
    rhs = [[total(r[i] * y[c] for r, y in zip(rows, ys)) for c in range(2)] for i in range(3)]
    w = solve(gram, rhs)
    mean = [total(y[c] for y in ys) / len(ys) for c in range(2)]
    err = total((y[c] - r[0] * w[0][c] - r[1] * w[1][c] - w[2][c]) ** 2
                for r, y in zip(rows, ys) for c in range(2))
    tot = total((y[c] - mean[c]) ** 2 for y in ys for c in range(2))
    return [[w[0][0], w[1][0]], [w[0][1], w[1][1]]], 1 - err / tot


def recovery(z, h):
    """R squared both ways, distance from a rotation, and the task's quality Q (max 90)."""
    a, r2_zh = affine_fit(z, h)
    r2_hz = affine_fit(h, z)[1]
    ata = [[a[0][i] * a[0][j] + a[1][i] * a[1][j] for j in range(2)] for i in range(2)]
    orth = total((ata[i][j] - (i == j)) ** 2 for i in range(2) for j in range(2)) ** 0.5 / 2 ** 0.5
    clip = lambda v: min(1.0, max(0.0, v))  # noqa: E731
    return r2_zh, r2_hz, orth, 35 * clip(r2_zh) + 35 * clip(r2_hz) + 20 * clip(1 - orth)


def losses(h0, h1):
    """Alignment: the gap between the views. Whitening: distance of mean and covariance from N(0, I)."""
    n = len(h0)
    align = total((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 for a, b in zip(h0, h1)) / n
    mean = [total(h[c] for h in h0) / n for c in range(2)]
    cov = [[total((h[i] - mean[i]) * (h[j] - mean[j]) for h in h0) / n for j in range(2)]
           for i in range(2)]
    white = mean[0] ** 2 + mean[1] ** 2 + total((cov[i][j] - (i == j)) ** 2
                                                for i in range(2) for j in range(2))
    return align, white


z, views = make_world(1)
ENCODERS = {"rotation": lambda p: rotate(p, 0.8),
            "3 x rotation": lambda p: [3 * c for c in rotate(p, 0.8)],
            "0.01 x rotation": lambda p: [0.01 * c for c in rotate(p, 0.8)],
            "the spiral x": spiral}
print("encoder          align  whiten  R2 z->h  h->z  orth     Q")
for name, enc in ENCODERS.items():
    align, white = losses([enc(p) for p in views[0]], [enc(p) for p in views[1]])
    r2_zh, r2_hz, orth, q = recovery(z, [enc(p) for p in z])
    print(f"{name:15} {align:6.3f}  {white:6.3f}  {r2_zh:7.3f}  {r2_hz:4.3f}  {orth:4.2f}  {q:4.1f}")
```

```{.text .output}
encoder          align  whiten  R2 z->h  h->z  orth     Q
rotation         0.401   0.005    1.000  1.000  0.00  90.0
3 x rotation     3.608  126.168    1.000  1.000  8.00  70.0
0.01 x rotation  0.000   2.000    1.000  1.000  1.00  70.0
the spiral x     2.499   0.004    0.012  0.012  0.99   1.1
```

Alignment alone prefers the collapsed encoder (0.000). Whitening rules out collapse and the wrong
scale. The spiral itself is perfectly Gaussian, but its views are far apart, and a linear map
recovers almost nothing from it (R² 0.012). Only the rotation is good on both losses, and it is
what the task rewards: R² near 1 both ways and an orthogonal map.

**What the agent writes.** The loss bodies in `losses.py`: alignment between the two views, SIGReg
and whitening (InfoNCE too, though the scored path does not call it). No loss may keep state between
calls. The encoder, optimizer, data and metrics stay fixed.

**How it is judged.** Three seeded runs of 1,001 updates on fresh batches of 256. The score is the
mean of `Q` (our toy's formula, up to 90) plus a time bonus, `5 · T_ref / T`, capped at 10 (5
points at equal speed). To pass,
each run must beat the reference on six measures: R² in both directions, orthogonality error,
covariance deviation `ε = ‖Cov h − I‖`, the alignment gap `δ`, and the error after the best
rotation.

**What the agents did.** 3 of 16 models passed and 15 scored above the reference (86.4): GPT-6
Astra and Gemini 4 Argon · Antigravity, both with the best final score, 99.5, and Claude Opus 5.5
with 99.4. DeepSeek V4.1 Flash also scored 99.5 but failed. The measure that separated runs was the
alignment gap `δ`: DeepSeek V4.1 Flash and Gemini 4 Argon · Pi beat the reference's 0.00602 on 2 of
3 seeds, and the other runs that failed on 1 or none. Opus measured alignment in the metric of the batch covariance (the gap between whitened views), so
it cannot trade scale against alignment. Its SIGReg has three parts: a moment penalty from two
independent half-batches, an Epps–Pulley test along eight fixed directions, and a radial-tail test.
Its own idea: a small InfoNCE term whose critic is the exact Gaussian log-density of one view given
the other.

# Nano World Model: the one pass

A **world model** is a learned simulator: given a frame and a list of actions, it predicts the
frames that follow. **NanoWM** (*Nano World Models*, arXiv 2026) uses a diffusion model on
compressed images. Each future frame starts as noise, which the model removes step by step, guided
by the actions. Each frame has its own noise level, so some frames can finish before others.

## One rule for three schedules

The sampler decides, row by row, each future frame's noise level (1 is pure noise, 0 is clean).
One rule covers the common schedules: frame `f` starts `lag · f` rows late.

```python
from math import log10


def schedule(frames, steps, lag):
    """Each future frame's noise level, row by row; frame f starts lag * f rows late."""
    return [[min(1.0, max(0.0, 1 - (r - lag * f) / steps)) for f in range(frames)]
            for r in range(steps + lag * (frames - 1) + 1)]


for name, lag in [("together", 0), ("pyramid", 1), ("sequential", 2)]:
    print(f"{name:10}", " ".join("/".join(f"{x:g}" for x in row) for row in schedule(3, 2, lag)))
```

```{.text .output}
together   1/1/1 0.5/0.5/0.5 0/0/0
pyramid    1/1/1 0.5/1/1 0/0.5/1 0/0/0.5 0/0/0
sequential 1/1/1 0.5/1/1 0/1/1 0/0.5/1 0/0/1 0/0/0.5 0/0/0
```

With a lag of the whole schedule, frame 1 finishes before frame 2 starts: the **sequential** mode
the task uses, with 250 steps. The real context frame stays at a low noise level, 0.02, to keep the
history steady.

**What the agent writes.** The sampler, its schedule utilities, the DDIM transition and the sampling
hooks. For each clip it gets the encoded first frame and 20 actions and returns a latent video of
shape (1, 4, 4, 32, 32). The trained NanoWM-B/2 model and the image encoder and decoder stay fixed.

**How it is judged.** Each clip is a point moving through a simulated maze; the three future frames
are compared with the recorded ones by PSNR, SSIM and LPIPS. Each measure is mapped to [0, 1]
(PSNR from 20 to 50 dB, SSIM from 0.8 to 1, LPIPS from 0.25 to 0), averaged and scaled to 100.
The score averages only the suite's two original clips, while the pass rule checks all six. To
pass, on all six graded clips PSNR and SSIM must be strictly higher and LPIPS strictly lower than
the reference's.

## Sixteen samples, averaged

A diffusion sample is random. Part of its error is shared by every sample (what the model gets
wrong), and part differs from sample to sample. Averaging cancels the second part. Our "frame" has
256 pixels; each sample adds a shared error and its own noise:

```python
def psnr(a, b):
    mse = total((x - y) ** 2 for x, y in zip(a, b)) / len(a)
    return 10 * log10(1 / mse)


rng = Rng(9)
truth = [rng.uniform() for _ in range(256)]
shared = [0.02 * rng.normal() for _ in truth]          # the same in every sample
samples = [[t + e + 0.08 * rng.normal() for t, e in zip(truth, shared)] for _ in range(16)]
for n in (1, 2, 4, 8, 16):
    mean = [total(smp[i] for smp in samples[:n]) / n for i in range(len(truth))]
    p = psnr(mean, truth)
    print(f"average of {n:2} samples: PSNR {p:5.2f} dB, PSNR term {min(1, max(0, (p - 20) / 30)):.3f}")
```

```{.text .output}
average of  1 samples: PSNR 21.69 dB, PSNR term 0.056
average of  2 samples: PSNR 24.80 dB, PSNR term 0.160
average of  4 samples: PSNR 27.07 dB, PSNR term 0.236
average of  8 samples: PSNR 29.79 dB, PSNR term 0.326
average of 16 samples: PSNR 31.50 dB, PSNR term 0.383
```

Each doubling gains less, because the shared error stays. The average is also blurrier than any
one sample, which PSNR rewards; a perceptual measure like LPIPS may not.

## What the agents did

| Run | LPIPS | PSNR (dB) | SSIM | Final score | |
|---|---:|---:|---:|---:|---|
| Human reference | 0.0198 | 36.6 | 0.9837 | 79.1 | |
| Claude Opus 5.5 | 0.0171 | 38.4 | 0.9856 | 81.4 | pass |
| GPT-6 Astra | 0.0179 | 38.3 | 0.9852 | 81.2 | fail |
| GPT-6.1 Sol | 0.0192 | 38.1 | 0.9850 | 81.1 | fail |
| Kimi K3 | 0.0176 | 38.2 | 0.9853 | 80.9 | fail |

As of October 26, 2026. Selected rows; the full table is on the task page. 13 of 16 models scored
above the reference, and only **Claude Opus 5.5**
passed. Most runs beat the reference's PSNR on all six clips; LPIPS decided the passes. GPT-6
Astra, Kimi K3 and GLM 5.3 each lost only LPIPS, on 1 of 6 clips.

Opus wrote one rule for all schedules (our first toy), a per-frame DDIM update that estimates every
clean frame from the model's output, and a lightly noised history. Its own idea is our second toy:
for each clip it runs 16 independent samplers of 50 steps and averages their latent videos. It then
re-noises the average slightly and denoises it once more, frame by frame, in 10 steps, so the result
leans toward what most samples agree on and is sharp again.

::: pattern
**Spend the budget on agreement.** Sixteen short samplers instead of one long one: the average
removes what samples disagree on, and a short final denoise restores detail.
:::

# Short runs: DeTok and DyT

Two tasks train a model briefly and score it. In both, a short run left little room to win on
quality, and speed decided most scores.

## DeTok: how much to corrupt

An image tokenizer turns a photo into latent tokens and decodes them back. **DeTok** (*Latent
Denoising Makes Good Tokenizers*, ICLR 2026) trains the tokenizer as a denoiser: it hides many image
patches and mixes noise into the latents (`(1 − τ) x + τ γ ε`), and the decoder must still rebuild
the clean image. The paper's aim is a tokenizer that a generative model can use well.

Our tokenizer's "images" are 16 smooth tokens. Our decoder rebuilds each token from itself, its
neighbors, a hidden flag and a constant, fitted by least squares on corrupted copies. We test it on
clean tokens, as the task does, and on noisy ones.

```python
from math import sin

T = 16


def make_images(seed, n):
    """16 smooth tokens per image: two waves with random phases, around 0.5."""
    rng = Rng(seed)
    out = []
    for _ in range(n):
        p, q = 2 * pi * rng.uniform(), 2 * pi * rng.uniform()
        out.append([0.5 + 0.3 * sin(2 * pi * i / T + p) + 0.1 * sin(6 * pi * i / T + q)
                    for i in range(T)])
    return out


def corrupt(x, rng, mask_max, tau_lo, tau_hi, gamma=3.0):
    """Hide a random share of tokens (up to mask_max), then mix noise into the others."""
    ratio, tau = mask_max * rng.uniform(), tau_lo + (tau_hi - tau_lo) * rng.uniform()
    z, hidden = [], []
    for xi in x:
        h = rng.uniform() < ratio
        hidden.append(1.0 if h else 0.0)
        z.append(0.0 if h else (1 - tau) * xi + tau * gamma * rng.normal())
    return z, hidden


def features(z, hidden, i):
    left, right = z[max(i - 1, 0)], z[min(i + 1, T - 1)]
    return [z[i], (left + right) / 2, hidden[i], 1.0]


def train_decoder(images, rng, policy):
    rows, ys = [], []
    for x in images:
        for _ in range(4):
            z, hidden = corrupt(x, rng, *policy)
            rows += [features(z, hidden, i) for i in range(T)]
            ys += x
    gram = [[total(r[a] * r[b] for r in rows) + 1e-6 * (a == b) for b in range(4)] for a in range(4)]
    rhs = [[total(r[a] * y for r, y in zip(rows, ys))] for a in range(4)]
    return [w[0] for w in solve(gram, rhs)]


def test_error(w, images, rng, tau):
    """Mean squared error (x 1000) on latents with noise weight tau; nothing hidden."""
    errs = []
    for x in images:
        z = [(1 - tau) * xi + tau * 3.0 * rng.normal() for xi in x]
        errs += [(total(a * b for a, b in zip(w, features(z, [0.0] * T, i))) - x[i]) ** 2
                 for i in range(T)]
    return 1000 * total(errs) / len(errs)


train, test = make_images(1, 100), make_images(2, 50)
POLICIES = {"no corruption": (0.0, 0.0, 0.0), "paper-like": (0.7, 0.0, 1.0),
            "light (Opus-like)": (0.07, 0.005, 0.05)}
print("policy             clean error  noisy-latent error")
for name, policy in POLICIES.items():
    w = train_decoder(train, Rng(5), policy)
    print(f"{name:18} {test_error(w, test, Rng(6), 0.0):11.3f}  {test_error(w, test, Rng(6), 0.2):18.3f}")
```

```{.text .output}
policy             clean error  noisy-latent error
no corruption            0.000             359.921
paper-like              48.371              48.609
light (Opus-like)        0.944             161.568
```

In our model, heavy corruption buys robustness to noisy latents but costs clean accuracy, and light
corruption keeps almost all of it. The task's reconstructions are clean.

**What the agent writes.** The corruption, in training only: which patches to hide, how to add
noise to the latents, and what fills each hidden position so the decoder gets a full sequence in
order. Skipping the corruption altogether is invalid; it is part of the contract.

**How it is judged.** Each workload continues training on 64 photos for one epoch: 16 AdamW updates
at learning rate 10⁻⁶. Then it reconstructs 64 others, with the model and with an average of its
weights (EMA), scored by PSNR. `score = 70 · (O + E) / 80 + 30 · mean(T_r / T_c)`, from the two
PSNRs and the time ratio. To pass, both PSNRs must be strictly higher and the whole process strictly
faster than the reference's, on each of three workloads.

**What the agents did.** 3 of 16 models passed. Gemini 4 Argon · Pi had the best final score, 78.3,
with 27 dB on both PSNRs against the reference's 24.4 and 24.5, and 46.9 s against 50.3 s; its
method is not described on the task page. With 16 updates at learning rate 10⁻⁶, most runs ended
at the reference's 24.4 and 24.5 dB, so wall time decided most scores. Claude Opus 5.5 (75.5) is one
of them: the same PSNRs, a pass on time (47.5 s), and a miss on the EMA PSNR of 1 of 3 workloads.
The page describes its run: it hides at most a tenth of the configured share of patches,
mixes in noise with a weight between 0.5% and 5%, and appends the learned mask token at hidden
positions before undoing the shuffle. Its own idea is where its score came from, time: building the model draws
about 343 million random numbers one at a time, and it reproduces the same stream faster with
Mersenne Twister jump-ahead, bit for bit.

## DyT: a learned tanh instead of LayerNorm

Transformers normalize activations with LayerNorm, which computes a mean and a variance over each
token's features. *Transformers without Normalization* (CVPR 2025) replaces it with one
element-wise function, **DyT**: `γ · tanh(α x) + β`, with a learned scalar `α` and learned
per-channel `γ` and `β`. The paper observed that trained LayerNorms map inputs to outputs along an
S-shaped curve much like tanh: linear in the middle, squashing the extremes.

```python
from math import tanh


def layer_norm(x, eps=1e-6):
    mean = total(x) / len(x)
    var = total((v - mean) ** 2 for v in x) / len(x)
    return [(v - mean) / (var + eps) ** 0.5 for v in x]


def dyt(x, alpha=0.5, gamma=1.0, beta=0.0):
    return [gamma * tanh(alpha * v) + beta for v in x]


token = [0.2, -0.5, 1.0, 0.3, 8.0]                  # one feature is an outlier
print("LayerNorm", [round(v, 3) for v in layer_norm(token)])
print("DyT      ", [round(v, 3) for v in dyt(token)])
```

```{.text .output}
LayerNorm [-0.51, -0.733, -0.255, -0.478, 1.977]
DyT       [0.1, -0.245, 0.462, 0.149, 0.999]
```

LayerNorm uses the outlier to rescale every feature; DyT treats each feature alone and caps the
outlier at `γ`. With no statistics to compute, DyT can be faster.

**What the agent writes.** The DyT layer, with its own `α`, `γ` and `β` at every site, and the
conversion that replaces every LayerNorm in the model. Outputs, gradients and optimizer updates must
match the authors' layer closely.

**How it is judged.** A ViT-Base classifier trained briefly from scratch on 20 flower photos of five
kinds, three workloads. The score is `0.6 · quality + 0.4 · latency`, where quality is
`50 + 2 (A − A*)` for top-1 accuracy and latency is `50 + 200 log₂(T* / T)` for the training step,
each clamped to [0, 100]. To pass, accuracy must be at least the reference's, and training and
inference strictly faster.

```python
from math import log2


def dyt_score(acc, ref_acc, t, ref_t):
    quality = min(100.0, max(0.0, 50 + 2 * (acc - ref_acc)))
    latency = min(100.0, max(0.0, 50 + 200 * log2(ref_t / t)))
    return 0.6 * quality + 0.4 * latency


for t in (30.8, 28.0, 25.9, 17.9):
    print(f"training step {t:4.1f} ms against 30.8 ms: score {dyt_score(20, 20, t, 30.8):.1f}")
```

```{.text .output}
training step 30.8 ms against 30.8 ms: score 50.0
training step 28.0 ms against 30.8 ms: score 61.0
training step 25.9 ms against 30.8 ms: score 70.0
training step 17.9 ms against 30.8 ms: score 70.0
```

At equal accuracy the score stops at 70 once the step is about 1.19 times faster. Top-1 accuracy
was 20% for the reference and for most runs: with 20 photos and a short run, the classifiers are at
chance for five classes. So the race was on speed.

**What the agents did.** 3 of 16 models passed: Gemini 4 Argon · Antigravity and Gemini 4 Argon ·
Pi, with the ceiling score of 70.0, and Claude Opus 5.5, with 69.6. GPT-6 Astra also scored 70.0
but failed: its inference was slower than the reference's on 1 of the 3 workloads. Opus's patch fuses the forward and the backward pass of DyT into one small kernel each, and
rounds every multiply and add as the plain formula does, so outputs and gradients match the
reference's layer bit for bit. Its own idea: record the converted block stack's kernels once into
CUDA graphs and replay them, which removes the cost of launching hundreds of small kernels.

::: pitfall
**The top score can fail.** GPT-6 Astra tied for DyT's top score, 70.0, and failed: the score
counts only the training step, but the pass rule also checks inference time on every workload.
:::

# Polar Express: the easiest task

A matrix's **polar factor** keeps its singular vectors but sets every singular value to 1. The Muon
optimizer needs it at every step, where an SVD is too slow. An odd polynomial `p(x) = a x + b x³ +
c x⁵` applied to a matrix (`a X + b X Xᵀ X + …`) acts on each singular value separately, using
matrix products only. So the question is scalar: which polynomials push every value in `[l, 1]`
toward 1, fastest? **Polar Express** (ICLR 2026) chooses each step's polynomial as the best one,
in the worst case, for the interval the previous steps leave.

## A schedule beats a fixed polynomial

The classical Newton–Schulz iteration applies the same cubic, `1.5 x − 0.5 x³`, every time. For an
odd cubic the best polynomial on `[lo, hi]` has a closed form: its error is the same, `E`, at both
ends and at its peak, with alternating signs. After the step, every value lies in `[1 − E, 1 + E]`,
and the next cubic is the best one for that interval. The task uses fifth-degree polynomials; the
idea is the same.

```python
def best_cubic(lo, hi):
    """The odd cubic a x + b x^3 closest to 1 on [lo, hi] in the worst case, and its error E.

    The error is -E at both ends and +E at the peak, which gives a closed form.
    """
    c = hi * hi + hi * lo + lo * lo
    peak = (c / 3) ** 0.5
    b = 2 / (lo ** 3 - c * lo + peak ** 3 - c * peak)
    a = -b * c
    return a, b, 1 - (a * lo + b * lo ** 3)


lo_ns = lo_pe = 0.001
hi_pe = 1.0
print("step  Newton-Schulz error  greedy best-cubic error")
for step in range(1, 11):
    lo_ns = 1.5 * lo_ns - 0.5 * lo_ns ** 3          # its largest error is at the low end
    a, b, err = best_cubic(lo_pe, hi_pe)
    lo_pe, hi_pe = 1 - err, 1 + err
    print(f"{step:4}  {1 - lo_ns:19.2e}  {err:23.2e}")
```

```{.text .output}
step  Newton-Schulz error  greedy best-cubic error
   1             9.99e-01                 9.95e-01
   2             9.98e-01                 9.87e-01
   3             9.97e-01                 9.66e-01
   4             9.95e-01                 9.14e-01
   5             9.92e-01                 7.96e-01
   6             9.89e-01                 5.68e-01
   7             9.83e-01                 2.65e-01
   8             9.74e-01                 5.37e-02
   9             9.62e-01                 2.17e-03
  10             9.42e-01                 3.52e-06
```

Newton–Schulz multiplies a small singular value by only 1.5 per step; the greedy schedule grows it
about 5 times on the first step and about 2.5 times per step after that, then closes in fast. After ten steps its worst error is 3.5 × 10⁻⁶.

**What the agent writes.** The whole method: `optimal_quintic(l, u)`, the best fifth-degree odd
polynomial for an interval; `optimal_composition(l, steps, …)`, a schedule of them; and
`PolarExpress`, the matrix iteration.

**How it is judged.** Twelve square, tall and wide matrices with three to six steps each; six of
them have hidden spectra from the paper's experiments (`σ_min / σ_max` down to about 10⁻⁴·⁵). The
score counts decimal digits: of the schedule's worst scalar error (12 digits for full marks) and of
the relative matrix error (8 digits), on the six original matrices only. To pass, on every matrix five quantities must beat the
reference: the worst scalar error, three distances from the true factor, and the cosine similarity.

**What the agents did.**

| Run | Relative error | Cosine | Final score | |
|---|---:|---:|---:|---|
| Human reference | 0.355 | 0.923 | 26.3 | |
| Gemini 4 Argon · Pi | 2.54 × 10⁻⁸ | 0.97 | 71.7 | pass |
| Kimi K3.1 Pro | 2.55 × 10⁻⁸ | 0.97 | 71.7 | pass |
| Claude Opus 5.5 | 2.86 × 10⁻⁶ | 0.983 | 67.8 | pass |

As of October 26, 2026. Selected rows; the full table is on the task page. 14 of 16 models passed;
15 scored above the reference (26.3). Its FDI is
1.6, the second easiest of the 48 tasks, and it sits in the same field as the hardest. Gemini 4
Argon · Pi and Kimi K3.1 Pro had the best final score, 71.7. Claude Opus 5.5 (67.8) found each
polynomial by the Remez exchange, built the greedy schedule in double precision (so the paper's
safety margins for low precision are not needed), and estimated the spectrum from a few products.
Its own idea: spend the products differently. A degree-17 polynomial costs five matrix products
through a nested evaluation scheme, and it mixes degrees up to 17 for each step count.

::: pattern
**A known answer is a clear target.** Polar Express has an exact oracle (the SVD), an optimal
polynomial with a classical algorithm (Remez), and a check that needs no GPU. Nearly every model
passed. KV Compaction has none of these, and nobody did.
:::

# Summary and self-check

::: pattern
**Three lessons from the Machine Learning tasks.**

1. *Every workload decides.* Claude Opus 5.5's KV Compaction run was 108 times faster with higher
   mean accuracy and failed on 2 articles of 24. GPT-6 Astra had DyT's top score and failed on one
   workload's inference time.
2. *Fit the method to the measurement.* Short runs left speed to decide most scores in DeTok and
   DyT; averaging sixteen samples suited the world model's PSNR and SSIM.
3. *Training data must be exactly right.* RAGEN's masks and rewards, Flow-OPD's replayed
   log-probabilities and the Fréchet queue's gradients fail silently when they are wrong.
:::

## Exercises

1. In the KV model, fit the bias and values on only 8 sample queries instead of 64. What happens to
   the test gap at 12 of 48 keys, and why?
2. Use the KV score: how many times faster than the reference must a run be to score 60 on an
   article?
3. In the Flow-OPD signal table, cap the noise at 0.35. Which steps change, and what is the ratio of
   the first step's signal to the last's now?
4. In the Fréchet model, replace the ring buffer with an exponential moving average of the mean and
   second moment. Which decay rate behaves like a window of 64?
5. Run the Newton–Schulz and greedy cubic iterations from `l = 0.1`. How many steps does each need
   to bring the worst error below 10⁻³?
