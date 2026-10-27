# Publishing the FrontierCS 2 course

**Goal:** all 14 lectures live at <https://boxi-cs.github.io/frontiercs2/>, each with checked
notes and an interactive page. The repo `boxi-cs/frontiercs2` is public and holds only the built
site (no notes source, no voice files). No company branding: the publish script refuses a build
that contains a word from the maintainer's local `tools/.brand-words`.

## A lecture is ready to publish when

1. `python3 frontiercs2/tools/check.py LNN` passes, and `tools/site_code.py LNN` has been run after
   the last change to the notes.
2. The JS demos print the same numbers as the notes' Python.
3. `site/LNN/` loads every chapter and works every demo with no console errors, on a 1200 px and a
   375 px wide page (no horizontal scroll).
4. Every result on the page says its date, and comes from public material only (task statements,
   papers, frontier-cs.org). Nothing from a task's reference patch or hidden workloads.

Then add `LNN` to `site/PUBLISHED` and run:

```bash
python3 frontiercs2/tools/publish.py --approve LNN
```

`--approve` snapshots `site/LNN` into `build/approved/LNN` (after the checks), and every publish
uses the snapshots, so a lecture being edited stays at its approved version online. The home page
and `assets/` always come from `site/`. The build is force-pushed as one commit; GitHub Pages
serves `main` from the root. To check a build first, add `--dry-run`.

## First-time setup (done once)

```bash
gh repo create boxi-cs/frontiercs2 --public --description "FrontierCS 2 course: interactive lectures"
python3 frontiercs2/tools/publish.py --approve L00 L04
gh api -X POST repos/boxi-cs/frontiercs2/pages -f "source[branch]=main" -f "source[path]=/"
gh repo edit boxi-cs/frontiercs2 --homepage https://boxi-cs.github.io/frontiercs2/
```
