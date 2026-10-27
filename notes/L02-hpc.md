---
title: "Lecture 02: HPC"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has four HPC tasks, all from Julian Shun's group at MIT: **RegionsSort**, a parallel
radix sort that works in place (SPAA 2019); **Parallel DBSCAN**, exact density clustering on a grid
(SIGMOD 2020); **Hygra**, core numbers of a hypergraph (PPoPP 2020); and **ParButterfly**, which
counts the smallest dense pattern in a bipartite graph (APOCS 2020). The four papers share one aim:
a parallel algorithm should be **work-efficient**, doing no more total work than a good serial one,
and only then spread that work over the cores. For each task, these notes explain the paper's idea,
the part the task removed, how a run is judged, and what the agents did.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. Every program in these notes has been run, and every output shown is the real
output.

::: instructor
**Sources.** Task pages and results: <https://frontier-cs.org/> (as of October 26, 2026). There is
no case study for the HPC tasks yet, so the agents' ideas come from the "Solution" section of each
task page, which describes Claude Opus 5.5's run. The task statements are the public ones an agent
reads. The ideas follow the four papers. Nothing here comes from the hidden workloads or the human
reference patches.

**Numbers.** Pass counts and scores are from the 16-model leaderboard. The human reference is timed
again in every run, so its row on a task page is the median of those runs, and a run passes or fails
against the reference of its own run. In the ParButterfly table, the reference took 1,950 ms,
2,000 ms and 1,580 ms in the runs of GPT-6 Astra, GPT-6.1 Sol and Muse Spark 1.3, against about
170 ms in most runs; we quote the site as it is. The toy sizes (40 keys, 80 points, 9 vertices, a
2,000-vertex random hypergraph, 80-vertex graphs) are ours.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Build the regions graph of a radix-sort level, and plan swaps that put every key in its bucket.
2. Explain why a grid of cells of side ε/√d makes exact DBSCAN fast, and link core cells with union-find.
3. Compute hypergraph core numbers by peeling, and explain why buckets make peeling work-efficient.
4. Count butterflies from wedges, and explain how the vertex order changes the number of wedges.
5. Turn a speedup into a FrontierCS score, and back.
6. Explain why a run with the best score can still fail, and one with a lower score can pass.

# RegionsSort: sorting in place

A **radix sort** sorts integers digit by digit. A most-significant-digit sort puts every key in a
**bucket** by its top digit (eight bits in the task, so 256 buckets), then sorts each bucket by the
next digit. The fast parallel versions copy the keys into a second array, which doubles the memory.
In place, each key must be *swapped* to its bucket, and the swaps depend on one another. **Regions
Sort** (Obeya, Kahssay, Fan and Shun, SPAA 2019) turns these dependences into a graph and finds swaps
that can run in parallel. It needs only O(K log r log n) extra memory for K blocks, and it is
work-efficient: O(n log r) work, as much as a serial radix sort.

## Blocks, countries and regions

Our toy has 40 keys of 8 bits. The digit is the top two bits, so there are four buckets, and the
array is cut into K = 4 **blocks** of 10. First, each block sorts its own keys by digit; the blocks
are independent, so this runs in parallel. Then counting gives each bucket its final interval, its
**country**.

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


N, K, BUCKETS = 40, 4, 4


def digit(key):
    return key >> 6  # the top two bits of an 8-bit key


rng = Rng(2019)
A = [rng.below(256) for _ in range(N)]
size = N // K
for lo in range(0, N, size):  # each block sorts itself by the digit
    A[lo:lo + size] = sorted(A[lo:lo + size], key=digit)

counts = [sum(digit(x) == d for x in A) for d in range(BUCKETS)]
starts = [sum(counts[:d]) for d in range(BUCKETS)]
country = [d for d in range(BUCKETS) for _ in range(counts[d])]
for lo in range(0, N, size):
    print(f"block {lo // size}:", "".join(str(digit(x)) for x in A[lo:lo + size]))
print("countries:", [(s, s + c) for s, c in zip(starts, counts)])
```

```{.text .output}
block 0: 0011233333
block 1: 0001222223
block 2: 0001111222
block 3: 0112223333
countries: [(0, 9), (9, 18), (18, 30), (30, 40)]
```

Country 0 is positions 0–8, so it should hold only 0s. It holds 001123333 instead: two 1s, a 2 and
four 3s are misplaced. A **region** is a run of keys of one bucket inside one block and one country.
Each misplaced region becomes an edge of the **regions graph**: an edge `i -> j` of weight `w` says
that `w` keys in country `i` belong to bucket `j`.

```python
def regions_graph(A):
    """Edges (i, j) -> ranges: keys in country i that belong to bucket j."""
    graph = {}
    start = 0
    for p in range(1, N + 1):
        same = p < N and p % size and country[p] == country[start]
        if not same or digit(A[p]) != digit(A[start]):
            i, j = country[start], digit(A[start])
            if i != j:
                graph.setdefault((i, j), []).append([start, p - start])
            start = p
    return graph


