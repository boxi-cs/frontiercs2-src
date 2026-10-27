---
title: "Lecture 04: Network"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has three Network tasks: **BBQ**, a hardware priority queue that picks the next packet
a network card sends (NSDI 2024); **MetaOpt**, which finds the traffic on which a routing heuristic
does worst (NSDI 2024); and **Shockwave**, which shares GPUs among training jobs whose batch sizes
change (NSDI 2023). For each one, these notes explain the paper's idea, the part the task removed,
how a run is judged, and what the agents wrote back.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. Every program in these notes has been run, and every output shown is the real
output.

::: instructor
**Sources.** Task pages and results: <https://frontier-cs.org/> (as of October 26, 2026). The
BBQ figures follow the case study *Two Faster Clocks for a Hardware Priority Queue* (October 18,
2026). The task statements are the public ones an agent reads. Nothing here comes from the hidden
workloads or the human reference patches.

**Numbers.** Pass counts and scores are from the 16-model leaderboard. The BBQ case study counted
twelve models, so it names three passes where the task page now shows five.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. State the FrontierCS 2 pass rule, and explain why a high score can still fail.
2. Remove the best packet from a BBQ bitmap tree by hand, and say when a bit turns to 0.
3. Compute a clock period under the task's timing model, and turn it into operations per second.
4. Explain why the BBQ reference waits on a memory read, and the two ways agents removed the wait.
5. Compute the gap between optimal routing and a combined heuristic on a small network.
6. Compare scheduling policies on makespan, completion time and fairness, and see why one policy rarely wins all four.

# How a FrontierCS 2 task works

Each task starts from a paper and the code its authors released. The task removes the paper's key
contribution from that code. An agent gets the rest of the code, the task statement and five hours,
and writes the missing part back. The authors' code is the **human reference**.

The judge runs the agent's final version on **hidden workloads**. A run **passes** only if it beats
the human reference on every metric, on every hidden workload. Each task also gives a continuous
**score**, but the score does not decide a pass.

```python
def passes(candidate, reference, lower_is_better):
    """True only if the candidate beats the reference on every metric of every workload."""
    for cand, ref in zip(candidate, reference):
        for metric, better_low in lower_is_better.items():
            if better_low and not cand[metric] < ref[metric]:
                return False
            if not better_low and not cand[metric] > ref[metric]:
                return False
    return True


LOWER = {"latency": True, "throughput": False}
reference = [{"latency": 30, "throughput": 2.0}, {"latency": 40, "throughput": 2.5}]
fast_but_slips = [{"latency": 15, "throughput": 4.0}, {"latency": 41, "throughput": 5.0}]
small_but_steady = [{"latency": 29, "throughput": 2.1}, {"latency": 39, "throughput": 2.6}]
print(passes(fast_but_slips, reference, LOWER))
print(passes(small_but_steady, reference, LOWER))
```

```{.text .output}
False
True
```

The first candidate is much faster on average, but its latency on the second workload is one unit
worse, so it fails. The second improves everything by a little, and it passes.

This toy is strict on every metric. Some tasks allow a tie on a metric: in BBQ the worst latency may
equal the reference's, and in MetaOpt an equal gap passes. Each task page states its own rule.

The agent also gets **train calls**: it can submit a version and see its score and how many public
workloads it beats. The hidden workloads are not the public ones. In BBQ they include a bitmap width
that train feedback never shows.

| Task | What the agent writes | Scored on | Pass | Best final score |
|---|---|---|---|---|
| BBQ | the logic of each level of a hardware priority queue | throughput, latency | 5 of 16 | 42.2 (reference 26.0) |
| MetaOpt | a search for traffic on which a heuristic does worst | gap found | 4 of 16 | 52.0 (reference 47.8) |
| Shockwave | each round's choice of jobs on four GPUs | makespan, completion time, fairness | 4 of 16 | 47.3 (reference 41.9) |

# BBQ: a priority queue built from bitmaps

A network card or a switch needs a **priority queue** to schedule packets. Each packet gets an
integer priority, and the queue must hand out the best one next, millions of times a second.
**BBQ** (Atre, Sadok and Sherry, NSDI 2024) builds that queue as a circuit.

Take 16 priorities, 0 to 15, with 0 the best. BBQ keeps them in a tree of 4-bit bitmaps. The bottom
level has four rows of four bits, one bit per priority. The top level has one row; its bit `i` is 1
when row `i` below holds a 1. Each bit also has a **counter** of the packets below it. A bit is 1
exactly when its counter is above 0, so the program below keeps only the counters.

