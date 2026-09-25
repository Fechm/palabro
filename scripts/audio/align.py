"""Corta un audio largo del panel de ElevenLabs en un MP3 por palabra usando Whisper local.

Uso: python scripts/audio/align.py audio-chunks/tandas-01-06.mp3
Busca la lista de palabras en el .words de misma base. Transcribe con faster-whisper
(modelo small), alinea la transcripción con la lista y corta cada palabra en el punto
de menor energía entre ella y la siguiente. Luego escucha cada corte con Whisper, repara
las zonas corridas y deja fuera (sin MP3) las palabras que sigan dudosas: chunks.py
las vuelve a incluir en la próxima tanda.
Requiere faster-whisper, numpy e imageio-ffmpeg.
"""
import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "audio" / "words"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
RATE = 16000
FRAME = 160
SILENCE_DB = -45
PAD = 0.04
MIN_WORD, MAX_WORD = 0.12, 1.4
LONG_WORD = 1.0
MIN_VOICED = 8
HOMOPHONES = {
    "two": ("to", "too"), "too": ("to", "two"), "four": ("for",), "hear": ("here",), "eye": ("i",),
    "week": ("weak",), "high": ("hi",), "buy": ("bye", "by"), "bye": ("buy", "by"), "write": ("right",),
    "piece": ("peace",), "marry": ("merry", "mary"), "sun": ("son",), "sea": ("see",), "tea": ("t", "tee"),
    "gentleman": ("gentlemen",), "seem": ("seam",), "scene": ("seen",), "road": ("rode",), "sell": ("cell",),
    "except": ("accept",), "bear": ("bare",), "wear": ("where",), "hair": ("hare",), "know": ("no",),
    "new": ("knew",), "hour": ("our",), "dear": ("deer",), "meet": ("meat",), "one": ("won",), "night": ("knight",),
    "whole": ("hole",), "wait": ("weight",), "break": ("brake",), "steal": ("steel",), "weather": ("whether",),
    "board": ("bored",), "blue": ("blew",), "plain": ("plane",), "sale": ("sail",), "tail": ("tale",),
    "pair": ("pear",), "waste": ("waist",), "flower": ("flour",), "son": ("sun",), "see": ("sea",),
    "right": ("write",), "here": ("hear",), "no": ("know",), "wonder": ("wunder",), "die": ("dye",),
}
NUMBERS = {"1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven",
           "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve", "20": "twenty", "100": "hundred"}


_model = None


def model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel("small", device="cpu", compute_type="int8")
    return _model


def whisper(source, offset: float = 0.0) -> list[dict]:
    segs, _ = model().transcribe(source, language="en", word_timestamps=True, condition_on_previous_text=False)
    return [{"w": w.word, "s": w.start + offset, "e": w.end + offset, "p": w.probability} for s in segs for w in s.words]


def transcribe(audio: Path) -> list[dict]:
    cache = audio.with_suffix(".asr.json")
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    words = whisper(str(audio))
    cache.write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    return words


def heard(pcm: np.ndarray, seg: tuple[float, float]) -> list[str]:
    segs, _ = model().transcribe(pcm[int(seg[0] * RATE):int(seg[1] * RATE)], language="en", beam_size=1,
                                without_timestamps=True, condition_on_previous_text=False)
    return [t for t in (norm(x) for s in segs for x in s.text.split()) if t]


def sounds_like(word: str, token: str) -> bool:
    return token == word or token in HOMOPHONES.get(word, ()) or word in HOMOPHONES.get(token, ())


def bad(words: list[str], k: int, tokens: list[str], length: float) -> bool:
    neighbors = set(words[max(0, k - 2):k + 3]) - {words[k]}
    if any(t in neighbors for t in tokens):
        return True
    if any(sounds_like(words[k], t) for t in tokens):
        return False
    return len(tokens) != 1 or length < 0.1 + 0.04 * len(words[k])


