---
title: "Lecture 10: Software Engineering"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has one Software Engineering task: **CREST**, from Burnim and Sen's paper *Heuristics
for Scalable Dynamic Test Generation* (ASE 2008). CREST is a concolic tester for C. It runs a program,
records the conditions the run depended on, flips one of them with a constraint solver, and runs the
program again on the solution. A real program has far more paths than any testing budget, so the
**search strategy**, the rule that picks which condition to flip next, decides how much of the
program gets tested. The task removes CREST's strategies; the agent writes one. With one task, this
lecture goes deeper than the others: concolic testing on a tiny program, then four search
strategies compared on branch coverage, then the task and what the agents wrote.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. Every program in these notes has been run, and every output shown is the real
output.

::: instructor
**Sources.** Task page and results: <https://frontier-cs.org/> (as of October 26, 2026). The task
statement is the one an agent reads. The paper is the
[Berkeley technical report UCB/EECS-2008-123](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2008/EECS-2008-123.pdf).
Nothing here comes from the hidden workloads, the human reference patch or the evaluator. There is
no case study for this task yet.

**Numbers.** Coverage, overhead and scores are from the 16-model leaderboard. The "human reference
in this run" values and the margins come from the hover text of the task page's results table. The
toy program, its 22 branches and the budget of 100 runs are ours; the task's programs have thousands
of branches and a budget of 4,000 runs.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Run a program concolically: record its path constraint and flip one condition with a solver.
2. Explain why the number of paths, not the number of branches, makes testing hard.
3. Implement bounded depth-first search, random branch search and CFG-directed search, and compare
   them on branch coverage.
4. Compute the task's score and its pass margins from per-seed spreads.
5. Explain why no run passed, and which ideas made the best runs cover more for less search time.

# Concolic testing on a tiny program

**Concolic** testing (concrete + symbolic) runs a program on real inputs and, at the same time,
records every condition along the path that depended on those inputs. The conjunction of those
conditions is the run's **path constraint**: any input that satisfies it takes the same path. To
reach new code, keep the first `k` conditions, negate condition `k`, and ask a solver for inputs
that satisfy the result. The next run follows the old path up to condition `k` and then takes the
other side.

## A program and its path constraint

Our program is a toy packet parser over twelve small integers, each 0 to 15. Every condition goes
through `t.cond`, which plays CREST's instrumentation: it evaluates the condition on the concrete
inputs, and records the branch taken, which inputs it read, and the condition itself. Condition `s`
has two branches: `2s` when it holds and `2s + 1` when it does not. There are 11 conditions, so
22 branches.

```python
class Trace:
    """Records the conditions a run takes, with the inputs each one reads."""

    def __init__(self, x):
        self.x = x
        self.path = []          # (branch, inputs read, condition, text)

    def cond(self, site, reads, test, text):
        taken = test(self.x)    # concrete: evaluate on the real inputs
        self.path.append((2 * site + (0 if taken else 1), reads, test, text))
        return taken


def program(x, t):
    """A toy packet parser: x0 is the type, x1..x5 the header, x6..x11 the payload."""
    if t.cond(1, (0,), lambda v: v[0] < 8, "x0 < 8"):
        if t.cond(2, (0,), lambda v: v[0] == 3, "x0 == 3"):
            if t.cond(3, (1,), lambda v: v[1] == 7, "x1 == 7"):
                if t.cond(4, (1, 2), lambda v: v[2] == v[1] + 4, "x2 == x1 + 4"):
                    t.cond(5, (3,), lambda v: v[3] > 13, "x3 > 13")
        else:
            t.cond(6, (1, 2), lambda v: v[1] > v[2], "x1 > x2")
    elif t.cond(7, (0,), lambda v: v[0] == 12, "x0 == 12"):
        if t.cond(8, (3, 4), lambda v: v[3] == 2 * v[4], "x3 == 2*x4"):
            if t.cond(9, (5,), lambda v: v[5] == 15, "x5 == 15"):
                t.cond(10, (4,), lambda v: v[4] > 7, "x4 > 7")
    for i in range(6, 12):                      # skip zero bytes in the payload
        t.cond(0, (i,), lambda v, i=i: v[i] == 0, f"x{i} == 0")


def run(x):
    t = Trace(list(x))
    program(t.x, t)
    return t.path


def describe(path):
    return [text if b % 2 == 0 else f"not {text}" for b, _, _, text in path]


x = [3, 7, 1, 5, 9, 2, 4, 0, 8, 1, 6, 3]
path = run(x)
print("branches:", [b for b, *_ in path])
print("path constraint:", " and ".join(describe(path)))
```

