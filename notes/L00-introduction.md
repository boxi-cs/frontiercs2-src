---
title: "Lecture 00: Introduction"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 measures whether AI agents can do computer-science research. This lecture explains how
a task is built, what the agent sees, what counts as a pass, how the leaderboard's numbers are
computed, and what a run costs. The later lectures take the 48 tasks one field at a time.

The Python programs are ours. They are small models of how the benchmark works, and they run
offline with the standard library. Every program in these notes has been run, and every output shown
is the real output.

::: instructor
**Sources.** The overview, leaderboard and questions on <https://frontier-cs.org/> (as of October
26, 2026), the task pages, and the case study on SVG-EAR (October 19, 2026).

**What is ours.** The toy runs, the margin numbers in the pass-rule example and the small fit in
chapter 4 are illustrations. The real FCI fit uses every metric of every run and a bootstrap; we
only show its core idea.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Describe how a FrontierCS 2 task is built from a paper and its released code.
2. List what the agent sees during a run, and what stays with the judge.
3. Apply the pass rule, including margins, and explain why a high score can fail.
4. Read the leaderboard: pass rate, mean score against the human reference, FCI and FDI.
5. Explain how a test-time scaling curve is computed from runs and a cost budget.

# What FrontierCS 2 measures

Most coding benchmarks ask an agent to fix a bug or pass a test that already has an answer.
FrontierCS 2 asks for research: each task takes a paper and the code its authors released, removes
the paper's key contribution, and asks an agent to write it back. To pass, the agent's version must
beat the authors' own code on every metric of the task's hidden workloads.

The tasks come from 13 fields:

```python
FIELDS = {
    "MLSys": 6, "HPC": 4, "Architecture": 3, "Network": 3, "Theory": 1,
    "Bioinformatics": 1, "Machine Learning": 9, "Database": 9,
    "Programming Languages": 4, "Software Engineering": 1,
    "Cryptography": 3, "Security": 2, "Robotics": 2,
}
MODELS = 16
tasks = sum(FIELDS.values())
print(tasks, "tasks in", len(FIELDS), "fields;", MODELS * tasks, "runs, one per model and task")
```

```{.text .output}
48 tasks in 13 fields; 768 runs, one per model and task
```

Each model runs in its own agent harness: Claude Opus 5.5 in Claude Code, GPT-6 models in Codex
CLI, Gemini 4 Argon in Antigravity and in Pi, and so on. So a leaderboard row is a model *and* its
harness. A private set of more than 100 further tasks is kept back, to be announced later.

# How a task is built

A task starts from a paper's own repository. The builders delete the paper's contribution: the
queue logic in BBQ, the search in MetaOpt, the scheduling decision in Shockwave. The rest of the code
stays, so the agent works inside a real research codebase. The authors' code is the **human
reference**.

During a run, which has a wall-clock budget of five hours, the agent sees:

- its repository and the task statement;
- for each patch it submits as a **train call**, a score on the **development workloads** and one
  message.

The evaluator, the **hidden workloads** and the reference stay with the judge. The hidden evaluation
adds workloads the agent never sees. At the end, the agent picks one of its versions as its **final
submission**, and only that version is scored on the hidden workloads.

## Picking the final version

Choosing which version to submit is part of the work. Here is a toy run with five submissions. The
development score is what the agent saw; the hidden score is what the judge measures later.

```python
RUN = [  # (minute, development score, hidden score)
    (35, 31.0, 30.2),
    (80, 38.5, 37.9),
    (140, 41.0, 40.1),
    (210, 44.2, 36.0),  # tuned to the development workloads
    (275, 42.8, 41.6),
]
REFERENCE_HIDDEN = 40.0

best_dev = max(RUN, key=lambda s: s[1])
last = RUN[-1]
for name, (minute, dev, hidden) in [("best on development", best_dev), ("last", last)]:
    print(f"{name:19} minute {minute}: dev {dev}, hidden {hidden}, above reference: {hidden > REFERENCE_HIDDEN}")
```

```{.text .output}
best on development minute 210: dev 44.2, hidden 36.0, above reference: False
last                minute 275: dev 42.8, hidden 41.6, above reference: True
```

