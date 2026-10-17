#!/usr/bin/env python3
"""Split the single-file notebook into the site's data and vendor files.

Usage:  python3 tools/build_data.py [path/to/bliss-replication.html]

Reads the embedded `const DATA = {...}` and the inlined marked / DOMPurify
bundles, then writes:
  data/core.js          everything the first screen needs (no message text)
  data/msgs-<exp>.json  full transcripts, one file per experiment, fetched on demand
  vendor/marked.min.js, vendor/purify.min.js
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "bliss-replication.html"
html = src.read_text(encoding="utf-8")

m = re.search(r"^const DATA = (\{.*\});\s*$", html, re.M)
if not m:
    sys.exit("DATA not found in " + str(src))
data = json.loads(m.group(1))

(ROOT / "data").mkdir(exist_ok=True)
compact = dict(ensure_ascii=False, separators=(",", ":"))
for exp in data["exps"]:
    msgs = [c.pop("msgs") for c in exp["view"]["convs"]]
    (ROOT / "data" / f"msgs-{exp['key']}.json").write_text(json.dumps(msgs, **compact), encoding="utf-8")
(ROOT / "data" / "core.js").write_text("window.DATA=" + json.dumps(data, **compact) + ";\n", encoding="utf-8")

(ROOT / "vendor").mkdir(exist_ok=True)
libs = {
    "marked.min.js": r"<script>(/\*\*\s*\n \* marked.*?)</script>",
    "purify.min.js": r"<script>(/\*! @license DOMPurify.*?)</script>",
}
for name, pat in libs.items():
    lm = re.search(pat, html, re.S)
    if not lm:
        sys.exit(name + " not found in " + str(src))
    code = re.sub(r"^//# sourceMappingURL=.*$", "", lm.group(1), flags=re.M).rstrip() + "\n"
    (ROOT / "vendor" / name).write_text(code, encoding="utf-8")

for p in sorted([*(ROOT / "data").iterdir(), *(ROOT / "vendor").iterdir()]):
    print(f"{p.relative_to(ROOT)}  {p.stat().st_size:,} bytes")