```{.text .output}
branches: [2, 4, 6, 9, 1, 0, 1, 1, 1, 1]
path constraint: x0 < 8 and x0 == 3 and x1 == 7 and not x2 == x1 + 4 and not x6 == 0 and x7 == 0 and not x8 == 0 and not x9 == 0 and not x10 == 0 and not x11 == 0
```

The payload loop runs six times, so condition 0 appears six times on every path, with the same two
branch ids. That is how loops look to a concolic tester.

## Flipping one condition

Our solver is the simplest one that works: it changes only the inputs that the negated condition
reads, plus any input tied to them by an earlier condition, and tries every value from 0 to 15 in
order. CREST narrows in the same way: its `YicesSolver::IncrementalSolve`, which the task's harness
calls, keeps the old inputs and solves only the constraints linked to the negated one. Here we negate condition 3, `not x2 == x1 + 4`. The earlier condition `x1 == 7` reads `x1`,
so `x1` is tied in and must stay 7:

```python
from itertools import product


def solve(x, path, k):
    """Inputs that follow path[:k] and then take the other side of path[k], or None."""
    _, reads, test, _ = path[k]
    want = path[k][0] % 2 == 1                  # it was false, so make it true
    free = set(reads)                           # inputs we may change
    grown = True
    while grown:                                # add inputs tied to them by earlier conditions
        grown = False
        for _, r, _, _ in path[:k]:
            if free & set(r) and not set(r) <= free:
                free |= set(r)
                grown = True
    keep = [(b % 2 == 0, f) for b, r, f, _ in path[:k] if free & set(r)]
    free = sorted(free)
    for values in product(range(16), repeat=len(free)):
        y = list(x)
        for i, v in zip(free, values):
            y[i] = v
        if test(y) == want and all(f(y) == taken for taken, f in keep):
            return y
    return None


k = 3                                           # negate "not x2 == x1 + 4"
y = solve(x, path, k)
print("new input:", y)
print("new path:", " and ".join(describe(run(y))[:6]))
```

```{.text .output}
new input: [3, 7, 11, 5, 9, 2, 4, 0, 8, 1, 6, 3]
new path: x0 < 8 and x0 == 3 and x1 == 7 and x2 == x1 + 4 and not x3 > 13 and not x6 == 0
```

The new run follows the old path up to that condition and takes its other side, which reaches a
condition, `x3 > 13`, no earlier run had seen. If no values work, the negation is **infeasible**:
the solver returns `None`, and no run is spent.

## Why not random inputs?

A random input reaches `x1 == 7` only if `x0 == 3` too: 1 chance in 256. Each further equality
divides by 16 again. Concolic testing reaches the deepest branch from all zeros, CREST's starting
input, in four flips. Each line shows a run's input and the last header condition it reached:

```python
class Rng:
    """Park-Miller generator: small, and exact in JavaScript too."""

    def __init__(self, seed):
        self.state = seed

    def below(self, n):
        self.state = self.state * 48271 % 2147483647
        return self.state % n


rng = Rng(1)
deep = {6: "x1 == 7", 8: "x2 == x1 + 4", 10: "x3 > 13"}
hits = {b: 0 for b in deep}
for _ in range(100_000):
    taken = {b for b, *_ in run([rng.below(16) for _ in range(12)])}
    for b in deep:
        hits[b] += b in taken
print("random inputs, of 100,000:", {deep[b]: hits[b] for b in deep})

x = [0] * 12                                    # CREST starts from all zeros
for step in range(5):
    path = run(x)
    print(step, x[:4], describe(path)[-7])
    flips = [k for k, (b, *_) in enumerate(path) if b in (5, 7, 9, 11)]   # a failed check
    if not flips:
        break
    x = solve(x, path, flips[0])
```

```{.text .output}
random inputs, of 100,000: {'x1 == 7': 385, 'x2 == x1 + 4': 35, 'x3 > 13': 2}
0 [0, 0, 0, 0] not x1 > x2
1 [3, 0, 0, 0] not x1 == 7
2 [3, 7, 0, 0] not x2 == x1 + 4
3 [3, 7, 11, 0] not x3 > 13
4 [3, 7, 11, 14] x3 > 13
```

For a random input, `x3 > 13` holds at the end of that chain with chance 2 in 65,536 (two of
100,000 here, against about 3 expected); concolic testing needed five runs.

