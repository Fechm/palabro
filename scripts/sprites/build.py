"""Procesa la hoja de sprites del acompañante generada por IA.

Uso:
  python scripts/sprites/build.py assets-src/companion/sheet.webp [--normalizar] [--preview RUTA.html]

Requiere Pillow y numpy. Escribe public/companion/<anim>.png y
src/client/companion/manifest.json.
"""
import argparse
import base64
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT_PNG = ROOT / "public" / "companion"
OUT_MANIFEST = ROOT / "src" / "client" / "companion" / "manifest.json"
NAMES = ["idle", "talk", "happy", "oops", "thinking", "celebrate", "wow", "wave"]
SCALE, JITTER, COLORS = 3, 6, 24
MIN_BAND, GROUP_GAP, SPLIT_MIN = 100, 18, 400
MIN_W, MAX_W = 55, 110


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


def detect_groups(op):
    groups = []
    for y0, y1 in (b for b in runs(op.any(1), 4) if b[1] - b[0] >= MIN_BAND):
        for x0, x1 in runs(op[y0:y1 + 1].any(0), GROUP_GAP):
            groups.append((y0, y1 + 1, x0, x1))
    if len(groups) != len(NAMES):
        raise SystemExit(f"Se esperaban {len(NAMES)} grupos y se detectaron {len(groups)}: {groups}")
    return dict(zip(NAMES, groups))


def find_cuts(op, box):
    y0, y1, x0, x1 = box
    dens = np.convolve(op[y0:y1, x0:x1 + 1].sum(0).astype(float), np.ones(5) / 5, "same")
    best = None
    for n in range(3, 8):
        w = len(dens) / n
        cuts = []
        for k in range(1, n):
            c = int(k * w)
            lo, hi = max(0, c - int(w * 0.3)), min(len(dens), c + int(w * 0.3))
            cuts.append(lo + int(np.argmin(dens[lo:hi])))
        widths = np.diff([0] + cuts + [len(dens)])
        if widths.min() < MIN_W or widths.max() > MAX_W:
            continue
        score = float(np.mean([dens[c] for c in cuts]))
        if best is None or score < best[0] - 1:
            best = (score, cuts)
    if best is None:
        raise SystemExit(f"No se pudieron separar los frames del grupo en x={x0}..{x1}")
    return [x0 + c for c in best[1]]


def components(mask):
    lab = np.zeros(mask.shape, np.int32)
    n, (h, w) = 0, mask.shape
    for sy, sx in zip(*np.where(mask)):
        if lab[sy, sx]:
            continue
        n += 1
        stack = [(sy, sx)]
        lab[sy, sx] = n
        while stack:
            y, x = stack.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        stack.append((ny, nx))
    return lab, n


def split_frames(src, box, cuts):
    y0, y1, x0, x1 = box
    region = src[y0:y1, x0:x1 + 1].copy()
    region[region[..., 3] < 128] = 0
    edges = [0] + [c - x0 for c in cuts] + [x1 + 1 - x0]
    slot = np.searchsorted(edges, np.arange(region.shape[1]), side="right") - 1
    lab, n = components(region[..., 3] > 0)
    owner = np.full(lab.shape, -1, np.int32)
    for k in range(1, n + 1):
        ys, xs = np.where(lab == k)
        counts = np.bincount(slot[xs], minlength=len(edges) - 1)
        owner[ys, xs] = slot[xs] if np.sort(counts)[-2] > SPLIT_MIN else int(np.argmax(counts))
    frames = []
    for i in range(len(edges) - 1):
        keep = owner == i
        cols = np.where(keep.any(0))[0]
        f = region[:, cols.min():cols.max() + 1].copy()
        f[~keep[:, cols.min():cols.max() + 1]] = 0
        ys, xs = np.where(f[..., 3] > 0)
        body = ys >= ys.min() + (ys.max() - ys.min()) * 0.5
        r, g, b = (f[..., c].astype(int) for c in range(3))
        indigo = (f[..., 3] > 0) & (b > 150) & (b - r > 50) & (b - g > 40)
        ref = float(ys.max() - np.where(indigo)[0].min()) if indigo.any() else float(ys.max() - ys.min())
        frames.append(dict(img=f, bottom=float(ys.max()), cx=float(xs[body].mean()), ref=ref))
    return frames


def build_palette(groups):
    px = np.concatenate([f["img"][f["img"][..., 3] > 0][:, :3][::7] for fr in groups.values() for f in fr]).astype(int)
    base = Image.fromarray(px[None].astype(np.uint8)).quantize(COLORS - 1, method=Image.Quantize.MEDIANCUT)
    cols = np.array(base.getpalette()[:3 * (COLORS - 1)]).reshape(-1, 3)
    gold = px[(px[:, 0] > 200) & (px[:, 1] > 140) & (px[:, 2] < 50)]
    if len(gold):
        cols = np.vstack([cols, gold.mean(0).round()])
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


def place(groups, pal, normalize):
    ref_idle = np.median([f["ref"] for f in groups["idle"]])
    placed = {}
    for name, fr in groups.items():
        scale = SCALE * np.median([f["ref"] for f in fr]) / ref_idle if normalize else SCALE
        mb = np.median([f["bottom"] for f in fr])
        mcx = np.median([f["cx"] for f in fr])
        items = []
        for f in fr:
            bottom = mb if abs(f["bottom"] - mb) <= JITTER else f["bottom"]
            shift = 0.0 if abs(f["cx"] - mcx) <= JITTER else f["cx"] - mcx
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
    size = max(up + down, 2 * half)
    ground = size - down
    strips = {}
    for name, items in placed.items():
        strip = np.zeros((size, size * len(items), 4), np.uint8)
        for k, i in enumerate(items):
            top = int(round(ground - i["lift"] - i["dy"]))
            left = int(round(k * size + size / 2 - i["dx"]))
            h, w = i["img"].shape[:2]
            m = i["img"][..., 3] > 0
            strip[top:top + h, left:left + w][m] = i["img"][m]
        strips[name] = strip
    return size, strips


def preview(path, size, strips, zoom=3):
    cards = []
    for name, strip in strips.items():
        n = strip.shape[1] // size
        tmp = OUT_PNG / f"{name}.png"
        b64 = base64.b64encode(tmp.read_bytes()).decode()
        cards.append(
            f'<figure><div style="width:{size*zoom}px;height:{size*zoom}px;margin:auto;image-rendering:pixelated;'
            f'background:url(data:image/png;base64,{b64}) 0 0/{n*size*zoom}px {size*zoom}px no-repeat;'
            f'--end:-{(n-1)*size*zoom}px;animation:p {n/6:.2f}s steps({n},jump-none) infinite"></div>'
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
    ap.add_argument("sheet")
    ap.add_argument("--normalizar", action="store_true")
    ap.add_argument("--preview")
    args = ap.parse_args()

    src = np.array(Image.open(args.sheet).convert("RGBA"))
    op = src[..., 3] >= 128
    boxes = detect_groups(op)
    groups = {n: split_frames(src, b, find_cuts(op, b)) for n, b in boxes.items()}
    size, strips = render(place(groups, build_palette(groups), args.normalizar))

    OUT_PNG.mkdir(parents=True, exist_ok=True)
    for name, strip in strips.items():
        Image.fromarray(strip).save(OUT_PNG / f"{name}.png", optimize=True)
    manifest = {"frameSize": size, "animations": {n: {"frames": s.shape[1] // size} for n, s in strips.items()}}
    OUT_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if args.preview:
        preview(args.preview, size, strips)
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