The version with the best development score was fitted to the development workloads and does worse
on the hidden ones. The benchmark reports what the agent chose, as it is: an agent may end on a
version that fails although an earlier one would have passed. In the toy, the hidden score stands in
for the whole pass check.

# What counts as a pass

A run **passes** only when its final submission beats the human reference on every metric the task
checks and on every hidden workload. The criteria are set from the reference's own measurements,
and some ask for a margin. For SVG-EAR, a video model's sparse attention, the latency must be at most
0.96 of the reference's, and three image-quality measures (PSNR, SSIM, LPIPS) must stay within fixed
bands.

```python
def check(candidate, reference):
    """One workload of a SVG-EAR-style rule. The 0.5 dB band is our example, not the task's."""
    return {
        "latency": candidate["latency"] <= 0.96 * reference["latency"],
        "psnr": candidate["psnr"] >= reference["psnr"] - 0.5,
    }


ref = {"latency": 100.0, "psnr": 30.0}
for cand in [{"latency": 97.0, "psnr": 30.4}, {"latency": 90.0, "psnr": 29.2}, {"latency": 95.0, "psnr": 29.8}]:
    result = check(cand, ref)
    print(cand, result, "PASS" if all(result.values()) else "fail")
```

```{.text .output}
{'latency': 97.0, 'psnr': 30.4} {'latency': False, 'psnr': True} fail
{'latency': 90.0, 'psnr': 29.2} {'latency': True, 'psnr': False} fail
{'latency': 95.0, 'psnr': 29.8} {'latency': True, 'psnr': True} PASS
```

The first candidate is 3% faster, but the rule asks for 4%. The second is 10% faster but loses too
much quality. Only the third passes. A task counts every such check on every hidden workload: on
SVG-EAR there are 48, and the closest run, GPT-6 Astra's, passed 43. No model passed SVG-EAR.

::: pitfall
**A score above the reference can still fail.** The final score averages over every metric and
every workload, so a large gain in one place can hide a loss in another. On KV Compaction, Claude
Opus 5.5 has the top score and sits above the human reference, but its answers fall short of the
reference's accuracy on 2 of the 24 articles, so the run fails. The benchmark wants a result the
paper's authors would accept as better, not a gain on one metric bought with another.
:::

# Reading the leaderboard

## Pass rate

The leaderboard's main number is **pass rate**: the share of a model's runs that pass. With one run
per task, it is the number of tasks passed out of 48.

```python
PASSED = {"Claude Opus 5.5": 28, "Gemini 4 Argon · Antigravity": 26, "GPT-6 Astra": 21,
          "GPT-6.1 Terra": 19, "Kimi K3.1 Pro": 12, "Step 5 Preview": 4}
for model, n in PASSED.items():
    print(f"{model:29} {n:2} of 48 = {100 * n / 48:.0f}%")
```

```{.text .output}
Claude Opus 5.5               28 of 48 = 58%
Gemini 4 Argon · Antigravity  26 of 48 = 54%
GPT-6 Astra                   21 of 48 = 44%
GPT-6.1 Terra                 19 of 48 = 40%
Kimi K3.1 Pro                 12 of 48 = 25%
Step 5 Preview                 4 of 48 = 8%
```

## Score against the human reference

Each task's evaluator also scores the final submission on the hidden suite, from 0 to 100. A run
that ends without a final submission scores 0. The **mean score** chart averages each run's score
minus the human reference's score on the same task, so 0 means level with the reference. Claude
Opus 5.5 leads at +9.2; Step 5 Preview is at −10.8.

## FCI and FDI

Pass rate treats every task the same, but some tasks are much harder than others. The **FrontierCS
Capabilities Index** (FCI) applies the idea of Epoch AI's ECI: one fit gives every model an ability
and every task a difficulty, the **FDI**. A model beats a task's checks more often the more its
ability exceeds the task's difficulty.

The fit below is the core of that idea on a toy table: three models, five tasks, 1 for a pass and 0
for a miss. The chance that model `m` passes task `t` is `sigmoid(ability[m] - difficulty[t])`, and
gradient ascent finds the values that make the table most likely. A small `shrink` term keeps the values finite: without it, a task nobody passed would drift to infinite difficulty. Like the real FCI, one model is
the zero point.

