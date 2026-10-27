"""Publish the FrontierCS 2 course site to GitHub Pages (boxi-cs/frontiercs2).

    python3 frontiercs2/tools/publish.py                    # build and push
    python3 frontiercs2/tools/publish.py --dry-run          # build only, into frontiercs2/build/publish/
    python3 frontiercs2/tools/publish.py --approve L00 L04  # snapshot reviewed lectures, then publish

Lecture pages are published from approved snapshots in build/approved/LNN/, so a lecture
someone is still editing in site/ keeps its last approved version online. --approve
copies site/LNN into the snapshot (after its notes pass check.py and the page passes the
sanity check). The hub and assets/ always come from site/.

Only the lectures listed in site/PUBLISHED go out (one LNN per line); the hub shows the
others as "in preparation". Each listed lecture's notes must pass check.py first. The
build is pushed as one fresh commit (force push), so old videos don't pile up in history.
See site/PUBLISHING.md for the release rules.
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
OUT = ROOT / "build" / "publish"
APPROVED = ROOT / "build" / "approved"
REMOTE = "https://github.com/boxi-cs/frontiercs2.git"
SKIP = {".DS_Store", "README.md", "PUBLISHED", "PUBLISHING.md", "code-keys.json"}


def published():
    lines = (SITE / "PUBLISHED").read_text().splitlines()
    return [s.strip().upper() for s in lines if s.strip() and not s.lstrip().startswith("#")]


def build(lectures):
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    ignore = shutil.ignore_patterns(*SKIP)
    shutil.copy2(SITE / "index.html", OUT / "index.html")
    shutil.copytree(SITE / "assets", OUT / "assets", ignore=ignore)
    for lec in lectures:
        src = APPROVED / lec if (APPROVED / lec).exists() else SITE / lec
        if not (src / "index.html").exists():
            sys.exit(f"{lec} is listed in PUBLISHED but has no index.html")
        shutil.copytree(src, OUT / lec, ignore=ignore)
    (OUT / ".nojekyll").write_text("")
    size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
    print(f"built {', '.join(lectures)} into {OUT} ({size / 1e6:.1f} MB)")


def problems_in(root, lec):
    """Half-finished edits: a JS file that doesn't parse, or a video the page refers to
    that isn't there. (Lecture work happens in this same checkout.)"""
    found = []
    for js in (root / lec).rglob("*.js"):
        r = subprocess.run(["node", "--check", str(js)], capture_output=True, text=True)
        if r.returncode:
            found.append(f"{lec}/{js.name} does not parse")
    text = (root / lec / "chapters.js").read_text()
    for ref in sorted(set(re.findall(r"media/[\w.-]+\.mp4", text))):
        if not (root / lec / ref).exists():
            found.append(f"{lec}/chapters.js refers to missing {ref}")
    return found


# Words a published build must not contain, kept in the maintainer's tools/.brand-words (not in git).
_WORDS = ROOT / "tools" / ".brand-words"
_LIST = [w.strip() for w in _WORDS.read_text().splitlines() if w.strip() and not w.startswith("#")] if _WORDS.exists() else []
BRAND = re.compile("|".join(_LIST), re.I) if _LIST else None


def sanity(lectures):
    problems = [p for lec in lectures for p in problems_in(OUT, lec)]
    for f in OUT.rglob("*"):
        if BRAND and f.is_file() and (BRAND.search(f.name) or (f.suffix in {".html", ".js", ".css", ".svg", ".vtt"} and BRAND.search(f.read_text()))):
            problems.append(f"{f.relative_to(OUT)} contains a word from tools/.brand-words")
    if problems:
        sys.exit("not published:\n  " + "\n  ".join(problems))


def approve(lectures):
    check = subprocess.run([sys.executable, str(ROOT / "tools" / "check.py"), *lectures])
    problems = [p for lec in lectures for p in problems_in(SITE, lec)]
    if check.returncode or problems:
        sys.exit("not approved:\n  " + "\n  ".join(problems or ["check.py failed"]))
    for lec in lectures:
        if (APPROVED / lec).exists():
            shutil.rmtree(APPROVED / lec)
        shutil.copytree(SITE / lec, APPROVED / lec, ignore=shutil.ignore_patterns(*SKIP))
        print("approved", lec)


def push():
    def git(*args):
        subprocess.run(["git", *args], cwd=OUT, check=True)

    git("init", "-q", "-b", "main")
    git("add", "-A")
    git("commit", "-q", "-m", "Publish FrontierCS 2 course")
    git("push", "-q", "-f", REMOTE, "main")
    print("pushed to", REMOTE)


def stale(lectures):
    """Lectures whose site/ folder changed after approval: the build still ships the old snapshot."""
    import filecmp
    out = []
    for lec in lectures:
        if not (APPROVED / lec).exists():
            continue
        cmp = filecmp.dircmp(SITE / lec, APPROVED / lec, ignore=list(SKIP))
        if cmp.left_only or cmp.right_only or filecmp.cmpfiles(SITE / lec, APPROVED / lec, cmp.common_files, shallow=False)[1]:
            out.append(lec)
    return out


def main(args):
    if "--approve" in args:
        approve([a.upper() for a in args if a.upper().startswith("L")])
    lectures = published()
    check = subprocess.run([sys.executable, str(ROOT / "tools" / "check.py"), *lectures])
    if check.returncode:
        sys.exit("check.py failed; nothing published")
    build(lectures)
    sanity(lectures)
    for lec in stale(lectures):
        print(f"note: site/{lec} changed after its approval; the build ships the approved snapshot "
              f"(run --approve {lec} to publish the change)")
    if "--dry-run" not in args:
        push()


if __name__ == "__main__":
    main(sys.argv[1:])
