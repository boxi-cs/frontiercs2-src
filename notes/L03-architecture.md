---
title: "Lecture 03: Architecture"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has three Architecture tasks: **RUNLTS**, a branch predictor that also reads register
values (CBP 2025); **KAMI**, a double-precision matrix-multiply kernel for one GPU thread block (SC
2025); and **Clusterwise SpGEMM**, which multiplies sparse matrices eight rows at a time (SC 2025).
For each one, these notes explain the paper's idea, the part the task removed, how a run is judged,
and what the agents wrote back.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. Every program in these notes has been run, and every output shown is the real
output.

::: instructor
**Sources.** Task pages and results: <https://frontier-cs.org/> (as of October 26, 2026). There is
no case study for these tasks yet; the agents' methods come from the "Solution" section of each task
page. The task statements are the public ones an agent reads. RUNLTS's own averages (3.197 and
140.3) are from its CBP 2025 paper; the 1.39× average speed-up is from the SpGEMM paper's abstract and belongs to its
hierarchical clustering, not the fixed eight-row scheme the task uses.
Nothing here comes from the hidden workloads or the human reference patches.

**Numbers.** Pass counts and scores are from the 16-model leaderboard. The H100 peak (67 FP64
TFLOPS) and memory bandwidth (3.35 TB/s) are NVIDIA's figures for the SXM card; the task does not
name the variant, so treat the bounds in the KAMI section as rough. All toy traces, matrices and
timings are ours.
:::

| Task | What the agent writes | Scored on | Pass | Best final score |
|---|---|---|---|---|
| RUNLTS | the register-value part of a branch predictor | mispredictions, wrong-path cycles | 0 of 16 | 31.3 (reference 31.5) |
| KAMI | the FP64 matrix-multiply kernel of one thread block | throughput | 7 of 16 | 23.0 (reference 18.0) |
| Clusterwise SpGEMM | a clustered sparse format and its multiply | run time, throughput | 12 of 16 | 66.9 (reference 50.0) |

Results from the 16-model leaderboard on frontier-cs.org, as of October 26, 2026.

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Explain how a two-bit counter and a history table predict branches, and when each fails.
2. Explain why a register value can predict a branch that history cannot, and why only the newest producer's value may be used.
3. Explain why winning on every one of 105 traces needs a gain well above the noise.
4. Compute the arithmetic intensity of a small matrix multiply, and say whether it is bound by memory or by compute.
5. Count how often a sparse multiply reads rows of the second matrix, row by row and eight rows at a time.
6. Turn a margin such as "15% faster" into the speed-up a pass needs.

# RUNLTS: predicting branches

A processor fetches instructions far ahead of the ones it is executing. When it meets a
conditional branch, it cannot wait to learn the direction; it **predicts** it and goes on. A wrong
guess means the work fetched since then is thrown away. The task counts both costs per 1,000
instructions: **mispredictions** (BrMisPKI) and the **cycles spent on the wrong path** (CycWpPKI).

The simplest predictor keeps one **two-bit counter** per branch, from 0 to 3. It predicts taken at
2 or 3, and moves one step toward each outcome. One surprise does not flip it.

```python
def step(table, key, taken):
    """Predict with the two-bit counter at table[key] (0..3, taken if 2 or 3), then train it.
    Returns 1 for a misprediction, 0 for a hit."""
    counter = table.get(key, 2)
    table[key] = min(3, counter + 1) if taken else max(0, counter - 1)
    return int((counter >= 2) != taken)


def loop_branch(trips, times):
    """A loop's exit test: taken (stay) trips - 1 times, then not taken (leave)."""
    return ([True] * (trips - 1) + [False]) * times


def alternating(times):
    return [True, False] * times


def two_bit(outcomes):
    table = {}
    return sum(step(table, None, taken) for taken in outcomes)


for name, trace in [("loop of 8", loop_branch(8, 100)), ("alternating", alternating(400))]:
    print(f"{name:12} {len(trace)} branches, two-bit counter misses {two_bit(trace)}")
```

```{.text .output}
loop of 8    800 branches, two-bit counter misses 100
alternating  800 branches, two-bit counter misses 400
```