graph = regions_graph(A)
for (i, j), ranges in sorted(graph.items()):
    print(f"{i} -> {j}  weight {sum(w for _, w in ranges)}  ranges {ranges}")
```

```{.text .output}
0 -> 1  weight 2  ranges [[2, 2]]
0 -> 2  weight 1  ranges [[4, 1]]
0 -> 3  weight 4  ranges [[5, 4]]
1 -> 0  weight 3  ranges [[10, 3]]
1 -> 2  weight 4  ranges [[14, 4]]
1 -> 3  weight 1  ranges [[9, 1]]
2 -> 0  weight 3  ranges [[20, 3]]
2 -> 1  weight 4  ranges [[23, 4]]
2 -> 3  weight 1  ranges [[19, 1]]
3 -> 0  weight 1  ranges [[30, 1]]
3 -> 1  weight 2  ranges [[31, 2]]
3 -> 2  weight 3  ranges [[33, 3]]
```

For every vertex, the weights in equal the weights out: country 0 holds 7 foreign keys, and 7 keys
of bucket 0 sit in other countries (3 + 3 + 1). This is the lemma the paper builds on.

## Swaps from 2-paths

The paper processes the graph along **2-paths**. Take two edges `x -> b` and `b -> y`. The first is
a range of b's keys in country x; the second is a range of y's keys in country b. Swap equal-length
parts of the two ranges. Now b's keys are home. The y keys have moved to country x: a new edge
`x -> y`, unless `x == y`, when both sides land home at once (a 2-cycle). Each swap is one record of
the task's interface, `Triangle{from, to, offset1, offset2, amount}`.

Here we plan one bucket at a time, the way Claude Opus 5.5 did: all 2-paths through bucket `b`, with
2-cycles preferred. The swaps that complete one bucket touch disjoint ranges, so they can all run at
once, in one parallel round.

```python
def plan_bucket(graph, b):
    """2-paths through broker b: swaps (offset1, offset2, amount) that complete country b."""
    incoming = [(x, r) for (x, j), rs in sorted(graph.items()) if j == b for r in rs]
    outgoing = [(y, r) for (i, y), rs in sorted(graph.items()) if i == b for r in rs]
    swaps = []
    for x, src in incoming:  # keys of b that sit in country x
        while src[1]:
            # prefer a range holding x's keys: then both sides land home (a 2-cycle)
            y, dst = min((o for o in outgoing if o[1][1]), key=lambda o: o[0] != x)
            amount = min(src[1], dst[1])
            swaps.append((src[0], dst[0], amount))
            if x != y:  # bucket y's keys now sit in country x: a new edge
                graph.setdefault((x, y), []).append([src[0], amount])
            src[0] += amount
            src[1] -= amount
            dst[0] += amount
            dst[1] -= amount
    for edge in [e for e in graph if b in e]:
        del graph[edge]
    return swaps


misplaced = sum(w for ranges in graph.values() for _, w in ranges)
rounds = []
for b in range(BUCKETS):
    swaps = plan_bucket(graph, b)
    for p, q, w in swaps:  # the ranges are disjoint, so one round runs in parallel
        A[p:p + w], A[q:q + w] = A[q:q + w], A[p:p + w]
    rounds.append(swaps)
    print(f"bucket {b}: {swaps}")
done = all(digit(x) == c for x, c in zip(A, country))
print(f"{misplaced} misplaced keys, {sum(map(len, rounds))} swaps; every key home: {done}")
```

```{.text .output}
bucket 0: [(10, 2, 2), (12, 4, 1), (20, 5, 3), (30, 8, 1)]
bucket 1: [(23, 14, 4), (31, 9, 1), (32, 12, 1)]
bucket 2: [(33, 19, 1), (34, 20, 2), (32, 22, 1)]
bucket 3: []
29 misplaced keys, 10 swaps; every key home: True
```

The first swap, `(10, 2, 2)`, is a 2-cycle: two 0s at positions 10–11 trade places with two 1s at
2–3. The last bucket needs no swaps: once the other three are complete, it is too. Then the sort
recurses into each country with the next digit.

## What the agent writes, and how it is judged

The task keeps the sorter, the executor that performs the swaps, and the recursion. It removes the
bodies of the region-graph planner in `EdgeListGraph`: turning two edges into one swap, extracting
the swaps of a node, and updating the graph after a swap is done. All swaps returned in one call run
concurrently, so no array position may appear in two of them.

Each submission sorts twelve arrays: unsigned 32-bit keys or key–payload records, uniform, skewed,
repeated or nearly sorted: eight arrays of 2.4 to 3.2 million elements, plus four arrays of 16 million keys. On
four cores, a pass needs three things on **every** array: a lower median sort time than the
reference, a lower median time inside the region-graph code, and extra memory of at most 5% of the
input, the bound the paper states. The score rewards speed over `std::sort`, the serial sort of the
C++ library, through a geometric-mean speedup `S` on the eight original arrays. ParButterfly uses the
same formula.

```python
from math import exp, log


