---
title: "Lecture 08: Database"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has nine Database tasks, all from PVLDB papers. Two are about query processing:
**Yannakakis** rewrites join trees into plans that drop useless rows before joining (2025), and
**JoinBoost** trains boosted trees inside a database without joining its tables (2023). Two come
from **FARGO**, a search for the largest inner product (2023): one asks when to stop probing, the
other for the whole query core. Two count small patterns in graphs: **SCOPE** counts them around
every vertex (2024), and **ScaleGPM** picks between two approximate engines (2024). Two speed up
blockchain execution: **Spectrum** checkpoints the stack of a smart contract (2024), and **Seer**
predicts its branches (2024). The last, **Persistent Treap**, keeps every version of an ordered index
under concurrent updates (2025). For each one, these notes explain the idea, the part the task
removed, how a run is judged, and what the agents did.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. They show the logic, not the speed of the real systems. Every program in these
notes has been run, and every output shown is the real output.

::: instructor
**Sources.** Task pages and results: <https://frontier-cs.org/> (as of October 26, 2026). The
task statements are the public ones an agent reads. There is no case study for a Database task yet.
Nothing here comes from the hidden workloads or the human reference patches.

**Numbers.** Pass counts and scores are from the 16-model leaderboard. All data, runtimes and
traces in the programs are ours: a 4-table join, 400 sales rows, 800 vectors, a 40-vertex graph,
twelve made-up engine timings, a 200-item stack, 60 branches and a 500-key treap.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Run the two phases of the Yannakakis algorithm by hand, and rewrite a join tree so that it lowers to them.
2. Explain why a boosting round can update its residuals in one pass, and check the update with the drop in squared error.
3. Order hash buckets by quantization distance across tables, and apply FARGO's probability test for stopping.
4. Count local patterns from degrees and common neighbors, and say why the ScaleGPM score weighs a wrong pick by its regret.
5. Checkpoint a stack with shared pages and copy on write, and compare branch predictors that may answer "unsure".
6. Copy the path of a persistent treap update, and answer a range query on a past version.

# Yannakakis: semijoins before joins

A database joins tables two at a time. A plan built this way can produce intermediate results far
larger than the final answer. For acyclic joins, the **Yannakakis algorithm** avoids this. It first
drops every row that cannot match, using **semijoins** (keep the rows of one table that have a
partner in another), then joins what is left. The paper (PVLDB 2025) engineers this for a column
store, so that it never runs much slower than the binary plan and often runs much faster.

## Rows that cannot match

Our tables follow the task page's example from Stack Overflow data. `u` holds users (after a
selective filter, four are left), `p` posts with their owner, and `c` comments with their post.
Attribute 0 is a post id and attribute 1 a user id. The optimizer's plan joins comments with posts
first, then with users.

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


# A row maps attributes to values: 0 is a post id, 1 a user id.
rng = Rng(7)
USERS = [{1: u} for u in range(4)]                         # u, after a selective filter
POSTS = [{0: p, 1: rng.below(40)} for p in range(120)]     # p: Id, OwnerUserId
COMMENTS = [{0: rng.below(120)} for _ in range(600)]       # c: PostId
VOTES = [{0: rng.below(120)} for _ in range(300)]          # v: PostId


def join(left, right, keys):
    """Hash join on the shared attributes in keys."""
    index = {}
    for row in right:
        index.setdefault(tuple(row[a] for a in keys), []).append(row)
    return [{**a, **b} for a in left for b in index.get(tuple(a[k] for k in keys), [])]


def semijoin(left, right, keys):
    """Keep the rows of left that have a partner in right."""
    present = {tuple(row[a] for a in keys) for row in right}
    return [row for row in left if tuple(row[a] for a in keys) in present]


cp = join(COMMENTS, POSTS, [0])
binary = join(cp, USERS, [1])
print(f"binary plan:    c-p {len(cp)} rows, then result {len(binary)} rows")

p2 = semijoin(POSTS, USERS, [1])            # phase 1: drop rows that cannot match
c2 = semijoin(COMMENTS, p2, [0])
two_phase = join(join(c2, p2, [0]), USERS, [1])          # phase 2: join the rest
print(f"two-phase plan: keeps p {len(p2)}, c {len(c2)}; result {len(two_phase)} rows")
rows = lambda r: sorted((x[0], x[1]) for x in r)
print("same result:", rows(binary) == rows(two_phase))
```

```{.text .output}
binary plan:    c-p 600 rows, then result 60 rows
two-phase plan: keeps p 15, c 60; result 60 rows
same result: True
```

The binary plan builds 600 rows to keep 60. After the semijoins, no intermediate result is larger
than the answer.

## Which trees convert

The system turns a binary join tree into a nested-semijoin plan, but only trees of one shape
convert. For every join, its keys must appear in the **leftmost table** of both sides. Our plan adds
votes `v` to the task page's example. Its middle join is on key 0, but the leftmost table of its
left side is `u`, which holds only key 1.

```python
class Leaf:
    def __init__(self, name, attrs, rows):
        self.name, self.attrs, self.rows = name, set(attrs), rows


class Join:
    def __init__(self, left, right, keys):
        self.left, self.right, self.keys = left, right, set(keys)


def tables(n):
    return [n] if isinstance(n, Leaf) else tables(n.left) + tables(n.right)


def show(n):
    if isinstance(n, Leaf):
        return n.name
    return f"({show(n.left)} ⋈{sorted(n.keys)} {show(n.right)})"


def lowerable(n):
    """Every join's keys sit in the leftmost table of both sides."""
    if isinstance(n, Leaf):
        return True
    return (n.keys <= tables(n.left)[0].attrs and n.keys <= tables(n.right)[0].attrs
            and lowerable(n.left) and lowerable(n.right))


U, P = Leaf("u", {1}, USERS), Leaf("p", {0, 1}, POSTS)
C, V = Leaf("c", {0}, COMMENTS), Leaf("v", {0}, VOTES)
plan = Join(Join(Join(U, P, {1}), C, {0}), V, {0})
print(show(plan), "lowerable:", lowerable(plan))
```

```{.text .output}
(((u ⋈[1] p) ⋈[0] c) ⋈[0] v) lowerable: False
```

## What the agent writes

The task removes the policy that reshapes the tree, `rewrite_plan` in one Python file, and the agent
writes it. It receives one optimizer tree per query and returns a new tree of the same leaf and join
types. The new tree must keep every table with the same attributes and estimate, have one join fewer
than tables, give each join the attributes its two sides share, and pass the leftmost-table rule.
The lowering, the engine and the data stay fixed.

**Claude Opus 5.5**'s rewrite started from a simple observation. Each binary join links two tables:
on each side, the leftmost table that holds the join's keys. These links form a **join tree**, and
any table can be its root. A left-deep spine from the root, with each child's subplan joined onto it,
always passes the rule: the root holds the keys it shares with each child, and each child is the
leftmost table of its own subplan.

```python
def tree_edges(n, edges):
    """Each join links the leftmost table on each side that holds its keys."""
    if isinstance(n, Join):
        a = next(t for t in tables(n.left) if n.keys <= t.attrs)
        b = next(t for t in tables(n.right) if n.keys <= t.attrs)
        edges.append((a, b, n.keys))
        tree_edges(n.left, edges)
        tree_edges(n.right, edges)
    return edges


def children(node, parent, edges):
    out = [(b, k) for a, b, k in edges if a is node and b is not parent]
    return out + [(a, k) for a, b, k in edges if b is node and a is not parent]


def rebuild(node, edges, parent=None):
    """A left-deep spine from node, each child's subplan joined onto it."""
    plan = node
    for child, keys in children(node, parent, edges):
        plan = Join(plan, rebuild(child, edges, node), keys)
    return plan