The counter misses every loop exit, and it misses half of an alternating branch. Both branches are
regular, so a predictor that remembers **history** can do better. The next one keeps a counter for
each pattern of the branch's last `h` outcomes.

```python
def with_history(outcomes, h):
    """One counter per pattern of this branch's last h outcomes."""
    table, history, mistakes = {}, (), 0
    for taken in outcomes:
        mistakes += step(table, history, taken)
        history = (history + (taken,))[-h:] if h else ()
    return mistakes


for h in [0, 1, 4, 7]:
    print(f"history {h}: loop misses {with_history(loop_branch(8, 100), h):3},"
          f" alternating misses {with_history(alternating(400), h):3}")
```

```{.text .output}
history 0: loop misses 100, alternating misses 400
history 1: loop misses 100, alternating misses   1
history 4: loop misses 100, alternating misses   3
history 7: loop misses   1, alternating misses   4
```

One outcome of history is enough for the alternating branch. The loop needs seven: only after seven
takens in a row is the exit next. Real predictors such as **TAGE** keep several tables with
histories of different lengths, from a few branches to thousands, and use the longest one that has
seen the pattern before. A **statistical corrector** then adds votes from other small tables and can
overturn TAGE's guess.

## Values, not just history

Some branches follow data. `if x % 3 == 0` on a loaded value `x` looks random to any history. But
if the instruction that loads `x` has already run when the branch is predicted, the value itself
predicts the branch. This is the idea of **RUNLTS** (Koizumi et al., CBP 2025), which won the 2025
Championship Branch Prediction. It is TAGE with a statistical corrector, plus a component that
learns how branch directions follow **register values**.

Our toy branch tests `x % 3 == 0` on a value from 0 to 63. In three cases out of four, the value is
ready when the branch is predicted; otherwise the predictor falls back to history.

```python
class Rng:
    """Park-Miller generator: small, and exact in JavaScript too."""

    def __init__(self, seed):
        self.state = seed

    def next(self):
        self.state = self.state * 48271 % 2147483647
        return self.state


def data_branch(n, seed=1):
    """A branch on a loaded value x: taken when x % 3 == 0. The value is ready 3 times in 4."""
    rng, trace = Rng(seed), []
    for _ in range(n):
        x = rng.next() % 64
        trace.append((x, rng.next() % 4 != 0, x % 3 == 0))
    return trace


def with_register(trace, h=4):
    """The history table, plus a table indexed by the register value when it is ready."""
    by_history, by_value, history, mistakes = {}, {}, (), 0
    for x, ready, taken in trace:
        miss_history = step(by_history, history, taken)
        mistakes += step(by_value, x, taken) if ready else miss_history
        history = (history + (taken,))[-h:]
    return mistakes


trace = data_branch(1000)
outcomes = [taken for _, _, taken in trace]
print("taken", sum(outcomes), "of 1000; value ready", sum(ready for _, ready, _ in trace), "times")
print("two-bit counter misses", two_bit(outcomes))
print("history of 4 misses   ", with_history(outcomes, 4))
print("plus register misses  ", with_register(trace))
```

```{.text .output}
taken 338 of 1000; value ready 752 times
two-bit counter misses 408
history of 4 misses    420
plus register misses   137
```

History is no better than one counter here: it misses about two branches in five. With the value,
the predictor is right almost every time the value is ready; most of the remaining misses are the
quarter of branches that had to fall back.

## Only the newest value counts

A real processor runs instructions **out of order**. When the branch is predicted, the producer of
a register may not have run yet, and an older producer of the same register may run late, after a
newer one. The task gives the predictor two callbacks: `decode_notify` when an instruction is
decoded and claims a destination register, and `execute_notify` when it runs and the value is known.
A value may be used only if it comes from the newest claimant.