```python
W = 4  # bits per bitmap row


def new_queue():
    return {"top": [0] * W, "rows": [[0] * W for _ in range(W)]}


def enqueue(q, prio):
    row, col = divmod(prio, W)
    q["top"][row] += 1
    q["rows"][row][col] += 1


def first_one(counts):
    """The first bit that is 1, that is, the first counter above 0."""
    return next(i for i, c in enumerate(counts) if c > 0)


def bits(counts):
    return "".join("1" if c else "0" for c in counts)


def show(q):
    print("top   ", bits(q["top"]), q["top"])
    for r, row in enumerate(q["rows"]):
        print(f"row {r} ", bits(row), row)


q = new_queue()
for prio in [1, 1, 2, 9, 9]:
    enqueue(q, prio)
show(q)
```

```{.text .output}
top    1010 [3, 0, 2, 0]
row 0  0110 [0, 2, 1, 0]
row 1  0000 [0, 0, 0, 0]
row 2  0100 [0, 2, 0, 0]
row 3  0000 [0, 0, 0, 0]
```

The queue holds two packets of priority 1, one of priority 2 and two of priority 9. To remove the
best packet, follow the first 1 at each level: bit 0 at the top, so row 0; bit 1 in row 0, so
priority 1. Then subtract one from each counter on the way. A bit turns to 0 when its counter does.

```python
def dequeue_min(q):
    row = first_one(q["top"])
    col = first_one(q["rows"][row])
    q["top"][row] -= 1
    q["rows"][row][col] -= 1
    return row * W + col


for k in range(3):
    before = bits(q["top"]), bits(q["rows"][0])
    prio = dequeue_min(q)
    after = bits(q["top"]), bits(q["rows"][0])
    print(f"removal {k + 1}: priority {prio}; top {before[0]}->{after[0]}, row 0 {before[1]}->{after[1]}")
```

```{.text .output}
removal 1: priority 1; top 1010->1010, row 0 0110->0110
removal 2: priority 1; top 1010->1010, row 0 0110->0010
removal 3: priority 2; top 1010->0010, row 0 0010->0000
```

The first removal changes no bit. The second empties priority 1, so bit 1 of row 0 turns to 0. The
third takes priority 2 and empties row 0, so bit 0 of the top turns to 0 as well.

::: pattern
**Each removal must know whether a count was 1.** That decides whether a bit clears. The next
removal comes one clock cycle later and must already see the result. This back-to-back dependency
is what the whole task is about.
:::

With width 4, two levels give 16 priorities and three give 64. The hidden workloads go up to three
levels of width 16: 4,096 priorities.

## What the task removes

The task keeps the circuit around the queue and removes the logic of its tree levels. That logic is
a Python program that writes the circuit (SystemVerilog), and the agent writes it back. Each level
must serve enqueue, dequeue-min and dequeue-max, even when operations arrive back to back.

The judge simulates every design on nine operation traces at five tree sizes. Every response must
match a correct queue. Then it measures two speeds on each workload: **operations per second**, and
the **latency** of the slowest operation. To pass, throughput must beat the reference and the worst
latency must be no longer, on every workload.

# BBQ: the clock, and two faster designs

A circuit works in ticks of a clock. Between ticks, values wait in **registers**. In each tick,
values leave the registers, pass through logic, and must settle in the next registers before the
next tick. The **clock period** is the time of the slowest such stretch.

The task times every design with a fixed model. Synthesis cuts the logic into **lookup tables**
(LUTs), the basic gate of an FPGA. Each LUT on a stretch costs 500 ps, every period carries a fixed
300 ps, a stretch that starts at a memory read costs 1,000 ps more, and one that starts at a FIFO
status flag costs 500 ps more.

```python
START = {"register": 0, "fifo flag": 500, "memory": 1000}


def period_ps(luts, start="register"):
    return 300 + START[start] + 500 * luts


print(period_ps(3), period_ps(3, "memory"), period_ps(1, "memory"))
```

```{.text .output}
1800 2800 1800
```

Speed is operations per second: operations per cycle divided by the period. Every design in the
case study finishes about 0.68 operations per cycle, so the period decides.