```

Which root is best? In the plan, each child is hashed and its parent probes it. Opus priced a plan
as tuples hashed, at three times the cost, plus tuples probed, with children taken most selective
first. Our model runs phase 1 for real and counts both.

```python
def phase_one(node, edges, parent=None):
    """Bottom-up semijoins. Returns the reduced rows, rows hashed, rows probed."""
    rows, hashed, probed = node.rows, 0, 0
    reduced = [(phase_one(c, edges, node), k) for c, k in children(node, parent, edges)]
    for (child_rows, h, p), keys in sorted(reduced, key=lambda r: len(r[0][0])):
        hashed += h + len(child_rows)          # the child is hashed once
        probed += p + len(rows)                # the parent probes it
        rows = semijoin(rows, child_rows, sorted(keys))
    return rows, hashed, probed


edges = tree_edges(plan, [])
print("tree edges:", [f"{a.name}-{b.name}" for a, b, _ in edges])
for root in (U, P, C, V):
    new = rebuild(root, edges)
    _, hashed, probed = phase_one(root, edges)
    print(f"root {root.name}: {show(new):32} lowerable {lowerable(new)}, "
          f"hashed {hashed:4}, probed {probed:3}, cost {3 * hashed + probed:4}")
```

```{.text .output}
tree edges: ['p-v', 'p-c', 'u-p']
root u: (u ⋈[1] ((p ⋈[0] v) ⋈[0] c))     lowerable True, hashed 1005, probed 232, cost 3247
root p: (((p ⋈[0] v) ⋈[0] c) ⋈[1] u)     lowerable True, hashed  904, probed 146, cost 2858
root c: (c ⋈[0] ((p ⋈[0] v) ⋈[1] u))     lowerable True, hashed  315, probed 735, cost 1680
root v: (v ⋈[0] ((p ⋈[0] c) ⋈[1] u))     lowerable True, hashed  618, probed 435, cost 2289
```

Every root gives a valid plan, and the costs differ by a factor of two. Rooting at the largest table,
the 600 comments, is cheapest here, because it is never hashed. That is also Opus's rule for schemas
it had no statistics for.

# Yannakakis: no pass

## How it is judged

The plans come from three benchmarks: Stats-CEB on Stack Overflow data, the Join Order Benchmark on
IMDB, and a graph benchmark for cardinality estimation. Each joins five to fourteen tables. Train
uses 20 public plans; the final run adds 19 hidden ones, so 39 queries in all.

Each query runs ten times for each of three plans: the original binary plan, the human reference and
the candidate. The score compares with the binary plan: per query `S_q = B_q / C_q` of the median
times, then the mean of `L(S_q)` over the queries, where `L` is the latency score from Lecture 01
(0 up to 1x, 50 at 10x). The pass rule compares with the reference instead. Every query must return
exactly the original result, and its median time must be strictly lower than the reference's.
There is no margin, and a plan identical to the reference's fails.

## What the agents did

No model passed; 13 of 16 scored above the human reference (10.2), and one matched it.

| Run | Exact result | Median latency (ms) | Final score |
|---|---:|---:|---:|
| Human reference | 1 | 231 | 10.2 |
| Kimi K3.1 Pro | 1 | 261 | 12.5 |
| Gemini 4 Argon · Pi | 1 | 216 | 12.2 |
| Gemini 4 Argon · Antigravity | 1 | 213 | 12.1 |
| Claude Opus 5.5 | 1 | 220 | 11.8 |

Means over the hidden queries, as of October 26, 2026. Every run fails. The reference is measured
again in every run, so its row is a median of those measurements.

A score of 12.5 is what a 1.4x speedup on every query would give. Kimi K3.1 Pro
has the best score but not the lowest latency: the score averages per-query gains over the binary
plan, so a few large gains can lift it. The pass needs something harder: 39 strict wins, query by
query, against plans that already run fast.

Besides the join-tree rewrite above, **Claude Opus 5.5** stored, for the Stack Overflow and IMDB
schemas, each table's size and the entity each join column refers to. From these it estimated how
much each semijoin shrinks its parent. A hill climb then swapped tree edges for others on the same
keys, tried every root and ordered children by selectivity, within 6,000 candidate trees. A check
confirmed every new plan keeps each table and key and has no cross product; any failure fell back to
a plain conversion.

::: pitfall
**Strict per-query timing.** With 39 queries and no margin, a single query that runs a few
milliseconds slower than the reference fails the run. A rewrite that helps on average is not enough.
:::

# JoinBoost: residuals without the join

**JoinBoost** (PVLDB 2023) trains decision trees and boosted ensembles inside a database, using only
SQL. The data stay in normalized tables: a large fact table of sales and small dimension tables for
items, stores and dates. JoinBoost never builds their join, and only small aggregates leave the
database.

## Boosting over normalized tables

Gradient boosting with squared error fits each tree to the **residuals** that earlier trees leave.
After a tree, every sales row subtracts the learning rate times the value of the leaf it falls in.
The leaf depends on features in other tables, so finding it needs the join, one row at a time. Our
data: 400 sales rows, 20 items with a feature `f1`, 5 stores with a feature `f4`.

```python
rng = Rng(3)
ITEMS = {i: rng.below(100) for i in range(20)}            # item -> feature f1
STORES = {s: rng.below(10) for s in range(5)}             # store -> feature f4
SALES = []
for _ in range(400):
    item, store = rng.below(20), rng.below(5)
    y = ITEMS[item] / 10 - 2 * STORES[store] + rng.uniform()
    SALES.append({"item": item, "store": store, "r": y})  # r: the residual, at first y

FEATURES = {"f1": ("item", ITEMS), "f4": ("store", STORES)}


def feature(row, name):
    """A sales row reaches a feature through its key."""
    key, table = FEATURES[name]
    return table[row[key]]


def sum_r(rows):
    s = 0.0
    for r in rows:
        s += r["r"]
    return s


def best_split(rows):
    """The split that most reduces the squared error, over both features."""
    total, n = sum_r(rows), len(rows)
    best = None
    for name in FEATURES:
        for cut in sorted({feature(r, name) for r in rows})[1:]:
            left = [r for r in rows if feature(r, name) < cut]
            g = sum_r(left)
            gain = g * g / len(left) + (total - g) ** 2 / (n - len(left)) - total * total / n
            if best is None or gain > best[0] + 1e-12:
                best = (gain, name, cut)
    return best


def grow(rows, depth, path=()):
    """A regression tree: a list of (predicate path, rows, value = mean residual)."""
    split = best_split(rows) if depth > 0 and len(rows) > 1 else None
    if split is None:
        return [(path, rows, sum_r(rows) / len(rows))]
    _, name, cut = split
    return (grow([r for r in rows if feature(r, name) < cut], depth - 1, path + ((name, "<", cut),))
            + grow([r for r in rows if feature(r, name) >= cut], depth - 1, path + ((name, ">=", cut),)))
```

The task's judge checks each update with an identity. If a leaf holds `h` rows whose residuals sum to
`g`, its value is `g / h`, and subtracting `lr · g / h` from each of them lowers the sum of squared
residuals by exactly `(2 lr − lr²) g² / h`.

```python
def sse(rows):
    s = 0.0
    for r in rows:
        s += r["r"] * r["r"]
    return s


lr = 0.5
for tree in range(4):
    leaves = grow(SALES, depth=2)
    before, drop = sse(SALES), 0.0
    for _, rows, value in leaves:
        drop += sum_r(rows) ** 2 / len(rows)
    for _, rows, value in leaves:             # the residual update
        for r in rows:
            r["r"] -= lr * value
    print(f"tree {tree + 1}: {len(leaves)} leaves, SSE {before:9.2f} -> {sse(SALES):9.2f}, "
          f"predicted {before - (2 * lr - lr * lr) * drop:9.2f}")
```

```{.text .output}
tree 1: 4 leaves, SSE  24329.64 ->   7283.53, predicted   7283.53
tree 2: 4 leaves, SSE   7283.53 ->   2263.76, predicted   2263.76
tree 3: 4 leaves, SSE   2263.76 ->    838.51, predicted    838.51
tree 4: 4 leaves, SSE    838.51 ->    370.60, predicted    370.60
```

## One pass instead of one per leaf

In SQL, the obvious update issues one `UPDATE` per leaf, each scanning the sales rows and joining
their features to test the leaf's predicate. A batched update issues one `UPDATE` with a `CASE` over
the leaves: one scan.

```python
def matches(row, path):
    return all((feature(row, f) < cut) == (op == "<") for f, op, cut in path)