```python
def newest_producer(events):
    """Track r3 through decode and execute events, as the task requires."""
    claim, value = None, None  # newest decoded producer of r3, and its value once it runs
    for kind, seq, *rest in events:
        if kind == "decode":
            claim, value = seq, None
            print(f"decode  #{seq} will write r3  -> r3 unusable")
        elif kind == "execute" and seq == claim:
            value = rest[0]
            print(f"execute #{seq} r3 = {value:<3}  -> r3 = {value}")
        elif kind == "execute":
            print(f"execute #{seq} r3 = {rest[0]:<3}  -> ignored, #{claim} is newer")
        else:
            print(f"predict #{seq}             -> uses r3 = {value}")


newest_producer([("decode", 10), ("decode", 12), ("execute", 12, 5), ("predict", 13),
                 ("execute", 10, 9), ("predict", 14), ("decode", 15), ("predict", 16)])
```

```{.text .output}
decode  #10 will write r3  -> r3 unusable
decode  #12 will write r3  -> r3 unusable
execute #12 r3 = 5    -> r3 = 5
predict #13             -> uses r3 = 5
execute #10 r3 = 9    -> ignored, #12 is newer
predict #14             -> uses r3 = 5
decode  #15 will write r3  -> r3 unusable
predict #16             -> uses r3 = None
```

Instruction 10 runs last but is older than 12, so its value 9 is stale. A predictor that kept "the
last value written" would use 9 at the second prediction. After instruction 15 is decoded, r3 has no
usable value until 15 runs.

::: pattern
**Use only what the hardware would know.** The predictor may read a value only after its producer
has run, and only if no newer instruction has claimed the register. Anything else is a look into the
future, and the task rejects it.
:::

## What the task removes

The task keeps TAGE, the rest of the statistical corrector and the simulator. It removes the
register-value component of the corrector, and the agent writes it in nine marked regions of one
C++ file: its state, its snapshot at prediction time, how it observes decode and execute events, its
vote (`pv.LSUM`) and its training. Which registers to use, how to represent a value, how big the
tables are and how much the vote weighs are all the agent's choice. The whole predictor must fit
**192 KiB** of declared state; the reference uses 1,570,890 of the 1,572,864 bits.

# RUNLTS: how it is judged, and what the agents did

Each submission runs a cycle-aware simulator over the **105 traces** of CBP 2025, in six groups of
programs (compression, floating point, infrastructure, integer, media, web). Only the second half of
each trace is measured. The score combines the two means:

```python
from math import sqrt


def runlts_score(br_mis_pki, cyc_wp_pki):
    return 100 / sqrt((1 + br_mis_pki) * (1 + cyc_wp_pki / 100))


print(f"paper    {runlts_score(3.197, 140.3):.1f}")
print(f"Opus 5.5 {runlts_score(3.24, 141):.1f}")
print(f"5% fewer {runlts_score(3.197 * 0.95, 140.3 * 0.95):.1f}")
```

```{.text .output}
paper    31.5
Opus 5.5 31.3
5% fewer 32.6
```

The paper's own averages give the reference's score of 31.5. Five percent fewer of both errors
would add only about one point: the score moves slowly.

## The pass rule

To pass, a predictor must make strictly fewer mispredictions **and** lose strictly fewer wrong-path
cycles than the reference, on **every one of the 105 traces**. A tie anywhere fails. The task
statement warns how noisy a single trace is: shifting the predictor's random stream by one call,
which has nothing to do with quality, moves one trace's mispredictions by about 1% (standard
deviation). Our model: if each trace's change is spread around the average gain with that 1%
deviation, what is the chance of winning all 105?

```python
from math import erf


def chance_all_win(gain, noise, traces=105):
    """Chance of beating the reference on every trace, if each trace's change is
    normally spread around `gain` (as a share) with standard deviation `noise`."""
    one = 0.5 * (1 + erf(gain / (noise * sqrt(2))))
    return one ** traces


for gain in [0.01, 0.02, 0.03, 0.04]:
    print(f"{gain:.0%} better on average: {chance_all_win(gain, 0.01):.3f}")
```

```{.text .output}
1% better on average: 0.000
2% better on average: 0.089
3% better on average: 0.868
4% better on average: 0.997
```

A predictor 1% better on average almost surely loses somewhere. It takes about 3% better on average
to be fairly safe, and RUNLTS is already the competition's winner. Our model checks mispredictions
only; the wrong-path cycles must also win on every trace, so the real chance is lower.