```python
def ops_per_second(period, ops_per_cycle=0.68):
    return ops_per_cycle / (period * 1e-12)


print(f"{ops_per_second(2800):.3g} ops/s at 2,800 ps, {ops_per_second(1800):.3g} at 1,800 ps")
```

```{.text .output}
2.43e+08 ops/s at 2,800 ps, 3.78e+08 at 1,800 ps
```

No design can go below 1,800 ps. The stage that reads the priority buckets is fixed, outside the
agent's part, and it reads a memory and passes one LUT: `period_ps(1, "memory")`.

## Where the human reference waits

The reference keeps the top level in registers. Below it, the counters sit in **memory blocks**,
which pack thousands of values into little space. A lower level takes three stages: search the row
and ask memory for the counter; receive the counter; update it and write it back.

A memory read lands late in its cycle. By then, an operation just ahead may have changed the same
counter. So after the read, the level compares the counter with what the operations ahead wrote and
keeps the newest value. That comparison costs three LUTs after the memory: 2,800 ps on the three
smallest trees. On the two largest, the search for the first 1 is slower still: 3,300 and 3,800 ps.

## Two ways to remove the wait

**Gemini 4 Argon · Pi** (the case study calls it Gemini 4 Argon) kept every memory. It noticed that *which* value is newest does not depend on the
value; it depends on which operations ahead touched the same counter, and registers already hold
that. So it computes the choice from registers while the read is in flight. When the counter lands,
one LUT picks it or a newer value: `period_ps(1, "memory")`, the floor.

**Claude Opus 5.5** removed the memory. Each bucket gets three registers: its bit, its count, and a
flag for "count is 1". Registers can be read at any moment, so a level needs one stage, not three.
An operation leaves the level before the next one enters it, so there is no newer value to look for.

| Tree | Reference (ps) | Gemini 4 Argon · Pi (ps) | Claude Opus 5.5 (ps) |
|---|---|---|---|
| 2 levels, width 4 | 2,800 | 1,800 | 1,800 |
| 2 levels, width 8 | 2,800 | 2,300 | 1,800 |
| 3 levels, width 4 | 2,800 | 1,800 | 1,800 |
| 3 levels, width 8 | 3,300 | 2,300 | 1,800 |
| 3 levels, width 16 | 3,800 | 2,800 | 2,300 |

At the same operations per cycle, the speed-up is the ratio of the periods.

```python
TREES = ["2x4", "2x8", "3x4", "3x8", "3x16"]
REF = [2800, 2800, 2800, 3300, 3800]
GEMINI = [1800, 2300, 1800, 2300, 2800]
OPUS = [1800, 1800, 1800, 1800, 2300]
for tree, r, g, o in zip(TREES, REF, GEMINI, OPUS):
    print(f"{tree:5} Gemini {r / g:.2f}x  Opus {r / o:.2f}x")
```

```{.text .output}
2x4   Gemini 1.56x  Opus 1.56x
2x8   Gemini 1.22x  Opus 1.56x
3x4   Gemini 1.56x  Opus 1.56x
3x8   Gemini 1.43x  Opus 1.83x
3x16  Gemini 1.36x  Opus 1.65x
```

The measured speed-ups in the case study are 1.22–1.56× for Gemini and 1.56–1.84× for Opus. They
differ from these ratios in the second decimal, because the designs do not finish exactly the same
operations per cycle.

::: pitfall
**Speed is not free.** At 4,096 priorities, Opus's design uses 26,763 LUTs and 48,454 registers,
against 1,694 and 2,431 for the reference; Gemini's uses 2,126 and 2,295. The task scores speed and
correctness, not size. Three other models also moved the counters into registers, but ran at 5,300
to 8,300 ps at width 16 and failed. Registers alone did not make a fast clock; the short single
stage did.
:::

::: pitfall
**The hidden workloads are wider than the feedback.** GPT-6 Astra scored 40.4, reached 1,800 ps on
every tree of the feedback, and still failed: at width 16 its clock rose to 4,800 ps, slower than
the reference's 3,800. Opus had written a second form for bottom levels of more than 1,024 buckets.
:::

# MetaOpt: traffic that defeats a heuristic

A wide-area network routes traffic between many pairs of sites. The best routing solves a
**linear program** (LP), which can be slow, so operators use **heuristics**. A heuristic is fast
but sometimes far from optimal. **MetaOpt** (NSDI 2024) asks: *on which traffic does the heuristic
do worst?* The answer tells an operator how much the heuristic can cost.

The heuristic in the task keeps the better of two shortcuts:

