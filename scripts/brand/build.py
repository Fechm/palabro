"""Genera los recursos de marca desde el logo original.

Uso: python scripts/brand/build.py
Entrada: assets-src/brand/logo-palabro.png (fondo transparente)
Salida en public/: logo-light.png, logo-dark.png, favicon-32.png, favicon.ico,
apple-touch-icon.png, icon-192.png, icon-512.png
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-src" / "brand" / "logo-palabro.png"
OUT = ROOT / "public"
NAVY = np.array([19, 31, 64])
PAPER = np.array([248, 250, 252])
INK = (15, 23, 42, 255)
GAP_MIN = 10


def content_box(alpha):
    ys, xs = np.where(alpha > 40)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def icon_split(alpha, x0, x1):
    cols = (alpha > 40).any(0)
    run = None
    for x in range(x0, x1):
        if not cols[x]:
            run = x if run is None else run
        elif run is not None and x - run > GAP_MIN:
            return run
        else:
            run = None
    raise SystemExit("No se encontró el hueco entre el ícono y el texto")


def recolor_text(img):
    a = np.array(img).astype(float)
    dist = np.linalg.norm(a[..., :3] - NAVY, axis=-1)
    navy_like = (dist < 60) & (a[..., 3] > 0)
    a[navy_like, :3] = PAPER
    return Image.fromarray(a.astype(np.uint8))


def square(img, size, pad_ratio, background=None):
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    inner = round(size * (1 - 2 * pad_ratio))
    icon = canvas.resize((inner, inner), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    out.alpha_composite(icon, ((size - inner) // 2, (size - inner) // 2))
    return out


def main():
    logo = Image.open(SRC).convert("RGBA")
    alpha = np.array(logo)[..., 3]
    x0, y0, x1, y1 = content_box(alpha)
    logo = logo.crop((x0, y0, x1, y1))
    split = icon_split(np.array(logo)[..., 3], 0, logo.width)
    icon = logo.crop((0, 0, split, logo.height))
    icon = icon.crop(content_box(np.array(icon)[..., 3]))

    width = 720
    light = logo.resize((width, round(logo.height * width / logo.width)), Image.Resampling.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    light.save(OUT / "logo-light.png", optimize=True)
    recolor_text(light).save(OUT / "logo-dark.png", optimize=True)

    square(icon, 32, 0.02).save(OUT / "favicon-32.png", optimize=True)
    square(icon, 64, 0.02).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    square(icon, 180, 0.14, INK).save(OUT / "apple-touch-icon.png", optimize=True)
    square(icon, 192, 0.14, INK).save(OUT / "icon-192.png", optimize=True)
    square(icon, 512, 0.14, INK).save(OUT / "icon-512.png", optimize=True)
    print(f"logo {logo.size} · ícono {icon.size} · salida en {OUT}")


if __name__ == "__main__":
    main()
