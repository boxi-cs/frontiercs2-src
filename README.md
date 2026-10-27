# FrontierCS 2 course (`frontiercs2/`)

A public, English course on the FrontierCS 2 benchmark (<https://frontier-cs.org/>): 48 tasks from
13 fields, one lecture per field, plus an introduction. Each lecture covers the field's tasks: the
paper's idea, what the task removed, how a run is judged, and what the agents wrote back, with a
small runnable model of each idea.

Decided with Boxi on 2026-10-27:

- **Structure:** L00 Introduction, then one lecture per field (L01 MLSys … L13 Robotics; the list is
  in `site/index.html`). L04 Network is the sample lecture.
- **Language:** English.
- **Look:** follows frontier-cs.org: white page, Hanken Grotesk and Google Sans Code, one blue
  (#0b57d0), light-blue pills, flat cards. Tokens in `site/assets/style.css`, overrides in
  `site/assets/course.css`. **No company logo or credit.** We don't copy the FrontierCS logo either;
  the brand mark is a plain "FCS" square.
- **Voice:** Boxi's own cloned voice on ElevenLabs (model `eleven_v4`, stability 0.5,
  similarity 0.75), the same as the FrontierCS-2 launch video. `voice/tts.py` is a copy of
  `FrontierCS-2/video/src/tts.py`; the voice id and the key's location are in `voice/.env`, which
  stays on the maintainer's machine. The key is never printed. Log every real call in the
  maintainer's usage log.
- **Hosting:** https://boxi-cs.github.io/frontiercs2/ , repo `boxi-cs/frontiercs2` holding only the
  build, as for the other courses. `tools/publish.py --approve LNN` (rules and first-time setup in
  `site/PUBLISHING.md`; it refuses a build containing any word listed in the local
  `tools/.brand-words`).

## Source repo and contributors

The source is public at `boxi-cs/frontiercs2-src`, so others can contribute by pull request; see
`CONTRIBUTING.md`. The maintainer keeps a private working copy and syncs it with
`tools/sync_src.py` (`push` exports a snapshot commit, `pull` brings merged pull requests back).
Publishing stays with the maintainer: merge, pull, review, then `tools/publish.py --approve LNN`.

## Content rules

- Use only public material: the task statements the agent reads (`agent-base/`), the papers, and the
  task pages and case studies on frontier-cs.org. **Never** use anything from a task's `judge/`
  folder (hidden workloads, reference patch, evaluator) or the private set. The judge is public in
  the FrontierCS-2 repo, but teaching from it would spoil the tasks for anyone who runs them.
- Results change. Every lecture states the date of its numbers ("as of October 26, 2026").
- Notes first: `notes/LNN-*.md`, checked with `python3 frontiercs2/tools/check.py LNN`. Then `python3 frontiercs2/tools/site_code.py LNN` copies the code and outputs into
  `site/LNN/code.js`. The JS demos repeat the Python models; check they print the same numbers.
- Write plainly, in short sentences, like the FrontierCS case studies.

## Files

```
notes/L00-introduction.md  how a task is built, the pass rule, FCI, test-time scaling (6 blocks)
notes/L04-network.md     sample lecture notes (12 Python blocks, all checked)
notes/L11-cryptography.md  second sample: Structured LWE, CKKS Noise, QuarterPIR (10 blocks)
LECTURE_BRIEF.md         the brief each lecture session follows (sources, files, checks, report)
tools/check.py           runs the notes' Python and compares outputs (rules in tools/notes_check.py)
tools/site_code.py       notes → site/LNN/code.js
tools/publish.py         approve snapshots, build, push to boxi-cs/frontiercs2 (site/PUBLISHED lists what goes out)
site/index.html          course home: 14 lectures in five groups; a card goes live when LNN/index.html exists
site/LNN/                chapters.js (text), demos.js, lecture.css (this lecture's styles only),
                         code-keys.json (markers for site_code.py), code.js (generated)
voice/tts.py             ElevenLabs, one clip per line, cached
voice/L04-test.lines.json  a 26-second voice test; audio in voice/out/ (not in git)
```

Preview: the `frontiercs2-site` launch config (port 8402); the built site: `frontiercs2-publish-preview` (8403).

## v1.0 (the first mature version) — released 2026-10-27

1. All 14 lectures published.
2. Each lecture reviewed by an independent reviewer that did not write it: every result number
   against its task page, every demo run to the end, the explanations read for clarity. Fixes go
   back to the lecture's author.
3. Course-wide polish: shared styles that several lectures copied move into `site/assets/`;
   previous/next lecture links; time and pass rate on each home-page card; one date, one way of
   naming models and terms; an About page on how the course is made and how fresh its data is.
4. A full site check at 1200 px and 375 px, then the tag `v1.0`.

Videos (animind visuals, Boxi's ElevenLabs voice) come after v1.0, starting with an L04 pilot.

## Status

| Lecture | Field | State |
|---|---|---|
| L00 | Introduction | published |
| L01 | MLSys | published |
| L02 | HPC | published |
| L03 | Architecture | published |
| L04 | Network | published |
| L05 | Theory | published |
| L06 | Bioinformatics | published |
| L07 | Machine Learning | published |
| L08 | Database | published |
| L09 | Programming Languages | published |
| L10 | Software Engineering | published |
| L11 | Cryptography | published |
| L12 | Security | published |
| L13 | Robotics | published |

All 14 lectures are published. Fixes are welcome: open an issue or a pull request (see CONTRIBUTING.md).

### Log

- 2026-10-27: home page, L04 Network (6 chapters, 4 demos, quiz), voice test. Checked at 1200 px
  and 375 px. No videos yet (new videos use animind, not manim).
- 2026-10-27: L00 Introduction (6 chapters, 4 demos, quiz). Publish script and rules; L00 and L04
  approved and published: repo boxi-cs/frontiercs2 created, GitHub Pages on (main, root).
- 2026-10-27: L11 Cryptography published. Per-lecture code-keys.json and lecture.css, so lecture
  sessions never edit shared files; LECTURE_BRIEF.md for the remaining lectures.
- 2026-10-27: L01 MLSys, L02 HPC, L03 Architecture and L05 Theory published, written by four
  parallel sessions from LECTURE_BRIEF.md and re-checked before release.
- 2026-10-27: L06, L07, L08, L09, L10, L12 and L13 published: all 14 lectures are live. Every
  task's pass count, best score and reference score was compared with its task page.
- 2026-10-27: **v1.0.** Each lecture reviewed by an independent reviewer (reports in
  `build/reviews/`, not in git); every must-fix and nearly every should-fix item fixed by the
  lecture's author. Course-wide: selected-row captions, quiz answers in mixed positions, full model
  names, previous/next links, time and pass rate on the cards, an About page. All 48 tasks
  re-compared with the site (unchanged; leaderboard still dated October 26, 2026). Full site check
  at 375 px and 1200 px: no overflow, no errors, every demo renders. Tag `v1.0`.