# Search strategies

## Paths, not branches

Every run takes one path. Unbounded depth-first search explores every feasible path exactly once:

```python
def all_paths(x):
    """Unbounded depth-first search: every feasible path, once."""
    seen = []

    def dfs(x, path, pos):
        seen.append([b for b, *_ in path])
        for k in range(pos, len(path)):
            y = solve(x, path, k)
            if y is not None:
                dfs(y, run(y), k + 1)

    dfs(x, run(x), 0)
    return seen


paths = all_paths([0] * 12)
branches = {b for p in paths for b in p}
print(f"{len(paths)} paths, {len(branches)} of 22 branches; missing: {sorted(set(range(22)) - branches)}")
```

```{.text .output}
640 paths, 21 of 22 branches; missing: [20]
```

Ten paths through the header, times 2⁶ = 64 ways through the payload loop, gives 640 paths for 21
reachable branches. Branch 20, `x4 > 7`, is unreachable: with `x3 == 2*x4`, `x4 > 7` would need
`x3 ≥ 16`. Real programs are much worse: GNU grep 2.2 has about 15,000 lines of C and 4,184 branches
(paper, Section 5.3), and its paths cannot be counted. The paper's key observation is that full
branch coverage needs at most as many runs as there are branches. So a strategy should hunt for
paths that expose a new branch, not try to visit them all.

## The harness

A testing **session** has a budget of runs. The strategy can **restart** on random inputs, or
**negate** condition `k` of an earlier run. Both cost one run, except that an infeasible negation
costs only a solver call. Coverage counts the distinct branches over the whole session.

```python
class Tester:
    """The harness: a budget of runs, coverage over the whole session."""

    def __init__(self, budget, seed):
        self.budget, self.rng = budget, Rng(seed)
        self.runs, self.solves, self.covered, self.curve = 0, 0, set(), []
        self.paths = []

    def execute(self, x):
        if self.runs == self.budget:
            raise StopIteration             # the budget is spent: the session ends
        self.runs += 1
        path = run(x)
        self.paths.append([b for b, *_ in path])
        new = {b for b, *_ in path} - self.covered
        self.covered |= new
        self.curve.append(len(self.covered))
        return x, path, len(new)

    def restart(self):
        return self.execute([self.rng.below(16) for _ in range(12)])

    def negate(self, ex, k):
        self.solves += 1
        y = solve(ex[0], ex[1], k)
        return None if y is None else self.execute(y)


def session(strategy, budget, seed):
    t = Tester(budget, seed)
    try:
        strategy(t)
    except StopIteration:
        pass
    return t


def random_testing(t):
    while True:
        t.restart()


t = session(random_testing, 100, 1)
print("random testing, 100 runs:", t.curve[9], t.curve[24], t.curve[49], t.curve[99], "branches")
```

```{.text .output}
random testing, 100 runs: 9 12 12 12 branches
```

Random testing never gets past the equality checks.

## Bounded depth-first search

The classic concolic strategy (DART, CUTE) is depth-first search. CREST's **BoundedDFS** explores
every path that differs from the first run in at most `depth` negations, in depth-first order. The
task's score uses it, with depth 12, as its baseline. (Ours is simplified: CREST's version also
counts sibling flips against the bound, and does not restart. In our toy neither changes the
result.)

```python
def bounded_dfs(t, depth=12):
    """CREST's BoundedDFS: every path with at most `depth` negations, depth first."""
    def dfs(ex, pos, depth):
        for k in range(pos, len(ex[1])):
            if depth == 0:
                return
            new = t.negate(ex, k)
            if new is not None:
                dfs(new, k + 1, depth - 1)

    while True:
        dfs(t.restart(), 0, depth)


t = session(bounded_dfs, 100, 1)
print("bounded DFS, 100 runs:", t.curve[9], t.curve[24], t.curve[49], t.curve[99], "branches")
heads = {tuple(b for b in p if b > 1) for p in t.paths}
print(f"its 100 runs took {len(heads)} different paths through the header")
```

```{.text .output}
bounded DFS, 100 runs: 14 14 14 14 branches
its 100 runs took 6 different paths through the header
```

Depth-first search dives once along the path, flipping each condition in turn, and then always
backtracks to the most recent fork first. On every path the last six forks are the payload loop's,
so after one dive through the header it spends the rest of the budget on the 64 ways through the
loop: 100 runs, 6 header paths, 14 branches. On grep, the paper's DFS and random testing were both
beaten by the CFG-directed and random searches (Section 5.3, Figure 2), and its depth-12 DFS stopped
after fewer than 2¹² iterations, since some runs had fewer than 12 feasible conditions.

