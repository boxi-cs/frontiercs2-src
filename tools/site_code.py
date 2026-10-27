"""Copy the code panels and outputs for a lecture page out of its checked notes, so they never drift.

    python3 frontiercs2/tools/site_code.py L04     # writes frontiercs2/site/L04/code.js

Run tools/check.py first. site/LNN/code-keys.json maps a key to text that must appear in exactly
one Python block of notes/LNN-*.md; the block's output (the {.text .output} block right after it,
if any) is stored under the same key in OUT.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from notes_check import blocks  # noqa: E402


def main(lec):
    note = next((ROOT / "notes").glob(f"{lec}-*.md"))
    want = json.loads((ROOT / "site" / lec / "code-keys.json").read_text())
    items = list(blocks(note.read_text()))
    code, out = {}, {}
    for key, marker in want.items():
        hits = [k for k, (_, cls, _, text) in enumerate(items) if "python" in cls and marker in text]
        if len(hits) != 1:
            sys.exit(f"{lec}: marker {marker!r} matches {len(hits)} blocks")
        k = hits[0]
        code[key] = items[k][3].rstrip("\n")
        if k + 1 < len(items) and "output" in items[k + 1][1]:
            out[key] = items[k + 1][3].rstrip("\n")
    target = ROOT / "site" / lec / "code.js"
    target.write_text(
        f"// Generated from frontiercs2/notes/{note.name} by tools/site_code.py "
        "(checked by tools/check.py). Do not edit by hand.\n"
        f"const CODE = {json.dumps(code, indent=2, ensure_ascii=False)};\n"
        f"const OUT = {json.dumps(out, indent=2, ensure_ascii=False)};\n"
    )
    print(f"wrote {target.relative_to(ROOT.parent)}: {len(code)} code panels, {len(out)} outputs")


if __name__ == "__main__":
    for lec in [a.upper() for a in sys.argv[1:]] or ["L04"]:
        main(lec)
