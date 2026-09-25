"""Arma las tandas de texto para generar el audio de las palabras desde el panel de ElevenLabs.

Uso: python scripts/audio/chunks.py [--size 100] [--pilot 20]
Salida: audio-chunks/tanda-XX.txt (una palabra por línea, con punto final para
que la voz haga una pausa y cierre la entonación) y audio-chunks/tanda-XX.words
(la lista en el mismo orden, para cortar después).
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLEAN = ROOT / "corpus" / "data" / "corpus.clean.jsonl"
OUT = ROOT / "audio-chunks"
WORDS = ROOT / "public" / "audio" / "words"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=100)
    ap.add_argument("--pilot", type=int, default=0)
    args = ap.parse_args()

    lemmas = []
    for line in CLEAN.read_text(encoding="utf-8").splitlines():
        if line.strip():
            lemma = json.loads(line)["lemma"].lower()
            if lemma not in lemmas and not (WORDS / f"{lemma}.mp3").exists():
                lemmas.append(lemma)

    OUT.mkdir(exist_ok=True)
    size = args.pilot or args.size
    groups = [lemmas[:args.pilot]] if args.pilot else [lemmas[i:i + size] for i in range(0, len(lemmas), size)]
    total = 0
    for n, group in enumerate(groups):
        name = "prueba" if args.pilot else f"tanda-{n + 1:02d}"
        text = "\n".join(f"{w.capitalize()}." for w in group) + "\n"
        (OUT / f"{name}.txt").write_text(text, encoding="utf-8")
        (OUT / f"{name}.words").write_text("\n".join(group) + "\n", encoding="utf-8")
        total += len(text)
        print(f"{name}: {len(group)} palabras, {len(text)} caracteres")
    print(f"Total: {total} caracteres · carpeta {OUT}")


if __name__ == "__main__":
    main()
