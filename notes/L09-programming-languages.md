---
title: "Lecture 09: Programming Languages"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has four Programming Languages tasks. Three of them build on one data structure, the
**e-graph**: **Egg** restores an e-graph's invariants after a batch of merges (POPL 2021);
**BABBLE** finds library functions shared by a corpus of programs (POPL 2023); and **Glenside**
tracks tensor shapes through rewrites so that convolutions can run on matrix hardware (MAPS 2021).
The fourth, **Polygon**, looks for a small database on which two SQL queries disagree (PLDI 2025).
For each task, these notes explain the paper's idea, the part the task removed, how a run is
judged, and what the agents did.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. We build one small e-graph in the first chapter and reuse it in the BABBLE
chapter. Every program in these notes has been run, and every output shown is the real output.

::: instructor
**Sources.** Task pages and results: <https://frontier-cs.org/> (as of October 26, 2026). The
task statements are the public ones an agent reads. Nothing here comes from the hidden workloads or
the human reference patches. There is no case study for this field yet.

**Numbers.** Pass counts and scores are from the 16-model leaderboard. The counts of workloads won
("4 of 6") are the task pages' per-cell notes. The toy programs, corpora, tables and sizes are ours.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Explain what an e-graph stores, and the roles of union-find, the hash-cons memo and congruence.
2. Explain why egg repairs the e-graph once per batch of merges, and count the work it saves.
3. Anti-unify two programs by hand, and compute how much a library function shrinks a corpus.
4. Find a database on which two SQL queries disagree, and say why NULL values matter.
5. Compute the outer and item shapes of a Glenside access pattern, and write a convolution as a matrix product.
6. Explain why a run can beat the human reference on average and still fail.

# Egg: what an e-graph stores

A compiler that optimizes by rewriting has a problem: which rewrite to apply first? Rewriting
`a * 2` to `a << 1` inside `(a * 2) / 2` can block the rewrite that simplifies it to `a`. **Equality saturation** avoids
the choice. It keeps every form it finds, applies all rewrites until nothing new appears (or a
limit is hit), and only then **extracts** the cheapest form. The forms live in an **e-graph**, which
shares them compactly. *egg: Fast and Extensible Equality Saturation* (POPL 2021) is the Rust
library behind much recent work, including BABBLE and Glenside.

## Three parts

An e-graph groups expressions into **e-classes** of equal values. Each class holds **e-nodes**: an
operator and the classes of its children, not child expressions. Three parts keep it consistent:

- a **union-find** over class ids, so that merged classes share one canonical id;
- a **hash-cons memo** from each e-node to its class, so the same node is never stored twice;
- **parent lists**: for each class, the nodes that use it as a child.

Merging two classes can make two nodes identical. If `b = c`, then `a + b` and `a + c` have the
same operator and the same child classes, so they must be equal too. This is **congruence**.
Restoring it means visiting the parents of merged classes, putting their children in canonical form,
and merging any parents that now collide in the memo. egg calls this **rebuilding**.

```python
class EGraph:
    """A small e-graph: union-find, a hash-cons memo, and parent lists."""

    def __init__(self, deferred=True):
        self.parent = []     # union-find over class ids
        self.memo = {}       # node -> class id; a node is (op, child ids...)
        self.nodes = {}      # root id -> its nodes
        self.uses = {}       # root id -> [(node, class)] of nodes that use it
        self.pending = []    # classes whose parents need repair
        self.deferred = deferred
        self.work = 0        # parent entries repaired: our cost measure

    def find(self, a):
        while self.parent[a] != a:
            a = self.parent[a]
        return a

    def canon(self, node):
        return (node[0],) + tuple(self.find(c) for c in node[1:])

    def add(self, node):
        node = self.canon(node)
        if node in self.memo:
            return self.find(self.memo[node])
        a = len(self.parent)
        self.parent.append(a)
        self.memo[node], self.nodes[a], self.uses[a] = a, [node], []
        for c in sorted(set(node[1:])):
            self.uses[c].append((node, a))
        return a

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a == b:
            return False
        if b < a:
            a, b = b, a          # keep the smaller id as the root
        self.parent[b] = a
        self.nodes[a] += self.nodes.pop(b)
        self.uses[a] += self.uses.pop(b)
        self.pending.append(a)
        if not self.deferred:
            self.rebuild()       # restore the invariants at once
        return True

    def classes(self):
        return len(self.nodes)
```

Rebuilding repairs every pending class. For each parent of the class, it removes the old memo entry,
puts the node in canonical form and stores it again. Two parents that become the same node are
congruent, so they are merged, which may queue more work.

```python
def repair(self, a):
    seen = {}
    for node, cls in self.uses[a]:
        self.work += 1
        self.memo.pop(node, None)
        node = self.canon(node)
        if node in seen:
            self.union(cls, seen[node])   # congruence: same op, same children
        self.memo[node] = seen[node] = self.find(cls)
    self.uses[self.find(a)] = list(seen.items())


def rebuild(self):
    while self.pending:
        todo = {self.find(a) for a in self.pending}
        self.pending = []
        for a in sorted(todo):
            self.repair(a)
    for a in self.nodes:
        self.nodes[a] = sorted(set(self.canon(n) for n in self.nodes[a]))


EGraph.repair, EGraph.rebuild = repair, rebuild
```