def clusters(flags: list[bool]) -> list[tuple[int, int]]:
    out = []
    for k, f in enumerate(flags):
        if f:
            if out and k - out[-1][1] <= 2:
                out[-1][1] = k
            else:
                out.append([k, k])
    return [(max(0, a - 1), min(len(flags) - 1, b + 1)) for a, b in out]


def repair(words: list[str], bounds: list[float], env: np.ndarray, pcm: np.ndarray, i: int, j: int) -> None:
    fps = RATE / FRAME
    a, b = bounds[i], bounds[j + 1]
    spans, _ = align(words[i:j + 1], whisper(pcm[int(a * RATE):int(b * RATE)], a))
    if any(s is None for s in spans):
        return
    new = []
    for (s1, e1), (s2, e2) in zip(spans, spans[1:]):
        lo, hi = (e1 - 0.05, s2 + 0.05) if s2 > e1 else ((e1 + s2) / 2 - 0.1, (e1 + s2) / 2 + 0.1)
        lo, hi = int(max(lo, a) * fps), max(int(max(lo, a) * fps) + 1, int(min(hi, b) * fps))
        new.append((lo + int(np.argmin(env[lo:hi]))) / fps)
    if all(x < y for x, y in zip([a] + new, new + [b])):
        bounds[i + 1:j + 1] = new


def norm(token: str) -> str:
    token = re.sub(r"[^a-z0-9']", "", token.lower())
    return NUMBERS.get(token, token)


def align(expected: list[str], asr: list[dict]) -> tuple[list[tuple[float, float] | None], list[str]]:
    asr = [a for a in asr if not (a["p"] < 0.2 and a["e"] - a["s"] < 0.15)]
    got = [norm(a["w"]) for a in asr]
    spans: list[tuple[float, float] | None] = [None] * len(expected)
    problems = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, expected, got, autojunk=False).get_opcodes():
        if op == "equal" or (op == "replace" and i2 - i1 == j2 - j1):
            for i, j in zip(range(i1, i2), range(j1, j2)):
                spans[i] = (asr[j]["s"], asr[j]["e"])
        elif op == "replace" and j2 > j1:
            for k, i in enumerate(range(i1, i2)):
                j = j1 + round(k * (j2 - j1) / (i2 - i1))
                spans[i] = (asr[j]["s"], asr[j]["e"])
            problems.append(f"{expected[i1:i2]} ~ {got[j1:j2]}")
        elif op == "delete":
            problems.append(f"sin audio: {expected[i1:i2]}")
    return spans, problems