## Random branch search

The paper's simplest fix is **random branch search**: negate a random condition of the current run,
move to the new run, and restart on fresh inputs after a stretch with no new coverage.

```python
def random_branch(t, patience=10):
    """Negate a random condition of the current run; restart when nothing new turns up."""
    while True:
        ex, stale = t.restart(), 0
        while stale < patience:
            new = t.negate(ex, t.rng.below(len(ex[1])))
            if new is not None:
                ex = new
                stale = 0 if new[2] else stale + 1


t = session(random_branch, 100, 1)
print("random branch, 100 runs:", t.curve[9], t.curve[24], t.curve[49], t.curve[99], "branches")
```

```{.text .output}
random branch, 100 runs: 10 12 17 18 branches
```

It is slow at first, because most conditions on a path are the payload's six, but it does not get
stuck.

## CFG-directed search

CREST's new strategy uses the program's **control-flow graph**. CREST builds it from the C source
with CIL: which branch can come next after each branch, with calls followed into the callee. For a
branch `b`, `dist[b]` is the number of branches on the shortest static path from `b` to a branch not
yet covered. One breadth-first search on the reversed graph, from all uncovered branches at once,
gives every distance:

```python
# Branch-level control-flow graph: the branches that can come next after each branch.
# Branch 2s is condition s taken, 2s + 1 not taken; a branch with no entry goes to the payload loop.
SUCC = {2: [4, 5], 3: [14, 15], 4: [6, 7], 5: [12, 13], 6: [8, 9], 8: [10, 11],
        14: [16, 17], 16: [18, 19], 18: [20, 21]}
INF = 10 ** 6


def succ(b):
    return SUCC.get(b, [0, 1])


def distances(covered):
    """Steps from each branch to the nearest uncovered one: BFS on the reversed graph."""
    back = {b: [] for b in range(22)}
    for a in range(22):
        for b in succ(a):
            back[b].append(a)
    dist = [INF] * 22
    queue = [b for b in range(22) if b not in covered]
    for b in queue:
        dist[b] = 0
    for b in queue:                       # the list grows while we walk it
        for a in back[b]:
            if dist[a] == INF:
                dist[a] = dist[b] + 1
                queue.append(a)
    return dist


edges = {(p[i], p[i + 1]) for p in paths for i in range(len(p) - 1)}
print("every step of the 640 paths is an edge:", all(b in succ(a) for a, b in edges))
print("program starts at branch 2 or 3; covered by one run of all zeros:", sorted({b for b, *_ in run([0] * 12)}))
print("distances:", distances({b for b, *_ in run([0] * 12)}))
```

```{.text .output}
every step of the 640 paths is an edge: True
program starts at branch 2 or 3; covered by one run of all zeros: [0, 2, 5, 13]
distances: [1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]
```

The check matters: the graph must allow every step a real run takes, or the distances lie. After one
run of all zeros, the run took branch 5 (`not x0 == 3`). Its other side, branch 4, is uncovered
(distance 0), so it is a first flip CFG-directed search can try. Branch 5 itself is 1 step from the
uncovered branch 12 (`x1 > x2`).

