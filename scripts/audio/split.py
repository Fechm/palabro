"""Corta el audio de una tanda generada en el panel de ElevenLabs en un MP3 por palabra.

Uso: python scripts/audio/split.py audio-chunks/tanda-01.mp3
Busca audio-chunks/tanda-01.words (misma base), detecta los silencios con ffmpeg y
escribe public/audio/words/<palabra>.mp3. Si el número de trozos no coincide con el
de palabras, no escribe nada y lo informa: esa tanda se regenera.
Requiere imageio-ffmpeg (trae su propio ffmpeg).
"""
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "audio" / "words"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
NOISE_DB = -40
MIN_SILENCE = 0.15
MIN_WORD, MAX_WORD = 0.15, 1.2
PAD = 0.06


def duration(path: Path) -> float:
    info = subprocess.run([FFMPEG, "-i", str(path)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def silences(path: Path) -> list[tuple[float, float]]:
    log = subprocess.run(
        [FFMPEG, "-i", str(path), "-af", f"silencedetect=noise={NOISE_DB}dB:d={MIN_SILENCE}", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    return list(zip(starts, ends + [None] * (len(starts) - len(ends))))


def segments(path: Path) -> list[tuple[float, float]]:
    total = duration(path)
    cursor = 0.0
    out = []
    for start, end in silences(path):
        if start - cursor > 0.05:
            out.append((cursor, start))
        cursor = end if end is not None else total
    if total - cursor > 0.05:
        out.append((cursor, total))
    return out


def main():
    audio = Path(sys.argv[1])
    words = [w for w in audio.with_suffix(".words").read_text(encoding="utf-8").split() if w]
    segs = segments(audio)
    if len(segs) != len(words):
        print(f"✗ {audio.name}: {len(segs)} trozos de audio para {len(words)} palabras. No se escribió nada.")
        sys.exit(1)
    odd = [(w, round(e - s, 2)) for w, (s, e) in zip(words, segs) if not MIN_WORD <= e - s <= MAX_WORD]
    if odd:
        print(f"✗ {audio.name}: duraciones sospechosas (¿palabras pegadas o partidas?): {odd}. No se escribió nada.")
        sys.exit(1)
    OUT.mkdir(parents=True, exist_ok=True)
    for word, (start, end) in zip(words, segs):
        s, e = max(0.0, start - PAD), end + PAD
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-i", str(audio), "-ss", f"{s:.3f}", "-to", f"{e:.3f}",
             "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "44100", "-b:a", "64k", str(OUT / f"{word}.mp3")],
            check=True,
        )
    print(f"✓ {audio.name}: {len(words)} palabras cortadas en {OUT}")


if __name__ == "__main__":
    main()