- **POP** splits the pairs into groups. Each group gets an equal share of every link and is solved
  on its own.
- **Demand pinning** (DP) sends every small demand (at most 6) on its shortest path, then optimizes
  the rest with what is left.

The **gap** of a traffic matrix `d` is `OPT(d) - max(POP(d), DP(d))`. The task removes MetaOpt's
search for traffic with a large gap, and the agent writes it.

## A small LP solver

To compute `OPT`, we need an LP solver. This one maximizes `c·x` subject to `Ax <= b` and `x >= 0`,
with `b >= 0`, using the simplex method on exact fractions.

```python
from fractions import Fraction


def simplex_max(c, A, b):
    """Maximise c.x with A x <= b, x >= 0 (b >= 0). Exact arithmetic, Bland's rule."""
    m, n = len(A), len(c)
    T = [[Fraction(v) for v in A[i]] + [Fraction(int(i == j)) for j in range(m)] + [Fraction(b[i])]
         for i in range(m)]
    z = [Fraction(-v) for v in c] + [Fraction(0)] * (m + 1)
    basis = [n + i for i in range(m)]
    while True:
        col = next((j for j in range(n + m) if z[j] < 0), None)
        if col is None:
            return z[-1]
        _, _, r = min((T[i][-1] / T[i][col], basis[i], i) for i in range(m) if T[i][col] > 0)
        T[r] = [v / T[r][col] for v in T[r]]
        for i in range(m):
            if i != r and T[i][col]:
                f = T[i][col]
                T[i] = [a - f * b_ for a, b_ in zip(T[i], T[r])]
        f = z[col]
        z = [a - f * b_ for a, b_ in zip(z, T[r])]
        basis[r] = col


print(simplex_max([1, 1], [[1, 0], [0, 1], [1, 1]], [4, 3, 5]))
```

```{.text .output}
5
```

## A four-site network

Our network has four sites, five links and five pairs. Each pair has two paths, shortest first. POP
uses two groups here; the task uses three.

```python
CAP = {"AB": 12, "BC": 12, "AD": 12, "CD": 12, "BD": 6}
PATHS = {
    "A>C": [["AB", "BC"], ["AD", "CD"]],
    "A>B": [["AB"], ["AD", "BD"]],
    "B>C": [["BC"], ["BD", "CD"]],
    "A>D": [["AD"], ["AB", "BD"]],
    "D>C": [["CD"], ["BD", "BC"]],
}
PAIRS = list(PATHS)


def max_flow(demand, cap):
    """Path-form multicommodity flow: most total flow, each pair at most its demand."""
    cols = [(p, path) for p in PAIRS if demand.get(p, 0) > 0 for path in PATHS[p]]
    if not cols:
        return Fraction(0)
    A = [[int(q == p) for q, _ in cols] for p in PAIRS if demand.get(p, 0) > 0]
    b = [demand[p] for p in PAIRS if demand.get(p, 0) > 0]
    for e in cap:
        A.append([int(e in path) for _, path in cols])
        b.append(cap[e])
    return simplex_max([1] * len(cols), A, b)


def opt(d):
    return max_flow(d, CAP)


GROUPS = [["A>C", "A>D"], ["A>B", "B>C", "D>C"]]


def pop(d):
    share = {e: Fraction(c, len(GROUPS)) for e, c in CAP.items()}
    return sum(max_flow({p: d[p] for p in g}, share) for g in GROUPS)


def dp(d, small=6):
    rest = dict(CAP)
    pinned = 0
    for p, v in d.items():
        if 0 < v <= small:
            for e in PATHS[p][0]:
                rest[e] -= v
            pinned += v
    if any(c < 0 for c in rest.values()):
        return None  # the pinned demands alone overload a link: not a valid matrix
    return pinned + max_flow({p: v for p, v in d.items() if v > small}, rest)


def gap(d):
    return opt(d) - max(pop(d), dp(d))


d = {"A>C": 6, "A>B": 18, "B>C": 18, "A>D": 0, "D>C": 0}
print("OPT", opt(d), " POP", pop(d), " DP", dp(d), " gap", gap(d))
```

```{.text .output}
OPT 36  POP 21  DP 24  gap 12
```

Why does this matrix hurt both shortcuts? Pinning puts the small A>C demand on A–B–C, the two links
that the big A>B and B>C demands need most; the optimum would send A>C the other way, round A–D–C.
POP gives each group only half of every link, so A>B and B>C, which share a group, each get only
half of their direct link.