**CfgDirectedSearch** negates the condition whose other side is closest to uncovered code. It adds
to the distance `tries`, how often that side was already forced without finding anything new, so a
close but hopeless target sinks in the ranking. A run with new coverage becomes the current run; a
run of failed attempts triggers a restart. (Two simplifications: the paper also follows the
static path after a successful flip, "SearchAlongPath", where ours just ranks again; and CREST's
code forgets its coverage on every restart, so its distances point to branches not covered in the
current epoch, where ours use the whole session's coverage.)

```python
def cfg_directed(t, patience=10):
    """CREST's CfgDirectedSearch, simplified: negate the condition whose other side is
    closest to uncovered code, plus how often that side was tried already."""
    while True:
        ex, stale, tries = t.restart(), 0, [0] * 22
        while stale < patience:
            dist = distances(t.covered)
            order = list(range(len(ex[1])))
            for i in range(len(order) - 1, 0, -1):          # random order among ties
                j = t.rng.below(i + 1)
                order[i], order[j] = order[j], order[i]
            order = [k for k in order if dist[ex[1][k][0] ^ 1] < INF]
            order.sort(key=lambda k: dist[ex[1][k][0] ^ 1] + tries[ex[1][k][0] ^ 1])
            for k in order:
                other = ex[1][k][0] ^ 1
                tries[other] += 1
                new = t.negate(ex, k)
                if new is None:
                    continue
                if new[2]:                    # new coverage: continue from this run
                    ex, stale, tries[other] = new, 0, 0
                    break
                stale += 1
            else:
                break                         # every condition tried: restart


t = session(cfg_directed, 100, 1)
print("CFG-directed, 100 runs:", t.curve[9], t.curve[24], t.curve[49], t.curve[99], "branches")
```

```{.text .output}
CFG-directed, 100 runs: 14 21 21 21 branches
```

## The race

Twenty seeds of each strategy, 100 runs each:

```python
STRATEGIES = {"random testing": random_testing, "bounded DFS": bounded_dfs,
              "random branch": random_branch, "CFG-directed": cfg_directed}
print("mean of 20 seeds   N=10     25     50    100   solver calls")
for name, strategy in STRATEGIES.items():
    runs = [session(strategy, 100, seed) for seed in range(1, 21)]
    means = []
    for n in (10, 25, 50, 100):
        total = 0
        for r in runs:
            total += r.curve[n - 1]
        means.append(total / 20)
    solves = 0
    for r in runs:
        solves += r.solves
    print(f"{name:15} " + " ".join(f"{m:6.2f}" for m in means) + f" {solves / 20:9.2f}")
```

```{.text .output}
mean of 20 seeds   N=10     25     50    100   solver calls
random testing    9.85  11.60  12.60  13.65      0.00
bounded DFS      13.55  13.55  13.55  13.70    100.40
random branch     8.00  10.95  14.50  16.90     94.15
CFG-directed     16.15  20.15  20.45  20.55     56.60
```

The final order matches the paper's grep plot: CFG-directed and random branch ahead, random
testing and DFS behind. In the paper random branch search also rose fast from the start; ours starts
slowly because six of every path's conditions are payload checks. CFG-directed search also asks the solver less often than random branch
search, because it skips conditions whose other side leads nowhere new. That second number matters
in the task, where solver time counts against the strategy.

# The task: a strategy for CREST

## What the agent writes

The task keeps CREST: the CIL instrumentation, the concolic library, the solver and the harness. Its
search strategies are removed and replaced by an interface. The agent writes one strategy class in
`src/frontier_solution/`; the starter only restarts on random inputs, like our `random_testing`.
The strategy drives a run through a `Host`:

- `Restart()` runs the program on fresh random inputs (one iteration).
- `Negate(e, k)` keeps the first `k` constraints of execution `e`, negates constraint `k`, solves,
  and runs the program. An infeasible request returns `NULL` and costs no iteration. (The harness
  rejects some requests without a solver attempt: when an earlier constraint of the path is
  identical to constraint `k`.) The new run does not always follow the predicted path; the strategy
  must compare the paths.
- `Release(e)` gives an execution back; at most 64 may be held.

The strategy sees each execution's path of branch ids and which positions are constraints, and the
program's static description: the branch ids, `paired[b]` (the other arm), `function_of[b]` and
`successors[b]`, the branch-level control-flow graph, as in our `SUCC`. It never sees the
constraints, the inputs or the solver. Branch ids are relabelled with a secret permutation in every
run, so nothing can be tuned to one program's ids. The code runs in a sandbox with no files, clock,
network, environment or child processes, and no randomness other than `Host::Random()` and
`Host::Uniform(n)`.

## How it is judged

Each run of the strategy is one session with a budget of 4,000 iterations, on a real C program with
a small symbolic input. The development program is GNU grep 2.2 (3,982 branches in this
instrumentation). The final programs are not in the agent's workspace; the task page names them:
**Vim 5.7** and **sed 3.02**. Two measurements are taken per run: **branches covered**, and
**search overhead**, the CPU time of the strategy plus the solver time its `Negate` requests cost
(running the program itself does not count). Safety caps (wall-clock time, overhead, solver attempts,
requests) end a run early but keep it valid.

The **score**, averaged over the programs, is `100 × max(0, C − B) / (T − B)`, where `C` is the
mean coverage over 30 seeds, `B` the mean coverage of bounded DFS with depth 12, and `T` the
program's number of branches. It uses no reference measurement and ignores overhead. It is far below
100 for any realistic strategy, because much of a program is unreachable from one entry point within
the budget.

**Pass rule.** The judge runs the candidate and the reference, the paper's CFG-directed search, on
the same 30 seeds of each program, interleaved on the same machine. On **every** program the
candidate must have more coverage and less overhead, each by more than three standard errors of the
difference of the two means, `3 × s × √(2/30)`, where `s²` is the mean of the two sample variances:

```python
from math import sqrt


def task_score(c, b, t):
    """The continuous score on one program: 100 * max(0, C - B) / (T - B)."""
    return 100 * max(0, c - b) / (t - b)


def margin(s):
    """Three standard errors of the difference of two 30-seed means."""
    return 3 * s * sqrt(2 / 30)


print(f"grep 2.2: B = 1057, T = 3982; covering 1,500 scores {task_score(1500, 1057, 3982):.1f}")
print(f"margin = {margin(1):.4f} * s")
print(f"GPT-6.1 Terra's run: Vim 5.7 coverage margin +209, so s = {209 / margin(1):.0f} branches per seed")
```

```{.text .output}
grep 2.2: B = 1057, T = 3982; covering 1,500 scores 15.1
margin = 0.7746 * s
GPT-6.1 Terra's run: Vim 5.7 coverage margin +209, so s = 270 branches per seed
```

The margin is about 0.77 standard deviations of one seed. Margins differ from run to run: the 16
runs' Vim coverage margins on the task page range from +102 to +335. Because `s` includes the candidate's own
spread, a noisy strategy needs a bigger win.

# What the agents did

No model passed. Three of sixteen scored above the human reference (13.3). FDI 56.0 puts the task
25th hardest of 48.

| Run | Covered, Vim 5.7 | Covered, sed 3.02 | Overhead, Vim 5.7 (s) | Overhead, sed 3.02 (s) | Score | |
|---|---|---|---|---|---|---|
| Human reference | 7,710 | 659 | 113 | 33.9 | 13.3 | |
| GPT-6.1 Terra | 8,930 | 711 | 78.5 | 31.4 | 16.2 | fail |
| Claude Opus 5.5 | 8,200 | 731 | 104 | 32 | 15.5 | fail |
| GPT-6.1 Sol | 8,290 | 699 | 103 | 39.8 | 15.0 | fail |
| GPT-6 Astra | 7,660 | 659 | 109 | 35.5 | 13.2 | fail |
| Gemini 4 Argon · Antigravity | 7,240 | 687 | 87.5 | 32 | 13.1 | fail |

Means over 30 seeds per program, as of October 26, 2026. The reference is measured again in every
run; its row shows the median.

Each run faces four rules: coverage and overhead, on two programs. The hover text gives the
reference in that run and the margin needed. The two best runs each missed one rule:

```python
RUNS = {   # program: (run's mean, reference in this run, margin needed); from the task page
    "GPT-6.1 Terra": {"Vim coverage": (8930, 7700, 209), "sed coverage": (711, 659, 19.6),
                      "Vim overhead": (78.5, 95.9, 17), "sed overhead": (31.4, 29.8, 0.572)},
    "Claude Opus 5.5": {"Vim coverage": (8200, 7710, 183), "sed coverage": (731, 659, 17.5),
                        "Vim overhead": (104, 116, 26.3), "sed overhead": (32, 36, 0.569)},
}
for name, rules in RUNS.items():
    print(name)
    for rule, (c, r, m) in rules.items():
        gain = c - r if "coverage" in rule else r - c
        print(f"  {rule:13} gain {gain:7.1f}, needed {m:6}: {'cleared' if gain > m else 'not cleared'}")
```

```{.text .output}
GPT-6.1 Terra
  Vim coverage  gain  1230.0, needed    209: cleared
  sed coverage  gain    52.0, needed   19.6: cleared
  Vim overhead  gain    17.4, needed     17: cleared
  sed overhead  gain    -1.6, needed  0.572: not cleared
Claude Opus 5.5
  Vim coverage  gain   490.0, needed    183: cleared
  sed coverage  gain    72.0, needed   17.5: cleared
  Vim overhead  gain    12.0, needed   26.3: not cleared
  sed overhead  gain     4.0, needed  0.569: cleared
```

GPT-6.1 Terra covered 1,230 more Vim branches than the reference, and its Vim overhead cleared by
about 0.4 s, but on sed it spent about 1.6 s more than the reference (both from the page's rounded
figures; the judge compares whole milliseconds). Claude Opus 5.5 lost the other way: faster
than the reference on Vim, but not by the 26.3 s needed. Five runs cleared three of the four rules
(also GPT-6.1 Sol, DeepSeek V4.1 Flash 1017 and Step 5 Preview); none cleared all four.

## The best runs' ideas

The task page shows **Claude Opus 5.5**'s patch, a CFG-directed "chain search" of 385 added lines.
From its comments:

1. *Epochs.* Each epoch starts from a fresh random input and forgets which branches the epoch has
   covered. It follows a chain: from the current run, try constraints in order of the CFG distance
   of their other arm to code not covered in this epoch, and move to the first run that covers
   something new for the epoch. An epoch ends when the chain stops finding new code.
2. *Along the graph.* After a negation that only gets closer, keep negating along the path toward
   the uncovered code, as the paper's SearchAlongPath does.
3. *Never ask twice.* Hash every path prefix. A negation whose negated prefix was already requested,
   or already seen on an executed path, is never sent again.
4. *Statistics per target.* Skip targets that were never feasible, rank lower the targets whose runs
   seldom found new code, and drop targets that got the program killed.
5. *Uncovered first.* Targets not yet covered anywhere in the session get a bonus.

Ideas 3 and 4 cut search overhead directly: a request that is never sent costs no solver time. Here
they are, added to our CFG-directed search:

```python
def cfg_memo(t, patience=10):
    """cfg_directed, plus two ideas from the best runs: never ask for the same
    negated prefix twice, and skip a target that was never feasible in 3 tries."""
    asked, infeasible, feasible = set(), [0] * 22, [0] * 22
    while True:
        ex, stale, tries = t.restart(), 0, [0] * 22
        while stale < patience:
            dist = distances(t.covered)
            order = list(range(len(ex[1])))
            for i in range(len(order) - 1, 0, -1):
                j = t.rng.below(i + 1)
                order[i], order[j] = order[j], order[i]
            order = [k for k in order if dist[ex[1][k][0] ^ 1] < INF]
            order.sort(key=lambda k: dist[ex[1][k][0] ^ 1] + tries[ex[1][k][0] ^ 1])
            for k in order:
                other = ex[1][k][0] ^ 1
                prefix = tuple(b for b, *_ in ex[1][:k]) + (other,)
                if prefix in asked or (infeasible[other] >= 3 and not feasible[other]):
                    continue
                asked.add(prefix)
                tries[other] += 1
                new = t.negate(ex, k)
                if new is None:
                    infeasible[other] += 1
                    continue
                feasible[other] += 1
                if new[2]:
                    ex, stale, tries[other] = new, 0, 0
                    break
                stale += 1
            else:
                break


for name, strategy in (("CFG-directed", cfg_directed), ("with the two ideas", cfg_memo)):
    runs = [session(strategy, 100, seed) for seed in range(1, 21)]
    cov = solves = 0
    for r in runs:
        cov += r.curve[-1]
        solves += r.solves
    print(f"{name:18} mean coverage {cov / 20:5.2f}, solver calls {solves / 20:6.2f}")
```

```{.text .output}
CFG-directed       mean coverage 20.55, solver calls  56.60
with the two ideas mean coverage 20.70, solver calls  11.50
```

Slightly more coverage (20.70 against 20.55) for a fifth of the solver calls. In our toy a repeated request is cheap; on Vim,
where each solver call is real CPU time, the savings decide the overhead rule.

::: pitfall
**Both measurements, every program.** Thirteen of sixteen runs cleared the Vim overhead rule, but
only three cleared Vim coverage, and the three that did each lost an overhead rule. Muse Spark 1.3
had the lowest overhead on both programs (24.4 s and 7.26 s) and covered 5,670 Vim branches, far below the
reference. A strategy that spends less time searching usually finds less.
:::

# Summary and self-check

::: pattern
**Three lessons from the Software Engineering task.**

1. *Paths explode; branches do not.* A loop multiplies the paths without adding branches. A good
   strategy hunts for new branches and ignores most paths.
2. *Static structure guides the search.* The control-flow graph tells which flip could lead
   somewhere new, so the search wastes fewer runs and fewer solver calls.
3. *Two measurements pull apart.* More coverage usually costs more search. No run won both on both
   programs; the two best each lost one overhead rule.
:::

## Exercises

1. Change the walk to always flip the *last* condition of the path (a payload check). How many
   runs does it take to reach `x3 > 13`, and why?
2. Move the payload loop to the start of `program` (and update `SUCC`). How does bounded DFS do now,
   and why?
3. Change `x4 > 7` to `x4 > 6`. Which strategies find branch 20, and after how many runs?
4. In `random_branch`, negate only conditions whose other side is uncovered. Compare with
   CFG-directed search.
5. A candidate covers 8,000 Vim branches with a per-seed spread of 300; the reference covers 7,700
   with a spread of 240. Does it clear the coverage rule?

## Solutions

Exercise 1: it never gets there. The last condition is always `x11 == 0`, so each flip changes only
`x11`, and the header never changes.

Exercises 2, 3 and 5: the two changed programs, run under the same seeds as the race, and the margin
of Exercise 5:

```python
def mean_at(strategy, n):
    total = 0
    for seed in range(1, 21):
        total += session(strategy, 100, seed).curve[n - 1]
    return total / 20


def program_loop_first(x, t):
    """Exercise 2: the same parser, with the payload loop first."""
    for i in range(6, 12):
        t.cond(0, (i,), lambda v, i=i: v[i] == 0, f"x{i} == 0")
    program_header(x, t)


def program_header(x, t, limit=7):
    if t.cond(1, (0,), lambda v: v[0] < 8, "x0 < 8"):
        if t.cond(2, (0,), lambda v: v[0] == 3, "x0 == 3"):
            if t.cond(3, (1,), lambda v: v[1] == 7, "x1 == 7"):
                if t.cond(4, (1, 2), lambda v: v[2] == v[1] + 4, "x2 == x1 + 4"):
                    t.cond(5, (3,), lambda v: v[3] > 13, "x3 > 13")
        else:
            t.cond(6, (1, 2), lambda v: v[1] > v[2], "x1 > x2")
    elif t.cond(7, (0,), lambda v: v[0] == 12, "x0 == 12"):
        if t.cond(8, (3, 4), lambda v: v[3] == 2 * v[4], "x3 == 2*x4"):
            if t.cond(9, (5,), lambda v: v[5] == 15, "x5 == 15"):
                t.cond(10, (4,), lambda v: v[4] > limit, f"x4 > {limit}")


def program_six(x, t):
    """Exercise 3: x4 > 6 instead of x4 > 7."""
    program_header(x, t, limit=6)
    for i in range(6, 12):
        t.cond(0, (i,), lambda v, i=i: v[i] == 0, f"x{i} == 0")


def succ_loop_first(b):
    return [0, 1, 2, 3] if b < 2 else SUCC.get(b, [])


original, original_succ = program, succ
before = mean_at(bounded_dfs, 25)
program, succ = program_loop_first, succ_loop_first
dfs25, cfg100 = mean_at(bounded_dfs, 25), mean_at(cfg_directed, 100)
print(f"Exercise 2: DFS after 25 runs {before:.2f} -> {dfs25:.2f}; CFG-directed after 100 runs {cfg100:.2f}")
program, succ = program_six, original_succ
for name, strategy in STRATEGIES.items():
    first = []
    for seed in range(1, 21):
        paths = session(strategy, 100, seed).paths
        hit = [i + 1 for i, p in enumerate(paths) if 20 in p]
        if hit:
            first.append(hit[0])
    mean = f", mean first run {sum(first) / len(first):.1f}" if first else ""
    print(f"Exercise 3, {name}: branch 20 found in {len(first)} of 20 sessions{mean}")
program = original
s5 = sqrt((300 ** 2 + 240 ** 2) / 2)
print(f"Exercise 5: s = {s5:.1f}, margin = {margin(s5):.1f}, gain 300")
```

```{.text .output}
Exercise 2: DFS after 25 runs 13.55 -> 21.00; CFG-directed after 100 runs 20.20
Exercise 3, random testing: branch 20 found in 0 of 20 sessions
Exercise 3, bounded DFS: branch 20 found in 8 of 20 sessions, mean first run 21.8
Exercise 3, random branch: branch 20 found in 5 of 20 sessions, mean first run 55.4
Exercise 3, CFG-directed: branch 20 found in 16 of 20 sessions, mean first run 14.1
Exercise 5: s = 271.7, margin = 210.4, gain 300
```

With the loop first, DFS backtracks to the deepest forks first, and those are now the header's, so
it covers every reachable branch. Where the path explosion sits decides how DFS does. With
`x4 > 6`, the input `x3 = 14, x4 = 7` reaches branch 20. In Exercise 5 the gain of 300 clears the margin of 210.4.
