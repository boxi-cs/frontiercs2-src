---
title: "Lecture 01: MLSys"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has six MLSys tasks. **SVG-EAR** rebuilds sparse attention for two video diffusion
models (ECCV 2026). **Continuum** speeds up vLLM serving for agents that talk to a model in many
turns (arXiv 2025). Four **FlashLib** tasks ask for fast GPU versions of classical operators:
brute-force **k-NN**, **DBSCAN**, a **k-means** step and **IVF-PQ** search (the FlashLib blog and
Flash-KMeans, arXiv 2026). For each one, these notes explain the idea, the part the task removed,
how a run is judged, and what the agents did.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. They show the arithmetic, not the GPU speed. Every program in these notes has
been run, and every output shown is the real output.

::: instructor
**Sources.** Task pages and results: <https://frontier-cs.org/> (as of October 26, 2026). The
SVG-EAR figures follow the case study *SVG-EAR: The Baseline No Model Could Beat* (October 19,
2026), and its one-query example is the case study's. The FlashLib idea follows the FlashLib blog
(<https://flashml-org.github.io/>). The task statements are the public ones an agent reads. Nothing
here comes from the hidden workloads or the human reference patches.

**Numbers.** Pass counts and scores are from the 16-model leaderboard. The SVG-EAR case study
counted twelve models; the task page now shows 0 of 16 passing. The toy sizes (16 key clusters,
six conversations, 4,096 database rows, 150 points, a 2,000-vector index) are ours.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Estimate a skipped block of attention from its centroid, and explain why SVG-EAR ranks blocks by error rather than weight.
2. Explain why a centroid estimate guesses low, and the variance term that corrects it.
3. Explain how a KV-cache time-to-live and conversation-order scheduling cut recomputation for multi-turn agents.
4. Compute a nearest-rank percentile and the FrontierCS latency score `L(S)`, and invert it.
5. Stream a k-NN search or a k-means step without storing the distance table, and prune a k-NN search with a bound.
6. Run DBSCAN and IVF-PQ by hand on small data, and say what ARI, iso-recall and nearest-neighbor recall measure.

# SVG-EAR: estimating what you skip

A video diffusion model makes a clip from noise in 50 steps, and each step runs a transformer over
the clip's tokens. A 720p clip of 81 frames has 75,600 of them. In attention, every token looks at
every other token, and that dominates the cost. **Sparse VideoGen2** clusters similar tokens and
computes attention only for the cluster pairs that matter. **SVG-EAR** (ECCV 2026) also estimates
the pairs it skips, from cluster averages, and picks the pairs to compute by the error that skipping
would cause.

## One query, four keys

The case study's example has one query and four keys in two clusters. The query gives key `j` a
score `s_j` (a dot product over the square root of the vector length), and the output averages the
keys' values with weights `e^{s_j}`. In cluster A both keys score 1. In cluster B they score 0 and
2. The values are ours. A skipped cluster of `n` keys whose average key scores `s̄` is estimated
as `n` keys of weight `e^{s̄}`, each carrying the average value.

```python
from math import exp

# One query, four keys in two clusters: (score, value) for each key.
CLUSTERS = {"A": [(1.0, 2.0), (1.0, 2.0)], "B": [(0.0, 1.0), (2.0, 3.0)]}


def exact(keys):
    """Weight and weighted value sum of a cluster, key by key."""
    return sum(exp(s) for s, _ in keys), sum(exp(s) * v for s, v in keys)


def estimate(keys):
    """The same from the cluster's average key and average value."""
    n = len(keys)
    s_bar = sum(s for s, _ in keys) / n
    v_bar = sum(v for _, v in keys) / n
    w = n * exp(s_bar)
    return w, w * v_bar


for name, keys in CLUSTERS.items():
    print(f"{name}: exact weight {exact(keys)[0]:.2f}, estimate {estimate(keys)[0]:.2f}")
```

```{.text .output}
A: exact weight 5.44, estimate 5.44
B: exact weight 8.39, estimate 5.44
```

The estimate is exact for A, whose keys score the same, and about 3 short for B.

```python
def output(plan):
    """plan: (keys, how) pairs, how being 'compute', 'estimate' or 'drop'."""
    w_sum = wv_sum = 0.0
    for keys, how in plan:
        if how != "drop":
            w, wv = (exact if how == "compute" else estimate)(keys)
            w_sum, wv_sum = w_sum + w, wv_sum + wv
    return wv_sum / w_sum


A, B = CLUSTERS["A"], CLUSTERS["B"]
plans = [("full attention", "compute", "compute"),
         ("compute B, drop A", "drop", "compute"),
         ("compute A, estimate B", "compute", "estimate"),
         ("compute B, estimate A", "estimate", "compute")]
for label, a, b in plans:
    print(f"{label:22} output {output([(A, a), (B, b)]):.3f}")
```

```{.text .output}
full attention         output 2.462
compute B, drop A      output 2.762
compute A, estimate B  output 2.000
compute B, estimate A  output 2.462
```

Suppose there is room to compute one cluster. Dropping the other loses its weight. Estimating it
helps, but only if the right one is estimated. By estimated weight A and B tie at 5.44. SVG-EAR
ranks them by how wrong the estimate would be: A's has no error, so it computes B, estimates A, and
the toy query comes out exact.

## Routing a whole layer

In a real layer the queries form clusters too, and sorting tokens by cluster turns attention into
blocks, one per pair of a query cluster and a key cluster. The task uses 300 query clusters for
Wan, 400 for HunyuanVideo and 1,000 key clusters. Our model keeps 16 key clusters of 8 keys, from
tight to loose, and routes 32 queries one by one. It compares three rules at the same budget:
rank by weight and drop the rest (Sparse VideoGen2), rank by weight and estimate the rest, and rank
by error and estimate the rest (SVG-EAR). The error of a block is the case study's signal: the
summed squared gap between the centroid estimate and each key, `Σ ‖e^{s̄} v̄ − e^{s_j} v_j‖²`.
The paper divides it by the block's token pairs; our clusters are all the same size, so we skip
that.

```python
class Rng:
    """Park-Miller generator: small, and exact in JavaScript too."""

    def __init__(self, seed):
        self.state = seed

    def next(self):
        self.state = self.state * 48271 % 2147483647
        return self.state

    def below(self, k):
        return self.next() % k

    def uniform(self):
        return self.next() / 2147483647


D, CLUSTER_COUNT, CLUSTER_SIZE, QUERY_COUNT = 8, 16, 8, 32


def make_layer(seed):
    """16 key clusters, from tight to loose, each key with a value; and 32 queries."""
    rng = Rng(seed)
    clusters = []
    for c in range(CLUSTER_COUNT):
        center = [2 * rng.uniform() - 1 for _ in range(D)]
        spread = 0.1 + 0.9 * c / (CLUSTER_COUNT - 1)
        keys = [[x + spread * (2 * rng.uniform() - 1) for x in center]
                for _ in range(CLUSTER_SIZE)]
        clusters.append([(k, 2 * rng.uniform() - 1 + c / 8) for k in keys])
    queries = [[3 * (2 * rng.uniform() - 1) for _ in range(D)] for _ in range(QUERY_COUNT)]
    return clusters, queries


def scored(query, cluster):
    return [(sum(q * x for q, x in zip(query, k)) / D ** 0.5, v) for k, v in cluster]


def block_error(keys):
    """SVG-EAR's signal: the gap between the centroid estimate and each key."""
    w, wv = estimate(keys)
    one, v_bar = w / len(keys), wv / w
    return sum((one * v_bar - exp(s) * v) ** 2 for s, v in keys)


def routed(query, clusters, budget, rank_by, rest):
    blocks = [scored(query, c) for c in clusters]
    signal = block_error if rank_by == "error" else (lambda b: estimate(b)[0])
    order = sorted(range(len(blocks)), key=lambda i: -signal(blocks[i]))
    chosen = set(order[:budget])
    return output([(b, "compute" if i in chosen else rest) for i, b in enumerate(blocks)])


def mean_error(budget, rank_by, rest, clusters, queries):
    gaps = [abs(routed(q, clusters, budget, rank_by, rest)
                - routed(q, clusters, len(clusters), rank_by, rest)) for q in queries]
    return sum(gaps) / len(gaps)


clusters, queries = make_layer(5)
print("computed  drop rest  estimate rest  estimate, rank by error")
for budget in (2, 4, 6, 8):
    row = [mean_error(budget, r, s, clusters, queries)
           for r, s in [("weight", "drop"), ("weight", "estimate"), ("error", "estimate")]]
    print(f"{budget:2} of 16  {row[0]:9.4f}  {row[1]:13.4f}  {row[2]:23.4f}")
```

```{.text .output}
computed  drop rest  estimate rest  estimate, rank by error
 2 of 16     0.2397         0.0670                   0.0280
 4 of 16     0.1736         0.0547                   0.0152
 6 of 16     0.0725         0.0333                   0.0069
 8 of 16     0.0443         0.0192                   0.0059
```

The table gives the mean gap from full attention. At every budget, estimating beats dropping, and
ranking by error beats ranking by weight. In the paper the budget comes from Sparse VideoGen2: the
token pairs in the blocks that hold 90% of the estimated weight.

## What the agent writes

The task removes the SVG-EAR attention layer of both models, Wan 2.1 and HunyuanVideo, and three
routines they share. One averages each cluster (`scatter_mean_fused`). One picks which cluster
pairs to compute (`identify_dynamic_map_estimated`). One computes the chosen pairs and estimates the
rest (`dynamic_block_sparse_prune_fwd_flashinfer`). The agent may rebuild the paper or try anything
else behind the same interfaces. The pipelines, schedulers and metrics stay fixed.

# SVG-EAR: 48 checks, no pass

## How it is judged

Twelve graded clips, eight from Wan and four from HunyuanVideo, are each compared with the clip
that full attention makes from the same prompt and seed. Three image scores measure the match:
PSNR and SSIM (higher is better) and LPIPS (lower is better). The leaderboard score rewards quality
and speed measured against full attention:

```python
def clip(x):
    return max(0.0, min(1.0, x))


def clip_score(psnr, ssim, lpips, seconds, dense_seconds):
    quality = (clip((psnr - 15) / 20) + clip((ssim - 0.5) / 0.5) + clip((0.35 - lpips) / 0.35)) / 3
    efficiency = clip(dense_seconds / seconds - 1)
    return 100 * quality * (0.25 + 0.75 * efficiency)


same = (float("inf"), 1.0, 0.0)
print(f"identical clip, dense speed:   {clip_score(*same, 1000, 1000):.2f}")
print(f"identical clip, twice as fast: {clip_score(*same, 500, 1000):.2f}")
print(f"our example clip:              {clip_score(23.0, 0.80, 0.19, 800, 1000):.2f}")
```

```{.text .output}
identical clip, dense speed:   25.00
identical clip, twice as fast: 100.00
our example clip:              21.25
```

The pass rule measures against the human reference instead, clip by clip. Every clip must take at
least 4% less time than with the reference, and its PSNR may be at most 0.25 dB lower, SSIM at most
0.01 lower and LPIPS at most 0.005 higher. Four measures on twelve clips make 48 checks.

```python
def clip_checks(run, ref):
    """The four bars of one clip: (seconds, PSNR, SSIM, LPIPS)."""
    return {"time": run[0] <= 0.96 * ref[0],
            "PSNR": run[1] >= ref[1] - 0.25,
            "SSIM": run[2] >= ref[2] - 0.01,
            "LPIPS": run[3] <= ref[3] + 0.005}


reference = (891.0, 21.67, 0.7665, 0.215)
astra = (728.6, 23.77, 0.7973, 0.1864)
print("means over 12 clips:", clip_checks(astra, reference))
print(f"Wan clip 3, PSNR: 19.42 vs bar {20.47 - 0.25:.2f}, short by {20.47 - 0.25 - 19.42:.2f} dB")
```

```{.text .output}
means over 12 clips: {'time': True, 'PSNR': True, 'SSIM': True, 'LPIPS': True}
Wan clip 3, PSNR: 19.42 vs bar 20.22, short by 0.80 dB
```

GPT-6 Astra cleared every bar on average and still failed: on Wan clip 3 its PSNR was 19.42 dB
against the reference's 20.47.

## What the agents did

No model passed; 13 of 16 scored above the human reference (33.9).

| Run | Latency (s) | LPIPS | PSNR (dB) | SSIM | Final score |
|---|---:|---:|---:|---:|---:|
| Human reference | 891 | 0.215 | 21.7 | 0.766 | 33.9 |
| GPT-6 Astra | 729 | 0.186 | 23.8 | 0.797 | 48.6 |
| GPT-6.1 Terra | 839 | 0.181 | 23.7 | 0.809 | 45.5 |
| GPT-6.1 Sol | 942 | 0.172 | 25.4 | 0.808 | 38.4 |
| Claude Opus 5.5 | 804 | 0.223 | 21.5 | 0.757 | 37.4 |

Means over the twelve hidden clips, as of October 26, 2026. Every run fails.

**GPT-6 Astra** kept the design and changed how it runs. Every fourth denoising step it takes 32
query tokens as probes, computes their exact attention, and rebuilds them the sparse way under caps
of 12%, 25% and 50% of the keys. Each head runs at the lowest cap whose error stays under a bound,
and a head that fails even at 50% runs dense attention until the next check. Inside its cap it ranks
blocks by estimated weight, the older Sparse VideoGen2 rule, until they hold 98% of the weight. So
the best run did not rank by error: measuring the error set its budget. It also added a term
the paper leaves out. A score is linear in the key, but `e^x` bends upward, so the average of
`e^{s_j}` is never below `e^{s̄}`: the centroid guesses low. A second-order expansion gives the
fix, `e^{s̄ + σ²/2}`, where `σ²` is the variance of the query's scores over the cluster.

```python
scores = [s for s, _ in B]
s_bar = sum(scores) / len(scores)
var = sum((s - s_bar) ** 2 for s in scores) / len(scores)
print(f"true weight      {sum(exp(s) for s in scores):.2f}")
print(f"centroid         {len(scores) * exp(s_bar):.2f}")
print(f"with variance    {len(scores) * exp(s_bar + var / 2):.2f}")
```

```{.text .output}
true weight      8.39
centroid         5.44
with variance    8.96
```

The corrected estimate overshoots here, but it lands far closer than 5.44. Astra tries the term at
0, ½, 1 and 1½ times its size on each head's probes and keeps the best.

**Claude Opus 5.5** stayed closest to the paper. It rebuilt the error-aware choice of blocks, and
sized the budget by error too: it takes key clusters until they cover 85% of the row's total error.
Its k-means starts each step from the previous step's centroids, and FlashInfer's block-sparse
kernel computes the chosen pairs and merges in the estimates through their log-sum-exp (the log of a row's summed weights, which lets
two partial softmaxes be combined). It passed
all twelve speed checks and 32 of 48 checks in all; its misses were all on image quality.

**GPT-6.1 Sol** ran exact attention. Its image quality was the best of any run, and it lost all
twelve speed checks. It also served as a yardstick: exact attention missed six image checks, five of
them the ones Astra missed.

::: pitfall
**Fidelity decided the task.** Of the twelve runs in the case study, seven beat the reference's time on every clip, but no run
passed all 36 image checks. Wan clip 3 stopped every run the case study examined.
:::

# Continuum: keeping the cache between turns

An AI agent calls a model in many turns, with a tool call between turns. vLLM keeps each request's
**KV cache**, the keys and values of its context, only while the request runs; when it ends the
blocks may be evicted, so after a tool call the whole context may be computed again. Other
conversations also cut in between turns. **Continuum** (arXiv 2025) holds a conversation's cache
for a **time-to-live** (TTL) after a tool call, and serves whole conversations first come, first
served.

## A small server

Our server runs one request at a time. A request computes its uncached prompt tokens at 4,000 a
second, then spends one second on its 300-token reply. The cache holds 14,000 tokens. Six
conversations arrive in the first six seconds, each with three or four turns and a tool pause after
each reply. vLLM serves requests in the order they become ready and evicts the least recently used
cache; Continuum serves the oldest conversation first and holds a finished turn's cache until its
TTL runs out.

```python
from math import ceil

# Each conversation: (arrival s, [(new prompt tokens, tool pause s after the reply), ...]).
CONVERSATIONS = [
    (0.0, [(3000, 4.0), (800, 6.0), (800, 3.0), (600, 0.0)]),
    (1.0, [(2500, 5.0), (900, 5.0), (700, 0.0)]),
    (2.0, [(4000, 3.0), (600, 7.0), (900, 4.0), (500, 0.0)]),
    (3.5, [(2000, 6.0), (1000, 4.0), (800, 0.0)]),
    (5.0, [(3500, 4.0), (700, 5.0), (600, 0.0)]),
    (6.0, [(3000, 5.0), (800, 3.0), (900, 6.0), (700, 0.0)]),
]
REPLY, PREFILL_RATE, DECODE_SECONDS, CACHE = 300, 4000, 1.0, 14000


def serve(conversations, policy, ttl=0.0):
    """One request at a time. Returns per-conversation latency and recomputed tokens."""
    turn = [0] * len(conversations)
    context = [0] * len(conversations)
    ready = [arrival for arrival, _ in conversations]
    cache = {}            # conversation -> [tokens, last use, held until]
    done, clock, recomputed = {}, 0.0, 0
    while len(done) < len(conversations):
        waiting = [c for c in range(len(conversations)) if c not in done and ready[c] <= clock]
        if not waiting:
            clock = min(ready[c] for c in range(len(conversations)) if c not in done)
            continue
        if policy == "vllm":
            c = min(waiting, key=lambda c: (ready[c], c))         # request order
        else:
            c = min(waiting, key=lambda c: (conversations[c][0], c))  # conversation order
        new, pause = conversations[c][1][turn[c]]
        hit = cache.pop(c, None)
        prompt = new if hit else context[c] + new
        recomputed += prompt - new
        need = context[c] + new + REPLY

        def victims():
            if policy == "vllm":
                return sorted(cache, key=lambda v: cache[v][1])     # least recently used
            free = sorted((v for v in cache if cache[v][2] <= clock), key=lambda v: cache[v][1])
            newer = sorted((v for v in cache if cache[v][2] > clock
                            and conversations[v][0] > conversations[c][0]),
                           key=lambda v: -conversations[v][0])
            return free + newer
        for v in victims():
            if sum(t for t, _, _ in cache.values()) + need <= CACHE:
                break
            del cache[v]
        clock += prompt / PREFILL_RATE + DECODE_SECONDS
        context[c] = need
        turn[c] += 1
        if turn[c] == len(conversations[c][1]):
            done[c] = clock - conversations[c][0]
        else:
            held = clock + ttl if policy == "continuum" else clock
            cache[c] = [need, clock, held]
            ready[c] = clock + pause
    return [done[c] for c in range(len(conversations))], recomputed


def nearest_rank(values, p):
    """The task's percentile: the ceil(p N)-th smallest value, no interpolation."""
    return sorted(values)[ceil(p * len(values)) - 1]


for policy, ttl in [("vllm", 0.0), ("continuum", 0.0), ("continuum", 8.0)]:
    latency, recomputed = serve(CONVERSATIONS, policy, ttl)
    print(f"{policy:9} ttl {ttl:3.0f} s: mean {sum(latency) / len(latency):5.1f} s, "
          f"p90 {nearest_rank(latency, 0.9):5.1f} s, recomputed {recomputed:6,} tokens")
```

```{.text .output}
vllm      ttl   0 s: mean  33.1 s, p90  40.1 s, recomputed 51,700 tokens
continuum ttl   0 s: mean  28.4 s, p90  42.7 s, recomputed 43,500 tokens
continuum ttl   8 s: mean  24.1 s, p90  34.7 s, recomputed 18,200 tokens
```

Ordering by conversation alone lowers the mean; the TTL then cuts recomputation by more than half.
Here any TTL of 5 s or more gives the same result. In the real system a
held cache is memory other requests cannot use, which is why the TTL is chosen with care.

## What the agent writes, and how it is judged

The task starts from unmodified vLLM 0.11.0 serving Qwen3-Coder-30B-A3B on one H100. The agent may
change vLLM's Python code for scheduling and serving: the scheduler, the KV-cache manager, the
engine and the server. Kernels, the model and the workloads stay fixed.

Each submission serves 48 SWE-bench coding conversations and 155 BFCL tool-calling conversations,
each at a public and a hidden load, with real tools. To pass, in all four groups it must beat the
human reference on the geometric mean of conversation latency and at the 90th, 95th and 99th
percentiles, and solve at least the reference's median count minus `max(1, ceil(0.05 N))`. The
score compares with unmodified vLLM instead: a latency score `L(S)` per workload, cut if accuracy
falls by more than 5 points and more than 5% of vLLM's, then 0.8 × SWE + 0.2 × BFCL.

```python
from math import log


def latency_score(speedup):
    """L(S): 0 up to 1x, 50 at 10x, rising toward 100 with no cap."""
    return 0.0 if speedup <= 1 else 100 * log(speedup) / (log(10) + log(speedup))


def quality_multiplier(vanilla_correct, candidate_correct):
    drop = max(0.0, vanilla_correct - candidate_correct)
    relative = drop / max(vanilla_correct, 1e-9)
    return 1.0 if drop <= 0.05 or relative <= 0.05 else 0.05 / relative


for s in (1.0, 2.0, 10.0, 100.0):
    print(f"L({s:g}) = {latency_score(s):.2f}")
print("multiplier, 30% -> 20% correct:", round(quality_multiplier(0.30, 0.20), 3))
print("ranks of p90, p95, p99 among 48:", [ceil(p * 48) for p in (0.90, 0.95, 0.99)])
```

```{.text .output}
L(1) = 0.00
L(2) = 23.14
L(10) = 50.00
L(100) = 66.67
multiplier, 30% -> 20% correct: 0.15
ranks of p90, p95, p99 among 48: [44, 46, 48]
```

The same `L(S)` scores all four FlashLib tasks below.

## What the agents did

No model passed; 10 of 16 scored above the human reference (9.6).

| Run | Correct (%) | P90 (s) | P95 (s) | P99 (s) | Speedup | Final score |
|---|---:|---:|---:|---:|---:|---:|
| Human reference | 15.3 | 158 | 176 | 183 | 1 | 9.6 |
| Gemini 4 Argon · Pi | 16.5 | 137 | 145 | 162 | 1.26 | 24.2 |
| GPT-6.1 Sol | 19.6 | 93.2 | 99.8 | 111 | 1.2 | 23.9 |
| Qwen 3.8 Max | 17.4 | 107 | 116 | 134 | 1.13 | 22.3 |
| Claude Opus 5.5 | 17.3 | 118 | 126 | 4,990 | 1.03 | 19.1 |

Means over the hidden groups, as of October 26, 2026.

**Claude Opus 5.5** rebuilt Continuum. Its scheduler groups requests into conversations by their
prompts alone, through the hash vLLM's prefix cache gives each full block, and orders waiting
requests by when their conversation began. When a turn finishes it holds the conversation's cache
for a TTL set from the last 256 pauses: 10 seconds until eight pauses are seen, then twice the
90th-percentile pause plus one second, within 2 to 30 seconds. An expired hold frees nothing until
memory runs short; then holds are released, expired ones first. Before a large hold is released, it
is copied to host memory and copied back when the conversation returns. Its 99th percentile was
4,990 s against the reference's 183 (a mean over the hidden groups); the page does not say why. With
48 SWE conversations, p99 is the slowest one, so a single stuck conversation is enough to fail the
check.

# FlashLib: k-NN and k-means

**FlashLib** applies the ideas behind fast GPU attention kernels to classical machine-learning
operators. The first of its principles is to rewrite an operator into a mathematically equivalent
form that suits the GPU: never write a large intermediate table to memory, keep running minima in
registers, and split `‖x − y‖² = ‖x‖² + ‖y‖² − 2⟨x, y⟩` so that the costly part becomes a matrix
product on tensor cores.

## k-nearest neighbors

Brute-force k-NN compares each query with every database row and keeps the k closest. The naive
version fills the whole distance table, then sorts each row. Our data are integer vectors from 0 to
255, like SIFT descriptors.

```python
def make_points(seed, n, dim, centers=16):
    """Integer vectors 0..255 around a few centers, like SIFT descriptors."""
    rng = Rng(seed)
    middles = [[rng.below(256) for _ in range(dim)] for _ in range(centers)]
    points = []
    for _ in range(n):
        m = middles[rng.below(centers)]
        points.append([min(255, max(0, x + rng.below(61) - 30)) for x in m])
    return points


def sq_dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b))


DATABASE = make_points(1, 4096, 8)
QUERIES = make_points(2, 4, 8)
K = 5

# Naive: fill the whole distance table, then sort each row.
table = [[sq_dist(q, row) for row in DATABASE] for q in QUERIES]
naive = [sorted(range(len(DATABASE)), key=lambda j: (t[j], j))[:K] for t in table]


def knn_tiled(queries, database, k, tile=256):
    """Stream the database tile by tile, keeping only k candidates per query."""
    norms = [sum(x * x for x in row) for row in database]
    best = [[] for _ in queries]
    for start in range(0, len(database), tile):
        for qi, q in enumerate(queries):
            for j in range(start, min(start + tile, len(database))):
                dot = sum(x * y for x, y in zip(q, database[j]))
                d = norms[j] - 2 * dot          # |q|^2 is the same for every row
                best[qi] = sorted(best[qi] + [(d, j)])[:k]
    return [[j for _, j in b] for b in best]


print("same answer:", knn_tiled(QUERIES, DATABASE, K) == naive)
print("query 0:", naive[0])
print(f"values kept: table {len(QUERIES) * len(DATABASE):,}, tiled {len(QUERIES) * K}")
```

```{.text .output}
same answer: True
query 0: [3381, 3032, 1204, 2782, 1393]
values kept: table 16,384, tiled 20
```

A GPU version streams tiles of the database through each query and keeps only a few candidates. It
also drops `‖q‖²`, the same for every row, and computes `⟨q, x⟩` as a matrix product.

## A bound on the k-th distance

**Claude Opus 5.5** passed with a pruning idea. Its first pass keeps only the two smallest
distances in each group of database rows. The k-th smallest of the group minima is an upper bound
on the true k-th distance, since those are k real rows. A group whose minimum is below the bound
contributes its best row; a group whose second value is too is rescanned in full. Every other row
is provably too far.

```python
def knn_bounded(dists, k, group):
    """Keep two values per group; bound the k-th distance; rescore few rows."""
    groups = []
    for start in range(0, len(dists), group):
        rows = sorted((dists[j], j) for j in range(start, min(start + group, len(dists))))
        groups.append((start, rows[0], rows[1]))
    bound = sorted(first[0] for _, first, _ in groups)[k - 1]   # k rows lie at or below it
    candidates = set()
    for start, first, second in groups:
        if first[0] <= bound:
            candidates.add(first[1])
        if second[0] <= bound:                                   # the group may hold more
            candidates.update(range(start, min(start + group, len(dists))))
    best = sorted((dists[j], j) for j in candidates)[:k]
    return [j for _, j in best], len(candidates)


for group in (32, 128):
    for k in (5, 10, 20):
        rescored = 0
        for t in table:
            found, count = knn_bounded(t, k, group)
            assert found == sorted(range(len(t)), key=lambda j: (t[j], j))[:k]
            rescored += count
        print(f"groups of {group:3}, k={k:2}: exact, {rescored / 4:7.2f} of 4,096 rows rescored")
```

```{.text .output}
groups of  32, k= 5: exact,    5.00 of 4,096 rows rescored
groups of  32, k=10: exact,   17.75 of 4,096 rows rescored
groups of  32, k=20: exact,   43.25 of 4,096 rows rescored
groups of 128, k= 5: exact,    5.00 of 4,096 rows rescored
groups of 128, k=10: exact,  295.75 of 4,096 rows rescored
groups of 128, k=20: exact, 1385.25 of 4,096 rows rescored
```

The answer is always exact; how much work it saves depends on k and the group size.

## How the four FlashLib tasks are judged

Each task leaves a plain, slow version as the starter, and the agent writes a fast GPU version in
Python and Triton on one H100. The score is `L(S)` from the Continuum section, with `S` the
geometric mean, over the scored workloads, of the median paired speedup over the naive version
(for k-NN, the frozen original cdist/topk; for k-means, the ratio of median latencies). A pass
compares with the human reference on every workload, including hidden ones: strictly faster, and
quality no worse (k-means has quality bands instead, given below).

The score formula can be inverted. From the leaderboard's rounded scores:

```python
def speedup_from_score(score):
    """Invert score = 100 log S / (log 10 + log S)."""
    return 10 ** (score / (100 - score))


tasks = {"KNN": (44.7, 51.8), "DBSCAN": (63.7, 72.9),
         "K-Means": (43.3, 53.8), "IVF-PQ": (75.6, 80.5)}
for name, (reference, best) in tasks.items():
    print(f"{name:8} reference {speedup_from_score(reference):6.1f}x, "
          f"best run {speedup_from_score(best):6.1f}x over the naive starter")
```

```{.text .output}
KNN      reference    6.4x, best run   11.9x over the naive starter
DBSCAN   reference   56.9x, best run  489.8x over the naive starter
K-Means  reference    5.8x, best run   14.6x over the naive starter
IVF-PQ   reference 1254.2x, best run 13434.0x over the naive starter
```

The log scale squeezes large speedups: 75.6 against 80.5 on IVF-PQ is a factor of about ten. The
scores are rounded to one decimal, so the high ones are rough.

For **k-NN**, the workloads are SIFT and GIST descriptors, up to 1,000,000 database rows and k up to
256 in hidden shapes. *Ball-recall* is the share of returned rows no farther than the plain
search's k-th distance (plus 10⁻⁶); *exact recall* is the same test against the true k-th distance
in fp64. Every timed call must reach ball-recall 0.88. To pass, each workload must be
faster than the reference, with worst ball-recall and worst exact recall at least the reference's,
and every reported distance within a relative 10⁻⁶ of a direct recomputation.

| Run | Latency (ms) | Worst ball recall | Worst exact recall | Final score | |
|---|---:|---:|---:|---:|---|
| Human reference | 2.23 | 0.948 | 1.000 | 44.7 | |
| Claude Opus 5.5 | 1.51 | 0.948 | 1.000 | 51.8 | pass |
| Gemini 4 Argon · Pi | 1.84 | 0.948 | 0.9999 | 47.6 | fail |
| Gemini 4 Argon · Antigravity | 1.95 | 0.948 | 1.000 | 45.4 | pass |

Selected runs; 2 of 16 passed, as of October 26, 2026. Beyond the bound, Claude Opus 5.5 recomputed the surviving candidates
in double precision so every distance matches a direct recomputation, replayed a recorded launch plan to skip Python
dispatch, and, as its own idea, noticed that SIFT values are whole numbers: shifted by −128 into
8-bit integers, the dot products are exact in 32-bit integer arithmetic.

## One k-means step

A Lloyd step sends every point to its nearest center, then moves each center to the mean of its
points. The task asks for exactly this step; an empty cluster keeps its old center.

```python
def kmeans_step(points, centroids, tile=4):
    """Assign each point to its nearest centroid, tile by tile; then average."""
    labels = []
    for p in points:
        best = (float("inf"), -1)
        for start in range(0, len(centroids), tile):         # one tile of centers
            for c in range(start, min(start + tile, len(centroids))):
                best = min(best, (sq_dist(p, centroids[c]), c))  # running minimum
        labels.append(best[1])
    sums = [[0] * len(centroids[0]) for _ in centroids]
    counts = [0] * len(centroids)
    for p, c in zip(points, labels):
        counts[c] += 1
        sums[c] = [s + x for s, x in zip(sums[c], p)]
    new = [[s / n for s in total] if n else old                  # empty: keep old center
           for total, n, old in zip(sums, counts, centroids)]
    return labels, new, counts


POINTS = make_points(3, 600, 4, centers=6)
centroids = [list(map(float, p)) for p in POINTS[:7]] + [[999.0] * 4]   # the last is far away
for step in range(2):
    labels, centroids, counts = kmeans_step(POINTS, centroids)
    inertia = sum(sq_dist(p, centroids[c]) for p, c in zip(POINTS, labels))
    print(f"step {step + 1}: cluster sizes {counts}, inertia {inertia:,.0f}")
print("the empty cluster kept its center:", centroids[7])
```

```{.text .output}
step 1: cluster sizes [88, 85, 52, 27, 44, 114, 190, 0], inertia 863,301
step 2: cluster sizes [88, 82, 42, 30, 51, 108, 199, 0], inertia 802,869
the empty cluster kept its center: [999.0, 999.0, 999.0, 999.0]
```

The GPU version computes the distances to one tile of centers after another as a matrix product
and keeps a running minimum, never storing the point-by-center table.

## A tile number inside a float

**Claude Opus 5.5**'s own idea was to write the center tile's number into the lowest mantissa bits
of each distance. A plain element-wise minimum over the tiles then carries the winning tile along
with the value, with no branches. The bits given up cost a tiny relative error.

```python
from struct import pack, unpack


def to_bits(x):
    return unpack("<I", pack("<f", x))[0]


def from_bits(b):
    return unpack("<f", pack("<I", b))[0]


def tag(dist, tile, bits=3):
    """Write the tile number into the lowest mantissa bits of a float32 distance."""
    return from_bits(to_bits(dist) & ~((1 << bits) - 1) | tile)


wrong, worst = 0, 0.0
for p in POINTS:
    dists = [float(sq_dist(p, c)) for c in centroids]          # one tile per center
    m = min(tag(d, t) for t, d in enumerate(dists))           # a plain minimum
    tile = to_bits(m) & 7
    wrong += dists[tile] != min(dists)
    worst = max(worst, abs(m - min(dists)) / min(dists))
print(f"wrong tile for {wrong} of {len(POINTS)} points; largest error {worst:.1e}")
```

```{.text .output}
wrong tile for 0 of 600 points; largest error 7.8e-07
```

The pass rule allows the clustering cost (inertia) to grow by at most 5% and the share of points
not at an exact nearest center by at most 0.002, and asks for a faster time on every one of six
shapes. 8 of 16 models passed, as many as on IVF-PQ and more than on the other four MLSys
tasks. Claude Opus 5.5 had the best score, 53.8 against the reference's 43.3, at 0.944 ms per Lloyd
iteration against 1.96.

# FlashLib: DBSCAN and IVF-PQ

## DBSCAN

DBSCAN groups points by density. A point with at least `min_samples` points within distance `eps`,
itself included, is a **core** point. Core points within `eps` of each other link into a cluster. A
non-core point next to a core point is a **border** point and joins the smallest neighboring core
label; the rest are **noise**. Union-find links the core points.

```python
def make_blobs(seed, n=150):
    """Points in the unit square: three blobs and some scattered noise."""
    rng = Rng(seed)
    blobs = [(0.25, 0.3, 0.08), (0.7, 0.7, 0.1), (0.75, 0.25, 0.05)]
    pts = []
    for i in range(n):
        if i % 10 == 9:
            pts.append((rng.uniform(), rng.uniform()))
        else:
            x, y, r = blobs[rng.below(3)]
            pts.append((x + r * (2 * rng.uniform() - 1), y + r * (2 * rng.uniform() - 1)))
    return pts


def dbscan(pts, eps, min_samples):
    n = len(pts)
    near = [[j for j in range(n) if sq_dist(pts[i], pts[j]) <= eps * eps] for i in range(n)]
    core = [len(near[i]) >= min_samples for i in range(n)]   # the count includes i
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in near[i]:
            if core[i] and core[j]:
                a, b = find(i), find(j)
                parent[max(a, b)] = min(a, b)         # a component keeps its smallest index
    labels = []
    for i in range(n):
        if core[i]:
            labels.append(find(i))
        else:                                         # border: smallest neighboring core label
            roots = [find(j) for j in near[i] if core[j]]
            labels.append(min(roots) if roots else -1)
    return labels, core


PTS = make_blobs(4)
labels, core = dbscan(PTS, eps=0.05, min_samples=5)
clusters = sorted(set(labels) - {-1})
border = sum(1 for lab, c in zip(labels, core) if lab != -1 and not c)
print(f"{len(clusters)} clusters, {sum(core)} core, {border} border, {labels.count(-1)} noise")
```

```{.text .output}
3 clusters, 131 core, 5 border, 14 noise
```

The task compares with the plain version by the **adjusted Rand index** (ARI), which ignores how
clusters are numbered. That is why it also counts noise-mask mismatches: ARI cannot tell noise from
a cluster.

```python
from math import comb


def ari(a, b):
    """Adjusted Rand index: 1 for the same grouping, about 0 for chance."""
    pairs = {}
    for x, y in zip(a, b):
        pairs[x, y] = pairs.get((x, y), 0) + 1
    rows, cols = {}, {}
    for (x, y), c in pairs.items():
        rows[x] = rows.get(x, 0) + c
        cols[y] = cols.get(y, 0) + c
    index = sum(comb(c, 2) for c in pairs.values())
    sum_a, sum_b = sum(comb(c, 2) for c in rows.values()), sum(comb(c, 2) for c in cols.values())
    expected = sum_a * sum_b / comb(len(a), 2)
    return (index - expected) / ((sum_a + sum_b) / 2 - expected)


renamed = [-1 if x == -1 else clusters.index(x) for x in labels]
one_off = list(labels)
one_off[labels.index(-1)] = clusters[0]               # one noise point joins a cluster
print(f"renumbered {ari(labels, renamed):.4f}, one point moved {ari(labels, one_off):.4f}")
swapped = [clusters[0] if x == -1 else -1 if x == clusters[0] else x for x in labels]
mismatch = sum((x == -1) != (y == -1) for x, y in zip(labels, swapped)) / len(labels)
print(f"noise swapped with a cluster: ARI {ari(labels, swapped):.4f}, mismatch {mismatch:.2f}")
```

```{.text .output}
renumbered 1.0000, one point moved 0.9863
noise swapped with a cluster: ARI 1.0000, mismatch 0.42
```

Every timed result needs ARI at least 0.99. To pass, each of six workloads, including hidden ones with
200,000 points and with `min_samples = 20`, must be faster than the reference, with ARI no lower
and noise mismatch no higher. 5 of 16 passed.

| Run | ARI | Latency (ms) | Noise mismatch (×10⁻⁵) | Final score | |
|---|---:|---:|---:|---:|---|
| Human reference | 0.9999 | 21 | 4 | 63.7 | |
| Claude Opus 5.5 | 1.000 | 2.35 | 0 | 72.9 | pass |
| Gemini 4 Argon · Pi | 0.9999 | 1.42 | 5.92 | 72.1 | fail |
| GPT-6.1 Sol | 1.000 | 4.69 | 1.5 | 70.7 | pass |

As of October 26, 2026. Gemini 4 Argon · Pi was the fastest and failed on noise. **Claude Opus
5.5** sorted points into cells around pivot points, gave each tile of points a bounding sphere, and
skipped tile pairs whose spheres lie more than `eps` apart. A tensor-core pass settled pairs clearly
inside or outside `eps`, and pairs near the boundary were rechecked with the plain version's exact
32-bit arithmetic, so its noise matched exactly.

## IVF-PQ

**IVF-PQ** is a standard index for approximate nearest-neighbor search. IVF splits the vectors into
lists by their nearest coarse center. PQ compresses each vector's residual from its center: the
residual is cut into `m` parts and each part is replaced by the number of its nearest codeword. A
query probes only its `nprobe` nearest lists and, per list, builds a small table of distances from
its own residual to every codeword, so each stored vector costs `m` table lookups.

```python
def lloyd(points, k, steps):
    centers = [list(map(float, p)) for p in points[:k]]
    for _ in range(steps):
        labels, centers, _ = kmeans_step(points, centers)
    return centers


def nearest(v, centers):
    return min(range(len(centers)), key=lambda c: (sq_dist(v, centers[c]), c))


def build_index(base, nlist=16, m=4, codes=16):
    """IVF: split into lists by a coarse center. PQ: code each residual in m parts."""
    coarse = lloyd(base, nlist, 6)
    lists = [[] for _ in range(nlist)]
    residuals = []
    for i, v in enumerate(base):
        c = nearest(v, coarse)
        lists[c].append(i)
        residuals.append([x - y for x, y in zip(v, coarse[c])])
    sub = len(base[0]) // m
    books = [lloyd([r[p * sub:(p + 1) * sub] for r in residuals], codes, 6) for p in range(m)]
    code = [[nearest(r[p * sub:(p + 1) * sub], books[p]) for p in range(m)] for r in residuals]
    return coarse, lists, books, code


def search(index, q, k, nprobe):
    coarse, lists, books, code = index
    sub = len(q) // len(books)
    probes = sorted(range(len(coarse)), key=lambda c: (sq_dist(q, coarse[c]), c))[:nprobe]
    hits, scanned = [], 0
    for c in probes:
        r = [x - y for x, y in zip(q, coarse[c])]
        table = [[sq_dist(r[p * sub:(p + 1) * sub], w) for w in book]   # one small table
                 for p, book in enumerate(books)]                       # per probed list
        for i in lists[c]:
            hits.append((sum(table[p][code[i][p]] for p in range(len(books))), i))
            scanned += 1
    return [i for _, i in sorted(hits)[:k]], scanned


BASE = make_points(5, 2000, 8)
TESTS = make_points(6, 20, 8)
index = build_index(BASE)
truth = [min(range(len(BASE)), key=lambda i: (sq_dist(q, BASE[i]), i)) for q in TESTS]
full = [search(index, q, 10, 16)[0] for q in TESTS]
for nprobe in (1, 2, 4, 8, 16):
    found = [search(index, q, 10, nprobe) for q in TESTS]
    nn = sum(t in f for t, (f, _) in zip(truth, found)) / len(TESTS)
    iso = sum(len(set(f) & set(g)) for (f, _), g in zip(found, full)) / (10 * len(TESTS))
    scanned = sum(s for _, s in found) / len(TESTS)
    print(f"nprobe {nprobe:2}: scans {scanned:6.1f} codes, iso-recall {iso:.2f}, nn-recall@10 {nn:.2f}")
```

```{.text .output}
nprobe  1: scans  155.8 codes, iso-recall 0.85, nn-recall@10 0.85
nprobe  2: scans  273.8 codes, iso-recall 0.94, nn-recall@10 0.90
nprobe  4: scans  631.0 codes, iso-recall 1.00, nn-recall@10 1.00
nprobe  8: scans 1113.7 codes, iso-recall 1.00, nn-recall@10 1.00
nprobe 16: scans 2000.0 codes, iso-recall 1.00, nn-recall@10 1.00
```

**Iso-recall** compares with the same index searched over every list; **nearest-neighbor recall**
asks whether the true nearest vector is among the k returned. The index is fixed; the public workloads use
8,192 lists, m = 16 parts per vector (16 one-byte codes) and k = 100 on SIFT, and hidden ones reach k = 1,024. Every timed call needs iso-recall 0.99,
and to pass each workload must be faster than the reference with both recalls no lower. 8 of 16
passed.

| Run | Iso-recall | NN recall | Latency (ms) | Final score | |
|---|---:|---:|---:|---:|---|
| Human reference | 1 | 0.967 | 151 | 75.6 | |
| Claude Opus 5.5 | 1 | 0.967 | 1.73 | 80.5 | pass |
| Gemini 4 Argon · Pi | 1 | 0.967 | 3.41 | 79.8 | pass |
| DeepSeek V4.1 Flash | 1 | 0.967 | 19.4 | 78.7 | fail |

Selected runs, as of October 26, 2026. **Claude Opus 5.5** grouped the query–list pairs by list, so each list's
codes are decoded once and compared with every query that probes it as one matrix product. Every
fast pass carries an error bound, and anything near a boundary is recomputed with the plain
search's own arithmetic, so its output matches the slow search exactly.

::: pattern
**Exact, but fast.** Claude Opus 5.5's k-NN, DBSCAN and IVF-PQ passes share one move: a fast
approximate pass with a proven error bound, then exact arithmetic only near the boundary. The
bound decides how little must be recomputed. (Its k-means pass needs no such step: a matrix product
and an exact running minimum. The task pages do not describe the other passing runs.)
:::

# Summary and self-check

::: pattern
**Three lessons from the MLSys tasks.**

1. *Estimate what you skip, and rank by error.* SVG-EAR keeps an estimate of every skipped block and
   spends its budget where the estimate is worst. (The best run, Astra, ranked by weight but used
   measured error to size its budget.)
2. *Every workload, every metric.* Astra beat the SVG-EAR reference on every mean and missed five
   checks; Claude Opus 5.5's Continuum run had a 99th percentile of 4,990 s.
3. *Bound, then be exact.* Claude Opus 5.5's k-NN, DBSCAN and IVF-PQ passes compute approximately,
   prove how far off they can be,
   and redo only what lies near the boundary.
:::

## Exercises

1. In the one-query example, give cluster A's two keys scores 0.5 and 1.5. Which cluster should
   SVG-EAR compute now?
2. In the routing model, rank by error but drop the rest instead of estimating it. Where does it
   land between the other rules?
3. In the Continuum model, double the cache to 28,000 tokens. How much does the TTL still help, and
   why?
4. In the k-NN bound, why must a group whose second value is below the bound be rescanned in full,
   not only its two kept rows?
5. In the IVF-PQ model, use `m = 2` parts instead of 4. How do the recalls change at `nprobe = 16`?
