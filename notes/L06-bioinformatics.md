---
title: "Lecture 06: Bioinformatics"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has one Bioinformatics task: **Edlib**, from Šošić and Šikić's paper *Edlib: a C/C++
library for fast, exact sequence alignment using edit distance* (Bioinformatics 2017). Edlib finds
the exact edit distance between two DNA strings and an alignment that achieves it. It does so with
Myers's bit-vector algorithm, a band that grows until it holds the answer, and Hirschberg's method,
which recovers the alignment without storing the whole table. The task removes that last part, the
path recovery. With one task, this lecture goes deeper than the others: edit distance by dynamic
programming, Myers's algorithm, banding, path recovery in linear memory, and then the task and what
the agents wrote.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. Every program in these notes has been run, and every output shown is the real
output.

::: instructor
**Sources.** Task page and results: <https://frontier-cs.org/> (as of October 26, 2026). The task
statement and the library source are the ones an agent reads; the alignment modes and their examples
come from the library's public README. The paper is
[doi 10.1093/bioinformatics/btw753](https://doi.org/10.1093/bioinformatics/btw753). Nothing here
comes from the hidden workloads or the human reference patch. There is no case study for this task
yet.

**Numbers.** Pass counts, metrics and scores are from the 16-model leaderboard. The "human reference
in this run" values and the counts of workloads won come from the hover text of the task page's
results table. Our DNA pairs (1,000 bases), the timing noise and the example times are ours, not the
task's.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Fill an edit-distance table by hand, trace an optimal alignment back through it, and write it as
   an extended CIGAR string.
2. Explain the three alignment modes (global, prefix, infix) by what each one leaves free.
3. Run Myers's bit-vector algorithm on a small example, and explain why one machine word handles 64
   rows at once.
4. Explain banding and k doubling, and why a known distance makes the band narrow.
5. Recover an optimal path in linear memory with Hirschberg's method, and say what it costs in time.
6. Explain how the task measures reconstruction time and memory, why the measurement is noisy, and
   why only one of sixteen models passed.

# Edit distance by dynamic programming

The **edit distance** between a query `q` and a target `t` is the smallest number of single-letter
edits that turn one into the other. There are three edits, each costing one: a **substitution**
(a mismatch), an **insertion** (a query letter with no partner in the target) and a **deletion** (a
target letter with no partner in the query). Biologists use it to compare DNA reads with a genome:
mutations and sequencing errors are exactly these edits.

## The table

Let `D[i][j]` be the distance between the first `i` letters of the query and the first `j` letters
of the target. The first row and column are `j` and `i`: an empty string needs that many edits. Every
other cell takes the best of three moves: diagonal (match or mismatch), down (insertion) or right
(deletion).

```python
def edit_table(q, t):
    """D[i][j] = edit distance between q[:i] and t[:j]."""
    m, n = len(q), len(t)
    d = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        d[i][0] = i
    for j in range(n + 1):
        d[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            d[i][j] = min(d[i - 1][j - 1] + (q[i - 1] != t[j - 1]),
                          d[i - 1][j] + 1,
                          d[i][j - 1] + 1)
    return d


for row in edit_table("ACGT", "ACCT"):
    print(" ".join(map(str, row)))
```

```{.text .output}
0 1 2 3 4
1 0 1 2 3
2 1 0 1 2
3 2 1 1 2
4 3 2 2 1
```

The answer is the bottom-right cell: `ACGT` and `ACCT` are one edit apart. Filling the table costs
one step per cell, so two strings of 30,000 letters need 900 million cells.

## Tracing the alignment back

The distance alone does not say which letters pair up. To get an **alignment**, start at the
bottom-right cell and walk back: at each cell, take a move that explains its value. Edlib writes each
step as a byte: 0 match, 1 insertion, 2 deletion, 3 mismatch. Runs of equal steps make an
**extended CIGAR** string, such as `2=1X1=` (two matches, one mismatch, one match).

```python
MATCH, INSERT, DELETE, MISMATCH = 0, 1, 2, 3


def traceback(q, t, d):
    """Walk back from the end of a full table; return the operations, first to last."""
    i, j, ops = len(q), len(t), []
    while i > 0 or j > 0:
        if i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + (q[i - 1] != t[j - 1]):
            ops.append(MATCH if q[i - 1] == t[j - 1] else MISMATCH)
            i, j = i - 1, j - 1
        elif i > 0 and d[i][j] == d[i - 1][j] + 1:
            ops.append(INSERT)
            i -= 1
        else:
            ops.append(DELETE)
            j -= 1
    return ops[::-1]


def cigar(ops):
    out, k = [], 0
    while k < len(ops):
        r = k
        while r < len(ops) and ops[r] == ops[k]:
            r += 1
        out.append(f"{r - k}{'=IDX'[ops[k]]}")
        k = r
    return "".join(out)


ops = traceback("ACGT", "ACCT", edit_table("ACGT", "ACCT"))
print(ops, cigar(ops))
```

```{.text .output}
[0, 0, 3, 0] 2=1X1=
```

This is the example in the task statement: distance 1, operations `0,0,3,0`, CIGAR `2=1X1=`. Often
several paths have the same cost; the task accepts any of them.

## Three alignment modes

Edlib has three modes, which differ only in what is free (from the library's README):

- **NW** (global, Needleman–Wunsch): the whole query against the whole target.
- **SHW** (prefix): the query against the start of the target; skipping the target's end is free.
- **HW** (infix): the query anywhere inside the target; skipping its start and its end is free.

A free target start means the first row is all zeros; a free target end means the answer is the
smallest value in the last row, and every column holding it is an **end location**. One row at a time
is enough for the distance:

```python
def last_row(q, t, mode="NW"):
    """The last row of the table, keeping only two rows at a time."""
    prev = [0] * (len(t) + 1) if mode == "HW" else list(range(len(t) + 1))
    for i, a in enumerate(q, 1):
        row = [i]
        for j, b in enumerate(t, 1):
            row.append(min(prev[j - 1] + (a != b), prev[j] + 1, row[j - 1] + 1))
        prev = row
    return prev


def distance(q, t, mode="NW"):
    """Edit distance and the 0-based target positions where an optimal alignment ends."""
    row = last_row(q, t, mode)
    if mode == "NW":
        return row[-1], [len(t) - 1]
    best = min(row)
    return best, [j - 1 for j in range(len(row)) if row[j] == best]


for mode in ("NW", "SHW", "HW"):
    print(f"{mode:3}", distance("AACT", "AACTGGC", mode), distance("ACT", "CGACTGAC", mode))
```

```{.text .output}
NW  (3, [6]) (5, [7])
SHW (0, [3]) (2, [0, 1, 4])
HW  (0, [3]) (0, [4])
```

In SHW mode `AACT` fits the start of `AACTGGC` exactly; in HW mode `ACT` fits inside `CGACTGAC`
exactly, ending at position 4. In the task, SHW inputs have an extra target suffix and HW inputs have
flanks on both sides. Once the end (and, for HW, the start) is known, Edlib cuts out that part of the
target, and path recovery is always a global (NW) problem.

## Our DNA pairs

The task's inputs are DNA cores of 10,000 and 30,000 bases, 60% to 99% similar. Its public generator
mutates 60% of the edited bases by substitution, 20% by insertion and 20% by deletion. Ours does the
same with 1,000 bases, so Python stays quick:

```python
class Rng:
    """Park-Miller generator: small, and exact in JavaScript too."""

    def __init__(self, seed):
        self.state = seed

    def below(self, n):
        self.state = self.state * 48271 % 2147483647
        return self.state % n


def random_dna(n, rng):
    return "".join("ACGT"[rng.below(4)] for _ in range(n))


def mutate(seq, similarity, rng):
    """Edit each base with probability 1 - similarity%: 60% substitution, 20% insertion, 20% deletion."""
    out = []
    for c in seq:
        if rng.below(100) < similarity:
            out.append(c)
            continue
        r = rng.below(10)
        if r < 6:
            out.append("ACGT"[("ACGT".index(c) + 1 + rng.below(3)) % 4])
        elif r < 8:
            out.append(c + "ACGT"[rng.below(4)])
    return "".join(out)


rng = Rng(6)
target = random_dna(1000, rng)
pairs = {s: mutate(target, s, rng) for s in (99, 90, 80, 70, 60)}
for s, query in pairs.items():
    print(f"{s}% similar: query {len(query)} bases, distance {last_row(query, target)[-1]}")
```

```{.text .output}
99% similar: query 1002 bases, distance 17
90% similar: query 1003 bases, distance 94
80% similar: query 989 bases, distance 194
70% similar: query 1019 bases, distance 267
60% similar: query 996 bases, distance 355
```

At 99% the pair is 17 edits apart; at 60% the distance is over a third of the length.

# Myers's bit-vector algorithm and the band

## Columns of +1, 0 and −1

Neighbouring cells of the table differ by at most one. So a column can be stored as the **deltas**
going down it: +1, 0 or −1 per row. Myers (1999) keeps them in two bit vectors, `pv` (the rows where
the delta is +1) and `mv` (the rows where it is −1), and computes the next column from the current one
with a handful of bitwise operations, whatever the number of rows. In a 64-bit machine word, that is
64 cells per operation. `peq` gives, for each letter, the rows where the query has that letter.

```python
def peq(q):
    """For each letter, a bit mask of the query rows that hold it (row 1 is bit 0)."""
    masks = {c: 0 for c in "ACGT"}
    for i, c in enumerate(q):
        masks[c] |= 1 << i
    return masks


def myers(q, t, trace=False):
    """Global edit distance, one column per target letter (Python ints act as one long word)."""
    m = len(q)
    full, high = (1 << m) - 1, 1 << (m - 1)
    eqs = peq(q)
    pv, mv, score = full, 0, m                 # first column 0, 1, ..., m: all deltas +1
    for j, c in enumerate(t, 1):
        eq = eqs[c]
        xv = eq | mv
        xh = (((eq & pv) + pv) ^ pv) | eq
        ph = mv | ~(xh | pv) & full            # horizontal deltas +1 ...
        mh = pv & xh                           # ... and -1
        score += (ph & high > 0) - (mh & high > 0)
        ph = (ph << 1 | 1) & full              # the top row grows by 1 per column
        mh = (mh << 1) & full
        pv = mh | ~(xv | ph) & full
        mv = ph & xv
        if trace:
            bits = "".join("+" if pv >> i & 1 else "-" if mv >> i & 1 else "0" for i in range(m))
            print(f"column {j} ({c}): deltas {bits}  bottom cell {score}")
    return score
```

The line `((eq & pv) + pv) ^ pv` is the trick: one addition carries information down a run of rows,
as a chain of matches carries a low value down a diagonal. Here it is on our first example. Read the
deltas from the top: column 1 starts at 1 (the top row holds `j`), then 1 − 1 = 0, then 1, 2, 3.

```python
myers("ACGT", "ACCT", trace=True)
print(all(myers(q, target) == last_row(q, target)[-1] for q in pairs.values()))
```

```{.text .output}
column 1 (A): deltas -+++  bottom cell 3
column 2 (C): deltas --++  bottom cell 2
column 3 (C): deltas --0+  bottom cell 2
column 4 (T): deltas --0-  bottom cell 1
True
```

The four columns match the table of the first section, and the five long pairs give the same distances
as the full table. Edlib cuts a long query into **blocks** of 64 rows and passes the carry from one
block to the next, so a column of a 30,000-base query takes 469 blocks.

## The band

A path that passes through cell `(i, j)` must make up the gap `|i − j|` to get there and the gap
`|(m − i) − (n − j)|` to leave. If the distance is at most `k`, any cell where these two gaps add up
to more than `k` can be skipped. The cells left form a **band** around the diagonal (Ukkonen, 1985).
Edlib does not know the distance in advance, so it tries `k = 64` and doubles `k` until the band
holds an answer:

```python
def banded(q, t, k):
    """The global distance if it is at most k (else None), and the number of cells computed."""
    m, n, far, cells = len(q), len(t), 1 << 30, 0
    if abs(m - n) > k:
        return None, 0
    prev = [j if j <= k else far for j in range(n + 1)]
    for i in range(1, m + 1):
        row = [i if i <= k else far] + [far] * n
        for j in range(max(1, i - k), min(n, i + k) + 1):
            if abs(i - j) + abs((m - i) - (n - j)) > k:
                continue
            cells += 1
            row[j] = min(prev[j - 1] + (q[i - 1] != t[j - 1]), prev[j] + 1, row[j - 1] + 1)
        prev = row
    return (prev[n] if prev[n] <= k else None), cells


def doubling(q, t, k=64):
    total = 0
    while True:
        d, cells = banded(q, t, k)
        total += cells
        print(f"  k={k}: {'distance ' + str(d) if d is not None else 'more than k'}, {cells:,} cells")
        if d is not None:
            return d, total
        k *= 2
```

```python
for s in (99, 90, 60):
    q = pairs[s]
    print(f"{s}% similar:")
    d, total = doubling(q, target)
    print(f"  total {total:,} cells of {len(q) * len(target):,}")
```

```{.text .output}
99% similar:
  k=64: distance 17, 64,008 cells
  total 64,008 cells of 1,002,000
90% similar:
  k=64: more than k, 63,070 cells
  k=128: distance 94, 124,094 cells
  total 187,164 cells of 1,003,000
60% similar:
  k=64: more than k, 63,810 cells
  k=128: more than k, 124,578 cells
  k=256: more than k, 239,970 cells
  k=512: distance 355, 446,178 cells
  total 874,536 cells of 996,000
```

For similar pairs the band is a small part of the table; at 60% the doubling ends up computing most
of it. Edlib bands Myers's algorithm by whole blocks of 64 rows, so it skips blocks rather than
cells. Path recovery has one advantage over the first pass: the distance is already known, so `k`
can be set to it and no doubling is needed.

# Recovering the path in linear memory

## The full table is too big

Tracing back needs the whole table, or at least all of Myers's columns. Edlib's own rule, in the
library source the agent reads, estimates that storage as 2 words and an `int` per block per column,
plus 8 bytes per column, and traces back directly only below 1 MiB. Here is the estimate for the
task's sizes, with one column of blocks for comparison:

```python
def traceback_bytes(m, n):
    """Edlib's estimate of the storage for a direct traceback (8-byte words, 4-byte ints)."""
    blocks = -(-m // 64)
    return (2 * 8 + 4) * blocks * n + 2 * 4 * n


for m in (1000, 10_000, 30_000):
    blocks = -(-m // 64)
    print(f"{m:>6,} x {m:>6,}: traceback {traceback_bytes(m, m) / 2**20:8.1f} MiB,"
          f" one column {(2 * 8 + 4) * blocks / 1024:5.1f} KiB")
```

```{.text .output}
 1,000 x  1,000: traceback      0.3 MiB, one column   0.3 KiB
10,000 x 10,000: traceback     30.0 MiB, one column   3.1 KiB
30,000 x 30,000: traceback    268.6 MiB, one column   9.2 KiB
```

Our 1,000-base pairs fit under 1 MiB, so Edlib would trace them back directly. The task's pairs
need 30 MiB and 269 MiB. The human reference in the task uses 80 KiB.

## Meeting in the middle

Hirschberg (1975) found a way to get the path with two rows of memory. Cut the query at its middle
row. Compute the top half's last row going forward, as before. Compute the bottom half's costs going
**backward**, by running the same code on both strings reversed. At each column, the two numbers
add up to the best cost of a path that crosses the middle row there; the smallest sum is the
distance, and it marks where an optimal path crosses. This is the picture on the task page:

```python
q, t = "ACGT", "ACCT"
mid = len(q) // 2
top = last_row(q[:mid], t)
bottom = last_row(q[mid:][::-1], t[::-1])[::-1]
sums = [a + b for a, b in zip(top, bottom)]
print("top   ", top)
print("bottom", bottom)
print("sum   ", sums, "-> crosses at column", sums.index(min(sums)))
```

```{.text .output}
top    [2, 1, 0, 1, 2]
bottom [3, 2, 1, 1, 2]
sum    [5, 3, 1, 2, 4] -> crosses at column 2
```

## Divide and conquer

Once the crossing is known, the top-left and bottom-right quarters are two smaller alignment
problems, and the other two quarters can be dropped. Solve each the same way, and stop when a piece
is one row or one column, where a tiny table is enough.

```python
work = {"cells": 0, "row": 0}


def hirschberg(q, t):
    """An optimal global alignment, keeping only two rows of the table at a time."""
    if len(q) <= 1 or len(t) <= 1:
        work["cells"] += len(q) * len(t)
        return traceback(q, t, edit_table(q, t))
    mid = len(q) // 2
    top = last_row(q[:mid], t)
    bottom = last_row(q[mid:][::-1], t[::-1])[::-1]
    work["cells"] += len(q) * len(t)
    work["row"] = max(work["row"], len(t) + 1)
    sums = [a + b for a, b in zip(top, bottom)]
    j = sums.index(min(sums))
    return hirschberg(q[:mid], t[:j]) + hirschberg(q[mid:], t[j:])
```

The task checks a path the way this function does: it must use up the whole query and the whole
target interval, every match must really match, and its cost must equal the exact distance.

```python
def path_cost(q, t, ops):
    """The path's cost, or None if it is not a valid alignment of q and t."""
    i = j = cost = 0
    for op in ops:
        if op in (MATCH, MISMATCH):
            if i >= len(q) or j >= len(t) or (q[i] == t[j]) != (op == MATCH):
                return None
            cost, i, j = cost + (op == MISMATCH), i + 1, j + 1
        elif op == INSERT:
            cost, i = cost + 1, i + 1
        else:
            cost, j = cost + 1, j + 1
    return cost if (i, j) == (len(q), len(t)) else None


for s in (99, 60):
    q = pairs[s]
    work.update(cells=0, row=0)
    ops = hirschberg(q, target)
    print(f"{s}%: cost {path_cost(q, target, ops)} (distance {myers(q, target)}),"
          f" {len(ops)} steps, CIGAR starts {cigar(ops)[:24]}")
    print(f"     cells computed {work['cells']:,} of {len(q) * len(target):,};"
          f" longest row {work['row']:,} cells")
```

```{.text .output}
99%: cost 17 (distance 17), 1005 steps, CIGAR starts 24=1X87=1D8=1X49=1X15=1X
     cells computed 2,003,099 of 1,002,000; longest row 1,001 cells
60%: cost 355 (distance 355), 1073 steps, CIGAR starts 2=1X1=1X1D3=1X3=1X2=1D3=
     cells computed 1,991,045 of 996,000; longest row 1,001 cells
```

The price of linear memory is time. The first split computes the whole table once; the pieces below it
add half as much, then a quarter, and so on, so the total is about **twice** the table. Edlib makes
two changes: it splits the **target** in half, because Myers's algorithm runs column by column and
gives a whole column of costs at once, and it bands every half by the known distance. Two smaller
gains are possible: stop splitting once a piece's table fits in a small budget, and trace that piece
back directly.

# The task: path recovery, judged on time and memory

## What the agent writes

The task keeps all of Edlib except the body of one function, `obtainAlignmentHirschberg`. The agent
gets the query, the target interval, their reversed copies and the exact distance, and must return
an optimal path as an array of operation bytes, allocated as the library expects. Any optimal path
is accepted. The function may use local helpers and its own data structures, but nothing outside its
body may change, and it may not touch files, the clock, other processes or threads.

## How it is judged

There are 60 workloads: cores of 10,000 and 30,000 bases, similarities 60%, 70%, 80%, 90% and 99%,
and the three modes, once with public seeds and once with held-out seeds. Every output is checked:
the exact distance, the exact locations and a valid path of that cost, as in `path_cost`. A wrong
answer anywhere scores zero.

**Reconstruction time.** Each implementation runs every workload fifteen times with the path and
fifteen times with locations only, each in a fresh process, measured from outside. The locations-only
run does the same work except the path, so the reconstruction time is the fastest path run minus the
fastest locations-only run. That difference is small and noisy. Here is our model of it, with a
6 ms process and random delays of up to 0.5 ms (our numbers):

```python
def measured(recon_ms, rng, base_ms=6.0, jitter_ms=0.5, runs=15):
    """Fastest path run minus fastest locations-only run, each with a random delay (ours)."""
    def run(extra):
        return base_ms + extra + jitter_ms * rng.below(1000) / 1000
    return min(run(recon_ms) for _ in range(runs)) - min(run(0) for _ in range(runs))


rng = Rng(7)
for recon in (0.5, 0.05, 0.0):
    total, bad = 0.0, 0
    for _ in range(60):
        x = measured(recon, rng)
        total += x
        bad += x <= 0
    print(f"true {recon:.2f} ms: mean measured {total / 60:.3f} ms, not positive on {bad} of 60")
```

```{.text .output}
true 0.50 ms: mean measured 0.510 ms, not positive on 0 of 60
true 0.05 ms: mean measured 0.054 ms, not positive on 6 of 60
true 0.00 ms: mean measured 0.011 ms, not positive on 22 of 60
```

A difference that is not positive is not a reconstruction time and fails the workload. The human
reference, measured afresh in every run, averaged 0.86 ms, so the noise is not small next to it.

**Memory.** The peak storage of the reconstruction call, counted in heap, stack and writable static
data, must be no greater than the reference's on every workload. Moving memory from the heap to the
stack does not help: all three are counted.

**Pass rule.** To pass, a run must be strictly faster than the reference and use no more memory on
**every** one of the 60 workloads. The **score** is separate. It is the mean over workloads of
`100 × A / (A + T)`, where `T` is the median time of a whole path run and `A` is a constant:
`(length / 100,000)²` seconds, 0.01 s for 10,000 bases and 0.09 s for 30,000.

```python
def score_term(length, seconds):
    a = (length / 100_000) ** 2
    return 100 * a / (a + seconds)


for length in (10_000, 30_000):
    terms = [f"{score_term(length, ms / 1000):.1f}" for ms in (5, 5.5, 10, 45, 90)]
    print(f"{length:,} bases, T = 5, 5.5, 10, 45, 90 ms:", terms)
```

```{.text .output}
10,000 bases, T = 5, 5.5, 10, 45, 90 ms: ['66.7', '64.5', '50.0', '18.2', '10.0']
30,000 bases, T = 5, 5.5, 10, 45, 90 ms: ['94.7', '94.2', '90.0', '66.7', '50.0']
```

`T` is the whole process: reading the input, finding the distance and locations, and recovering the
path. The agent can change only the last part. In our example, half a millisecond more on a 5 ms run
of a 10,000-base pair moves its term from 66.7 to 64.5. So the scores of good runs sit close together,
and the reference itself scores 65.5.

# What the agents did

One of sixteen models passed; three scored above the human reference (65.5). FDI 74.5 puts the task
13th hardest of 48.

| Run | Peak memory (KiB) | CPU time (ms) | Memory won | Time won | Score | |
|---|---|---|---|---|---|---|
| Human reference | 80 | 0.86 | | | 65.5 | |
| Gemini 4 Argon · Antigravity | 22.7 | 0.509 | 60 of 60 | 60 of 60 | 66.9 | pass |
| GPT-6 Astra | 39.4 | 0.406 | 60 of 60 | 59 of 60 | 66.8 | fail |
| GPT-6.1 Sol | 45.8 | 0.455 | 58 of 60 | 59 of 60 | 65.9 | fail |
| Claude Opus 5.5 | 174 | 1.41 | 0 of 60 | 10 of 60 | 65.3 | fail |
| Gemini 4 Argon · Pi | 31.5 | 1.4 | 60 of 60 | 11 of 60 | 65.3 | fail |
| GPT-6.1 Terra | 41.7 | −0.369 | 60 of 60 | 39 of 60 | 59.3 | fail |

Means over the 60 hidden workloads, as of October 26, 2026. "CPU time" is the reconstruction time
defined above.

**Gemini 4 Argon · Antigravity** passed, with under a third of the reference's memory. **GPT-6 Astra**
had the fastest reconstruction on average but was slower than the reference on one workload, and
failed. **GPT-6.1 Terra**'s mean reconstruction time is below zero: on many workloads its path runs
were faster than its locations-only runs. In other runs, the reference's own mean came out as −0.021,
0.172 and 0.457 ms instead of about 0.86. That is the noise of the previous section.

## Claude Opus 5.5's solution

The task page describes the solution of **Claude Opus 5.5**, which did not pass (score 65.3). It has
five parts:

1. *A banded pass with checkpoints.* Since the distance is known, one forward pass covers only the band
   a path of that cost can reach. It runs Myers's algorithm on blocks of 64 rows and saves its state at
   sparse checkpoint columns.
2. *Strips traced right to left.* From the end cell, it resolves the strips between checkpoints from
   right to left. A narrow strip is recomputed from its checkpoint with full storage, within a small
   memory budget, and traced back directly, skipping runs of matches along the diagonal.
3. *Splitting wide strips.* For a wide strip, a short backward pass from the exit cell meets the
   checkpoint column; the row where forward and backward costs add up to the known cost is where an
   optimal path enters, and the part between is solved recursively, as in Hirschberg's method.
4. *A shortcut for similar pairs,* below.
5. *Columns in parallel.* The bit-parallel kernel runs as a skewed wavefront over several neighbouring
   columns at once, so their carry chains share AVX-512 or AVX2 vector registers.

Its peak memory, 174 KiB on average, was above the reference's 80 KiB on all 60 workloads, so it
could not pass however fast it was. Our reading: checkpoints and strips stored in full buy speed with
memory, and this metric allows no tolerance.

## A shortcut for similar pairs

When the distance `d` is small next to the length, there is a faster way than the band, the
**diagonal transition** method (Ukkonen 1985, Myers 1986). For each cost 0, 1, 2, …, keep how far
each diagonal can be reached; from there, slide along the diagonal while the letters match, for free.
Only `d + 1` rounds of `2d + 1` diagonals are needed, plus the slides.

```python
def diagonal(q, t):
    """Global edit distance by diagonal transition; also the number of steps taken."""
    m, n = len(q), len(t)
    far, d, steps = {0: 0}, 0, 0              # diagonal k = j - i -> furthest row i reached
    while True:
        for k, i in far.items():
            while i < m and i + k < n and q[i] == t[i + k]:
                i, steps = i + 1, steps + 1
            far[k] = i
        if far.get(n - m, -1) >= m:
            return d, steps
        d += 1
        new = {}
        for k in range(-d, d + 1):
            i = max(far.get(k, -2) + 1,       # mismatch: same diagonal
                    far.get(k + 1, -2) + 1,   # insertion: from diagonal k + 1
                    far.get(k - 1, -1))       # deletion: from diagonal k - 1
            i = min(i, m, n - k)
            steps += 1
            if i >= 0 and i + k >= 0:
                new[k] = i
        far = new


for s in (99, 90, 60):
    d, steps = diagonal(pairs[s], target)
    print(f"{s}%: distance {d}, {steps:,} steps")
```

```{.text .output}
99%: distance 17, 1,384 steps
90%: distance 94, 12,705 steps
60%: distance 355, 169,358 steps
```

At 99% similarity it takes 1,384 steps where the band took 64,008 cells. Its work grows with the
square of the distance, so the gain shrinks fast: at 60% it takes 169,358 steps, while Myers's
algorithm covers the band's 446,178 cells as about 7,000 words of 64 cells, each a dozen bit
operations (our rough comparison). Claude Opus 5.5 switches to this method when the cost is small next
to the length, and traces back from the end cell.

::: pitfall
**Fast on average is not a pass.** GPT-6 Astra had the fastest mean reconstruction, 0.406 ms, and lost
one workload of 60. GPT-6.1 Sol lost one on time and two on memory. Claude Opus 5.5 and Gemini 4 Argon
· Pi scored 65.3, near the reference's 65.5, but won on time on only 10 and 11 workloads.
:::

# Summary and self-check

::: pattern
**Three lessons from the Bioinformatics task.**

1. *Speed comes from structure, not from skipping work.* Myers's algorithm does 64 cells per word,
   the band skips cells no cheap path can reach, and diagonal transition skips runs of matches. Every
   answer stays exact.
2. *Memory and time trade against each other.* Hirschberg's method gets a path with two rows of
   memory for about twice the time; storing more (checkpoints, strips) is faster but costs memory,
   and here memory is judged with zero tolerance.
3. *A small, noisy measurement must win everywhere.* Reconstruction takes under a millisecond, the
   time is a difference of two minima, and a pass needs a strict win on all 60 workloads.
:::

## Exercises

1. Fill the table for `GATTACA` and `GCATGCA` by hand, then check it with `edit_table`. Find two
   different optimal paths.
2. Run `myers` with `trace=True` on `GATTACA` and `GCATGCA`, and rebuild the last column of your table
   from its deltas.
3. Change `doubling` to start at `k = 16`. How many cells does each pair need now?
4. Change `hirschberg` to trace a piece back directly when its table has at most 4,096 cells. How
   many cells does it compute for the 60% pair, and what is the largest table it keeps?
5. A run's reconstruction takes 0.3 ms less than the reference's and uses 1 KiB more memory on one
   workload. Does it pass? What happens to its score?
