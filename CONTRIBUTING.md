# Contributing to the FrontierCS 2 course

Thanks for helping. The course is a static website: one interactive lecture per field of the
[FrontierCS 2](https://frontier-cs.org/) benchmark, live at <https://boxi-cs.github.io/frontiercs2/>.
This repo (`boxi-cs/frontiercs2-src`) holds the source. The live site is built from it and
published by the maintainer (Boxi Yu); contributors never publish.

## Setup

You need **Python 3.10+** and **Node.js** (only for `node --check`). Nothing to install: the notes
use the standard library only, and there is no build step for the site.

```bash
git clone https://github.com/boxi-cs/frontiercs2-src.git
cd frontiercs2-src
git clone https://github.com/FrontierCS/FrontierCS-2.git ../FrontierCS-2   # the task statements
```

Preview the site at <http://localhost:8402>:

```bash
python3 -m http.server 8402 --directory site
```

Check a lecture's notes (every Python block runs, and its output must match what the notes show):

```bash
python3 tools/check.py L06
```

After you change the notes, copy their code into the page:

```bash
python3 tools/site_code.py L06
```

Optional: `ruff check .` for the Python.

## How to contribute a lecture

1. **Claim one.** Ask Boxi which lecture is free and open an issue "L06 Bioinformatics: <your name>".
   Lectures already published or in progress are listed in `README.md` (Status).
2. **Read `LECTURE_BRIEF.md`**: what a lecture covers, which sources you may use, which files you
   create, and the checks. Then read a finished sample end to end: `notes/L04-network.md` with
   `site/L04/`, and `notes/L11-cryptography.md` with `site/L11/`.
3. **Branch** `lecture/L06-bioinformatics` and work only in your lecture's files:
   `notes/L06-*.md` and `site/L06/`. In the brief, paths start with `frontiercs2/`; in this repo,
   drop that prefix. Task statements are in your FrontierCS-2 clone under
   `tasks/frontier-cs-2.0-demo/problems/`.
4. **Open a pull request** when all six checks in the brief pass. In the description, list your
   chapters and demos, the check results, and every fact you were unsure of with its source.
   Small commits are fine; the maintainer reviews, merges and publishes.

Fixes to a published lecture are welcome too: a wrong number, a broken demo, a typo. Open a PR
that touches only that lecture.

## Rules that matter

- **Public material only**: the task statements under `agent-base/`, the papers, and
  frontier-cs.org. Never use a task's `judge/`, `verifier/` or `datasets/` folder, and nothing about
  the private set. Teaching from the judge spoils the tasks.
- **Never type an output by hand.** Run the block and paste what it printed; `check.py` will catch it.
- **Copy result numbers exactly** from the task pages, and say the date they are from.
- **Don't edit shared files** (`site/assets/`, `site/index.html`, `site/PUBLISHED`, `tools/`) in a
  lecture PR. If one needs a change, say so in the PR.
- **No branding.** No logos, no images copied from papers or the site.
- Plain English in short sentences, like the FrontierCS case studies.

## What stays with the maintainer

Publishing (`tools/publish.py`, which needs push access to `boxi-cs/frontiercs2`), the voice-over
(`voice/`, which needs the maintainer's ElevenLabs key), and videos.

## Credit

Each lecture you write gets a line in its notes' instructor box and on its page:
"Written by <your name>". Tell Boxi how you want to be named.
