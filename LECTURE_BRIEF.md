# Brief: one FrontierCS 2 lecture

You are writing one lecture of the FrontierCS 2 course: a public, English site at
<https://boxi-cs.github.io/frontiercs2/>, one lecture per field of the FrontierCS 2 benchmark
(<https://frontier-cs.org/>). Read `frontiercs2/README.md` first. **Copy the samples:**
`notes/L04-network.md` + `site/L04/` (three tasks) and `notes/L11-cryptography.md` + `site/L11/`.
Match their structure, tone and level of checking.

Paths below start with `frontiercs2/` (the course folder in the maintainer's copy). In the
`boxi-cs/frontiercs2-src` repo, drop that prefix; see `CONTRIBUTING.md`. Python: plain `python3` (standard library only in the notes).

## What one lecture is

For **every task in the field**, the notes and page explain, in this order:

1. **The idea**: what the paper found, built up from a small example that runs (our own Python model).
2. **What the agent writes**: the part the task removed.
3. **How it is judged**: the metrics, the workloads and the pass rule (with any margins).
4. **What the agents did**: pass count, best final score vs the human reference, and the ideas behind
   the best runs, from the task page's "Solution" section and any case study.

Then a short summary (two or three lessons that cut across the field's tasks), exercises, and a
5-question quiz. Chapters: one "rules + the field's tasks at a glance" chapter is not needed (L00
covers the rules); start straight with the first task. Usually one or two chapters per task, plus a
final "Review" chapter. A field with many tasks (9) may give some tasks a single section each; keep
the page under about 90 minutes of reading.

## Sources: public only

- The task statement the agent reads: `<FrontierCS-2>/tasks/frontier-cs-2.0-demo/problems/<Field folder>/<task_id>/agent-base/frontier/task/README.md`
  and, for the science, `.../agent-base/frontier/task/repo/README.md`. Metadata (paper, venue, link):
  `.../tasks/metadata/<task_id>.yaml`. `<FrontierCS-2>/TASKS.md` lists all. `<FrontierCS-2>` is a clone of github.com/FrontierCS/FrontierCS-2
  (cloned next to this repo, or wherever you keep it).
- The task pages: `https://frontier-cs.org/task/#<slug>` (open the home page's task list and follow
  the links; read "The idea", "What the agent writes", "How it is judged", "Results", the results
  table and "Solution"). Use the built-in browser and `get_page_text`.
- Case studies: `https://frontier-cs.org/blog/` (SVG-EAR, BBQ, QuarterPIR so far).
- The papers themselves, for the idea.
- **Never** read or use a task's `judge/` folder (reference patch, hidden workloads, evaluator), the
  `verifier/` folder, `datasets/`, or anything about the private set. Teaching from the judge would
  spoil the tasks.
- Results come from the 16-model leaderboard. Write "as of <the site's "Last updated" date>" in the
  notes' instructor box and the first results table. Copy numbers exactly; don't round differently.

## Files you create (and nothing else)

```
frontiercs2/notes/LNN-<field>.md        notes (pandoc Markdown, same block rules as the samples)
frontiercs2/site/LNN/index.html         copy site/L04/index.html; change title, description, brand-mark
frontiercs2/site/LNN/chapters.js        LECTURE, CHAPTERS, QUIZ (copy the helpers at the top of L04's)
frontiercs2/site/LNN/demos.js           DEMOS; JS twins of the notes' Python models
frontiercs2/site/LNN/code-keys.json     key -> text unique to one Python block, for tools/site_code.py
frontiercs2/site/LNN/code.js            generated: python3 frontiercs2/tools/site_code.py LNN
frontiercs2/site/LNN/lecture.css        this lecture's demo styles only
```

**Do not edit** anything in `site/assets/`, `site/index.html`, `site/PUBLISHED`, `tools/`, other
lectures' folders, `CLAUDE.md`, `.claude/launch.json`, or the README. Other sessions are working in
the same folder at the same time. **Do not commit, push or publish.** If a shared file needs a
change, say so in your report instead.

Use the existing CSS variables (`--teal` is the primary blue, `--amber`, `--green`, `--red`, `--line`,
`--paper-2`, …) and classes (`.card`, `.demo`, `.stats`/`.stat`, `.controls`, `.cbtn`, `.msg`,
`.callout`, `.chip.pass`/`.chip.fail`). No new fonts, no images from papers or the site, no logos.
No company branding anywhere.

## Checks before you report

1. `python3 frontiercs2/tools/check.py LNN` passes. Never type an output by hand: run the block and
   paste what it printed.
2. `python3 frontiercs2/tools/site_code.py LNN` has been run after the last notes change.
3. Every JS twin prints the same numbers as its Python (run it under `node`, as the L04 session
   did, and compare).
4. `node --check` passes on every JS file; `ruff check frontiercs2` passes.
5. In the browser (the `frontiercs2-site` launch config, port 8402; reload with a cache-buster
   after edits): every chapter loads, every demo works to the end, no console errors other than
   the home page's 404 checks, at 1200 px and at 375 px with no horizontal scroll.
6. Every number about a model's result matches the task page.
7. Privacy: `grep -nIi -f frontiercs2/tools/.private-words frontiercs2/notes/LNN-* frontiercs2/site/LNN/*`
   prints nothing (the word list exists only in the maintainer's copy; skip this check elsewhere).
   Don't name other courses, local paths or people's emails anywhere.

## Tips from the first lectures

- Use the preview server that is already running on port 8402 (the `frontiercs2-site` launch
  config); don't start another one. Reload with a cache-buster (`?r=2`) after edits.
- Python 3.12+ `sum()` of floats uses compensated summation, so a plain JS loop can differ in the
  last digits. Sum with an explicit loop in the Python too, or copy CPython's algorithm in JS.
- Round half-way values (like 43.25) can round differently in Python and JS: print one more decimal.
- Long inline code names overflow at 375 px: break them or wrap the paragraph.
- When the site's results table and the "Solution" section name a model differently ("Opus 5.5"
  vs "Claude Opus 5.5"), use the full name.
- A field with many tasks (nine): one section per task is enough for the smaller ones; give the
  tasks with a case study or a striking result a chapter of their own.

## Style

Plain English in short sentences, like the FrontierCS case studies. Name models exactly as the
site does ("Claude Opus 5.5", "Gemini 4 Argon · Antigravity"). Mark our toy numbers as ours. No
hype words. Code: PEP 8, standard library, small enough to read in one screen per block.

## Report

End with: the lecture's chapters and demos; the check results (block count, browser widths); every
place you were unsure of a fact, with the source you used; and anything a shared file needs.