## What the agents did

No model passed, and none scored above the human reference (31.5). Claude Opus 5.5 came closest at
31.3, with 3.24 mispredictions and 141 wrong-path cycles per 1,000 instructions, against 3.2 and 140
for the reference. Every one of the sixteen runs scored between 30.9 and 31.3. With an FDI of 88.8,
RUNLTS is the fifth-hardest of the 48 tasks.

Opus's component, from the task page:

1. *Tracking the newest producer.* For 33 registers (the 31 general ones, the stack pointer and the
   flags) it records which instruction last claimed each one at decode, and stores a value only if it
   comes from that claimant, as in our `newest_producer`.
2. *Picking recent registers.* At each prediction it takes the six registers with the most recent
   usable values and hashes each with the branch address into one shared table of small signed
   counters.
3. *Exact and coarse lookups.* Each register is looked up twice: by its exact value, and by a coarse
   class (magnitude, sign and two low bits), so that nearby values share what they learn.
4. *Joining the vote.* The counters' sum, with saturated counters counted three times, is added to
   the corrector's sum, with a trained weight per lookup group.

::: pitfall
**Rebuilding the paper is not enough.** The reference is, by every sign, the paper's own component:
its storage and the paper's averages match the leaderboard's 31.5. A good reconstruction lands close to it, about 1% worse, and the pass
rule asks for a clear win on every trace.
:::

# KAMI: a matrix multiply inside one thread block

A GPU runs threads in **thread blocks**. A block runs on one streaming multiprocessor, and its
threads come in **warps** of 32. Many HPC and AI workloads need a great number of *small* matrix
products, one per block: general, low-rank, batched and sparse multiplication.
**KAMI** (Wang et al., SC 2025) brings ideas from **communication-avoiding** matrix multiplication,
first built for clusters of machines, into a single block: the warps split the work so that they
exchange as little data as possible through shared memory, and they compute on the double-precision
**tensor cores**.

## Memory or compute?

Each block computes `C = A Bᵀ + 0.5 C` on its own matrices, in double precision (8 bytes per
number). The task's four public shapes, with the batch of blocks it launches for each:

```python
SHAPES = [(16, 16, 24, 65536), (32, 64, 48, 8192), (64, 64, 32, 8192), (128, 64, 64, 4096)]
PEAK_TFLOPS, BANDWIDTH_TBS = 67, 3.35  # H100 SXM: FP64 tensor cores, HBM3


def block_cost(m, n, k):
    """Operations and bytes of one block: C = A B^T + 0.5 C, all FP64 (8 bytes)."""
    flops = 2 * m * n * k
    moved = 8 * (m * k + n * k + 2 * m * n)  # read A, B, C; write C
    return flops, moved


for m, n, k, batch in SHAPES:
    flops, moved = block_cost(m, n, k)
    intensity = flops / moved
    bound = min(PEAK_TFLOPS, intensity * BANDWIDTH_TBS)
    print(f"{m:3}x{n}x{k}: {flops * batch:>13,} FLOP, A+B+C {(moved - 8 * m * n) * batch / 2 ** 20:3.0f} MiB,"
          f" {intensity:.2f} FLOP/byte, at most {bound:4.1f} TFLOPS")
```

```{.text .output}
 16x16x24:   805,306,368 FLOP, A+B+C 512 MiB, 1.20 FLOP/byte, at most  4.0 TFLOPS
 32x64x48: 1,610,612,736 FLOP, A+B+C 416 MiB, 2.82 FLOP/byte, at most  9.5 TFLOPS
 64x64x32: 2,147,483,648 FLOP, A+B+C 512 MiB, 2.67 FLOP/byte, at most  8.9 TFLOPS
128x64x64: 4,294,967,296 FLOP, A+B+C 640 MiB, 4.57 FLOP/byte, at most 15.3 TFLOPS
```

The operation counts and the data sizes match the task's table. The **arithmetic intensity**, the
operations per byte moved, is 1 to 5. An H100 needs about 20 to keep its FP64 tensor cores busy
(67 TFLOPS against 3.35 TB/s). So every shape is bound by **memory bandwidth**: the bound is the
bandwidth times the intensity, far below the peak. The kernel's first job is to keep memory busy.

