#!/usr/bin/env python3
"""Validate + merge authored content for The Stranger.

Checks (these are the build's quality gates):
  T1  every tagged term appears verbatim (case-insensitive) in its response
  T2  no tagged term is a substring of another tagged term in the same list
  T3  keyword-ON responses carry >= 10 expert terms absent from the assembled prompt
  T4  keyword-OFF responses carry <= 4 tagged terms
  T5  no two of the 64 variants share more than 5% identical sentences
  T6  card-shape constraints (dense = no headings/bullets/numbers; listicle = 10 items)
  T7  markdown stays inside the allowed subset
"""
import json, re, sys, itertools, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = json.load(open(f"{ROOT}/src/scenarios.json", encoding="utf-8"))
SCEN = {s["id"]: s for s in SPEC["scenarios"]}

fails, warns = [], []


def assembled(sc, key):
    bits = key.split("|")[0]
    parts = [sc["base"]]
    if bits[0] == "1":
        parts.append(sc["levers"]["context"])
    if bits[1] == "1":
        parts.append(sc["levers"]["success"])
    if bits[2] == "1":
        parts.append(sc["levers"]["keywords"])
    return "\n\n".join(parts)


def sentences(md):
    t = re.sub(r'"[^"]{10,}"', " ", md)          # drop quoted source spans
    t = re.sub(r"^\s{0,3}(#{1,6}\s|[-*]\s|\d+\.\s)", " ", t, flags=re.M)
    t = re.sub(r"[*_`]", "", t)
    out = []
    for raw in re.split(r"(?<=[.!?])\s+|\n+", t):
        s = re.sub(r"[^a-z0-9 ]+", " ", raw.lower())
        s = re.sub(r"\s+", " ", s).strip()
        if len(s.split()) >= 6:
            out.append(s)
    return out


ALLOWED = re.compile(r"^(#{3}\s\S|[-]\s\S|\d+\.\s\S|\S)")
BANNED = re.compile(r"(\|.*\|)|(^```)|(\[[^\]]*\]\([^)]*\))|(^>\s)|(^---\s*$)|(^#{1,2}\s)", re.M)

bundle = {"cards": SPEC["cards"], "scenarios": []}
allresp = {}

for sc in SPEC["scenarios"]:
    sid = sc["id"]
    merged = {}
    for part in ("on", "off"):
        p = f"{ROOT}/src/content/{sid}_{part}.json"
        d = json.load(open(p, encoding="utf-8"))
        merged.update(d["responses"])

    expect = {"010", "110", "011", "111"} | {
        f"{b}|{c}" for b in ("000", "100", "001", "101") for c in sc["cards"]
    }
    if set(merged) != expect:
        fails.append(f"{sid}: key mismatch missing={expect-set(merged)} extra={set(merged)-expect}")

    for key, r in merged.items():
        tag = f"{sid}/{key}"
        md, terms = r["md"], r["terms"]
        low = md.lower()

        for t in terms:                                                    # T1
            # the runtime marks the first word-boundary-respecting occurrence,
            # so a lemma that only appears inflected ("enthymeme" in
            # "enthymemes") would silently never get marked. Reject it here.
            if not re.search(r"(?<![a-z0-9])" + re.escape(t.lower()) + r"(?![a-z0-9])", low):
                fails.append(f"T1 {tag}: no word-boundary occurrence of {t!r}")
        for a, b in itertools.permutations(terms, 2):                      # T2
            if a.lower() in b.lower():
                fails.append(f"T2 {tag}: {a!r} is a substring of {b!r}")

        prompt = assembled(sc, key).lower()
        novel = [t for t in terms if t.lower() not in prompt]
        kw_on = key.split("|")[0][2] == "1"
        if kw_on:
            if len(novel) < 10:                                            # T3
                fails.append(f"T3 {tag}: only {len(novel)} novel terms (need >=10)")
        else:
            if len(terms) > 4:                                             # T4
                fails.append(f"T4 {tag}: {len(terms)} terms on a keyword-off state")

        if BANNED.search(md):                                              # T7
            fails.append(f"T7 {tag}: banned markdown construct")

        card = key.split("|")[1] if "|" in key else None
        if card == "dense":                                                # T6
            if re.search(r"^\s*(#{1,6}\s|[-*]\s|\d+\.\s)", md, flags=re.M):
                fails.append(f"T6 {tag}: dense card contains a heading/bullet/number")
        if card == "listicle":
            n = len(re.findall(r"^\s*\d+\.\s", md, flags=re.M))
            if n != 10:
                fails.append(f"T6 {tag}: listicle has {n} numbered items (need 10)")

        r["words"] = len(re.findall(r"[A-Za-z0-9'’-]+", md))
        r["novel"] = len(novel)
        allresp[tag] = set(sentences(md))
        merged[key] = r

    bundle["scenarios"].append({
        "id": sid, "tab": sc["tab"], "title": sc["title"], "base": sc["base"],
        "attachment": sc["attachment"], "levers": sc["levers"], "cards": sc["cards"],
        "responses": merged,
    })

# T5 pairwise sentence overlap
worst = (0.0, "")
for (k1, s1), (k2, s2) in itertools.combinations(allresp.items(), 2):
    if not s1 or not s2:
        continue
    shared = s1 & s2
    frac = len(shared) / min(len(s1), len(s2))
    if frac > worst[0]:
        worst = (frac, f"{k1} vs {k2} ({len(shared)} shared)")
    if frac > 0.05:
        fails.append(f"T5 {k1} vs {k2}: {frac:.1%} identical sentences :: {list(shared)[:2]}")

n = len(allresp)
print(f"variants: {n}   total words: {sum(r['words'] for s in bundle['scenarios'] for r in s['responses'].values()):,}")
print(f"worst pairwise sentence overlap: {worst[0]:.2%}  [{worst[1] or 'none'}]")
kwon = [(k, r['novel'], len(r['terms'])) for s in bundle['scenarios'] for k, r in s['responses'].items() if k.split('|')[0][2] == '1']
print(f"keyword-on variants: {len(kwon)}   novel-term range: {min(x[1] for x in kwon)}–{max(x[1] for x in kwon)}   tagged range: {min(x[2] for x in kwon)}–{max(x[2] for x in kwon)}")
kwoff = [len(r['terms']) for s in bundle['scenarios'] for k, r in s['responses'].items() if k.split('|')[0][2] == '0']
print(f"keyword-off tagged range: {min(kwoff)}–{max(kwoff)}")

for w in warns:
    print("WARN", w)
if fails:
    print(f"\n{len(fails)} FAILURES")
    for f in fails[:40]:
        print("  ✗", f)
    sys.exit(1)

json.dump(bundle, open(f"{ROOT}/src/content.json", "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
print("\nall gates pass -> src/content.json")