def speedup_score(S):
    """RegionsSort and ParButterfly: S is the geometric-mean speedup over a serial baseline."""
    return 0.0 if S <= 1 else 100 * log(S) / (log(10) + log(S))


def speedup_from(score):
    return exp(score * log(10) / (100 - score))


print([round(speedup_score(S), 1) for S in (1, 2, 10, 100)])
print(f"reference 50.2 -> {speedup_from(50.2):.1f}x, best 51.5 -> {speedup_from(51.5):.1f}x")
```

```{.text .output}
[0.0, 23.1, 50.0, 66.7]
reference 50.2 -> 10.2x, best 51.5 -> 11.5x
```

A tenfold speedup scores 50. The reference sorts about ten times faster than `std::sort`, and the
best run about 11.5 times.

## What the agents did

| Run | Extra memory (KiB) | Region-graph time (ms) | Sort time (ms) | Final score | |
|---|---|---|---|---|---|
| Human reference | 701 | 6 | 18.9 | 50.2 | |
| Gemini 4 Argon · Antigravity | 516 | 1.82 | 18.2 | 51.5 | Fail |
| GPT-6.1 Sol | 861 | 2.65 | 18.5 | 51.3 | Fail |
| GLM 5.3 | 700 | 2.66 | 18.5 | 51.1 | Pass |
| Step 5 Preview | 700 | 2.56 | 18.5 | 51.1 | Pass |
| Claude Opus 5.5 | 780 | 2.79 | 20.3 | 49.8 | Fail |

Selected rows; the full table is on the task page. Means over the twelve hidden arrays, as of October 26, 2026. Two of sixteen models passed, and nine
scored above the reference. RegionsSort has an FDI of 60.5, the 18th hardest of 48 tasks.

Every one of the sixteen runs beat the reference's region-graph time on all twelve arrays, most by
a factor of two or more. The pass was decided by the whole sort. The planner is a small part of a
sort call: the reference spends about 6 ms in it, summed over four workers, in a call that takes
about 19 ms. Gemini 4 Argon · Antigravity, with the best score, was faster than the reference on
eleven of twelve arrays and failed. Claude Opus 5.5 was faster on seven.

Claude Opus 5.5 planned one bucket at a time, as in our model: it paired every key of the bucket held
elsewhere with every misplaced slot of the bucket's own interval, took 2-cycles first, filled the
rest in address order, and fused swaps that continue each other into one. Its last step was to
**defer the graph updates**: the ranges that the swaps leave in other countries are recorded only
after the caller has started sorting the finished bucket, in small per-bucket lists, and large
scratch buffers are freed, which keeps the extra memory low.

::: pitfall
**A faster part is not a faster whole.** Making the removed component twice as fast left the sort
within a few percent of the reference, where small effects decide each array. The two passing runs
won all twelve arrays with mean sort times of 18.5 ms.
:::

# Parallel DBSCAN: exact clusters on a grid

**DBSCAN** finds clusters as dense regions. A point is **core** if at least `minPts` points,
itself included, lie within distance ε. Two core points are in the same cluster when a chain of core
points joins them, each step at most ε. A non-core point within ε of a core point is a **border**
point; any other point is **noise**. Done naively, DBSCAN compares every pair of points: O(n²) work.
*Theoretically-Efficient and Practical Parallel DBSCAN* (Wang, Gu and Shun, SIGMOD 2020) gives exact
parallel algorithms that are work-efficient in two dimensions and fast in higher ones.

## The plain algorithm

Our toy has 80 points in the plane: three clusters of 22 points each and 14 points of uniform noise,
with ε = 0.6 and `minPts` = 4. The plain algorithm is our oracle: it counts neighbors by comparing
every pair, then grows each cluster from a core point.

```python
from math import cos, floor, log, pi, sqrt

EPS, MIN_PTS = 0.6, 4


def gauss(rng):
    """A standard normal sample (Box-Muller)."""
    u1, u2 = rng.uniform(), rng.uniform()
    return sqrt(-2 * log(u1)) * cos(2 * pi * u2)


