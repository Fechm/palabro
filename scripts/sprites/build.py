"""Procesa las hojas de sprites del acompañante generadas por IA.

Uso:
  python scripts/sprites/build.py [--preview RUTA.html]

Lee las hojas de SHEETS (una animación por fila, cuadros separados por
transparencia), las lleva a una escala común por hoja (el perro sentado del
primer cuadro de cada fila mide TARGET_H px de alto), aplica una paleta común
y escribe public/companion/<anim>.png y src/client/companion/manifest.json.
Requiere Pillow y numpy.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "companion"
OUT_PNG = ROOT / "public" / "companion"
OUT_MANIFEST = ROOT / "src" / "client" / "companion" / "manifest.json"
SHEETS = {
    "sheet-v3.webp": ["idle", "talk", "happy", "oops", "thinking", "celebrate", "wow", "wave"],
    "extras-v3.webp": ["yawn", "scratch", "point", "idea"],
}
TARGET_H, JITTER, COLORS = 46, 6, 22
MIN_BAND, FRAME_GAP, MIN_FRAME = 40, 6, 30


def runs(v, gap):
    idx = np.where(v)[0]
    out, s, p = [], idx[0], idx[0]
    for i in idx[1:]:
        if i > p + gap:
            out.append((int(s), int(p)))
            s = i
        p = i
    out.append((int(s), int(p)))
    return out


def frame_columns(op_band):
    cols = [list(r) for r in runs(op_band.any(0), FRAME_GAP)]
    frames = [c for c in cols if c[1] - c[0] >= MIN_FRAME]
    for c in cols:
        if c[1] - c[0] < MIN_FRAME:
            near = min(frames, key=lambda f: max(f[0] - c[1], c[0] - f[1]))
            near[0], near[1] = min(near[0], c[0]), max(near[1], c[1])
    return frames


def extract(src, sheet, names):
    op = src[..., 3] >= 128
    bands = [b for b in runs(op.any(1), 2) if b[1] - b[0] >= MIN_BAND]
    if len(bands) != len(names):
        raise SystemExit(f"{sheet}: se esperaban {len(names)} filas y se detectaron {len(bands)}")
    groups = {}
    for name, (y0, y1) in zip(names, bands):
        frames = []
        for x0, x1 in frame_columns(op[y0:y1 + 1]):
            f = src[y0:y1 + 1, x0:x1 + 1].copy()
            f[f[..., 3] < 128] = 0
            ys, xs = np.where(f[..., 3] > 0)
            body = ys >= ys.max() - (ys.max() - ys.min()) * 0.2
            frames.append(dict(img=f, bottom=float(ys.max()), cx=float(xs[body].mean()),
                               height=float(ys.max() - ys.min())))
        groups[name] = frames
    scale = float(np.median([fr[0]["height"] for fr in groups.values()])) / TARGET_H
    return groups, scale


def build_palette(groups):
    px = np.concatenate([f["img"][f["img"][..., 3] > 0][:, :3][::7] for fr in groups.values() for f in fr]).astype(int)
    base = Image.fromarray(px[None].astype(np.uint8)).quantize(COLORS - 1, method=Image.Quantize.MEDIANCUT)
    cols = np.array(base.getpalette()[:3 * (COLORS - 1)]).reshape(-1, 3)
    gold = px[(px[:, 0] > 200) & (px[:, 1] > 140) & (px[:, 2] < 50)]
    if len(gold):
        cols = np.vstack([cols, gold.mean(0).round()])
    blue = px[(px[:, 2] > 130) & (px[:, 2] - px[:, 0] > 40)]
    if len(blue):
        light = blue.sum(1) >= np.median(blue.sum(1))
        cols = np.vstack([cols, blue[light].mean(0).round(), blue[~light].mean(0).round()])
    pal = Image.new("P", (1, 1))
    pal.putpalette(cols.astype(int).flatten().tolist() + [0] * (768 - cols.size))
    return pal


def reduce(f, scale, pal):
    h, w = f.shape[:2]
    size = (max(1, round(w / scale)), max(1, round(h / scale)))
    a = (f[..., 3] > 0).astype(np.float32)
    prem = f[..., :3].astype(np.float32) * a[..., None]
    cov = np.array(Image.fromarray(a).resize(size, Image.Resampling.BOX))
    col = np.stack([np.array(Image.fromarray(prem[..., c]).resize(size, Image.Resampling.BOX)) for c in range(3)], -1)
    rgb = np.clip(col / np.maximum(cov[..., None], 1e-6), 0, 255).astype(np.uint8)
    q = np.array(Image.fromarray(rgb).quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB"))
    out = np.zeros((size[1], size[0], 4), np.uint8)
    out[..., :3] = q
    out[..., 3] = (cov >= 0.35) * 255
    return out


def place(groups, scales, pal):
    placed = {}
    for name, fr in groups.items():
        scale = scales[name]
        mb = np.median([f["bottom"] for f in fr])
        mcx = np.median([f["cx"] for f in fr])
        items = []
        for f in fr:
            bottom = mb if abs(f["bottom"] - mb) <= JITTER * scale / 3 else f["bottom"]
            shift = 0.0 if abs(f["cx"] - mcx) <= JITTER * scale / 3 else f["cx"] - mcx
            red = reduce(f["img"], scale, pal)
            ys, xs = np.where(red[..., 3] > 0)
            items.append(dict(
                img=red[ys.min():ys.max() + 1, xs.min():xs.max() + 1],
                dx=(f["cx"] - shift) / scale - xs.min(),
                dy=f["bottom"] / scale - ys.min(),
                lift=(mb - bottom) / scale,
            ))
        placed[name] = items
    return placed


def render(placed):
    boxes = [(-(i["lift"] + i["dy"]), -i["dx"], *i["img"].shape[:2]) for v in placed.values() for i in v]
    up = int(np.ceil(max(-t for t, _, _, _ in boxes))) + 1
    down = int(np.ceil(max(t + h for t, _, h, _ in boxes))) + 1
    half = int(np.ceil(max(max(-l, l + w) for _, l, _, w in boxes))) + 1
    width, height = 2 * half, up + down
    ground = height - down
    strips = {}
    for name, items in placed.items():
        strip = np.zeros((height, width * len(items), 4), np.uint8)
        for k, i in enumerate(items):
            top = int(round(ground - i["lift"] - i["dy"]))
            left = int(round(k * width + width / 2 - i["dx"]))
            h, w = i["img"].shape[:2]
            m = i["img"][..., 3] > 0
            strip[top:top + h, left:left + w][m] = i["img"][m]
        strips[name] = strip
    return (width, height), strips


def preview(path, size, strips, zoom=3):
    w, h = size
    cards = []
    for name, strip in strips.items():
        n = strip.shape[1] // w
        b64 = base64.b64encode((OUT_PNG / f"{name}.png").read_bytes()).decode()
        cards.append(
            f'<figure><div style="width:{w*zoom}px;height:{h*zoom}px;margin:auto;image-rendering:pixelated;'
            f'background:url(data:image/png;base64,{b64}) 0 0/{n*w*zoom}px {h*zoom}px no-repeat;'
            f'--end:-{(n-1)*w*zoom}px;animation:p {n/6:.2f}s steps({n},jump-none) infinite"></div>'
            f"<figcaption>{name} · {n} frames</figcaption></figure>")
    Path(path).write_text(
        "<!doctype html><meta charset=utf-8><title>Sprites</title><style>"
        "body{background:#f8fafc;font:14px system-ui;margin:24px}"
        ".g{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}"
        "figure{margin:0;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center}"
        "@keyframes p{to{background-position:var(--end) 0}}</style>"
        f'<div class=g>{"".join(cards)}</div>', encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview")
    args = ap.parse_args()

    groups, scales = {}, {}
    for sheet, names in SHEETS.items():
        g, scale = extract(np.array(Image.open(SRC / sheet).convert("RGBA")), sheet, names)
        groups.update(g)
        scales.update({n: scale for n in g})
    size, strips = render(place(groups, scales, build_palette(groups)))

    OUT_PNG.mkdir(parents=True, exist_ok=True)
    for old in OUT_PNG.glob("*.png"):
        if old.stem not in strips:
            old.unlink()
    for name, strip in strips.items():
        Image.fromarray(strip).save(OUT_PNG / f"{name}.png", optimize=True)
    digest = hashlib.sha1(b"".join(s.tobytes() for s in strips.values())).hexdigest()[:8]
    manifest = {"version": digest, "frameWidth": size[0], "frameHeight": size[1],
                "animations": {n: {"frames": s.shape[1] // size[0]} for n, s in strips.items()}}
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if args.preview:
        preview(args.preview, size, strips)
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