## Congruence in action

We add `(a + b) * 2` and `(a + c) * 2`, then merge `b` and `c`. Right after the union, the two
products are still in different classes. After rebuilding, they share one.

```python
def add_term(g, term):
    """Add a nested tuple like ("+", ("a",), ("b",)) and return its class."""
    return g.add((term[0],) + tuple(add_term(g, t) for t in term[1:]))


g = EGraph()
b, c = add_term(g, ("b",)), add_term(g, ("c",))
ab = add_term(g, ("*", ("+", ("a",), ("b",)), ("2",)))
ac = add_term(g, ("*", ("+", ("a",), ("c",)), ("2",)))
print("start:        ", g.classes(), "classes, same class?", g.find(ab) == g.find(ac))
g.union(b, c)
print("after b = c:  ", g.classes(), "classes, same class?", g.find(ab) == g.find(ac))
g.rebuild()
print("after rebuild:", g.classes(), "classes, same class?", g.find(ab) == g.find(ac))
```

```{.text .output}
start:         8 classes, same class? False
after b = c:   7 classes, same class? False
after rebuild: 5 classes, same class? True
```

There are eight classes at the start: `a`, `b`, `c`, `2`, two sums and two products (`a` and `2`
are stored once). The union leaves seven. Rebuilding finds that the two sums are congruent and
merges them, and then finds the same for the two products: five classes.

# Egg: rebuild once per batch

Before egg, e-graphs restored congruence after every union. egg's idea is to **defer**: apply a
whole batch of rewrites, queue the merged classes, and rebuild once. A class that is merged many
times in one batch then has its parents repaired once, not once per merge.

## Counting the work

Our workload: a class `x0` sits under `n` different operators `h0(x0)`, `h1(x0)`, …, and each
`xj` sits under `hj`. One batch of rewrites merges `x1`, …, `x(n-1)` into `x0`. Each merge makes
`hj(x0)` and `hj(xj)` congruent. We count parent entries repaired, our measure of work.

```python
def batch(n, deferred):
    g = EGraph(deferred)
    xs = [add_term(g, (f"x{i}",)) for i in range(n)]
    for j in range(n):
        add_term(g, (f"h{j}", ("x0",)))
        add_term(g, (f"h{j}", (f"x{j}",)))
    for x in xs[1:]:
        g.union(xs[0], x)
    g.rebuild()
    return g.classes(), g.work


for n in [4, 16, 64, 256]:
    (k1, w1), (k2, w2) = batch(n, False), batch(n, True)
    print(f"n={n:3}: {k1:3} classes both ways; work immediate {w1:5}, deferred {w2:3}")
```

```{.text .output}
n=  4:   5 classes both ways; work immediate    15, deferred   7
n= 16:  17 classes both ways; work immediate   255, deferred  31
n= 64:  65 classes both ways; work immediate  4095, deferred 127
n=256: 257 classes both ways; work immediate 65535, deferred 511
```

Both ways end with the same e-graph: one class for all the `x`s and one per operator. Repairing
after every union visits the growing parent list of `x0` each time, about `n²` entries. Deferring
visits it once, about `2n`. The paper finds that rebuilding gives asymptotic
speedups in practice; our numbers only show the shape of the saving.

::: pitfall
**Deferring has a price.** Between rebuilds, the memo can hold stale nodes and two classes can be
equal without knowing it. Anything that searches the e-graph must wait for a rebuild. egg rebuilds
once per iteration of equality saturation, after all matches are applied.
:::

## What the agent writes, and how it is judged

The task gives the agent egg's source with three methods removed: `process_unions`, which works
through the pending merges and analysis updates; `rebuild_classes`, which puts every class's nodes
in canonical form and removes duplicates; and `rebuild`, which runs both until no work is left.
After `rebuild`, every id must be canonical, congruent nodes must share a class, the memo must agree,
**analysis data** (facts attached to each class, such as a constant's value) must have flowed up to
the parents, explanations must stay valid, and extraction must find the cheapest form.

The workloads are tests from egg's arithmetic suite: three public ones (e-matching, differentiation
with explanations, and associativity of addition) and three hidden ones of the same family. Each is
run many times. To pass, on every test the agent's code must be at least 5% faster than the human
reference in **two** measures: total wall-clock time, and congruence-maintenance time (the time
spent applying matches and rebuilding). The score uses only the agent's own times: with `G` the
geometric mean of its wall-clock times, `score = 100 × S / (S + G)` with `S = 20 ms`.

```python
S = 0.020


def egg_score(seconds):
    return 100 * S / (S + seconds)


for name, score in [("Human reference", 54.3), ("Kimi K3.1 Pro", 62.3)]:
    seconds = S * (100 / score - 1)          # the formula, solved for the time
    print(f"{name}: score {score} means a mean time of {1000 * seconds:.1f} ms")
```