```python
from math import exp

TABLE = {  # model -> pass (1) or miss (0) on tasks T1..T5
    "Model A": [1, 1, 1, 0, 1],
    "Model B": [1, 1, 0, 0, 0],
    "Model Z": [1, 0, 0, 0, 0],
}


def sigmoid(x):
    return 1 / (1 + exp(-x))


def fit(table, zero="Model Z", steps=2000, rate=0.1, shrink=0.1):
    models, n = list(table), len(next(iter(table.values())))
    ability = {m: 0.0 for m in models}
    difficulty = [0.0] * n
    for _ in range(steps):
        grad_a = {m: -shrink * ability[m] for m in models}
        grad_d = [-shrink * d for d in difficulty]
        for m in models:
            for t in range(n):
                miss = table[m][t] - sigmoid(ability[m] - difficulty[t])
                grad_a[m] += miss
                grad_d[t] -= miss
        for m in models:
            ability[m] += rate * grad_a[m]
        difficulty = [d + rate * g for d, g in zip(difficulty, grad_d)]
    shift = ability[zero]  # put the zero model at 0
    return {m: a - shift for m, a in ability.items()}, [d - shift for d in difficulty]


ability, difficulty = fit(TABLE)
print("ability   ", {m: round(a, 1) for m, a in ability.items()})
print("difficulty", [round(d, 1) for d in difficulty])
```

```{.text .output}
ability    {'Model A': 4.0, 'Model B': 1.4, 'Model Z': 0.0}
difficulty [-1.2, 0.9, 2.7, 5.0, 2.7]
```

T4, which nobody passed, comes out hardest; T1, which everybody passed, easiest. T3 and T5 were each
passed only by Model A, so they get the same difficulty. The real FCI is fitted on every metric of
all 768 runs, counts how far each final score is above or below the reference, and reports 90%
intervals from a bootstrap over tasks. Its zero point is Kimi K2.7, which takes part in the fit but
is not on the leaderboard. On the real scale, Claude Opus 5.5 has an FCI of 54.0, and KV Compaction is
the hardest task, with an FDI of 103.0.

# Test-time scaling and cost

Runs differ in cost: an agent that tries more ideas spends more on its model's API. A **test-time
scaling** curve asks: what would a model score if every run were stopped at a cost budget? A run
that ended within the budget counts what it achieved; a run still going at the budget counts as one
that ended there without a final submission, so it beats nothing. A curve can therefore never fall
as the budget grows.

```python
RUNS = [(0.8, True), (2.5, False), (4.0, True), (7.3, True), (12.0, False), (25.9, True)]  # (US$, passed)


def pass_rate_at(budget):
    return sum(passed and cost <= budget for cost, passed in RUNS) / len(RUNS)


for budget in [1, 5, 10, 30]:
    print(f"budget ${budget:>2}: pass rate {pass_rate_at(budget):.0%}")
```

```{.text .output}
budget $ 1: pass rate 17%
budget $ 5: pass rate 33%
budget $10: pass rate 50%
budget $30: pass rate 67%
```

The real curves plot FCI rather than pass rate, with each task's difficulty kept from the leaderboard
fit, so a curve ends at the model's leaderboard value once the budget covers all its runs.

A full evaluation is expensive. For Claude Opus 5.5, one pass over the 48 tasks costs about
US$1,000 in API fees, US$300 in GPU time and US$100 in CPU time. The tasks, their evaluators and the
judge are public as one evaluation environment (github.com/FrontierCS/FrontierCS-2), which installs
into your own AWS account; GPU tasks also need Modal.

# How to use this course

Each later lecture covers one field. For every task in it, you will see:

1. **The idea**: what the paper found, on a small example you can run.
2. **What the agent writes**: the part the task removed.
3. **How it is judged**: the metrics, the workloads and the pass rule.
4. **What the agents did**: the results, and the ideas behind the best runs.

Lecture 4 (Network) is a good place to start: BBQ, MetaOpt and Shockwave each show a different way a
run can pass or fail.

## Exercises

1. In the toy run, which version should an agent pick if it can see only the development scores?
   What would make it trust the last version more than the best one?
2. Change the margin in `check` from 0.96 to 0.98. Which candidates pass now?
3. Add a fourth model to `TABLE` that passes every task except T4, and fit again. Where does it land,
   and how do the difficulties change?
4. A run passes and costs US$40. At which budgets does it count in the scaling curve?