def update_per_leaf(rows, leaves, lr):
    """One UPDATE per leaf: each scans every sales row."""
    visits = 0
    for path, _, value in leaves:
        for r in rows:
            visits += 1
            if matches(r, path):
                r["r"] -= lr * value
    return visits


def update_batched(rows, leaves, lr):
    """One UPDATE with a CASE over the leaves: a single scan."""
    for r in rows:
        r["r"] -= lr * next(v for path, _, v in leaves if matches(r, path))
    return len(rows)


for depth in (1, 3, 5):
    leaves = grow(SALES, depth)
    a, b = [dict(r) for r in SALES], [dict(r) for r in SALES]
    va, vb = update_per_leaf(a, leaves, 0.5), update_batched(b, leaves, 0.5)
    same = all(x["r"] == y["r"] for x, y in zip(a, b))
    print(f"depth {depth}: {len(leaves):2} leaves, row visits per leaf {va:6,}, batched {vb}, same {same}")
```

```{.text .output}
depth 1:  2 leaves, row visits per leaf    800, batched 400, same True
depth 3:  8 leaves, row visits per leaf  3,200, batched 400, same True
depth 5: 31 leaves, row visits per leaf 12,400, batched 400, same True
```

The task removes `GradientBoosting._update_error`, the step that advances the residuals after each
tree, and the agent writes it, with changes allowed in five files of the package. The rules keep the
paper's setting. Joins and aggregations run in DuckDB, through a fixed executor. Only small results
may return to Python: at most 10,000 rows per query and 250,000 values per fit. No table with at
least 10% of the sales rows may carry more than 4 columns beyond the sales table's own, so the join
cannot be built.

## How it is judged

Each of eight cases trains an ensemble on one to two million real grocery sales from the Corporación
Favorita data, over one of three join layouts, with depth 1 to 5 and 3 to 24 trees. The model must
match one trained on the joined table: RMSE within 10⁻³, and the sorted predictions within 10⁻⁶ per
row. The score compares with the per-leaf version, `L = log10(B / T)` on summed fit times and
`score = 100 L / (2 + L)`; the batched human reference is barely faster. The pass rule needs, on
every case, a lower median fit time and a lower median update time than the reference, and an RMSE
within 10⁻³.

```python
def speedup_from_score(score):
    """Invert score = 100 L / (2 + L), with L = log10(speedup)."""
    return 10 ** (2 * score / (100 - score))


for name, score in [("Human reference", 0.6), ("Gemini 4 Argon · Antigravity", 33.4),
                    ("Claude Opus 5.5", 27.0)]:
    print(f"{name:29} {score:5.1f} -> {speedup_from_score(score):5.2f}x over one UPDATE per leaf")
```

```{.text .output}
Human reference                 0.6 ->  1.03x over one UPDATE per leaf
Gemini 4 Argon · Antigravity   33.4 -> 10.07x over one UPDATE per leaf
Claude Opus 5.5                27.0 ->  5.49x over one UPDATE per leaf
```

## What the agents did

10 of 16 models passed; 12 of 16 scored above the human reference (0.6).

| Run | Run time (s) | Residual update time (ms) | RMSE (×10⁻¹⁰) | Final score | |
|---|---:|---:|---:|---:|---|
| Human reference | 9.57 | 787 | 5.99 | 0.6 | |
| Gemini 4 Argon · Antigravity | 7.7 | 422 | 9.53 | 33.4 | pass |
| Claude Opus 5.5 | 14.4 | 451 | 12.6 | 27.0 | pass |
| DeepSeek V4.1 Flash | 24.9 | 585 | 12.5 | 20.2 | pass |

As of October 26, 2026. The reference is measured again in every run, so compare a run with its own
reference, not with this row.

**Claude Opus 5.5** reorganized the data, not just the update. Every table that sales joins,
together with the tables behind it, forms a branch whose joins are many-to-one. It joined each branch
once into a small side table with one row per key that appears in sales. The residuals lived in a
slim table holding only the residual and the sales keys. After a tree, each sales row joined its keys
to the side tables, where every split test was precomputed per key as bits, and one query subtracted
the scaled leaf value. Split statistics came from per-key residual sums; for each split it aggregated
only the smaller child and derived the sibling by subtraction.

# FARGO: when to stop probing

**Maximum inner-product search** (MIPS) finds the stored vectors whose dot product with a query is
largest; retrieval and recommendation depend on it. **FARGO** (PVLDB 2023) splits the vectors into
partitions by length. Within a partition, one extra coordinate gives every vector the same length,
so a large inner product means a small angle. Each partition is hashed into `L` tables of `K` sign
bits, one per random projection.

## One global order of buckets

A query's own bucket in each table comes first. Flipping bit `i` costs the query's squared
projection on that bit, normalized, so a bucket's **quantization distance** (QD) is the sum of the
costs of the bits where it differs from the query's key. FARGO probes buckets across all tables in
one global order of QD. Our data: 800 vectors in 12 dimensions, in 8 clusters, with 4 tables of 6
bits and 4 partitions.

```python
from math import acos, pi, sqrt

D, N, K, L = 12, 800, 6, 4          # dimension, vectors, bits per table, tables
rng = Rng(11)


def gauss():
    """Roughly normal: the sum of three uniforms, centered."""
    return rng.uniform() + rng.uniform() + rng.uniform() - 1.5


def dot(a, b):
    s = 0.0
    for x, y in zip(a, b):
        s += x * y
    return s


CENTERS = [[gauss() for _ in range(D)] for _ in range(8)]
DATA = []
for _ in range(N):
    center, scale = CENTERS[rng.below(8)], 0.3 + rng.uniform()
    DATA.append([scale * (x + 0.35 * gauss()) for x in center])
PLANES = [[[gauss() for _ in range(D + 1)] for _ in range(K)] for _ in range(L)]


def key(v, t):
    """K sign bits in table t; the highest bit belongs to projection 0."""
    k = 0
    for plane in PLANES[t]:
        k = 2 * k + (dot(plane, v) > 0)
    return k