## How the warps share the work

Inside a block, the tensor cores work on fragments of 16×8 outputs. Suppose the block's warps form
a `rows × cols` grid over C. Each warp must read its strip of A (its rows, all of K) and its strip of
B from shared memory. More warps compute in parallel, but read more in total; the shape of the grid
decides how much more.

```python
def shared_loads(m, n, k, rows, cols):
    """Warps in a rows x cols grid over C. Each warp reads its strip of A and of B."""
    return k * (m * cols + n * rows)


def best_layout(m, n, k, warps):
    """Among layouts that split the 16x8 tensor-core fragments of C evenly, the fewest loads."""
    options = [(shared_loads(m, n, k, r, warps // r), r, warps // r)
               for r in range(1, warps + 1)
               if warps % r == 0 and (m // 16) % r == 0 and (n // 8) % (warps // r) == 0]
    return min(options) if options else None


for m, n, k, _ in SHAPES:
    row = []
    for warps in [1, 2, 4, 8]:
        best = best_layout(m, n, k, warps)
        label = f"{warps} warp{'s' if warps > 1 else ' '}"
        row.append(f"{label}: {best[1]}x{best[2]} {best[0]:>6,}" if best else f"{label}: none")
    print(f"{m:3}x{n}x{k}  " + " | ".join(row))
```

```{.text .output}
 16x16x24  1 warp : 1x1    768 | 2 warps: 1x2  1,152 | 4 warps: none | 8 warps: none
 32x64x48  1 warp : 1x1  4,608 | 2 warps: 1x2  6,144 | 4 warps: 1x4  9,216 | 8 warps: 2x4 12,288
 64x64x32  1 warp : 1x1  4,096 | 2 warps: 1x2  6,144 | 4 warps: 2x2  8,192 | 8 warps: 2x4 12,288
128x64x64  1 warp : 1x1 12,288 | 2 warps: 2x1 16,384 | 4 warps: 2x2 24,576 | 8 warps: 4x2 32,768
```

The 16×16 block has only two fragments, so at most two warps can share it evenly. For 128×64, eight
warps read least as 4×2 (32,768 loads), not 8×1 or 1×8; with four warps, 2×2 and 4×1 tie. This is the kind of choice KAMI makes at
compile time for each shape.

## What the task removes, and how it is judged

The task removes KAMI's FP64 kernel, the code each block runs, and the agent writes it. A fixed
harness gives every block its own slices of A, B and C, launches the kernel once, and checks every
output element against a CPU result. The final run adds four hidden shapes to the four public ones.

Speed is `TFLOPS = 2·M·N·K·batch / (time in ms × 10⁹)`. Candidate and reference run six times each,
in alternating order: three pairs with the candidate first, three with the reference first. A
launch's position can change its time, so each side's value is the geometric mean of its median in
each order. With balanced orders, a steady position effect cancels:

```python
from statistics import median


def crossover_ratio(cand, ref, cand_first):
    """Workload value = geometric mean of the median in each launch order."""
    def value(samples):
        first = median(s for s, f in zip(samples, cand_first) if f)
        second = median(s for s, f in zip(samples, cand_first) if not f)
        return (first * second) ** 0.5
    return value(cand) / value(ref)


# Our toy: the candidate is truly 1.20x faster, but whoever launches first runs 4% slower.
order = [True, False] * 3
cand = [6.0 * (0.96 if f else 1) for f in order]
ref = [5.0 * (1 if f else 0.96) for f in order]
print(f"balanced crossover: {crossover_ratio(cand, ref, order):.3f}")
lopsided = [True, True, False]
print(f"2:1 plain medians:  {median(6.0 * (0.96 if f else 1) for f in lopsided) / median(5.0 * (1 if f else 0.96) for f in lopsided):.3f}")
```

```{.text .output}
balanced crossover: 1.200
2:1 plain medians:  1.152
```

