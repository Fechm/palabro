"""Une el piloto y los lotes revisados (parts/rev-*.jsonl) en corpus/data/corpus.jsonl.

Uso: python corpus/ai-generation/merge.py [--write] [--partial]
El freq_rank se asigna por lema desde wordlist.csv; las entradas cuyo lema ya no está en la lista se descartan.
"""
import glob, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data"
rank_of = {r.split(",")[1].strip().lower(): int(r.split(",")[0])
           for r in (ROOT / "wordlist.csv").read_text(encoding="utf-8").splitlines()[1:] if r.strip()}

pilot_src = ROOT / "parts" / "pilot.jsonl"
if not pilot_src.exists():
    lines = [l for l in (ROOT / "corpus.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    pilot = [l for l in lines if json.loads(l)["freq_rank"] <= 10]
    pilot_src.write_text("\n".join(pilot) + "\n", encoding="utf-8", newline="\n")

sources = [pilot_src] + [Path(f) for f in sorted(glob.glob(str(ROOT / "parts" / "rev-*.jsonl")))]
by_lemma, obsolete, dupes = {}, [], []
for src in sources:
    for line in src.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        e = json.loads(line)
        key = e["lemma"].lower()
        if key not in rank_of:
            obsolete.append(key)
            continue
        if key in by_lemma:
            dupes.append(key)
            continue
        e["freq_rank"] = rank_of[key]
        by_lemma[key] = e

missing = sorted((r, w) for w, r in rank_of.items() if w not in by_lemma)
print(f"fuentes: {len(sources)} · entradas útiles: {len(by_lemma)}/{len(rank_of)}")
print(f"obsoletas descartadas: {len(obsolete)} · duplicadas: {len(dupes)} {dupes[:10]}")
print(f"faltan: {len(missing)}", missing[:15], "…" if len(missing) > 15 else "")

if "--write" in sys.argv:
    if dupes or (missing and "--partial" not in sys.argv):
        sys.exit("No se escribe corpus.jsonl: hay faltantes o duplicados (usa --partial para escribir lo que hay).")
    ordered = sorted(by_lemma.values(), key=lambda e: e["freq_rank"])
    (ROOT / "corpus.jsonl").write_text(
        "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in ordered), encoding="utf-8", newline="\n")
    print("escrito corpus.jsonl con", len(ordered), "entradas")