rng = Rng(2020)
centers = [(2.0, 2.0), (5.5, 2.5), (3.5, 5.5)]
points = [(cx + 0.45 * gauss(rng), cy + 0.45 * gauss(rng))
          for k in range(66) for cx, cy in [centers[k % 3]]]
points += [(8 * rng.uniform(), 8 * rng.uniform()) for _ in range(14)]
tests = 0


def close(p, q):
    global tests
    tests += 1
    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 <= EPS * EPS


def oracle(points):
    """Plain DBSCAN: compare every pair. Returns core flags and a cluster per core point."""
    n = len(points)
    core = [sum(close(p, q) for q in points) >= MIN_PTS for p in points]
    label = [-1] * n
    for s in range(n):
        if core[s] and label[s] < 0:
            label[s], stack = s, [s]
            while stack:
                p = stack.pop()
                for q in range(n):
                    if core[q] and label[q] < 0 and close(points[p], points[q]):
                        label[q] = s
                        stack.append(q)
    return core, label


core, truth = oracle(points)
print(f"{len(points)} points, {sum(core)} core, {len(set(truth) - {-1})} clusters;",
      f"{len(points) ** 2} tests to find the core points, {tests - len(points) ** 2} to link them")
```

```{.text .output}
80 points, 60 core, 3 clusters; 6400 tests to find the core points, 1385 to link them
```

## Cells of side ε/√d

The paper puts the points in a grid of cells of side ε/√d, here ε/√2. The diagonal of a cell is ε,
so any two points in one cell are neighbors. A cell's neighbors are the few cells close enough to
hold a point within ε. The step the task removed comes next: **link the core cells**. Two core cells
belong to one cluster if some core point of one is within ε of some core point of the other. Our
version checks each pair of nearby core cells, stops at the first close pair, skips cells that are
already joined, and keeps the clusters in a **union-find** structure.

```python
SIDE = EPS / sqrt(2)  # any two points in one cell are within EPS

cells = {}
for i, (x, y) in enumerate(points):
    cells.setdefault((floor(x / SIDE), floor(y / SIDE)), []).append(i)
reach = [(dx, dy) for dx in range(-2, 3) for dy in range(-2, 3)
         if SIDE * SIDE * (max(abs(dx) - 1, 0) ** 2 + max(abs(dy) - 1, 0) ** 2) <= EPS * EPS]
core_cells = sorted(c for c, members in cells.items() if any(core[i] for i in members))
parent = {c: c for c in core_cells}


def find(c):
    while parent[c] != c:
        parent[c] = parent[parent[c]]
        c = parent[c]
    return c


tests = 0
for a in core_cells:
    for dx, dy in reach:
        b = (a[0] + dx, a[1] + dy)
        if b <= a or b not in parent or find(a) == find(b):
            continue  # each pair once, and skip cells already joined
        if any(close(points[i], points[j]) for i in cells[a] if core[i]
               for j in cells[b] if core[j]):
            parent[find(a)] = find(b)
label = [-1] * len(points)
for c in core_cells:
    for i in cells[c]:
        if core[i]:
            label[i] = core_cells.index(find(c))
same = all((label[i] == label[j]) == (truth[i] == truth[j])
           for i in range(len(points)) for j in range(len(points)) if core[i] and core[j])
print(f"{len(cells)} cells, {len(core_cells)} with core points; {tests} tests to link them;",
      f"same clusters as the oracle: {same}")
```

```{.text .output}
50 cells, 31 with core points; 189 tests to link them; same clusters as the oracle: True
```

The grid links the same clusters with a fraction of the distance tests. In parallel, threads take
different cell pairs and merge components in the union-find with atomic operations.

## What the agent writes, and how it is judged

The task keeps the loader, the grid, the core-point test and the border step. It removes
`ClusterCoreBCPGridParallelBucketingND`, the core-connectivity stage, with its helpers. The agent
returns one entry per point: a cluster id for each core point, −1 for every other point.

Each submission clusters twelve generated point sets on eight threads: eight small sets of 12,000 or
14,000 points in three or seven dimensions, and four seed-spreader sets of 200,000 points in five or
seven dimensions, the generator family of the paper's datasets. The output must match an exact
oracle point by point, including every membership of a border point. To pass, the run time must be
strictly lower than the reference's on every set. The score uses only the small sets: their
geometric-mean time `C`, in seconds, against a fixed anchor of 20 ms.

```python
def dbscan_score(seconds):
    C = exp(sum(log(t) for t in seconds) / len(seconds))
    return 100 * 0.020 / (0.020 + C)


