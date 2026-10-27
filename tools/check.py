"""Run every Python block in the FrontierCS 2 course notes and check the shown output.

    python3 frontiercs2/tools/check.py          # all lectures
    python3 frontiercs2/tools/check.py L04      # some lectures

Block rules: see tools/notes_check.py.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from notes_check import check_file  # noqa: E402


def main(args):
    names = [a.upper() for a in args]
    files = sorted((ROOT / "notes").glob("L*.md"))
    if names:
        files = [f for f in files if f.name.split("-")[0] in names]
    total_fail = 0
    for f in files:
        ran, failed = check_file(f)
        total_fail += failed
        print(f"{'ok  ' if not failed else 'FAIL'} {f.name}: {ran} blocks, {failed} failed")
    return 1 if total_fail else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
