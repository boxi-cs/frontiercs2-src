"""The block rules for checking lecture notes (shared with the maintainer's other courses).

Blocks of one lecture run in order in one shared namespace:
- a block that starts with ``>>>`` is a doctest session;
- any other ``python`` block is exec'd; if the next block is ``{.text .output}``,
  what the program printed must equal it exactly;
- ``{.python .norun}`` blocks are skipped (code meant to fail or never stop);
- ``{.python stdin="..."}`` feeds that text to ``input()`` (``\\n`` separates lines).

Used by check.py and site_code.py. Kept here so this course needs nothing outside its own folder.
"""

import contextlib
import doctest
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FENCE = re.compile(r"^(`{3,})\s*(\{[^}]*\}|[\w.-]+)?\s*$")


def parse_attrs(info):
    """Return (classes, attrs) for a fence info string like {.python stdin="1"}."""
    if not info:
        return [], {}
    if not info.startswith("{"):
        return [info], {}
    body = info[1:-1]
    attrs = {k: v.encode().decode("unicode_escape") for k, v in re.findall(r'(\w+)="([^"]*)"', body)}
    classes = re.findall(r"(?:^|\s)\.([\w-]+)", body)
    return classes, attrs


def blocks(text):
    """Yield (line_no, classes, attrs, code) for every fenced block."""
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        m = FENCE.match(lines[i])
        if not m or not m.group(2):
            i += 1
            continue
        fence, start = m.group(1), i + 1
        classes, attrs = parse_attrs(m.group(2))
        j = i + 1
        while j < len(lines) and lines[j].rstrip() != fence:
            j += 1
        yield start, classes, attrs, "\n".join(lines[i + 1 : j]) + "\n"
        i = j + 1


def run_program(code, ns, stdin, name):
    out = io.StringIO()
    old_stdin = sys.stdin
    sys.stdin = io.StringIO(stdin)
    try:
        with contextlib.redirect_stdout(out):
            exec(compile(code, name, "exec"), ns)
    finally:
        sys.stdin = old_stdin
    return out.getvalue()


def check_file(path):
    ns = {"__name__": "__notes__"}
    parser = doctest.DocTestParser()
    runner = doctest.DocTestRunner(optionflags=doctest.ELLIPSIS)
    items = list(blocks(path.read_text()))
    failures = ran = 0
    for k, (line, classes, attrs, code) in enumerate(items):
        if "python" not in classes or "norun" in classes:
            continue
        ran += 1
        where = f"{path.name}:{line}"
        try:
            if code.lstrip().startswith(">>>"):
                test = parser.get_doctest(code, ns, where, str(path), line)
                report = io.StringIO()
                result = runner.run(test, out=report.write, clear_globs=False)
                if result.failed:
                    failures += 1
                    print(report.getvalue())
                continue
            printed = run_program(code, ns, attrs.get("stdin", ""), where)
            nxt = items[k + 1] if k + 1 < len(items) else None
            if nxt and "output" in nxt[1]:
                if printed != nxt[3]:
                    failures += 1
                    print(f"FAIL {where}: output differs from block at line {nxt[0]}")
                    print("--- expected\n" + nxt[3] + "--- got\n" + printed)
        except Exception as e:  # noqa: BLE001 - report any error in a block
            failures += 1
            print(f"FAIL {where}: {type(e).__name__}: {e}")
    return ran, failures