print([round(dbscan_score([t]), 1) for t in (0.010, 0.020, 0.040)])
```

```{.text .output}
[66.7, 50.0, 33.3]
```

The reference's score of 71.7 means a geometric mean of about 7.9 ms on the small sets. The run
times in the table below are means over all twelve sets, so the large ones dominate them.

## What the agents did

| Run | Run time (ms) | Final score | |
|---|---|---|---|
| Human reference | 46.4 | 71.7 | |
| Gemini 4 Argon · Antigravity | 25.3 | 77.4 | Fail |
| GLM 5.3 | 30.3 | 76.0 | Fail |
| GPT-6 Astra | 34.1 | 73.8 | Pass |
| GPT-6.1 Terra | 29.3 | 73.7 | Pass |
| Claude Opus 5.5 | 35.3 | 72.5 | Pass |
| GLM 5.3 Flash | 46.8 | 68.8 | Pass |

Selected rows; the full table is on the task page. Means over the twelve hidden sets, as of October 26, 2026. Six of sixteen models passed. The FDI is
42.1, the 34th hardest of 48.

The two best scores failed: Gemini 4 Argon · Antigravity and GLM 5.3 were faster than the reference
on eleven of twelve sets. **Claude Opus 5.5** passed. It used a lock-free union-find: threads merge
components with atomic compare-and-swap, linking a root to the smaller index. It checks cell pairs in
three phases, nearest neighbors first (cells that differ by one in a single coordinate), then
diagonal neighbors, then cells further away but still within reach of ε. Each test stops early: one
representative core point from each cell, then a few point pairs, and only then an exhaustive check
of the points near the other cell's bounding box, with the reference's own arithmetic so the result
matches exactly. Its own idea: the far candidates come from a trie over cell coordinates, each trie
node records the component its whole subtree shares, and a subtree already in the querying cell's
component is skipped.

::: pitfall
**A pass is decided in its own run.** GLM 5.3 Flash scored 68.8, below the reference's 71.7 in the
table, and passed. Its mean time, 46.8 ms, is above the table's 46.4, but the reference measured in
its own run took 53.4 ms, and GLM 5.3 Flash was faster on all twelve sets. The score is absolute; the
pass compares two programs on the same machine at the same time.
:::

# Hygra: peeling a hypergraph

A **hypergraph** lets one edge, a **hyperedge**, join any number of vertices. The **k-core** is
what remains after repeatedly removing every vertex that lies in fewer than `k` hyperedges, and with
it each hyperedge that loses a member. A vertex's **core number** is the largest `k` whose core still
holds it: a measure of how deep inside the dense part it sits. *Practical Parallel Hypergraph
Algorithms* (Shun, PPoPP 2020) builds Hygra, a framework for parallel hypergraph algorithms, and
gives it a new work-efficient algorithm for core numbers.

## The definition

Our hypergraph has nine vertices and eight hyperedges. Vertices 0 to 3 form a tight group of four
three-vertex hyperedges; 4, 5 and 6 a looser one; vertex 7 hangs on one hyperedge, and vertex 8 is
in none. The definition gives the core numbers directly, if slowly.

```python
from collections import Counter

EDGES = [{0, 1, 2}, {0, 1, 3}, {1, 2, 3}, {0, 2, 3}, {3, 4}, {4, 5, 6}, {5, 6}, {6, 7}]
NV = 9  # vertex 8 is in no hyperedge


def survivors(edges, nv, k):
    """Remove vertices in fewer than k live hyperedges (and their hyperedges) until none is left."""
    alive, live = set(range(nv)), list(edges)
    while True:
        degree = Counter(v for e in live for v in e)
        weak = {v for v in alive if degree[v] < k}
        if not weak:
            return alive
        alive -= weak
        live = [e for e in live if not e & weak]


def core_by_definition(edges, nv):
    core = [0] * nv
    k = 1
    while alive := survivors(edges, nv, k):
        for v in alive:
            core[v] = k
        k += 1
    return core