## Searching for the worst traffic

Like the task, we allow demand levels 0, 6 and 18. Five pairs give 3⁵ = 243 matrices, few enough to
try them all.

```python
from itertools import product

LEVELS = [0, 6, 18]
results = []
for levels in product(LEVELS, repeat=len(PAIRS)):
    d = dict(zip(PAIRS, levels))
    if dp(d) is not None:
        results.append((gap(d), sum(v > 0 for v in levels), levels))
best = max(g for g, _, _ in results)
print(len(results), "valid matrices; largest gap", best)
for g, nonzero, levels in sorted(results, key=lambda r: (-r[0], r[1]))[:3]:
    print(" ", dict(zip(PAIRS, levels)), "gap", g)
```

```{.text .output}
243 valid matrices; largest gap 12
  {'A>C': 6, 'A>B': 18, 'B>C': 18, 'A>D': 0, 'D>C': 0} gap 12
  {'A>C': 6, 'A>B': 18, 'B>C': 18, 'A>D': 0, 'D>C': 6} gap 12
  {'A>C': 6, 'A>B': 18, 'B>C': 18, 'A>D': 6, 'D>C': 0} gap 12
```

In our network no pinned load can overload a link, so all 243 matrices are valid. The task has 27 pairs, at most nine of them nonzero, and only 256 calls to the exact checker per
instance. There are far too many matrices to try them all:

```python
from math import comb

print(f"{sum(comb(27, k) * 2 ** k for k in range(10)):,} matrices")
```

```{.text .output}
3,103,495,099 matrices
```

The human reference solves one large mixed-integer program, MetaOpt's own method. Claude Opus 5.5
(final score 52.0, a pass; three other runs tied at 52.0 and passed too) wrote its own small simplex solver to score candidates privately, then ran
a local search with four threads. Its own idea was to seed the search from **cuts**: small sets of
links that every path of the big demands must cross, crowded with small pinned demands, just like
the A–B–C links above. Eleven of sixteen models scored above the reference; four passed every
instance.

# Shockwave: sharing GPUs fairly

A shared cluster runs many machine-learning training jobs. Each round (120 seconds in the task), a
**scheduler** chooses which jobs run on the cluster's GPUs. Many jobs change their batch size as
they train, and with it their speed. **Shockwave** (NSDI 2023) plans for these changes ahead, to
finish jobs fast while treating each one fairly.

The task judges a schedule on two hidden traces of eight jobs each, on four counts, and a pass must
beat the reference strictly on all four, on both traces:

- **makespan**: when the last job finishes;
- **average JCT**: the mean job completion time (finish minus arrival);
- **worst ρ**: a job's finish-time fairness ρ is its JCT divided by the time it would take with a
  fair share of the cluster (its time alone times `max(1, jobs / GPUs)`, so 2 for eight jobs on four
  GPUs); the worst ρ is the largest;
- **unfair jobs**: the share of jobs with ρ above 1.05.

## A small cluster

Our cluster has four GPUs and six jobs. Each job needs a fixed number of GPUs, and its epochs get
shorter as its batch size grows.

```python
ROUND, GPUS = 120, 4
# name, GPUs, arrival (s), seconds per epoch on its GPUs
JOBS = [
    ("LM", 1, 0, [300, 300, 200, 200]),
    ("ResNet", 2, 0, [400, 400, 400]),
    ("Rec", 4, 0, [240, 240, 120]),
    ("Trans", 1, 120, [600, 300]),
    ("ViT", 2, 240, [360, 240, 120]),
    ("A3C", 1, 360, [240, 240]),
]


def simulate(policy):
    left = {name: sum(epochs) for name, _, _, epochs in JOBS}
    gpus = {name: g for name, g, _, _ in JOBS}
    done, t = {}, 0
    while len(done) < len(JOBS):
        live = [j for j in JOBS if j[2] <= t and j[0] not in done]
        used = 0
        for name in policy(live, left, t):
            if used + gpus[name] > GPUS:
                continue
            used += gpus[name]
            if left[name] <= ROUND:
                done[name] = t + left[name]
            left[name] = max(0, left[name] - ROUND)
        t += ROUND
    jct = {name: done[name] - arrival for name, _, arrival, _ in JOBS}
    share = max(1, len(JOBS) / GPUS)  # a fair share runs each job this many times slower
    rho = {name: jct[name] / (sum(epochs) * share) for name, _, _, epochs in JOBS}
    return {"makespan": max(done.values()), "avg JCT": round(sum(jct.values()) / len(JOBS)),
            "worst rho": round(max(rho.values()), 2), "unfair": sum(r > 1.05 for r in rho.values())}
```