The task statement says an earlier version of the harness did show such a position bias. A shape
passes only if the candidate's ratio is above a threshold measured from the reference's own timing
noise; a pass needs all eight shapes. The score is `100·G / (G + 20)`, with `G` the geometric mean of
the eight values in TFLOPS:

```python
def kami_score(g):
    return max(0, min(100, 100 * g / (g + 20)))


for name, g in [("G = 4.39", 4.39), ("G = 5.97", 5.97), ("G = 20", 20)]:
    print(f"{name}: score {kami_score(g):.1f}")
```

```{.text .output}
G = 4.39: score 18.0
G = 5.97: score 23.0
G = 20: score 50.0
```

A geometric mean of about 4.4 TFLOPS gives the reference's 18.0, and about 6.0 gives the best run's
23.0. The leaderboard's TFLOPS column is an ordinary mean over the eight shapes, so it is higher:
4.89 and 6.54.

## What the agents did

Seven of sixteen models passed, and fourteen scored above the reference. **Claude Opus 5.5** scored
23.0 (6.54 TFLOPS) and Gemini 4 Argon · Pi also 23.0 (6.56 TFLOPS). Opus's kernel, from the task
page:

1. *Streaming the inputs.* Since the batch is bound by memory, it copies A and B into shared memory
   with asynchronous 16-byte copies: all of K at once when they fit in 48 KiB, otherwise in a
   pipeline of stages over K.
2. *Fusing the old C.* Each thread loads its part of C straight into its accumulator registers and
   halves it before the products start, so the read of C overlaps the reads of A and B.
3. *Tensor cores, laid out at compile time.* The FP64 tensor-core instruction works on 16×8×8
   fragments. It lays the warps over them so that as many warps as divide the grid evenly take part,
   with the fewest shared-memory loads per product, as in `best_layout`.
4. *Conflict-free loads.* Inside each step of 8 in K, it reorders the K positions a thread needs so
   that each pair becomes one 16-byte load, and swizzles rows so that simultaneous reads hit
   different memory banks.
5. *Reverse launch order, its own idea.* Block `b` takes the `b`-th slice from the end. The first
   blocks then start on the end of the batch that was written last, which is still in cache.

::: pitfall
**A good score does not mean a pass.** Muse Wonder 1.0 scored 21.7 and failed; GPT-6.1 Sol also
scored 21.7 and passed, and GLM 5.3 passed at 21.5. The score averages the shapes; the pass needs
every shape above the noise threshold.
:::

# Clusterwise SpGEMM: eight rows at a time

Multiplying two **sparse** matrices (SpGEMM) is a core step of graph analytics and scientific
computing. The usual method, **Gustavson's**, works row by row: for each stored entry `A[i, k]`, it
reads row `k` of B and adds `A[i, k] · B[k, :]` into row `i` of the result. Each stored entry of A
costs one read of a row of B.

*Improving SpGEMM Performance Through Matrix-Reordering and Cluster-wise Computation* (Islam, Xu,
Dai and Buluç, SC 2025) groups neighboring rows of A into **clusters**. For a cluster, it reads each
needed row of B once and uses it for every row of the cluster. To make the rows of a cluster share
columns, it first **reorders** the rows so that similar rows sit together. The paper compares 10 row
orderings and 3 ways of forming clusters on 110 matrices; its best scheme, hierarchical clustering, is
1.39× faster on average. The task uses the simplest scheme: fixed clusters of eight consecutive rows
after an RCM reordering.

## Counting the reads

Our matrix is the 5-point stencil of an 8×8 grid: 64 rows, each with up to five entries. We count
the rows of B read, one row at a time and eight at a time, in the grid's order, after shuffling the
rows, and after a simple reordering of our own (sorting rows by their column lists).