```{.text .output}
Human reference: score 54.3 means a mean time of 16.8 ms
Kimi K3.1 Pro: score 62.3 means a mean time of 12.1 ms
```

## What the agents did

No model passed. Thirteen of sixteen scored above the human reference, yet none was 5% faster on
both measures on all six tests.

| Run | Congruence time (ms) | Wall-clock time (ms) | Final score | |
|---|---|---|---|---|
| Human reference | 3.71 | 97.9 | 54.3 | |
| Kimi K3.1 Pro | 3.25 (won 4 of 6) | 77.6 (won 2 of 6) | 62.3 | Fail |
| GPT-6.1 Terra | 3.21 (won 3 of 6) | 80.8 (won 3 of 6) | 61.8 | Fail |
| Gemini 4 Argon · Pi | 2.78 (won 6 of 6) | 74.2 (won 4 of 6) | 61.7 | Fail |
| Claude Opus 5.5 | 3.98 (won 0 of 6) | 99.6 (won 0 of 6) | 52.8 | Fail |

Means over the six hidden tests, as of October 26, 2026. "Won" counts the tests on which the run
beat the reference.

Gemini 4 Argon · Pi came closest: it beat the reference on congruence time in all six tests and on
wall-clock time in four. The task page describes the run of **Claude Opus 5.5**, which did not
pass. It repairs pending parents as our `repair` does, then propagates analysis data: when a class's
data changes, its parents go back on the queue. Both loops repeat until neither has work. Finally it
visits every class once, sorts its nodes and removes duplicates, and rebuilds the index from each
operator to the classes that contain it, which pattern matching uses.

::: pitfall
**An average is not a pass.** A run that is faster on average can still be slower on one test, or
fast in total but slow in rebuilding. The pass rule asks for every test and both measures.
:::

# BABBLE: learning a library

People who write many related programs factor out functions. **Library learning** does this
automatically: given a corpus of programs, find functions whose use makes the corpus smallest.
*babble: Learning Better Abstractions with E-Graphs and Anti-unification* (POPL 2023) finds
candidate functions by **anti-unification** and keeps the corpus in an e-graph, so that equivalent
forms of each fragment are considered too.

## Anti-unification

To anti-unify two fragments, line them up and put a **hole** wherever they differ. The result is
the most specific pattern that matches both. Our corpus is four turtle drawings: two polygons, and
two shapes made of a polygon and a line. We read them into the e-graph from the first chapter, where
shared fragments such as `(move 10)` become one class.

```python
def parse(text):
    """Read one s-expression like (move 10) into nested tuples."""
    tokens = text.replace("(", " ( ").replace(")", " ) ").split()

    def read(i):
        if tokens[i] != "(":
            return (tokens[i],), i + 1
        op, i = tokens[i + 1], i + 2
        kids = []
        while tokens[i] != ")":
            kid, i = read(i)
            kids.append(kid)
        return (op, *kids), i + 1

    return read(0)[0]


def show(t):
    return t[0] if len(t) == 1 else "(" + " ".join([t[0]] + [show(k) for k in t[1:]]) + ")"


def size(t):
    return 1 + sum(size(k) for k in t[1:])


CORPUS = [parse(p) for p in [
    "(repeat 4 (seq (move 10) (turn 90)))",
    "(repeat 3 (seq (move 10) (turn 120)))",
    "(seq (repeat 6 (seq (move 5) (turn 60))) (move 20))",
    "(seq (move 20) (repeat 8 (seq (move 5) (turn 45))))",
]]
lib = EGraph()
roots = [add_term(lib, p) for p in CORPUS]
print(sum(size(p) for p in CORPUS), "nodes in the corpus,", lib.classes(), "e-classes")
```

```{.text .output}
34 nodes in the corpus, 28 e-classes
```

Anti-unification works on pairs of e-classes. If the two classes are the same, the pattern is that
fragment. If their nodes have the same operator, the pattern has that operator and anti-unifies the
children pair by pair. Otherwise the pair becomes a hole; the same pair always gets the same hole.

```python
def term_of(g, a):
    node = g.nodes[a][0]
    return (node[0],) + tuple(term_of(g, c) for c in node[1:])


def anti_unify(g, a, b, holes):
    """The most specific pattern matching classes a and b; where they differ, a hole."""
    if a == b:
        return term_of(g, a)
    na, nb = g.nodes[a][0], g.nodes[b][0]
    if na[0] == nb[0] and len(na) == len(nb):
        return (na[0],) + tuple(anti_unify(g, x, y, holes) for x, y in zip(na[1:], nb[1:]))
    if (a, b) not in holes:
        holes[(a, b)] = "?" + "xyzuvw"[len(holes)]
    return (holes[(a, b)],)


print(show(anti_unify(lib, roots[0], roots[1], {})))
print(show(anti_unify(lib, roots[2], roots[3], {})))
```

```{.text .output}
(repeat ?x (seq (move 10) (turn ?y)))
(seq ?x ?y)
```

The two polygons give a polygon function with two holes. The other two shapes differ at the top, so
their pattern is a single `seq` with two holes, which is too general to help.