# Four partitions by length, longest first. The extra coordinate lifts every
# vector to the partition's largest length m.
by_norm = sorted(range(N), key=lambda i: -dot(DATA[i], DATA[i]))
PARTS = []
for j in range(4):
    members = by_norm[j * N // 4:(j + 1) * N // 4]
    m = sqrt(dot(DATA[members[0]], DATA[members[0]]))
    tables = [{} for _ in range(L)]
    for i in members:
        lifted = DATA[i] + [sqrt(max(0.0, m * m - dot(DATA[i], DATA[i])))]
        for t in range(L):
            tables[t].setdefault(key(lifted, t), []).append(i)
    PARTS.append((m, tables))
print("partition lengths:", [round(m, 2) for m, _ in PARTS])
```

```{.text .output}
partition lengths: [3.13, 1.81, 1.33, 0.93]
```

```python
def flip_costs(q):
    """Per table: the query's own bucket and the cost of flipping each bit."""
    qn = sqrt(dot(q, q))
    lifted = [x / qn for x in q] + [0.0]
    out = []
    for t in range(L):
        proj = [dot(plane, lifted) for plane in PLANES[t]]
        norm = dot(proj, proj)
        out.append((key(lifted, t), [x * x / norm for x in proj]))
    return out


def probe_order(q):
    """Every bucket of every table once, in one global order by QD."""
    order = []
    for t, (home, cost) in enumerate(flip_costs(q)):
        for b in range(2 ** K):
            qd = 0.0
            for i in range(K):
                if (b ^ home) >> (K - 1 - i) & 1:
                    qd += cost[i]
            order.append((qd, t, b))
    order.sort()
    return order


order = probe_order(DATA[0])
print("first probes (QD, table, bucket):", [(round(d, 3), t, b) for d, t, b in order[:5]])
print("buckets:", len(order), "distinct:", len({(t, b) for _, t, b in order}))
```

```{.text .output}
first probes (QD, table, bucket): [(0.0, 0, 9), (0.0, 1, 32), (0.0, 2, 26), (0.0, 3, 16), (0.001, 0, 8)]
buckets: 256 distinct: 256
```

The four home buckets come first, at QD 0; then the cheapest single flips, from whichever table
offers them.

## The stop rule

Let `I_k` be the k-th best inner product so far, `c` the approximation ratio and `U` the partition's
largest possible inner product (its length times the query's). An unseen vector matters only if it
beats `I_k / c`. If `I_k ≥ c U`, nothing in the partition can, and it stops at once. Otherwise such a
vector lies within angle `θ = acos(I_k / (c U))` of the query, and each of its bits differs from the
query's with chance `θ / π`. From that, `φ(d; θ)` is the chance that its bucket in one table has QD at
most `d`, the next bucket's QD. The paper's test is `α₂ = 1 − φ^L < p_τ`, with `p_τ = 0.1`: stop once
it is unlikely that some table still holds the vector unseen. FARGO reads `φ` from a precomputed table;
our model computes it for the query's own projections, one table at a time.

```python
def phi(cost, d, p):
    """Pr[QD <= d] in one table for a vector whose bits each differ with chance p."""
    total = 0.0
    for flips in range(2 ** K):
        qd, n = 0.0, 0
        for i in range(K):
            if flips >> (K - 1 - i) & 1:
                qd += cost[i]
                n += 1
        if qd <= d:
            w = 1.0
            for i in range(K):
                w *= p if i < n else 1 - p
            total += w
    return total


def search(q, k, c, budget=None, p_tau=0.1):
    """Probe each partition in global QD order. budget: the fixed rule; else FARGO's."""
    order, costs = probe_order(q), [cost for _, cost in flip_costs(q)]
    qn, top, verified = sqrt(dot(q, q)), [], 0
    for m, tables in PARTS:
        bound, seen = m * qn, set()
        for d, t, b in order:
            if len(top) >= k and top[k - 1] > 0:
                kth = top[k - 1]
                if budget is not None:
                    if len(seen) >= budget:
                        break
                elif kth >= c * bound:
                    break                                # settled: nothing here beats kth / c
                else:
                    p = acos(kth / (c * bound)) / pi
                    all_seen = 1.0
                    for cost in costs:
                        all_seen *= phi(cost, d, p)
                    if 1 - all_seen < p_tau:             # alpha_2 < p_tau
                        break
            for i in tables[t].get(b, []):
                if i not in seen:
                    seen.add(i)
                    top = sorted(top + [dot(q, DATA[i])], reverse=True)[:k]
        verified += len(seen)
    return top, verified
```

We compare FARGO's rule with a fixed budget of vectors per partition, the task's starter, on 20
queries with `k = 10`.

```python
k, QUERIES = 10, DATA[:20]
exact = [sorted((dot(q, x) for x in DATA), reverse=True)[:k] for q in QUERIES]
print("rule              recall@10  last-result ratio  vectors verified")
for label, c, budget in [("budget 20", 1.0, 20), ("budget 50", 1.0, 50), ("adaptive c=0.6", 0.6, None),
                         ("adaptive c=0.8", 0.8, None), ("adaptive c=0.9", 0.9, None)]:
    recall = ratio = work = 0.0
    for q, truth in zip(QUERIES, exact):
        top, verified = search(q, k, c, budget)
        recall += sum(1 for s in top if s >= truth[-1]) / k
        ratio += top[-1] / truth[-1]
        work += verified
    n = len(QUERIES)
    print(f"{label:16} {recall / n:9.3f}  {ratio / n:17.3f}  {work / n:16.2f}")
```

```{.text .output}
rule              recall@10  last-result ratio  vectors verified
budget 20            0.625              0.933            144.05
budget 50            0.845              0.979            221.70
adaptive c=0.6       0.875              0.987            130.25
adaptive c=0.8       0.970              0.998            201.05
adaptive c=0.9       1.000              1.000            239.25
```

At about the same work, the adaptive rule at `c = 0.8` finds more of the true top 10 than a budget of
50 per partition. A larger `c` asks for more and probes longer.

# FARGO: two tasks, one paper

## FARGO Query Stopping

This task removes the stop rule, `should_stop` in `src/alg.cpp`, and the agent writes it. After each
bucket, it sees the result heap, the bucket's score, the work done so far, the ratio and the bound,
and the path to the authors' lookup table. The shipped rule stops after a fixed number of candidates.

The workload is the Audio dataset, 54,387 vectors of 192 dimensions, with 150 public and 150 hidden
queries, at `c` of 0.6, 0.8 and 0.9 and result-heap sizes of 100, 200, 400 and 800, scored on the
first 50 results. Each of the 12 settings scores `100 Q E / (1 + E)`, where `Q` combines recall and
the last result's inner-product ratio, and `E` the gains in query time and verified candidates over
the fixed-budget starter. To pass, at all 12 settings: mean query time strictly lower than the human
reference's, recall and last-result ratio no lower, and verified candidates no more.

5 of 16 models passed; 13 of 16 scored above the human reference (80.8).

| Run | Last-result ratio | Query time (ms) | Recall@50 | Candidates | Final score | |
|---|---:|---:|---:|---:|---:|---|
| Human reference | 0.996 | 5.45 | 0.963 | 6,750 | 80.8 | |
| GLM 5.3 | 0.992 | 1.18 | 0.921 | 2,970 | 86.7 | fail |
| Kimi K3 | 0.988 | 1.65 | 0.897 | 2,990 | 85.5 | fail |
| Claude Opus 5.5 | 0.995 | 4.38 | 0.956 | 6,070 | 81.8 | pass |
| GPT-6.1 Sol | 0.995 | 4.44 | 0.956 | 6,160 | 81.7 | pass |

As of October 26, 2026. The top two scores came from stopping much earlier: four times faster, at a
cost in recall the score allows and the pass rule does not.

**Claude Opus 5.5** kept the fixed budget as an upper limit and added the paper's test. From the k-th
score, `c` and the partition's largest length it found the angle; if no angle qualified, the
partition stopped at once. It read the lookup table's columns lazily and remembered, per angle, the
first column that passes. Its own idea was the settled-partition stop: once k results reach the
largest inner product a partition allows, neither it nor any partition of shorter vectors can enter
the answer. It checked this only after 1, 2, 4, 8 and later powers of two probes, to keep it cheap.

## FARGO Query Core

This task removes the whole query core: the frontier that streams `(table, key, score)` buckets
across all tables, each exactly once, with the score equal to the sum of squared projections on the
differing bits, and the stop rule, which the statement fixes to the paper's `α₂ < 0.1`. Searches run on
Audio and MNIST (60,000 × 784), at `c` of 0.6, 0.8, 0.9 and `k` of 1, 10, 50, 100. To pass, every
setting must equal or beat the human reference on recall and answer quality, verify no more
candidates, and answer strictly faster.

12 of 16 models passed; 15 of 16 scored above the human reference (50.9).

| Run | Candidates verified | Overall ratio | Query time (ms) | Recall | Final score | |
|---|---:|---:|---:|---:|---:|---|
| Human reference | 7,060 | 0.983 | 9.48 | 0.76 | 50.9 | |
| Claude Opus 5.5 | 7,060 | 0.983 | 6.64 | 0.76 | 52.6 | pass |
| GPT-6 Astra | 7,060 | 0.983 | 6.56 | 0.76 | 52.5 | pass |
| Gemini 4 Argon · Pi | 7,060 | 0.983 | 6.26 | 0.76 | 52.5 | pass |
| Kimi K3 | 7,060 | 0.983 | 7.5 | 0.76 | 52.1 | fail |

As of October 26, 2026. Every scored run verified the same 7,060 candidates with the same recall:
with the rule fixed, the task became a race on speed.

**Claude Opus 5.5** produced the early buckets from a small heap over all tables, growing sets of
flipped bits by shift and expand moves over each table's sorted costs, so each bucket appears once,
in order. For deep probing it switched to batches: each table's costs split into a low and a high
half with precomputed sorted subset sums, and every bucket below the next threshold was emitted at
once and sorted. For fixed inputs the stop rule is a cutoff distance, cached until the k-th result
changes.

::: pattern
**Same paper, two tasks.** When the agent chose the rule, the best scores stopped early and failed.
When the rule was fixed, nearly everyone passed by making the same search faster.
:::

# Graph patterns: SCOPE and ScaleGPM

## Local counts

**SCOPE** (PVLDB 2024) counts small patterns around every vertex of a large graph: for each vertex,
how many copies of a pattern place one chosen pattern vertex, the **orbit**, there. By definition
the count is `|ISO(v)| · |θ| / |Aut(p)|`: the one-to-one edge-preserving maps that send the orbit
vertex to `v`, times the size of its orbit under the pattern's symmetries, over the number of
symmetries. Our graph has 40 vertices and 120 edges.

```python
from itertools import permutations
from math import comb

rng = Rng(5)
n = 40
adj = [set() for _ in range(n)]
while sum(len(a) for a in adj) < 240:
    a, b = rng.below(n), rng.below(n)
    if a != b:
        adj[a].add(b)
        adj[b].add(a)

# Patterns: (vertex count, edges, orbit vertex).
PATTERNS = {"wedge end": (3, [(0, 1), (1, 2)], 0), "wedge center": (3, [(0, 1), (1, 2)], 1),
            "triangle": (3, [(0, 1), (1, 2), (0, 2)], 0),
            "4-cycle": (4, [(0, 1), (1, 2), (2, 3), (3, 0)], 0)}


def local_counts(pattern):
    """By definition: |ISO(v)| * |orbit| / |Aut|, the maps found by brute force."""
    k, edges, o = pattern
    es = {frozenset(e) for e in edges}
    auts = [p for p in permutations(range(k)) if {frozenset((p[a], p[b])) for a, b in edges} == es]
    orbit = {p[o] for p in auts}
    counts = []
    for v in range(n):
        iso = 0
        for rest in permutations([u for u in range(n) if u != v], k - 1):
            m = list(rest[:o]) + [v] + list(rest[o:])
            iso += all(m[b] in adj[m[a]] for a, b in edges)
        counts.append(iso * len(orbit) // len(auts))
    return counts
```

Counting maps one by one is slow. Formulas are fast, and two shared tables serve the whole batch:
the degrees and the common-neighbor counts. The wedge end is a small case of the trick Opus used: a
walk `v–u–w` counts `Σ deg(u)` maps, and subtracting the `deg(v)` walks that return to `v` leaves the
one-to-one ones.

```python
deg = [len(a) for a in adj]
common = [[len(adj[v] & adj[w]) for w in range(n)] for v in range(n)]   # shared by the batch
formulas = {
    "wedge end": [sum(deg[u] for u in adj[v]) - deg[v] for v in range(n)],
    "wedge center": [comb(deg[v], 2) for v in range(n)],
    "triangle": [sum(common[v][u] for u in adj[v]) // 2 for v in range(n)],
    "4-cycle": [sum(comb(common[v][w], 2) for w in range(n) if w != v) for v in range(n)],
}
v = max(range(n), key=lambda x: formulas["triangle"][x])
for name, pattern in PATTERNS.items():
    brute = local_counts(pattern)
    print(f"{name:12} vertex {v}: {brute[v]:3}  formula matches on all {n}: {brute == formulas[name]}")
```

```{.text .output}
wedge end    vertex 1:  78  formula matches on all 40: True
wedge center vertex 1:  78  formula matches on all 40: True
triangle     vertex 1:  14  formula matches on all 40: True
4-cycle      vertex 1:  55  formula matches on all 40: True
```

## SCOPE: what the agent writes, and how it is judged

The task removes SCOPE's batch mode, which counts many patterns in one run with shared plans, in up
to ten C++ files. Each submission counts two batches, 24 five-vertex patterns and 4 smaller ones, on
three real graphs: web pages (4,767 vertices), movie ratings (7,601) and yeast proteins (6,008). Every
count must equal an independent count exactly. On one core, the score is `L = median log2(B / C)`
over five timing rounds against the independent one-query path, and `score = 100 L / (2 + L)`. To
pass, each of the six graph-and-batch workloads must beat the human reference's time in every one of
the five rounds.

5 of 16 models passed; 10 of 16 scored above the human reference (20.1).

| Run | Batch latency (s) | Exact counts | Final score | |
|---|---:|---:|---:|---|
| Human reference | 3.59 | 1 | 20.1 | |
| Gemini 4 Argon · Pi | 0.123 | 1 | 73.1 | pass |
| Claude Opus 5.5 | 0.14 | 1 | 72.1 | pass |
| GPT-6 Astra | 0.198 | 1 | 70.3 | pass |
| Kimi K3 | 2.21 | 1 | 37.6 | fail |

As of October 26, 2026. Inverting the score, 20.1 is about 1.4x over the one-query path and 73.1
about 43x.

**Claude Opus 5.5** rewrote each pattern's count as a signed sum of **homomorphism** counts (maps
that need not be one-to-one) of the pattern's quotients, by Möbius inversion over vertex partitions.
Homomorphisms are far easier to count. Each rooted shape got a canonical code, so equal sub-shapes of
different queries were computed once. Trees reduce to sparse matrix–vector products; dedicated kernels
counted the dense cores, from triangles to the 5-clique, with per-edge triangle counts, bitsets and a
dense table of common-neighbor counts. Anything outside this class went to the original path.

## ScaleGPM: picking an engine

**ScaleGPM** (PVLDB 2024) estimates how often a pattern occurs within a relative-error target, with
two engines: neighborhood sampling (`NS`) and color-based graph sparsification (`GS`). Both meet the
target; which is faster depends on the graph and the settings. The task removes the `threshold`
function that picks one, and the agent writes it. It sees the graph's vertices, adjacency entries,
triangle count and largest degree, the pattern (triangle or 4-clique), the error target, both
engines' settings and the core count.

The score uses measured runtimes for 112 settings on eight graphs. A pick's **regret** is its runtime
over the faster engine's; `R` is the geometric mean, `B` the better constant pick's, and the score is
`100 (B − R) / (B − 1)`. Our twelve settings and their times are made up.

```python
from math import exp, log

# Our own runtimes in ms for twelve settings: (GS, NS).
CASES = [(10, 12), (8, 30), (15, 14), (20, 9), (6, 25), (12, 13),
         (30, 11), (9, 10), (7, 40), (14, 16), (25, 10), (11, 50)]


def regret(picks):
    """Geometric mean of chosen time over the faster time."""
    total = 0.0
    for (gs, ns), pick in zip(CASES, picks):
        total += log((gs if pick == "GS" else ns) / min(gs, ns))
    return exp(total / len(CASES))


best = ["GS" if gs <= ns else "NS" for gs, ns in CASES]
constant = min(regret(["GS"] * 12), regret(["NS"] * 12))


def wrong_on(cases):
    return [("NS" if b == "GS" else "GS") if i in cases else b for i, b in enumerate(best)]


selectors = {"always GS": ["GS"] * 12, "always NS": ["NS"] * 12, "perfect": best,
             "wrong on 2 close calls": wrong_on({0, 5}), "wrong on 2 wide gaps": wrong_on({1, 6})}
for name, picks in selectors.items():
    r = regret(picks)
    right = sum(p == b for p, b in zip(picks, best))
    score = max(0.0, 100 * (constant - r) / (constant - 1))
    print(f"{name:22} right {right:2}/12  regret {r:.4f}  score {score:6.1f}")
```

```{.text .output}
always GS              right  8/12  regret 1.2614  score    0.0
always NS              right  4/12  regret 1.7199  score    0.0
perfect                right 12/12  regret 1.0000  score  100.0
wrong on 2 close calls right 10/12  regret 1.0221  score   91.5
wrong on 2 wide gaps   right 10/12  regret 1.2138  score   18.2
```

Two selectors with the same accuracy land far apart: a wrong pick costs little where the engines are
close and much where they are not. To pass, the picks must beat the human reference's geometric-mean
runtime, separately for triangles and for 4-cliques.

7 of 16 models passed; 9 of 16 scored above the human reference (86.9).

| Run | Estimate accuracy | Run time (ms) | Final score | |
|---|---:|---:|---:|---|
| Human reference | 1 | 11.9 | 86.9 | |
| Claude Opus 5.5 | 1 | 11.7 | 92.0 | pass |
| Gemini 4 Argon · Antigravity | 1 | 11.7 | 92.0 | pass |
| GPT-6.1 Sol | 1 | 11.8 | 91.1 | pass |
| GPT-6.1 Terra | 1 | 11.9 | 88.2 | fail |

As of October 26, 2026.

**Claude Opus 5.5** predicted each engine's time with its own formula. Sampling grows with the sample
count, the average degree and the graph size; sparsification with the vertices and edges, divided by
powers of the number of colors, with triangle terms for 4-cliques. It fitted the coefficients to its
own timings of the unmodified engines on generated small-world graphs, one set per pattern and core
count, and picked the smaller prediction. Its own idea: a graph with more triangles than a random one
of the same degree has more local neighbor lists, which merge faster, so it added a locality term
inferred from the triangle count.

# Blockchain execution: Spectrum and Seer

## Checkpoints on the stack

**Spectrum** (PVLDB 2024) runs Ethereum smart-contract transactions in parallel but commits them in
the order consensus fixed. When two conflict, it does not restart the later one; it rolls it back to
a **checkpoint** taken partway through. A checkpoint saves the code position and the operand stack.
Copying a deep stack at every checkpoint is slow and uses memory. Our second stack keeps items in
pages of four: a checkpoint shares the page table, and a page is copied only on its first write after
a checkpoint.

```python
class CopyStack:
    """Every checkpoint copies the whole stack."""

    def __init__(self):
        self.items, self.copied = [], {"save": 0, "restore": 0, "write": 0}

    def push(self, value):
        self.items.append(value)

    def write(self, index, value):            # index 0 is the top
        self.items[-1 - index] = value

    def save(self):
        self.copied["save"] += len(self.items)
        return list(self.items)

    def restore(self, saved):
        self.copied["restore"] += len(saved)
        self.items = list(saved)

    def values(self):
        return list(self.items)

    def kept(self, saved):
        return sum(len(s) for s in saved)
```

```python
class PagedStack:
    """Items in pages of four. A checkpoint shares the page table; pages copy on write."""

    PAGE = 4

    def __init__(self):
        self.pages, self.owned, self.height = [], set(), 0
        self.copied = {"save": 0, "restore": 0, "write": 0}

    def push(self, value):
        if self.height % self.PAGE == 0:
            self.pages.append([None] * self.PAGE)
            self.owned.add(len(self.pages) - 1)
        self.height += 1
        self.write(0, value)

    def write(self, index, value):
        pos = self.height - 1 - index
        page = pos // self.PAGE
        if page not in self.owned:              # first write since a checkpoint: copy it
            self.pages[page] = list(self.pages[page])
            self.copied["write"] += self.PAGE
            self.owned.add(page)
        self.pages[page][pos % self.PAGE] = value

    def save(self):
        self.owned = set()                      # every page is now shared
        return tuple(self.pages), self.height

    def restore(self, saved):
        self.pages, self.height, self.owned = list(saved[0]), saved[1], set()

    def values(self):
        return [self.pages[i // self.PAGE][i % self.PAGE] for i in range(self.height)]

    def kept(self, saved):
        return self.PAGE * len({id(p) for table, _ in saved for p in table})
```

The task's correctness trace, in small: push 200 items, keep 16 checkpoints, with 24 writes after
each, then restore every one and compare with what it saw.

```python
def checkpoint_trace(stack, seed, depth=200, rounds=16, writes=24):
    rng = Rng(seed)
    for v in range(depth):
        stack.push(v)
    saved, oracle = [], []
    for _ in range(rounds):
        saved.append(stack.save())
        oracle.append(stack.values())
        for _ in range(writes):
            stack.write(rng.below(depth), rng.below(1000))
    exact = True
    for s, o in zip(reversed(saved), reversed(oracle)):
        stack.restore(s)
        exact = exact and stack.values() == o
    return exact, stack.kept(saved)


for kind in (CopyStack, PagedStack):
    stack = kind()
    exact, kept = checkpoint_trace(stack, 9)
    c = stack.copied
    print(f"{kind.__name__:10} restores exact {exact}; items copied: save {c['save']:4}, "
          f"restore {c['restore']:4}, write {c['write']:4}; items kept {kept}")
```

```{.text .output}
CopyStack  restores exact True; items copied: save 3200, restore 3200, write    0; items kept 3200
PagedStack restores exact True; items copied: save    0, restore    0, write 1252; items kept 1388
```

Saving and restoring copy nothing; the writes pay instead, a page at a time, and the 16 checkpoints
share most of their pages.

## Spectrum: what the agent writes, and how it is judged

The task removes the checkpoint-capable stack, `StackTop` and `Checkpoint` in one C++ header, and the
agent writes it. Indexed reads and writes count from the top; a checkpoint must be copyable and
movable, and creating, restoring, copying or destroying one must not change any other. Allocation is
tracked, and `malloc`, `operator new` and the like are banned from the added lines.

A submission first passes checkpoint traces against a fixed-array oracle: 400 rounds of 1,000 pushes
and 16 live checkpoints. Then it runs YCSB, SmallBank and a TPC-C-like workload for one second each.
The score combines committed throughput `T`, creation and restore times `C` and `R`, and memory per
checkpoint `M`, as `Q = T / (M √(C R))^(1/3)`, and gives `100 log10` of `Q` over the shipped stack's.

```python
from math import log10


def points(tps=1.0, create=1.0, restore=1.0, memory=1.0):
    """Score change when each measure is multiplied by the given factor."""
    return 100 * log10(tps / (memory * (create * restore) ** 0.5) ** (1 / 3))


for label, change in [("twice the throughput", {"tps": 2}), ("half the memory", {"memory": 0.5}),
                      ("half the creation time", {"create": 0.5}),
                      ("half of create, restore and memory", {"create": 0.5, "restore": 0.5, "memory": 0.5})]:
    print(f"{label:35} {points(**change):+6.2f} points")
```

```{.text .output}
twice the throughput                +30.10 points
half the memory                     +10.03 points
half the creation time               +5.02 points
half of create, restore and memory  +20.07 points
```

To pass, it must beat the human reference on all four: throughput, creation time, restore time and
memory per checkpoint.

2 of 16 models passed; 9 of 16 scored above the human reference (61.4).

| Run | Create (ns) | Restore (ns) | Transactions/s | Memory per checkpoint | Final score | |
|---|---:|---:|---:|---:|---:|---|
| Human reference | 231 | 65 | 42,500 | 13,400 | 61.4 | |
| Gemini 4 Argon · Antigravity | 37 | 30 | 47,500 | 8,500 | 100.0 | pass |
| Claude Opus 5.5 | 43 | 25 | 48,100 | 8,560 | 88.5 | pass |
| Kimi K3.1 Pro | 99 | 309 | 43,600 | 10,700 | 83.7 | fail |
| GLM 5.3 | 39 | 428 | 47,900 | 4,300 | 78.6 | fail |

As of October 26, 2026. GLM 5.3 used half Opus's memory and lost on restore time.

**Claude Opus 5.5** stored the stack in pages of four with a page table, as in our model. Saving a
deep stack shared the live table in constant time; the live stack copied the table, and then each
page, only when it first wrote there. A stack of at most 63 items was copied flat instead. Restoring
one of the stack's own checkpoints swapped its table back in. Pages and tables came from free lists
carved out of the stack's own preallocated space, and a mark-and-sweep pass freed pages no table
referred to.

## Seer: predicting branches

**Seer** (PVLDB 2024) speeds up Ethereum block execution by predicting which way smart-contract
branches will go. Many branches test state that earlier transactions wrote. The task removes the
branch predictor: one small predictor per branch, which answers taken, not taken or **unsure**, and
then learns the direction the branch really took. Within a block, all predictions come before the
observations. Our trace has 60 branches over 40 blocks: some always go one way, some switch once,
some change from block to block, and a few are random.

```python
UNSURE, TAKEN, NOT_TAKEN = 1, 2, 3


def make_branch_trace(seed, branches=60, blocks=40):
    """Our branch behaviors; in each block, each branch runs one to three times."""
    rng = Rng(seed)
    kinds = ["steady"] * 24 + ["switches once"] * 18 + ["per block"] * 12 + ["random"] * 6
    flip_at = [rng.below(blocks) for _ in range(branches)]
    trace = []
    for blk in range(blocks):
        runs = []
        for b in range(branches):
            mood = rng.below(2)
            for _ in range(1 + rng.below(3)):
                kind = kinds[b]
                if kind == "steady":
                    taken = b % 2 == 0
                elif kind == "switches once":
                    taken = (blk >= flip_at[b]) == (b % 2 == 0)
                elif kind == "per block":
                    taken = mood == 1
                else:
                    taken = rng.below(2) == 1
                runs.append((b, taken))
        trace.append(runs)
    return trace
```

Three predictors: always taken (the task's calibration), the last direction seen, and Opus's rule,
which predicts the last direction only after it has held, unchanged, across two distinct blocks.

```python
class AlwaysTaken:
    def predict(self):
        return TAKEN

    def update(self, taken):
        pass


class LastDirection:
    def __init__(self):
        self.last = UNSURE

    def predict(self):
        return self.last

    def update(self, taken):
        self.last = TAKEN if taken else NOT_TAKEN


class StableTwoBlocks(LastDirection):
    """A prediction after an observation starts a new block."""

    def __init__(self):
        super().__init__()
        self.blocks, self.new_block = 0, True

    def predict(self):
        self.new_block = True
        return self.last if self.blocks >= 2 else UNSURE

    def update(self, taken):
        seen = TAKEN if taken else NOT_TAKEN
        if seen != self.last:
            self.last, self.blocks = seen, 1
        elif self.new_block:
            self.blocks += 1
        self.new_block = False


def replay(kind, trace):
    """A block makes all its predictions first, then all its observations."""
    predictors, tally = {}, {"right": 0, "wrong": 0, "unsure": 0}
    for runs in trace:
        guesses = [predictors.setdefault(b, kind()).predict() for b, _ in runs]
        for (b, taken), g in zip(runs, guesses):
            if g == UNSURE:
                tally["unsure"] += 1
            else:
                tally["right" if (g == TAKEN) == taken else "wrong"] += 1
            predictors[b].update(taken)
    return tally


branch_trace = make_branch_trace(21)
print("observations:", sum(len(r) for r in branch_trace))
for kind in (AlwaysTaken, LastDirection, StableTwoBlocks):
    print(f"{kind.__name__:16}", replay(kind, branch_trace))
```

```{.text .output}
observations: 4738
AlwaysTaken      {'right': 2489, 'wrong': 2249, 'unsure': 0}
LastDirection    {'right': 3885, 'wrong': 743, 'unsure': 110}
StableTwoBlocks  {'right': 3376, 'wrong': 343, 'unsure': 1019}
```

Waiting for a second block halves the wrong guesses, at the price of more unsure answers.

## Seer: how it is judged

The predictor is a Go file, `core/vm/predictor.go`, with only `math`, `sort` and `sync` packages
allowed. The judge replays 600 consecutive blocks of Ethereum mainnet from height 14,650,000, with
the authors' snapshot. Transactions using at least 100,000 gas are complex, the rest normal. Each
block and category reports a transaction-path ratio `T` and a branch accuracy `B`. The score is
`Q = 100 (0.8 B + 0.2 T)`, normalized against the always-taken predictor and squared. To pass, in
each category and each of the three 200-block periods, the summed branch accuracy must rise by at
least one printed hundredth over the human reference, and the summed path ratio must not fall.

4 of 16 models passed; 14 of 16 scored above the human reference (80.4).

| Run | Branch accuracy | Path accuracy | Final score | |
|---|---:|---:|---:|---|
| Human reference | 0.954 | 0.873 | 80.4 | |
| Gemini 4 Argon · Pi | 0.96 | 0.893 | 81.5 | pass |
| Gemini 4 Argon · Antigravity | 0.96 | 0.893 | 81.4 | pass |
| Claude Opus 5.5 | 0.96 | 0.892 | 81.3 | pass |
| GPT-6 Astra | 0.959 | 0.891 | 81.2 | fail |
| Kimi K3 | 0.959 | 0.891 | 81.0 | pass |

As of October 26, 2026. Ten runs reached the same rounded means and the pass split them: it is
decided per category and period, so Kimi K3 passed with 81.0 while GPT-6 Astra failed with 81.2.

**Claude Opus 5.5** used the two-block rule from our model. Observations within one block see nearly
the same state, so it counted blocks, not observations, and found block boundaries from the replay
order. It also kept the history of branches seen in two distinct blocks when the system swept away
rarely seen predictors.

# Persistent Treap: every version stays

**Contreap** (PVLDB 2025) is an ordered index on a **treap**: a binary search tree that also keeps
random priorities in heap order, which keeps it balanced. Each node stores a key, its multiplicity
and the total multiplicity of its subtree, so range sums are fast. It is **persistent**: every
transaction makes a new version, and every old version stays readable. An update copies only the
path it changes; everything else is shared with the old version.

## Path copying

```python
class Node:
    __slots__ = ("key", "prio", "count", "total", "left", "right")

    def __init__(self, key, prio, count, left, right):
        self.key, self.prio, self.count, self.left, self.right = key, prio, count, left, right
        self.total = count + (left.total if left else 0) + (right.total if right else 0)


def priority(key):
    return key * 2654435761 % 4294967296          # a fixed pseudo-random priority


def copy(n, **changes):
    f = {"key": n.key, "prio": n.prio, "count": n.count, "left": n.left, "right": n.right}
    f.update(changes)
    STATS["copied"] += 1
    return Node(f["key"], f["prio"], f["count"], f["left"], f["right"])


def insert(n, key):
    if n is None:
        STATS["copied"] += 1
        return Node(key, priority(key), 1, None, None)
    if key == n.key:
        return copy(n, count=n.count + 1)
    if key < n.key:
        c = insert(n.left, key)
        if c.prio > n.prio:                       # rotate right
            return copy(c, right=copy(n, left=c.right))
        return copy(n, left=c)
    c = insert(n.right, key)
    if c.prio > n.prio:                           # rotate left
        return copy(c, left=copy(n, right=c.left))
    return copy(n, right=c)
```

```python
def merge(a, b):
    if a is None or b is None:
        return a or b
    if a.prio > b.prio:
        return copy(a, right=merge(a.right, b))
    return copy(b, left=merge(a, b.left))


def delete(n, key):
    if key == n.key:
        return copy(n, count=n.count - 1) if n.count > 1 else merge(n.left, n.right)
    if key < n.key:
        return copy(n, left=delete(n.left, key))
    return copy(n, right=delete(n.right, key))


def range_sum(n, lo, hi):
    """Occurrences of keys in [lo, hi], from the subtree totals."""
    if n is None:
        return 0
    if n.key < lo:
        return range_sum(n.right, lo, hi)
    if n.key > hi:
        return range_sum(n.left, lo, hi)
    return n.count + range_sum(n.left, lo, n.key - 1) + range_sum(n.right, n.key + 1, hi)
```

A trace in the task's style: 500 even keys, then 3,000 transactions in the balanced mix, 42% inserts,
25% deletes and 33% range queries over 128 keys. Every version's root is kept, and we check range
sums on random past versions against the multisets we recorded.

```python
rng, STATS = Rng(13), {"copied": 0}
n = 500
keys = [2 * (i + 1) for i in range(n)]
for i in range(n - 1, 0, -1):                     # shuffle the initial keys
    j = rng.below(i + 1)
    keys[i], keys[j] = keys[j], keys[i]
root = None
for key in keys:
    root = insert(root, key)
roots, live, history, STATS["copied"] = [root], {k: 1 for k in keys}, [], 0
for _ in range(3000):
    draw = rng.below(100)
    if draw < 42:
        key = 1 + rng.below(4 * n)
        root = insert(root, key)
        live[key] = live.get(key, 0) + 1
    elif draw < 67:
        key = sorted(live)[rng.below(len(live))]
        root = delete(root, key)
        live[key] -= 1
        if live[key] == 0:
            del live[key]
    roots.append(root)                            # a query publishes the same root
    history.append(dict(live))
updates = sum(1 for a, b in zip(roots, roots[1:]) if a is not b)
print(f"versions {len(roots)}, updates {updates}, nodes copied per update {STATS['copied'] / updates:.1f}")
ok = True
for _ in range(200):
    v, lo = 1 + rng.below(3000), 1 + rng.below(4 * n - 128)
    want = sum(c for k, c in history[v - 1].items() if lo <= k <= lo + 127)
    ok = ok and range_sum(roots[v], lo, lo + 127) == want
print("200 range sums on past versions correct:", ok)
```

```{.text .output}
versions 3001, updates 1974, nodes copied per update 12.0
200 range sums on past versions correct: True
```

About a dozen new nodes per update keep 3,001 complete versions alive.

## Units, workers and a hot range

**Claude Opus 5.5** made updates parallel. Nodes with priority above a threshold form the **top** of
the treap; each subtree below them, a **unit**, holds the keys between two consecutive top keys.
Each update goes to the worker that owns its unit, and workers copy paths inside their units
independently. A linker thread then copies the short top path of each update, in version order, and
publishes the version.

```python
from bisect import bisect_left

TOP = 4294967296 - 4294967296 // 32           # nodes above this priority form the top


def top_keys(n):
    if n is None or n.prio < TOP:
        return []
    return top_keys(n.left) + [n.key] + top_keys(n.right)


def path(n, key):
    """(top nodes, unit nodes) on the way to key: the nodes an update copies."""
    top = unit = 0
    while n is not None:
        if n.prio >= TOP:
            top += 1
        else:
            unit += 1
        if key == n.key:
            break
        n = n.left if key < n.key else n.right
    return top, unit


tops = top_keys(root)
print(f"{len(tops)} top keys split the keys into {len(tops) + 1} units")
for label, hot in [("uniform", 0), ("hotspot", 98)]:
    rng = Rng(17)
    stream = [(900 + rng.below(40)) if rng.below(100) < hot else 1 + rng.below(4 * n)
              for _ in range(1000)]
    load, top_nodes, unit_nodes = [0] * 4, 0, 0   # four workers, units dealt out in turn
    for key in stream:
        load[bisect_left(tops, key) % 4] += 1
        t, u = path(root, key)
        top_nodes, unit_nodes = top_nodes + t, unit_nodes + u
    print(f"{label:8} nodes per update: top {top_nodes / 1000:.1f}, unit {unit_nodes / 1000:.1f}; "
          f"worker loads {load}")
```

```{.text .output}
21 top keys split the keys into 22 units
uniform  nodes per update: top 6.1, unit 6.0; worker loads [295, 142, 346, 217]
hotspot  nodes per update: top 8.0, unit 4.9; worker loads [5, 486, 503, 6]
```

In a hotspot, two workers do all the work and the linker's serial share grows. Opus's own idea
answers this: it sampled recent update keys, and when 90% fell in a narrow range it raised the top
node over that range to the root, so updates there stop copying ancestors on the other side.

## What the agent writes, and how it is judged

The task removes the update scheduler and the insert and delete routines, three C++ headers, and the
agent writes them. A reader may ask for any version at any moment, while updates are still running,
and must never see a half-built tree. Each trace has 80,000 to 89,999 initial keys and 450,000 to
539,999 transactions, in four mixes (balanced, read-heavy, update-heavy and hotspot), run with 4 to
6 server threads and 1 or 2 query clients. Concurrent checkers verify ordering, multiplicities, range
sums and that no node comes from a future version.

The score is `L(S)` (as for Yannakakis) of the geometric-mean throughput gain over a fixed serial
scaffold. To pass, every one of the 24 case-and-thread groups must beat the human reference on three
counts: throughput, peak memory, and the time of 100,000 range queries on random past versions.

12 of 16 models passed; 15 of 16 scored above the human reference (10.2).

| Run | Throughput (KTPS) | Historical query (µs) | Peak memory (MiB) | Final score | |
|---|---:|---:|---:|---:|---|
| Human reference | 1,540 | 2.67 | 548 | 10.2 | |
| Claude Opus 5.5 | 5,100 | 2.83 | 465 | 40.2 | pass |
| GPT-6.1 Terra | 4,200 | 1.79 | 406 | 34.2 | pass |
| Qwen 3.8 Max | 3,250 | 2.48 | 469 | 34.2 | pass |
| DeepSeek V4.1 Flash | 2,930 | 2.37 | 403 | 28.5 | fail |

As of October 26, 2026. The reference is measured again in every run, so compare a run with its own
reference, not with this row.

```python
def gain_from_score(score):
    """Invert L(S) = 100 log S / (log 10 + log S)."""
    return 10 ** (score / (100 - score))


for name, score in [("Human reference", 10.2), ("Claude Opus 5.5", 40.2), ("GPT-6.1 Terra", 34.2)]:
    print(f"{name:16} {score:4.1f} -> {gain_from_score(score):4.2f}x the serial scaffold's throughput")
```

```{.text .output}
Human reference  10.2 -> 1.30x the serial scaffold's throughput
Claude Opus 5.5  40.2 -> 4.70x the serial scaffold's throughput
GPT-6.1 Terra    34.2 -> 3.31x the serial scaffold's throughput
```

Besides the units and the hot range, **Claude Opus 5.5** copied paths top-down in one pass, writing
each ancestor's subtree count once, and a delete first found its key, so a missing key created no
nodes. Nodes are never freed, so path copies came from large regions by a bump allocator; a helper
thread touched the next pages ahead of the linker, and unused tails were returned so they never
counted toward peak memory.

# Summary and self-check

::: pattern
**Three lessons from the Database tasks.**

1. *Do the cheap pass first.* Yannakakis drops rows before joining, FARGO stops once more probes are
   unlikely to help, and SCOPE counts easy homomorphisms instead of copies.
2. *Reorganize the data, not just the loop.* The best JoinBoost and Spectrum runs changed how the
   data were stored: side tables per branch, pages shared between checkpoints.
3. *The pass rule decides.* On FARGO Query Stopping the top scores failed on recall; on Seer, runs
   with the same means split on per-period checks; on Yannakakis, 39 strict per-query wins were too
   many for every model.
:::

## Exercises

1. In the Yannakakis model, filter users to 20 instead of 4. How do the binary plan's intermediate
   result and the cheapest root change?
2. In the JoinBoost model, use a learning rate of 1.0. Check the identity, and explain why the SSE now
   drops by exactly `Σ g² / h`.
3. In the FARGO model, use `p_τ = 0.3`. How do recall and work change at `c = 0.8`?
4. Derive the formula for the number of wedges with `v` at one end from homomorphisms, and say which
   maps the `− deg(v)` removes.
5. In the Spectrum model, use pages of 16 items. What happens to the items copied on write and the
   items kept, and why?