```python
def stencil(side):
    """The 5-point stencil matrix of a side x side grid, as sorted column lists per row."""
    rows = []
    for i in range(side * side):
        r, c = divmod(i, side)
        nbrs = [(r - 1, c), (r, c - 1), (r, c), (r, c + 1), (r + 1, c)]
        rows.append(sorted(rr * side + cc for rr, cc in nbrs if 0 <= rr < side and 0 <= cc < side))
    return rows


def b_row_reads(a_rows, width):
    """Rows of B read: once per distinct column in each group of `width` consecutive rows."""
    return sum(len(set().union(*a_rows[g:g + width])) for g in range(0, len(a_rows), width))


A = stencil(8)
shuffled = A[:]
rng = Rng(5)
for i in range(len(shuffled) - 1, 0, -1):  # Fisher-Yates with our generator
    j = rng.next() % (i + 1)
    shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
reordered = sorted(shuffled, key=lambda cols: cols)
print("stored entries of A:", sum(map(len, A)))
for name, rows in [("grid order", A), ("shuffled", shuffled), ("reordered", reordered)]:
    print(f"{name:10}  one row at a time {b_row_reads(rows, 1)}, eight at a time {b_row_reads(rows, 8)}")
```

```{.text .output}
stored entries of A: 288
grid order  one row at a time 288, eight at a time 176
shuffled    one row at a time 288, eight at a time 229
reordered   one row at a time 288, eight at a time 166
```

Row by row, the order does not matter: 288 reads. Eight at a time, the grid order needs 176, because
neighboring rows share columns. Shuffled rows share fewer, and the reordering wins the sharing back.
The task gives the order (a fixed RCM ordering per matrix); the agent's part is the format and the
multiply.

## The clustered format

For each group of eight rows, the format keeps one sorted list of column ids, and eight values per
id, one per row (zero where a row has no entry). The multiply walks the list, reads row `k` of B
once, and updates all eight lanes of every output column it reaches.

```python
def to_clusters(a_rows, a_vals, width=8):
    """Each group of rows: one sorted list of column ids, with `width` values per id."""
    clusters = []
    for g in range(0, len(a_rows), width):
        group = range(g, min(g + width, len(a_rows)))
        ids = sorted(set().union(*(a_rows[i] for i in group)))
        vals = [[dict(zip(a_rows[i], a_vals[i])).get(k, 0) for i in group] for k in ids]
        clusters.append((ids, vals))
    return clusters


def multiply_clusters(clusters, b_rows, b_vals):
    """Read row k of B once per cluster; update all lanes of every output column it reaches."""
    out = []
    for ids, vals in clusters:
        acc = {}
        for k, lanes in zip(ids, vals):
            for j, b in zip(b_rows[k], b_vals[k]):
                if j not in acc:
                    acc[j] = [a * b for a in lanes]  # first path to column j
                else:
                    acc[j] = [s + a * b for s, a in zip(acc[j], lanes)]
        out.append(acc)
    return out


def multiply_rows(a_rows, a_vals, b_rows, b_vals):
    """Plain row-by-row product (Gustavson), for checking."""
    out = []
    for cols, vals in zip(a_rows, a_vals):
        acc = {}
        for k, a in zip(cols, vals):
            for j, b in zip(b_rows[k], b_vals[k]):
                acc[j] = acc.get(j, 0) + a * b
        out.append(acc)
    return out


vals = [[(r * 7 + c) % 5 + 1 for c in cols] for r, cols in enumerate(reordered)]
plain = multiply_rows(reordered, vals, A, [[1] * len(c) for c in A])
clustered = multiply_clusters(to_clusters(reordered, vals), A, [[1] * len(c) for c in A])
same = all(plain[g * 8 + lane].get(j, 0) == lanes[lane]
           for g, acc in enumerate(clustered) for j, lanes in acc.items() for lane in range(8))
print("clusters", len(clustered), "| output columns stored", sum(map(len, clustered)),
      "| scalar entries", sum(map(len, plain)), "| same values:", same)
```

```{.text .output}
clusters 8 | output columns stored 261 | scalar entries 676 | same values: True
```

The output is clustered too: 261 column ids, each with eight values, hold the 676 nonzero results.
Our integer values make both products equal exactly.

::: pitfall
**Match the reference's arithmetic, not just A·B.** The task fixes the order of additions and a
rule from the source: the first path to an output column always sets it, but a later path adds only
when `|A[i, k]|` is at least about 10⁻⁶. So which rows share a cluster can change the values, and an
ordinary product, correct as mathematics, can fail the check. Our toy leaves this rule out.
:::