## Choosing a function

Every pair of classes gives a candidate. We keep those with at most two holes (the task's limit)
and some structure. A candidate's value is the corpus size after rewriting every match into a call,
plus the size of the function itself.

```python
def is_hole(t):
    return t[0].startswith("?")


def holes_in(t):
    return {t[0]} if is_hole(t) else set().union(*[holes_in(k) for k in t[1:]])


def match(pat, t, env):
    if is_hole(pat):
        return env if env.setdefault(pat[0], t) == t else None
    if pat[0] != t[0] or len(pat) != len(t):
        return None
    for p, k in zip(pat[1:], t[1:]):
        if match(p, k, env) is None:
            return None
    return env


def rewrite(t, pat, name):
    """Replace every match of pat, outermost first, by a call (name args...)."""
    env = match(pat, t, {})
    if env is not None:
        return (name,) + tuple(rewrite(env[h], pat, name) for h in sorted(env))
    return (t[0],) + tuple(rewrite(k, pat, name) for k in t[1:])


def cost_with(pat):
    return size(pat) + sum(size(rewrite(p, pat, "f")) for p in CORPUS)


ids = sorted(lib.nodes)
candidates = set()
for i, a in enumerate(ids):
    for b in ids[i + 1:]:
        pat = anti_unify(lib, a, b, {})
        if len(pat) > 1 and len(holes_in(pat)) <= 2:
            candidates.add(pat)
ranked = sorted(candidates, key=lambda q: (cost_with(q), show(q)))
print(len(candidates), "candidates; the best four:")
for pat in ranked[:4]:
    print(f"  cost {cost_with(pat)}  {show(pat)}")
```

```{.text .output}
9 candidates; the best four:
  cost 31  (seq (move ?x) (turn ?y))
  cost 33  (repeat ?x (seq (move 10) (turn ?y)))
  cost 33  (repeat ?x (seq (move 5) (turn ?y)))
  cost 33  (seq (move 10) (turn ?x))
```

The polygon pattern loses: it matches only the first two programs. The smaller pattern
`(seq (move ?x) (turn ?y))`, "one side", matches all four.

```python
best = ranked[0]
before, after = sum(size(p) for p in CORPUS), cost_with(best)
print("f =", show(best))
for prog in CORPUS:
    print("  ", show(rewrite(prog, best, "f")))
print(f"cost {before} -> {after}, ratio {before / after:.3f}, reduction {100 * (1 - after / before):.1f}%")
```

```{.text .output}
f = (seq (move ?x) (turn ?y))
   (repeat 4 (f 10 90))
   (repeat 3 (f 10 120))
   (seq (repeat 6 (f 5 60)) (move 20))
   (seq (move 20) (repeat 8 (f 5 45)))
cost 34 -> 31, ratio 1.097, reduction 8.8%
```

BABBLE does more than this. It repeats the search for a second round, keeps a beam of 64 partial
libraries, and, with domain **equations** such as the commutativity of addition, runs equality
saturation first, so a class holds several forms of a fragment. Anti-unifying two classes then gives
a *set* of patterns, one for each pair of forms. The paper computes these sets across the whole
e-graph by crossing its **tree automaton** (the e-graph seen as rules `op(classes) → class`) with
itself.

## What the agent writes, and how it is judged

The task removes the candidate step: the body of `LearnedLibrary::new`, which turns the saturated
e-graph into candidate patterns, and of `Dfta::cross_over`, which crosses the automaton with itself.
Candidates must keep the meaning of what they replace, respect the hole limit of two, and the search
must end on cyclic e-graphs. Everything after it (deduplication, choosing the library, extraction,
measuring) is fixed.

The development suite has five corpora, one per domain: lists, physics, text, logo drawings and
block towers. The graded suite has ten others, two per domain. Each corpus is run three times. To
pass, on every corpus the compression must be at least the human reference's, and the median run
time must be strictly lower. The score is the mean percentage reduction, `100 × (1 − 1/r)` for a
compression ratio `r`, so a ratio of 1.25 scores 20.

## What the agents did

One model passed: **Claude Opus 5.5**, with a compression ratio of 1.28 against the reference's
1.27, and 257 ms against 973 ms. Six of sixteen scored above the reference. Many runs were faster,
but most fell short of the reference's compression on at least one corpus.

| Run | Compression ratio | Run time (ms) | Final score | |
|---|---|---|---|---|
| Human reference | 1.27 | 973 | 18.8 | |
| DeepSeek V4.1 Flash | 1.28 (7 of 10) | 412 (4 of 10) | 19.4 | Fail |
| GPT-6.1 Terra | 1.28 (9 of 10) | 162 (9 of 10) | 19.0 | Fail |
| Claude Opus 5.5 | 1.28 (10 of 10) | 257 (10 of 10) | 18.9 | Pass |
| GLM 5.3 | 1.27 (8 of 10) | 74.2 (10 of 10) | 18.3 | Fail |

Means over the ten graded corpora, as of October 26, 2026. In brackets: the corpora on which the run
met the reference.

Claude Opus 5.5 crossed every rule of the automaton with every rule of the same arity. A depth-first
search then computed the patterns common to each pair of e-classes **once per pair**, as our
`anti_unify` would with a memo. It kept all patterns in one table that stores each distinct
subpattern once, skipped pairs of classes that can never occur in one program, named holes in order
of first appearance and dropped repeats. On cyclic e-graphs, where many candidates match exactly the
same places, it kept only the smallest candidate of each group, as the later deduplication would.

::: pitfall
**The best score did not pass.** DeepSeek V4.1 Flash had the best final score, 19.4, but its
compression fell below the reference's on three of the ten corpora.
:::

# Polygon: two queries that disagree

A student's SQL answer passes the test cases, but is it right? Two queries are **equivalent** if
they return the same result on every database. Proving that is hard; refuting it needs only one
**counterexample**: a database on which they differ. *Polygon: Symbolic Reasoning for SQL using
Conflict-Driven Under-Approximation Search* (PLDI 2025) finds small ones. It encodes both queries as
formulas over tables of a few symbolic rows, and asks an SMT solver for values that make the results
differ.

## A wrong answer that passed

The task's public example is a LeetCode problem: count, for each customer, the visits with no
transaction. The reference uses `NOT IN`; a submitted answer uses a `LEFT JOIN` and keeps rows with a
NULL amount. We write both as Python functions, with SQL's rules for NULL (`None`).

```python
from collections import Counter
from itertools import product


def answer(visits, trans):
    """SELECT v.customer_id, COUNT(v.customer_id) FROM visits v
       LEFT JOIN transactions t ON v.visit_id = t.visit_id
       WHERE t.amount IS NULL GROUP BY v.customer_id"""
    groups = {}
    for visit_id, customer in visits:
        amounts = [amount for _, vid, amount in trans if vid == visit_id]
        for amount in amounts or [None]:              # no match: the join gives NULLs
            if amount is None:
                groups[customer] = groups.get(customer, 0) + (customer is not None)
    return Counter(groups.items())


def reference(visits, trans):
    """SELECT customer_id, COUNT(*) FROM visits WHERE visit_id NOT IN
       (SELECT DISTINCT visit_id FROM transactions) GROUP BY customer_id"""
    used = {vid for _, vid, _ in trans}
    groups = {}
    for visit_id, customer in visits:
        if visit_id not in used:
            groups[customer] = groups.get(customer, 0) + 1
    return Counter(groups.items())


print(answer([(1, 7), (2, 7)], [(1, 1, 30)]), reference([(1, 7), (2, 7)], [(1, 1, 30)]))
```

```{.text .output}
Counter({(7, 1): 1}) Counter({(7, 1): 1})
```

On this database, the answer is right. Rows are `(visit_id, customer_id)` and
`(transaction_id, visit_id, amount)`; results are compared as bags of rows, since there is no
`ORDER BY`.

## Small databases first

Polygon's schema rules come with the problem: visit and transaction ids are unique, and every
transaction's visit exists. We search all databases with at most `bound` rows per table, smallest
first, from a few values per column.

```python
def search(bound, customers=(7, None), amounts=(5, None)):
    tried = 0
    visit_rows = list(product((1, 2), customers))
    trans_rows = list(product((1, 2), (1, 2), amounts))
    for total in range(2 * bound + 1):                 # small databases first
        for nv in range(min(total, bound) + 1):
            nt = total - nv
            if nt > bound:
                continue
            for visits in product(visit_rows, repeat=nv):
                for trans in product(trans_rows, repeat=nt):
                    ids = [v for v, _ in visits]
                    if len(set(ids)) < nv or len({t for t, _, _ in trans}) < nt:
                        continue                          # unique keys
                    if any(vid not in ids for _, vid, _ in trans):
                        continue                          # every visit exists
                    tried += 1
                    if answer(visits, trans) != reference(visits, trans):
                        return tried, visits, trans
    return tried, None, None


print("any values:      ", search(2))
print("no NULL customer:", search(2, customers=(7,)))
print("no NULL at all:  ", search(2, customers=(7,), amounts=(5,)))
```

```{.text .output}
any values:       (3, ((1, None),), ())
no NULL customer: (5, ((1, 7),), ((1, 1, None),))
no NULL at all:   (37, None, None)
```

The answer has two bugs, and the search finds both. A visit with no customer counts 0 in the
answer, because `COUNT(column)` skips NULL, and 1 in the reference. A transaction with a NULL amount
keeps its visit in the answer's join. Without NULLs, the two queries agree on every database we
tried: test data without such NULLs cannot catch either bug.

## Under-approximation

Brute force grows exponentially with the bound and the domains; Polygon instead lets the solver
choose the values. But encoding every behavior of a query at once (every row present or absent,
every branch of every join) makes a formula too big to solve fast. Polygon **under-approximates**:
it commits to some choices, for example that some rows are absent, and solves the smaller formula.
If that has no solution, the solver's unsat core names the choices that conflict; Polygon records
the conflict, backs off and widens only those choices.

The second kind of workload asks for one database that splits 50 or 100 queries into two groups of
equal size by their results. A tiny version, with one row:

```python
thresholds = [29, 30, 31, 32]          # SELECT emp_id FROM employees WHERE age > t
for age in range(25, 40):
    rows = [age > t for t in thresholds]
    if sum(rows) == len(rows) // 2:
        print("age", age, "->", ["row" if r else "empty" for r in rows])
        break
```

```{.text .output}
age 31 -> ['row', 'row', 'empty', 'empty']
```

## What the agent writes, and how it is judged

The task removes Polygon's search, end to end: the body of `Environment.check`, which parses and
encodes the two queries, searches, and decodes the solver's model into a database; the parallel
disambiguation path; and the conflict-driven bodies behind them. The parser, encoders, SMT interface
and the MariaDB check stay. A refutation counts only if MariaDB runs both queries on the decoded
database and sees different results.

Each suite has 16 wrong LeetCode answers (four each at row bounds 2, 3, 4 and 5, with a 2-second
budget), three splitting tasks of 50 or 100 queries, and two hard pairs from the paper with
20-second budgets. To pass, on each of the 19 ordinary workloads it must refute wherever the
reference does and take at most `max(0.03 s, 20%)` longer; on the two hard pairs it must be more
than twice as fast. The score counts refutations first, then total time in steps of 0.5:

```python
from math import ceil, exp


def polygon_score(refuted, time_units, n=19):
    """time_units: the sum over workloads of 2 * time / budget."""
    t = 0.5 * ceil(time_units / 0.5)
    return 100 * (refuted + exp(-t / (n * 0.25))) / (n + 1)


for units in [2.5, 10, 38]:
    print(f"19 refuted, time units {units:4}: score {polygon_score(19, units):.1f}")
print(f"18 refuted, time units  2.5: score {polygon_score(18, 2.5):.1f}")
```

```{.text .output}
19 refuted, time units  2.5: score 98.0
19 refuted, time units   10: score 95.6
19 refuted, time units   38: score 95.0
18 refuted, time units  2.5: score 93.0
```

With every workload refuted, the score lies between 95 and 100. A missed refutation costs 5 points,
more than any speedup can win back. By the formula, the reference's 95.6 means about 10 time units,
and 98.0 about 2.5: our arithmetic, not a published figure.

## What the agents did

Four of sixteen models passed. Ten scored above the human
reference. GPT-6.1 Terra and Kimi K3.1 Pro shared the best final score.

| Run | Pairs refuted | Wall time (ms) | Final score | |
|---|---|---|---|---|
| Human reference | 1 | 1,210 | 95.6 | |
| GPT-6.1 Terra | 1 (21 of 21) | 253 (21 of 21) | 98.0 | Pass |
| Kimi K3.1 Pro | 1 (21 of 21) | 274 (21 of 21) | 98.0 | Pass |
| GLM 5.3 | 1 (21 of 21) | 307 (21 of 21) | 97.7 | Pass |
| DeepSeek V4.1 Flash 1017 | 1 (21 of 21) | 314 (21 of 21) | 97.7 | Pass |
| Claude Opus 5.5 | 1 (21 of 21) | 831 (10 of 21) | 95.5 | Fail |
| GPT-6.1 Sol | 0.952 (20 of 21) | 242 (21 of 21) | 93.0 | Fail |

Shares and means over the 21 graded workloads, as of October 26, 2026. In brackets: the workloads on
which the run met the reference's bar.

The task page describes the run of **Claude Opus 5.5**. It grows the row bound from one row per
table up to the limit, each bound a fresh, smaller formula, as our `search` does. Within a bound,
each table starts with few live rows, given to the Z3 solver as assumptions; on failure, the unsat
core names the tables whose sizes took part, and only those grow by one row. Preferences such as
dates inside the database's range stay until a conflict blames them. Several schedules run in
parallel, each with its own Z3, and the first model found stops the rest. It refuted all 21
workloads but was too slow on 11 of them.

::: pitfall
**Fast is not enough.** GPT-6.1 Sol was faster than every passing run, at 242 ms, but missed one
refutation, and its score fell to 93.0.
:::

# Glenside: shapes through rewrites

Matrix accelerators, such as a **systolic array** of multiply-and-add units, run matrix products. A
neural network's **convolution** is not one, but it can be rewritten as one, a trick called
**im2col**. *Pure Tensor Program Rewriting via Access Patterns* (MAPS 2021) introduces Glenside, a
language in which such rewrites are pure and local, so that an e-graph can explore them and a fixed
rule can spot forms the accelerator runs.

## Access patterns

In Glenside, a tensor is viewed as an **access pattern**: an **outer shape** that indexes a
collection of items, and an **item shape**, the shape of each item. `(access x 1)` on a tensor of
shape `[2, 3, 4]` is a collection of 2 items of shape `[3, 4]`. Operators work on items:
`access-windows` makes one item per window, `cartesian-product` pairs every left item with every right
item, and `dot-product` multiplies each pair and sums.

The e-graph needs to know these shapes for every class: the rewrites and the accelerator rule depend
on them. That is an **analysis**: `make` builds a node's fact from its children's facts, and `merge`
combines the facts of two classes that join. Here is `make` for the operators of the task's public
example, a 2×2 convolution of a 3×3 image:

```python
def make(op, kids, args, env):
    """The fact (outer shape, item shape) of one node, from its children's facts."""
    if op == "access-tensor":
        return env[args[0]], []
    outer, item = kids[0]
    full = outer + item
    if op == "access":                      # move the split to after k dimensions
        return full[:args[0]], full[args[0]:]
    if op == "access-pad":                  # zeros added along one full axis
        axis, before, after = args
        full = full[:axis] + [full[axis] + before + after] + full[axis + 1:]
        return full[:len(outer)], full[len(outer):]
    if op == "access-windows":              # one item per window position
        k, s = args
        positions = [(i - kk) // ss + 1 for i, kk, ss in zip(item, k, s)]
        return outer + positions, list(k)
    if op == "access-squeeze":              # drop a dimension of size 1
        axis = args[0]
        n_outer = len(outer) - (axis < len(outer))
        full = full[:axis] + full[axis + 1:]
        return full[:n_outer], full[n_outer:]
    if op == "cartesian-product":
        r_outer, r_item = kids[1]
        assert item == r_item, "paired items must have the same shape"
        return outer + r_outer, [2] + item
    if op == "dot-product":                 # multiply each pair, sum over the item
        return outer, []
    if op == "access-transpose":
        full = [full[p] for p in args[0]]
        return full[:len(outer)], full[len(outer):]
    raise ValueError(op)


def analyse(expr, env, rows):
    kids = [analyse(x, env, rows) for x in expr[1:] if isinstance(x, tuple)]
    args = [x for x in expr[1:] if not isinstance(x, tuple)]
    fact = make(expr[0], kids, args, env)
    rows.append((expr[0], fact))
    return fact


weights = ("access", ("access-tensor", "weights"), 1)
data = ("access", ("access-pad", ("access-pad", ("access-tensor", "data"), 2, 0, 0), 3, 0, 0), 1)
windows = ("access", ("access-squeeze", ("access-windows", data, [1, 2, 2], [1, 1, 1]), 1), 3)
conv = ("access-transpose", ("dot-product", ("cartesian-product", weights, windows)), [1, 0, 2, 3])
rows = []
analyse(conv, {"data": [1, 1, 3, 3], "weights": [1, 1, 2, 2]}, rows)
for op, (outer, item) in rows:
    print(f"{op:18} outer {str(outer):13} item {item}")
```

```{.text .output}
access-tensor      outer [1, 1, 2, 2]  item []
access             outer [1]           item [1, 2, 2]
access-tensor      outer [1, 1, 3, 3]  item []
access-pad         outer [1, 1, 3, 3]  item []
access-pad         outer [1, 1, 3, 3]  item []
access             outer [1]           item [1, 3, 3]
access-windows     outer [1, 1, 2, 2]  item [1, 2, 2]
access-squeeze     outer [1, 2, 2]     item [1, 2, 2]
access             outer [1, 2, 2]     item [1, 2, 2]
cartesian-product  outer [1, 1, 2, 2]  item [2, 1, 2, 2]
dot-product        outer [1, 1, 2, 2]  item []
access-transpose   outer [1, 1, 2, 2]  item []
```

These are the shapes the task statement lists for this expression. The windows give 2 × 2 items of
shape `[1, 2, 2]`, one per output pixel; the product pairs each with the one kernel; the dot product
leaves one number per pixel.

## A convolution as a matrix product

The accelerator rule looks for a dot product over a Cartesian product whose items are flat vectors:
a matrix times a matrix. Flattening each window gives the **im2col** matrix: one row per output
pixel, one column per kernel weight. With the task's public numbers:

```python
def im2col(image, kh, kw, stride=1):
    h, w = len(image), len(image[0])
    return [[image[i + di][j + dj] for di in range(kh) for dj in range(kw)]
            for i in range(0, h - kh + 1, stride) for j in range(0, w - kw + 1, stride)]


image = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
kernel = [1, 0, 0, -1]
cols = im2col(image, 2, 2)
print("im2col:", cols)
print("output:", [sum(k * x for k, x in zip(kernel, row)) for row in cols])
```

```{.text .output}
im2col: [[1, 2, 4, 5], [2, 3, 5, 6], [4, 5, 7, 8], [5, 6, 8, 9]]
output: [-4, -4, -4, -4]
```

The output `[-4, -4, -4, -4]` is the one the task statement gives. In the e-graph, rewrites that
flatten and reshape accesses add equal forms to the convolution's class, until one of them has the
shape the accelerator rule wants. Without correct shape facts, no rewrite can fire safely.

When two classes join, `merge` combines their facts. Both must cover the same number of elements; a
**settled** shape wins over an unsettled one; and accelerator use is kept if either side has it. It
returns which side changed, so the e-graph revisits only what moved.

```python
from math import prod


def merge(to, other):
    """Facts are (outer, item, settled, uses_accelerator). Returns (fact, to changed, other changed)."""
    (o1, i1, s1, a1), (o2, i2, s2, a2) = to, other
    assert prod(o1 + i1) == prod(o2 + i2), "equal classes hold the same number of elements"
    assert not (s1 and s2) or (o1, i1) == (o2, i2), "two settled shapes must agree"
    o, i = (o1, i1) if s1 or not s2 else (o2, i2)
    fact = (o, i, s1 or s2, a1 or a2)
    return fact, fact != to, fact != other


print(merge(([16], [], False, False), ([4], [4], True, True)))
```

```{.text .output}
(([4], [4], True, True), True, False)
```

## What the agent writes, and how it is judged

The task removes Glenside's analysis: `make` and `merge` for every operator, with facts for outer and
item shapes, known zero regions, whether the shape is settled, and accelerator use. Four generic
rewrites are also editable. The accelerator rules, their order and the extraction are fixed, and
lookup tables for the workloads are not allowed.

There are 14 workloads: 12 small convolutions (in two layouts, with padding, strides and surrounding
axis operations) and two concatenations of Cartesian products under a dot product. Each search runs
up to 30 iterations, 100,000 nodes or 10 seconds. A workload counts as **discovered** if the
extracted program uses the accelerator and gives the right numbers on test inputs. To pass, on every
workload it must discover whenever the reference does, with no more rewrite time and no more
e-graph growth (new nodes). The score rewards discovery (60 points) and then time and growth:

```python
def glenside_score(seconds, growth):
    t = (10.0 / seconds) ** 0.125
    g = (100001.0 / (growth + 1)) ** 0.125
    return 60 + 20 * t / (1 + t) + 20 * g / (1 + g)


for name, seconds, growth in [("statement's check", 10, 100_000),
                              ("Human reference", 0.178, 55_200),
                              ("Claude Opus 5.5", 110e-6, 17.4)]:
    print(f"{name:17}: {glenside_score(seconds, growth):.1f}")
```

```{.text .output}
statement's check: 80.0
Human reference  : 82.8
Claude Opus 5.5  : 91.0
```

The first line is the statement's own check: 80 points. The other two plug the leaderboard's mean
time and growth into the formula; the real score is a mean over workloads, but here it comes out at
the listed 82.8 and 91.0.

## What the agents did

Twelve of sixteen models passed, the most in the field; three runs scored 0. The best final score,
91.0, was shared by seven runs. They found the accelerator form on every workload, adding about 18
new nodes in about 0.11 ms on average, where the reference grew the e-graph by 55,200 nodes and took
178 ms.

| Run | E-graph growth | Finds im2col | Rewrite time (µs) | Final score | |
|---|---|---|---|---|---|
| Human reference | 55,200 | 1 | 178,000 | 82.8 | |
| Claude Opus 5.5 | 17.4 | 1 | 110 | 91.0 | Pass |
| GPT-6 Astra | 17.4 | 1 | 113 | 91.0 | Pass |
| GLM 5.3 Flash | 41 | 1 | 468 | 90.1 | Pass |
| Muse Spark 1.3 | 55,200 | 1 | 167,000 | 82.9 | Fail |

Means over the 14 graded workloads, as of October 26, 2026.

**Claude Opus 5.5** built a fact for every operator, marked accelerator nodes and let every parent
inherit the mark, and merged facts as our `merge` does. Its own idea was in the rewrites. A dot
product of a Cartesian product is rebuilt over flattened operands, so the accelerator rule sees a
plain matrix product at once. A concatenation of two such dot products becomes one dot product of
block operands, padded with zeros so that the extra products add nothing. Each rule skips classes it
has already rewritten, which keeps the e-graph small.

::: pitfall
**Equal is not better.** Muse Spark 1.3 grew the e-graph exactly as much as the reference, but was
slower on 4 of the 14 workloads, so it failed.
:::

# Summary and self-check

::: pattern
**Three lessons from the Programming Languages tasks.**

1. *One data structure, three tasks.* Egg maintains the e-graph, BABBLE mines it for functions, and
   Glenside attaches shapes to it. Knowing union-find, the memo and congruence covers all three.
2. *Every workload, every metric.* In Egg, thirteen runs beat the reference's score and none passed;
   in BABBLE and Polygon, the best score was not a pass.
3. *Write less, not faster.* In Glenside, the passing runs added fewer than 50 nodes instead of
   55,200: a direct rewrite beat a big search.
:::

## Exercises

1. In `batch`, merge the `x`s in pairs (`x0` with `x1`, `x2` with `x3`, …) and then the pairs. How
   do the immediate and deferred work counts change?
2. Anti-unify the first and third programs of the corpus by hand, then check with `anti_unify`.
3. Allow three holes in the candidate search. Which function wins now, and what does the corpus cost?
4. Add a NOT NULL rule to `customer_id` only. What is the smallest counterexample now, and which bug
   does it show?
5. With `im2col`, compute the output of the same kernel on a 4×4 image of the numbers 1 to 16, with
   stride 2. What shape does the output have?
