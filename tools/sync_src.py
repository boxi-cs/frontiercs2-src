"""Sync the maintainer's working copy of the course with the public source repo.

    python3 tools/sync_src.py push    # export the committed course folder as one snapshot commit
    python3 tools/sync_src.py pull    # apply what was merged in the public repo since the last sync
    python3 tools/sync_src.py status  # show the last synced commit and whether the repo moved on

The public repo gets only snapshots of committed files, authored with the GitHub noreply address,
so the working copy's own history, paths and email never leave this machine. Before a push, every
exported file is scanned for the patterns in tools/.private-words (local, not in git); one hit
stops the push.

`push` refuses when the public repo has commits newer than the last sync: run `pull`, review and
commit the changes, then push. State is kept in build/sync-state.json (not in git).
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REMOTE = "https://github.com/boxi-cs/frontiercs2-src.git"
CLONE = ROOT / "build" / "src-clone"
STATE = ROOT / "build" / "sync-state.json"
WORDS = ROOT / "tools" / ".private-words"
AUTHOR = {"GIT_AUTHOR_NAME": "Boxi Yu", "GIT_AUTHOR_EMAIL": "89333694+BoxiYu@users.noreply.github.com"}
AUTHOR.update(GIT_COMMITTER_NAME=AUTHOR["GIT_AUTHOR_NAME"], GIT_COMMITTER_EMAIL=AUTHOR["GIT_AUTHOR_EMAIL"])


def git(*args, cwd=CLONE, capture=True, env=None):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=capture, text=True,
                       env={**os.environ, **(env or {})})
    if r.returncode:
        sys.exit(f"git {' '.join(args)} failed:\n{r.stderr}")
    return r.stdout.strip() if capture else ""


def state():
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def fresh_clone():
    """A clean clone at the public repo's main (empty repos are fine)."""
    if not (CLONE / ".git").exists():
        CLONE.mkdir(parents=True, exist_ok=True)
        git("init", "-q", "-b", "main")
        git("remote", "add", "origin", REMOTE)
    git("fetch", "-q", "origin")
    has_main = git("ls-remote", "--heads", "origin", "main")
    if has_main:
        git("checkout", "-q", "-B", "main", "origin/main")
        git("reset", "-q", "--hard", "origin/main")
        git("clean", "-qfdx")
    return git("rev-parse", "origin/main") if has_main else None


def export_tree(dest):
    """The committed course folder (HEAD of the working copy's repo), without its history."""
    top = Path(git("rev-parse", "--show-toplevel", cwd=ROOT))
    prefix = ROOT.relative_to(top).as_posix()
    with tempfile.TemporaryDirectory() as tmp:
        tar = Path(tmp) / "course.tar"
        git("archive", "-o", str(tar), "HEAD", prefix, cwd=top)
        with tarfile.open(tar) as t:
            t.extractall(tmp, filter="data")
        shutil.copytree(Path(tmp) / prefix, dest, dirs_exist_ok=True)


def scan(folder):
    if not WORDS.exists():
        sys.exit(f"{WORDS.relative_to(ROOT)} is missing: refusing to export without a privacy scan")
    pats = [w.strip() for w in WORDS.read_text().splitlines() if w.strip() and not w.startswith("#")]
    rx = re.compile("|".join(pats), re.I)
    hits = []
    for f in sorted(folder.rglob("*")):
        if ".git" in f.parts or not f.is_file():
            continue
        rel = f.relative_to(folder).as_posix()
        try:
            text = f.read_text()
        except UnicodeDecodeError:
            text = ""
        for n, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                hits.append(f"{rel}:{n}: {line.strip()[:100]}")
        if rx.search(rel):
            hits.append(f"{rel}: file name")
    if hits:
        sys.exit("not exported, private words found:\n  " + "\n  ".join(hits))


def push(note):
    head = fresh_clone()
    synced = state().get("synced")
    if head and head != synced:
        sys.exit(f"the public repo moved on ({head[:8]}, last synced {str(synced)[:8]}): run pull first")
    for item in CLONE.iterdir():
        if item.name != ".git":
            shutil.rmtree(item) if item.is_dir() else item.unlink()
    export_tree(CLONE)
    scan(CLONE)
    git("add", "-A")
    if head and not git("status", "--porcelain"):
        print("nothing to export: the public repo already matches")
        return
    message = f"Sync from the maintainer's copy ({date.today().isoformat()})" + (f"\n\n{note}" if note else "")
    git("commit", "-q", "-m", message, env=AUTHOR)
    git("push", "-q", "origin", "main")
    STATE.write_text(json.dumps({"synced": git("rev-parse", "HEAD")}) + "\n")
    print("pushed", git("rev-parse", "--short", "HEAD"), "to", REMOTE)


def pull():
    head = fresh_clone()
    synced = state().get("synced")
    if not synced:
        sys.exit("no sync state yet: push first")
    if head == synced:
        print("up to date")
        return
    diff = git("diff", "--binary", synced, head)
    top = Path(git("rev-parse", "--show-toplevel", cwd=ROOT))
    prefix = ROOT.relative_to(top).as_posix()
    r = subprocess.run(["git", "apply", "--3way", f"--directory={prefix}"], cwd=top, input=diff + "\n",
                       capture_output=True, text=True)
    print(r.stdout + r.stderr)
    if r.returncode:
        sys.exit("pull did not apply cleanly; resolve, then run pull again")
    STATE.write_text(json.dumps({"synced": head}) + "\n")
    log = git("log", "--format=  %h %s (%an)", f"{synced}..{head}")
    print(f"applied {synced[:8]}..{head[:8]} to {prefix}/ (not committed):\n{log}")


def main(args):
    cmd = args[0] if args else "status"
    if cmd == "push":
        push(" ".join(args[1:]))
    elif cmd == "pull":
        pull()
    else:
        head = fresh_clone()
        synced = state().get("synced")
        print(f"public main {str(head)[:8]}, last synced {str(synced)[:8]}"
              + ("" if head == synced else "  <- run pull"))


if __name__ == "__main__":
    main(sys.argv[1:])