## How it is judged

Each submission multiplies whole matrices from structural mechanics, numerical stencils, irregular
systems and directed graphs, on 60 CPU threads. The time counts everything from loading the file to
the end of the process, over seven alternating pairs of runs. To pass, on every matrix the median
time must be **below 0.85 times** the reference's, and the throughput above the reference's divided
by 0.85. The score is `100·G / (1 + G)`, with `G` the geometric mean of the speed-ups.

```python
def spgemm_result(speedups):
    """Per-matrix speed-ups (reference time / candidate time) -> score and pass."""
    g = 1
    for s in speedups:
        g *= s
    g **= 1 / len(speedups)
    passes = all(1 / s < 0.85 for s in speedups)
    return round(100 * g / (1 + g), 1), passes


print(spgemm_result([1.0] * 8))
print(spgemm_result([1.15] * 8))
print(spgemm_result([1.18] * 8))
print(spgemm_result([3.0] * 7 + [1.1]))
```

```{.text .output}
(50.0, False)
(53.5, False)
(54.1, True)
(72.6, False)
```

"More than 15% faster in time" means a speed-up above 1/0.85 ≈ 1.176, so 1.15× everywhere fails and
1.18× passes. A run three times faster on seven matrices, but only 1.1× on the eighth, scores 72.6
and fails.

## What the agents did

Twelve of sixteen models passed, and thirteen scored above the reference (50.0). With an FDI of 10.3,
it is the third-easiest task of the 48. **Claude Opus 5.5** scored 66.9: 2.87 s against the
reference's 6.17 s, and 213 against 127 MFLOP/s. From the task page:

1. *Building the format* in two passes: one counts each cluster's list, one fills it.
2. *Counting output columns first*, with a hash table or a bitmap, so the output is allocated exactly.
3. *Eight rows at once.* For each column id, it reads row `k` of B once and adds each product into the
   eight lanes with one 512-bit vector instruction where the processor has it, keeping the
   reference's order of additions so the values match.
4. *Streaming the output.* A cluster accumulates in scratch memory that stays in cache, then is
   copied out with stores that bypass the cache; large arrays use huge memory pages.
5. *Balancing the threads.* Each cluster's work is estimated from the rows of B it reads. Heavy
   clusters run first, each on its own; the rest run in runs of about equal work.

Kimi K3 scored 56.7 (4.84 s on average) and still failed: faster on average, but not by 15% on every
matrix. Three runs scored 0.

# Summary and self-check

::: pattern
**Three lessons from the Architecture tasks.**

1. *Find the bottleneck first.* KAMI's blocks are bound by memory, not arithmetic; the best kernels
   are built to keep memory busy. SpGEMM's cost is the reads of B, which clusters share.
2. *A margin changes the target.* "15% faster" means 1.18×; "every trace, with 1% noise" means a few
   percent on each one. Know the pass bar before you aim.
3. *A tuned reference is hard to beat.* RUNLTS's reference is a competition winner, and the gain
   left is smaller than the noise of one trace. All sixteen runs stayed within 2% of its score.
:::

## Exercises

1. Write a predictor that keeps one history of the last `h` outcomes of *all* branches (global
   history) and runs the loop and alternating branches interleaved. How long must `h` be now?
2. In `data_branch`, make the value ready only one time in two. How many mispredictions does
   `with_register` make? What would you expect, before running it?
3. Compute the arithmetic intensity of a 256×256×256 block. Is it still bound by memory on an H100?
   *Solution:* 2 × 256³ = 33,554,432 operations; 8 × (4 × 65,536) = 2,097,152 bytes; 16 operations
   per byte. The bound is 16 × 3.35 ≈ 53.6 TFLOPS, still below the 67 TFLOPS peak, but close: much
   larger blocks become compute bound.
4. In the SpGEMM count, use clusters of 4 and of 16 rows. How do the reads of B change? Why might the
   task fix the width at eight?
5. *Open.* Find a sparse matrix on which clustering eight rows stores *more* values in the cluster
   format than plain rows do. What makes the format wasteful there?