print(core_by_definition(EDGES, NV))
```

```{.text .output}
[3, 3, 3, 3, 2, 2, 2, 1, 0]
```

## Peeling with buckets

Peeling finds all core numbers in one pass. Keep each vertex's live degree. At level `k`, remove
every vertex whose degree is at most `k`; it gets core number `k`. Each of its live hyperedges dies,
and every other member loses one from its degree. Members that fall to `k` leave in the next round
of the same level. A simple parallel version scans all remaining vertices in every round, so its work
grows with the number of rounds. The paper keeps the vertices in **buckets** by degree, so a round
touches only the vertices that leave and the ones whose degree drops: linear work.

```python
def peel(edges, nv):
    """Core numbers by peeling with buckets. Returns (core, frontier sizes, decrements)."""
    incident = [[] for _ in range(nv)]
    for e, members in enumerate(edges):
        for v in members:
            incident[v].append(e)
    degree = [len(es) for es in incident]  # live degree; the core number once removed
    buckets = {}
    for v in range(nv):
        buckets.setdefault(degree[v], set()).add(v)
    dead, removed = [False] * len(edges), [False] * nv
    k, rounds, decrements = 0, [], 0
    while buckets:
        k = max(k, min(buckets))
        frontier = buckets.pop(min(buckets))  # every vertex now at degree <= k
        rounds.append(len(frontier))
        for v in frontier:
            removed[v], degree[v] = True, k
        for v in frontier:
            for e in incident[v]:
                if not dead[e]:  # a hyperedge dies with its first removed member
                    dead[e] = True
                    for u in edges[e]:
                        if not removed[u]:
                            old = max(degree[u], k)
                            degree[u] -= 1
                            decrements += 1
                            new = max(degree[u], k)
                            if new != old:
                                buckets[old].discard(u)
                                buckets.setdefault(new, set()).add(u)
        buckets = {d: vs for d, vs in buckets.items() if vs}
    return degree, rounds, decrements


core, rounds, _ = peel(EDGES, NV)
print(core, "frontiers", rounds)
```

```{.text .output}
[3, 3, 3, 3, 2, 2, 2, 1, 0] frontiers [1, 1, 3, 4]
```

Four rounds: vertex 8 at level 0, vertex 7 at level 1, then 4, 5 and 6 together at level 2, which
kills {3, 4}, {4, 5, 6} and {5, 6} and leaves vertices 0 to 3 at degree 3. On a larger random hypergraph, the
count of vertex visits shows the difference the buckets make:

```python
rng = Rng(2020)
nv = 2000
big = [{rng.below(nv) for _ in range(2 + rng.below(4))} for _ in range(6000)]
core, rounds, decrements = peel(big, nv)
left, scans = nv, 0
for size in rounds:  # a simple algorithm rescans every remaining vertex each round
    scans += left
    left -= size
print(f"max core {max(core)}, {len(rounds)} rounds; matches the definition:",
      core == core_by_definition(big, nv))
print(f"buckets visit {nv + decrements} vertices; rescanning visits {scans + decrements}")
```

```{.text .output}
max core 5, 29 rounds; matches the definition: True
buckets visit 15069 vertices; rescanning visits 61259
```

## What the agent writes, and how it is judged

The task removes the whole body of `KCore`. The agent gets the hypergraph in both directions (each
vertex's hyperedges and each hyperedge's vertices) and must return the exact core number of every
vertex.

Each submission runs on four random hypergraphs from the framework's own generator, with hundreds of
thousands of vertices and hyperedges and millions of memberships: two public, two held out. The
time is the whole process, from launch to exit, loading the file included. The score is
`100 · e^(−t / 0.25)` for a median time `t` in seconds. To pass, the run must be at least 3% faster
than the reference on every hypergraph, twice: on eight threads, and on **one** thread. The
one-thread time is the paper's T₁, the total work, so the task checks work-efficiency directly.

## What the agents did

| Run | Run time (ms) | Sequential run time (ms) | Final score | |
|---|---|---|---|---|
| Human reference | 164 | 639 | 52.2 | |
| Gemini 4 Argon · Antigravity | 131 | 518 | 59.5 | Pass |
| DeepSeek V4.1 Flash 1017 | 132 | 548 | 59.1 | Pass |
| Muse Wonder 1.0 | 139 | 574 | 57.6 | Fail |
| Step 5 Preview | 141 | 574 | 56.8 | Fail |
| Claude Opus 5.5 | 176 | 541 | 49.7 | Pass |
| GLM 5.3 | 213 | 648 | 43.1 | Fail |

Selected rows; the full table is on the task page. Means over the four hidden hypergraphs, as of October 26, 2026. Eight of sixteen models passed;
Gemini 4 Argon · Antigravity had the best score and passed. The FDI is 38.7, the 35th hardest.

Every run with a valid result beat the reference on one thread on all four hypergraphs. All six
failures with a valid result came from eight threads; for example Muse Wonder 1.0 and Step 5 Preview
won one of four, GLM 5.3 none.
Two runs, GLM 5.3 Flash and Muse Spark 1.3, scored 0.

**Claude Opus 5.5** passed with a score below the reference's, because the reference took 197 ms in
its run. It peels level by level, as in our model, and runs each round in one of three ways. *Push*:
each live hyperedge touching the leaving vertices is handled once, by its lowest-numbered leaving
member, which decrements the others. *Pull*: the leaving vertices mark their hyperedges dead, and
every remaining vertex recounts its live hyperedges. *Fix*: when few vertices remain, only those are
recounted. A cost model picks the cheapest from the frontier size, the level and the average sizes.
It also used **ownership instead of atomics**: each thread owns aligned blocks of 64 vertices and
of the dead-hyperedge bitmap, and in parallel push rounds threads send kills and decrements to the
owner as messages, so no atomic operation touches the hot arrays.

::: pitfall
**Work-efficient is not enough.** All fourteen runs with a valid result beat the reference on one
thread on every hypergraph. Only eight also beat it on eight threads on every hypergraph, which the
pass needs too.
:::

# ParButterfly: counting butterflies

A **bipartite graph** has two sides, and every edge joins the two: users and products, authors and
papers. A **butterfly** is two vertices on each side joined by all four edges, the smallest dense
pattern such a graph can have, much as a triangle is in an ordinary graph. *Parallel Algorithms for
Butterfly Computations* (Shi and Shun, APOCS 2020) builds ParButterfly, a framework that counts and
peels butterflies in parallel.

## Wedges

A **wedge** is a path of two edges, `x – y – z`, with `x` and `z` on the same side. Two vertices
that share `c` neighbors are the endpoints of `c` wedges, and any two of those wedges form a
butterfly: `c(c − 1)/2` butterflies. So counting comes down to collecting wedges by their endpoints.

The framework first **ranks** the vertices. It keeps only the wedges whose center `y` and far
endpoint `z` are both ranked after `x`. Every butterfly is then counted exactly once, from its
first-ranked vertex. The order decides how many wedges there are. **Side order** ranks one side
first, so all wedges have their centers on the other side; **degree order** ranks vertices by
decreasing degree, so the hubs are always endpoints and seldom centers. Our two graphs have 40
vertices on each side and 320 edges: one with equal degrees, one with heavy tails on both sides.

```python
from bisect import bisect_right
from itertools import combinations