A policy returns the live jobs in order of preference. The simulator packs them onto the free GPUs
in that order and skips a job that does not fit. Here are three simple policies:

```python
def fifo(live, left, t):
    """First come, first served."""
    return [j[0] for j in live]


def srtf(live, left, t):
    """Shortest remaining time first."""
    return [j[0] for j in sorted(live, key=lambda j: left[j[0]])]


def fairest(live, left, t):
    """The job whose rho would be worst if it waited another round goes first."""
    share = max(1, len(JOBS) / GPUS)
    return [j[0] for j in sorted(live, key=lambda j: -(t + ROUND - j[2] + left[j[0]]) / (sum(j[3]) * share))]


for name, policy in [("FIFO", fifo), ("SRTF", srtf), ("Fairest", fairest)]:
    print(f"{name:8}", simulate(policy))
```

```{.text .output}
FIFO     {'makespan': 2400, 'avg JCT': 1497, 'worst rho': 2.67, 'unfair': 3}
SRTF     {'makespan': 2520, 'avg JCT': 1397, 'worst rho': 1.4, 'unfair': 2}
Fairest  {'makespan': 2400, 'avg JCT': 1557, 'worst rho': 1.33, 'unfair': 6}
```

Each policy wins somewhere and loses somewhere. FIFO and Fairest finish the trace first. SRTF has
the shortest average JCT and the fewest unfair jobs. Fairest has the best worst ρ, but every one of
its six jobs ends above 1.05. Beating a reference on all four at once is much harder than on any one.

::: pitfall
**Three out of four is a fail.** On the real task, Claude Opus 5.5 had the best fairness of all
sixteen runs (12.5% unfair jobs, worst ρ 1.18, against 62.5% and 1.51 for the reference) and a
shorter average JCT. But its mean makespan was 16,700 s, against 16,100 s for the reference, so it
failed. Its final score, 47.1, is third of sixteen: level with Gemini 4 Argon · Antigravity, which
passed, and above GPT-6.1 Terra, which passed with 46.5.
:::

Opus kept its own copy of every job's state, copied the simulator's batch-size rules to forecast
how long each job still needs, and searched over job orders for the one with the best combined
score. That score gave the two fairness terms three times their base weight. Four models passed; all
sixteen scored above the reference.

| Run | Average JCT (s) | Makespan (s) | Unfair jobs | Worst ρ | Pass |
|---|---|---|---|---|---|
| Human reference | 8,970 | 16,100 | 62.5% | 1.51 | |
| Gemini 4 Argon · Pi | 7,690 | 15,300 | 18.8% | 1.24 | yes |
| GPT-6 Astra | 7,700 | 15,500 | 18.8% | 1.24 | yes |
| Claude Opus 5.5 | 7,660 | 16,700 | 12.5% | 1.18 | no |

Selected rows; means over the two hidden traces, as of October 26, 2026. The full table is on the task page.

# Summary and self-check

::: pattern
**Three lessons from the Network tasks.**

1. *Find the wait.* In BBQ, both passing designs removed the same wait, the memory read on the
   back-to-back path, in two different ways.
2. *Generalize past the feedback.* The hidden workloads include cases the train calls never show.
   Designs tuned only to the feedback failed at width 16.
3. *Every metric counts.* A pass needs every metric on every workload. A high score can fail on one.
:::

## Exercises

1. In the BBQ program, write `dequeue_max`, which removes the worst packet. Check it on the five
   packets of the example: it should return 9, 9, 2, 1, 1.
2. Under the timing model, a design's slowest stretch starts at a FIFO flag and passes two LUTs.
   What is its period, and how many operations per second does it reach at 0.68 operations per
   cycle?
3. In the MetaOpt network, change the capacity of link BD from 6 to 12. Find the largest gap again.
   Does the worst matrix change?
4. In the Shockwave program, let SRTF guess each job's remaining time from its *current* epoch
   length only, as a scheduler would that does not know the batch size will grow. Which metrics
   change?
5. *Open.* Write a policy that beats SRTF on all four counts on our six jobs, or explain why you
   think none exists.