def load(audio: Path) -> np.ndarray:
    raw = subprocess.run([FFMPEG, "-loglevel", "error", "-i", str(audio), "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def envelope(pcm: np.ndarray) -> np.ndarray:
    frames = pcm[: len(pcm) // FRAME * FRAME].reshape(-1, FRAME)
    db = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9)
    return np.convolve(db, np.ones(5) / 5, mode="same")


def candidates(env: np.ndarray) -> list[tuple[float, float]]:
    fps = RATE / FRAME
    win = int(0.25 * fps)
    out = []
    for i in range(1, len(env) - 1, 2):
        depth = min(env[max(0, i - win):i].max(), env[i + 1:i + 1 + win].max()) - env[i]
        if depth > 6 or env[i] < SILENCE_DB:
            out.append((i / fps, depth))
    return out


def speech(env: np.ndarray) -> np.ndarray:
    from numpy.lib.stride_tricks import sliding_window_view
    win = 301
    padded = np.pad(env, (win // 2, win // 2), mode="edge")
    floor = np.repeat(np.percentile(sliding_window_view(padded, win)[::10], 10, axis=1), 10)[: len(env)]
    return np.concatenate([[0], np.cumsum(env > floor + 10)])


def boundaries(spans: list[tuple[float, float]], env: np.ndarray) -> list[float]:
    fps = RATE / FRAME
    gaps = candidates(env)
    times = np.array([t for t, _ in gaps])
    voiced = speech(env)
    frame = np.minimum((times * fps).astype(int), len(env))
    targets = [(e1 + s2) / 2 for (_, e1), (s2, _) in zip(spans, spans[1:])]
    layers = []
    for t in targets:
        idx = np.nonzero(np.abs(times - t) <= 0.7)[0]
        if not len(idx):
            idx = np.array([int(np.argmin(np.abs(times - t)))])
        layers.append([(int(i), ((times[i] - t) / 0.3) ** 2 - gaps[i][1] / 8) for i in idx])
    cost = np.array([c if times[i] >= MIN_WORD else np.inf for i, c in layers[0]])
    back = []
    for prev, layer in zip(layers, layers[1:]):
        gap = times[[i for i, _ in layer]][:, None] - times[[j for j, _ in prev]][None, :]
        total = cost[None, :] + np.where(gap > LONG_WORD, ((gap - LONG_WORD) / 0.1) ** 2, 0)
        total[gap < MIN_WORD] = np.inf
        inside = voiced[frame[[i for i, _ in layer]]][:, None] - voiced[frame[[j for j, _ in prev]]][None, :]
        total[inside < MIN_VOICED] += 50
        arg = total.argmin(axis=1)
        cost = total[np.arange(len(layer)), arg] + np.array([c for _, c in layer])
        back.append(arg)
    k = int(np.argmin(cost))
    chosen = [layers[-1][k][0]]
    for layer, row in zip(reversed(layers[:-1]), reversed(back)):
        k = row[k]
        chosen.append(layer[k][0])
    return [float(times[i]) for i in reversed(chosen)]


def cuts(bounds: list[float], env: np.ndarray) -> list[tuple[float, float]]:
    fps = RATE / FRAME
    out = []
    for start, end in zip(bounds, bounds[1:]):
        i, j = int(start * fps), max(int(start * fps) + 1, int(end * fps))
        loud = np.nonzero(env[i:j] > SILENCE_DB)[0]
        if len(loud):
            out.append((max(start, (i + loud[0]) / fps - PAD), min(end, (i + loud[-1] + 1) / fps + PAD)))
        else:
            out.append((start, end))
    return out


def main():
    audio = Path(sys.argv[1])
    words = [w for w in audio.with_suffix(".words").read_text(encoding="utf-8").split() if w]
    spans, problems = align(words, transcribe(audio))
    missing = [w for w, s in zip(words, spans) if s is None]
    if missing:
        print(f"✗ {audio.name}: no se ubicaron {missing}. No se escribió nada.")
        sys.exit(1)
    pcm = load(audio)
    env = envelope(pcm)
    total = len(env) / (RATE / FRAME)
    bounds = [0.0] + boundaries(spans, env) + [total]
    for p in problems:
        print(f"  revisar: {p}")
    flags = [True] * len(words)
    for round_ in range(4):
        segs = cuts(bounds, env)
        flags = [flags[k] and bad(words, k, heard(pcm, segs[k]), segs[k][1] - segs[k][0]) for k in range(len(words))]
        print(f"  pasada {round_ + 1}: {sum(flags)} palabras dudosas")
        if not any(flags) or round_ == 3:
            break
        for i, j in clusters(flags):
            repair(words, bounds, env, pcm, i, j)
        flags = [any(flags[max(0, k - 3):k + 4]) for k in range(len(words))]
    segs = cuts(bounds, env)
    rejected = [w for w, f, (s, e) in zip(words, flags, segs) if f or not MIN_WORD <= e - s <= MAX_WORD]
    OUT.mkdir(parents=True, exist_ok=True)
    for word, (s, e) in zip(words, segs):
        target = OUT / f"{word}.mp3"
        if word in rejected:
            target.unlink(missing_ok=True)
            continue
        subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-ss", f"{s:.3f}", "-to", f"{e:.3f}", "-i", str(audio),
             "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "44100", "-b:a", "64k", str(target)],
            check=True,
        )
    print(f"✓ {audio.name}: {len(words) - len(rejected)} palabras cortadas en {OUT}")
    if rejected:
        print(f"  {len(rejected)} quedaron fuera y van a la próxima tanda: {rejected}")


if __name__ == "__main__":
    main()