L, R, M = 40, 40, 320  # vertices 0..39 on the left, 40..79 on the right; M edges


def bipartite(seed, skewed):
    """Uniform: every left vertex has degree M / L. Skewed: heavy tails on both sides."""
    rng, adj = Rng(seed), {v: set() for v in range(L + R)}
    cum, total = [], 0
    for r in range(L):  # in the skewed graph, rank r has weight 1000 // (r + 1)**2 + 5
        total += 1000 // (r + 1) ** 2 + 5
        cum.append(total)
    while sum(len(adj[u]) for u in range(L)) < M:
        if skewed:
            u, v = bisect_right(cum, rng.below(total)), L + bisect_right(cum, rng.below(total))
        else:
            u = min(range(L), key=lambda x: len(adj[x]))  # the first left vertex still short
            v = L + rng.below(R)
        adj[u].add(v)
        adj[v].add(u)
    return adj


def brute_force(adj):
    """Check every pair of left vertices against every pair of right vertices."""
    return sum(all(v in adj[u] for u in us for v in vs)
               for us in combinations(range(L), 2) for vs in combinations(range(L, L + R), 2))


def count(adj, rank):
    """Wedges (x, y, z) with y and z ranked after x; each butterfly is counted once, from x."""
    butterflies = wedges = 0
    for x in adj:
        shared = {}
        for y in adj[x]:
            if rank[y] > rank[x]:
                for z in adj[y]:
                    if rank[z] > rank[x]:
                        shared[z] = shared.get(z, 0) + 1
                        wedges += 1
        butterflies += sum(c * (c - 1) // 2 for c in shared.values())
    return butterflies, wedges
```

The paper's rule, which the task's comparison code applies: count the wedges `w_s` of the better
side order and `w_r` of degree order, and use side order when `(w_s − w_r) / w_s < 0.1`.

```python
for skewed in (False, True):
    adj = bipartite(2020, skewed)
    orders = {
        "centers right": {v: v for v in adj},  # left vertices ranked first: they are endpoints
        "centers left": {v: (v + L) % (L + R) for v in adj},
        "degree order": {v: i for i, v in enumerate(sorted(adj, key=lambda v: -len(adj[v])))},
    }
    print("skewed:" if skewed else "uniform:", brute_force(adj), "butterflies by brute force")
    results = {name: count(adj, rank) for name, rank in orders.items()}
    for name, (butterflies, wedges) in results.items():
        print(f"  {name:13} {butterflies} butterflies, {wedges} wedges")
    w_s = min(results["centers right"][1], results["centers left"][1])
    w_r = results["degree order"][1]
    print(f"  (w_s - w_r) / w_s = {(w_s - w_r) / w_s:.2f}:",
          "side order" if (w_s - w_r) / w_s < 0.1 else "degree order")
```

```{.text .output}
uniform: 806 butterflies by brute force
  centers right 806 butterflies, 1272 wedges
  centers left  806 butterflies, 1120 wedges
  degree order  806 butterflies, 1263 wedges
  (w_s - w_r) / w_s = -0.13: side order
skewed: 5109 butterflies by brute force
  centers right 5109 butterflies, 2410 wedges
  centers left  5109 butterflies, 2537 wedges
  degree order  5109 butterflies, 1348 wedges
  (w_s - w_r) / w_s = 0.44: degree order
```

Every order finds the same count. On the uniform graph, one side order is cheapest. On the skewed
graph, degree order processes 44% fewer wedges than the best side order, because the hubs seldom
serve as centers: a hub is a center only for wedges whose endpoint is an even bigger hub. The work is the number of wedges; the order is a choice of algorithm, made before
any thread starts.

## What the agent writes, and how it is judged

The task removes `CountTotal`, the routine that returns the exact total. The command line names a
ranking and a way of grouping wedges, but only the count is checked, so the agent may choose its own
order and aggregation. The comparison is the authors' parallel code with the rule above and their
simple batching.

There are eight graphs with about two million edges each, 18,000 to 23,000 vertices on one side and
20,000 to 25,000 on the other: six with uniform degrees and two with heavy tails on both sides, where
the largest hubs have 14,000 to 19,000 neighbors. On four threads, the count must be exact on every
graph, and the median of 31 paired time ratios must show the agent's code **more than 5% faster**
than the comparison on every graph. The score is the speedup score of RegionsSort, against a frozen
serial baseline, on the uniform graphs only.

```python
print(f"reference 34.7 -> {speedup_from(34.7):.1f}x, best 56.3 -> {speedup_from(56.3):.1f}x")
```

```{.text .output}
reference 34.7 -> 3.4x, best 56.3 -> 19.4x
```

The reference counts 3.4 times faster than the serial baseline; the best run, 19.4 times.

## What the agents did

| Run | Counting time (ms) | Final score | |
|---|---|---|---|
| Human reference | 172 | 34.7 | |
| Gemini 4 Argon · Antigravity | 29.1 | 56.3 | Pass |
| Gemini 4 Argon · Pi | 29.4 | 56.3 | Pass |
| Claude Opus 5.5 | 29.8 | 56.0 | Pass |
| GPT-6.1 Terra | 37.8 | 54.1 | Pass |
| Kimi K3 | 154 | 37.5 | Pass |
| GLM 5.3 | — | 0.0 | Fail |

Selected rows; the full table is on the task page. Means over the eight hidden graphs, as of October 26, 2026; every valid count was 2.73 × 10⁹ on average,
the same as the reference's. Fifteen of sixteen models passed, and fifteen scored above the
reference. GLM 5.3 had no valid result. With an FDI of −11.2, ParButterfly is the easiest task of
the benchmark.

The best runs counted about six times faster than the reference (29.1 ms against 165 ms in Gemini 4
Argon · Antigravity's run). **Claude Opus 5.5** chose a strategy per graph. It takes the side with
fewer wedges; on skewed graphs it also counts the wedges of a degree order and picks the cheaper by a
cost model. In side order, for every neighbor, the smaller endpoints form a prefix of that neighbor's
sorted list, and a small per-thread counter collects the shared neighbors of each pair, adding
`c(c − 1)/2`. Neighbor lists are copied once into fixed-width slots of 16-bit ids, so vector
instructions find and copy a prefix without branches; each thread times two forms of its counting
loop on its first chunks and keeps the faster. On skewed graphs it ranks by degree, as in our model,
so the few hubs seldom serve as centers, and low-degree vertices use 8-bit counters.

# Summary and self-check

::: pattern
**Three lessons from the HPC tasks.**

1. *Work first, then threads.* Each paper is about doing less total work in parallel: swaps planned
   from a graph, a grid instead of all pairs, buckets instead of rescans, an order with fewer wedges.
   Hygra checks it directly with a one-thread time.
2. *Every workload counts.* The best scores on RegionsSort and Parallel DBSCAN failed, each on one
   of twelve inputs.
3. *A pass is decided in its own run.* The reference is timed again in every run. On Hygra and
   Parallel DBSCAN, runs passed with scores below the reference's row.
:::

## Exercises

1. In the RegionsSort toy, plan the buckets in the order 3, 2, 1, 0. How many swaps does the plan
   need now, and why could it differ?
2. Change the toy to K = 2 blocks of 20. How many edges does the regions graph have?
3. In the DBSCAN toy, double ε to 1.2. How many clusters are there, and how many distance tests does
   the grid need to link them?
4. In Hygra's small hypergraph, add the hyperedge {4, 5}. Which core numbers change?
5. Why does degree order help on the skewed graph and not on the uniform one? Count the wedges a
   single vertex of degree 40 would produce as a center.
