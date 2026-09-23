# Acompañante corgi — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un corgi pixel art fijo en la esquina de la pestaña Estudiar que reacciona a aciertos, fallos, veredictos y subidas de nivel, y que en los fallos cita el dato del corpus (falso amigo, error típico, nota de uso).

**Architecture:** Un script de Python procesa la hoja que genera la IA y la convierte en tiras PNG más un manifest. En el cliente, `lines.ts` (función pura) decide qué animación correr y qué decir; `store.ts` (Zustand) maneja los tiempos; `Companion.tsx` dibuja con CSS `steps()`. Las tarjetas solo llaman a `emitCompanion(evento)`.

**Tech Stack:** React 19, Zustand 5, Tailwind 4, Vitest 3, Playwright 1.63, Python 3 + Pillow + numpy (solo el script).

**Spec:** `docs/superpowers/specs/2026-09-23-companion-perro-design.md`

**Reglas del repo que aplican a todas las tareas:**
- Sin commits: Felipe no autorizó commits ni ramas. Cada tarea termina con un checkpoint de verificación, no con `git commit`.
- Sin comentarios dentro del código: el porqué va en el spec.
- Node 24 aislado: anteponer `C:\Users\felipe.chavez\nodejs-24` al `PATH` en cada comando (`wrangler` y el dev server lo exigen; el Node global es el 20).
- `npm run typecheck` corre tres tsconfig separados; no se unifican (HANDOFF §5.7).

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `assets-src/companion/sheet.webp` | crear | original de la IA, versionado |
| `scripts/sprites/build.py` | crear | detección, corte, reducción, paleta, alineación, manifest y vista previa |
| `public/companion/*.png` | generar | 8 tiras horizontales |
| `src/client/companion/manifest.json` | generar | `frameSize` + frames por animación |
| `src/client/companion/animations.ts` | crear | fps/bucle y duración por animación |
| `src/client/companion/lines.ts` | crear | eventos, `react()` pura, textos |
| `src/client/companion/store.ts` | crear | estado, temporizadores, `emitCompanion` |
| `src/client/companion/Sprite.tsx` | crear | una animación con CSS |
| `src/client/companion/SpeechBubble.tsx` | crear | globito |
| `src/client/companion/Companion.tsx` | crear | composición, escala, precarga, respaldo |
| `src/client/index.css` | modificar | keyframe y movimiento reducido |
| `src/client/main.tsx` | modificar | montar `<Companion />` en Estudiar |
| `src/client/routes/Study.tsx` | modificar | `session_start`, `card_shown`, `leveled_up`, `session_done`, padding |
| `src/client/components/ClozeCard.tsx` | modificar | `answer` al elegir |
| `src/client/components/RecognitionCard.tsx` | modificar | `answer` al calificar |
| `src/client/components/ProductionCard.tsx` | modificar | `produce_pending`, `verdict`, `produce_failed` |
| `tests/unit/companion-lines.test.ts` | crear | reglas de `react()` |
| `tests/unit/companion-store.test.ts` | crear | temporizadores e interrupciones |
| `playwright.config.ts` | crear | dev server + chromium |
| `tests/e2e/companion.spec.ts` | crear | flujo con red simulada |
| `tsconfig.node.json` | modificar | incluir `playwright.config.ts` |

---

### Task 1: Pipeline de sprites

**Files:**
- Create: `assets-src/companion/sheet.webp` (copia de la imagen v2)
- Create: `scripts/sprites/build.py`
- Generate: `public/companion/*.png`, `src/client/companion/manifest.json`

- [ ] **Step 1: Copiar el original**

```bash
mkdir -p assets-src/companion && cp "<scratchpad>/images/2.webp" assets-src/companion/sheet.webp
```

- [ ] **Step 2: Escribir `scripts/sprites/build.py`**

```python
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
```

- [ ] **Step 3: Ejecutarlo**

Run: `python scripts/sprites/build.py assets-src/companion/sheet.webp --preview <scratchpad>/sprites/preview-repo.html`
Expected: `{"frameSize": 71, "animations": {"idle": {"frames": 4}, "talk": {"frames": 4}, "happy": {"frames": 4}, "oops": {"frames": 4}, "thinking": {"frames": 4}, "celebrate": {"frames": 5}, "wow": {"frames": 4}, "wave": {"frames": 5}}}` y 8 PNG en `public/companion/`.

- [ ] **Step 4: Checkpoint.** Comparar con los PNG aprobados del scratchpad. Deben coincidir en tamaño y frames. El prototipo centraba siempre cada frame en horizontal; la versión del repo solo conserva desvíos > 6 px (movimiento intencional), así que únicamente pueden diferir frames con un desplazamiento lateral real. Resultado con la hoja v2: idénticos (ningún frame supera los 6 px).

---

### Task 2: `animations.ts` y `lines.ts` (TDD)

**Files:**
- Create: `src/client/companion/animations.ts`
- Create: `src/client/companion/lines.ts`
- Test: `tests/unit/companion-lines.test.ts`

- [ ] **Step 1: Escribir `animations.ts`**

```ts
import manifest from "./manifest.json";

export type AnimName = "idle" | "talk" | "happy" | "oops" | "thinking" | "celebrate" | "wow" | "wave";

const TIMING: Record<AnimName, { fps: number; loop: boolean }> = {
  idle: { fps: 6, loop: true },
  talk: { fps: 8, loop: true },
  happy: { fps: 8, loop: false },
  oops: { fps: 6, loop: false },
  thinking: { fps: 4, loop: true },
  celebrate: { fps: 8, loop: false },
  wow: { fps: 6, loop: false },
  wave: { fps: 7, loop: false },
};

export interface Animation {
  name: AnimName;
  frames: number;
  fps: number;
  loop: boolean;
  durationMs: number;
  src: string;
}

export const FRAME_SIZE: number = manifest.frameSize;

export const ANIMATIONS = Object.fromEntries(
  (Object.keys(TIMING) as AnimName[]).map((name) => {
    const frames = manifest.animations[name].frames;
    const { fps, loop } = TIMING[name];
    return [name, { name, frames, fps, loop, durationMs: Math.round((frames / fps) * 1000), src: `/companion/${name}.png` }];
  }),
) as Record<AnimName, Animation>;
```

- [ ] **Step 2: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { FRESH_MEMORY, lineText, react, type CompanionEvent, type Memory } from "../../src/client/companion/lines.js";
import type { StudyCard, Verdict } from "../../src/shared/schemas.js";

const rng = () => 0;
const FF = { es_word: "actualmente", warning: "«Actualmente» se dice currently." };

function card(lexeme: Partial<StudyCard["lexeme"]> = {}): StudyCard {
  return {
    user_card_id: 1, mastery_level: 2, state: 1, reps: 2, is_new: false,
    lexeme: {
      id: 7, lemma: "actually", pos: "adverb", cefr: "A2", ipa: null,
      definition_en: "in fact", definition_es: "en realidad", usage_note: null,
      false_friend: null, collocations: [], common_errors: [], ...lexeme,
    },
    context: null,
  };
}

const miss = (c: StudyCard, kind: "cloze" | "recognition" = "cloze"): CompanionEvent =>
  ({ type: "answer", card: c, correct: false, kind });
const hit = (): CompanionEvent => ({ type: "answer", card: card(), correct: true, kind: "cloze" });

function verdict(over: Partial<Verdict>): Verdict {
  return {
    uses_target_correctly: true, grammatical: true, natural: true, grade: 3,
    native_version: "I actually like it.", feedback_es: "Bien.", error_tags: [], ...over,
  };
}

function run(events: CompanionEvent[], memory: Memory = FRESH_MEMORY) {
  const out = [];
  for (const e of events) {
    const r = react(e, memory, rng);
    memory = r.memory;
    out.push(r);
  }
  return out;
}

describe("react: fallos", () => {
  it("en hueco prioriza el falso amigo", () => {
    const r = react(miss(card({ false_friend: FF, common_errors: ["x"], usage_note: "y" })), FRESH_MEMORY, rng);
    expect(r.anim).toBe("oops");
    expect(r.line).toEqual(["Ojo: ", { em: "actually" }, " no es ", { em: "actualmente" }, ". «Actualmente» se dice currently."]);
  });

  it("sin falso amigo usa el error típico", () => {
    const r = react(miss(card({ common_errors: ["decir «actually» por «currently»"] })), FRESH_MEMORY, rng);
    expect(lineText(r.line!)).toBe("Error típico con actually: decir «actually» por «currently»");
  });

  it("sin error típico usa la nota de uso", () => {
    const r = react(miss(card({ usage_note: "Va al inicio o antes del verbo." })), FRESH_MEMORY, rng);
    expect(lineText(r.line!)).toBe("Pista: Va al inicio o antes del verbo.");
  });

  it("sin datos del corpus cae a una frase de respaldo no vacía", () => {
    const r = react(miss(card()), FRESH_MEMORY, rng);
    expect(lineText(r.line!).length).toBeGreaterThan(5);
  });

  it("en reconocimiento se salta el falso amigo, que ya está en la tarjeta", () => {
    const r = react(miss(card({ false_friend: FF, common_errors: ["x"] }), "recognition"), FRESH_MEMORY, rng);
    expect(lineText(r.line!)).toBe("Error típico con actually: x");
  });

  it("ninguna frase de fallo reprocha", () => {
    const cards = [card(), card({ false_friend: FF }), card({ common_errors: ["x"] }), card({ usage_note: "y" })];
    for (const value of [0, 0.34, 0.67, 0.99]) {
      for (const c of cards) {
        for (const kind of ["cloze", "recognition"] as const) {
          const text = lineText(react(miss(c, kind), FRESH_MEMORY, () => value).line!).toLowerCase();
          expect(text).not.toMatch(/\bmal\b|fallaste|error tuyo|otra vez fallaste/);
        }
      }
    }
  });
});

describe("react: aciertos", () => {
  it("habla en el primero de la sesión y cada 3 seguidos; un fallo reinicia", () => {
    const spoke = run([hit(), hit(), hit(), miss(card()), hit(), hit(), hit()]).map((r) => r.line !== null);
    expect(spoke).toEqual([true, false, true, true, false, false, true]);
  });

  it("todos los aciertos animan happy", () => {
    expect(run([hit(), hit()]).map((r) => r.anim)).toEqual(["happy", "happy"]);
  });

  it("la tercera seguida dice ¡Tres seguidas!", () => {
    expect(lineText(run([hit(), hit(), hit()])[2]!.line!)).toBe("¡Tres seguidas!");
  });

  it("session_start reinicia la memoria", () => {
    const [, , , r] = run([hit(), hit(), { type: "session_start" }, hit()]);
    expect(r!.line).not.toBeNull();
  });
});

describe("react: producción", () => {
  it("natural → wow", () => {
    const r = react({ type: "verdict", card: card(), verdict: verdict({}) }, FRESH_MEMORY, rng);
    expect([r.anim, lineText(r.line!)]).toEqual(["wow", "¡Sonaste nativo!"]);
  });

  it("gramatical pero no natural → talk", () => {
    const r = react({ type: "verdict", card: card(), verdict: verdict({ natural: false }) }, FRESH_MEMORY, rng);
    expect([r.anim, lineText(r.line!)]).toEqual(["talk", "Correcta, pero un nativo lo diría distinto. Mira abajo."]);
  });

  it("no gramatical → oops", () => {
    const r = react({ type: "verdict", card: card(), verdict: verdict({ natural: false, grammatical: false }) }, FRESH_MEMORY, rng);
    expect([r.anim, lineText(r.line!)]).toEqual(["oops", "Casi. Te dejé la corrección abajo."]);
  });

  it("produce_pending piensa y produce_failed vuelve a idle", () => {
    expect(react({ type: "produce_pending", card: card() }, FRESH_MEMORY, rng).anim).toBe("thinking");
    expect(react({ type: "produce_failed", card: card() }, FRESH_MEMORY, rng).anim).toBe("idle");
  });
});

describe("react: resto", () => {
  it("leveled_up celebra con la palabra en cursiva", () => {
    const r = react({ type: "leveled_up", card: card(), level: 3 }, FRESH_MEMORY, rng);
    expect(r.anim).toBe("celebrate");
    expect(r.line).toEqual(["¡", { em: "actually" }, " subió a nivel 3!"]);
  });

  it("session_done es sticky y cuenta la racha en singular y plural", () => {
    const one = react({ type: "session_done", correct: 4, total: 5, streak: 1 }, FRESH_MEMORY, rng);
    const many = react({ type: "session_done", correct: 4, total: 5, streak: 5 }, FRESH_MEMORY, rng);
    const none = react({ type: "session_done", correct: 4, total: 5, streak: null }, FRESH_MEMORY, rng);
    expect(one.sticky).toBe(true);
    expect(one.anim).toBe("wave");
    expect(lineText(one.line!)).toBe("4 de 5 bien · racha de 1 día. ¡Nos vemos!");
    expect(lineText(many.line!)).toContain("racha de 5 días");
    expect(lineText(none.line!)).toBe("4 de 5 bien. ¡Nos vemos!");
  });

  it("card_shown no cambia nada", () => {
    const r = react({ type: "card_shown", card: card() }, FRESH_MEMORY, rng);
    expect([r.anim, r.line]).toEqual([null, null]);
  });
});
```

- [ ] **Step 3: Verificar que falla**

Run: `npx vitest run tests/unit/companion-lines.test.ts`
Expected: FAIL, `Cannot find module .../companion/lines.js`

- [ ] **Step 4: Escribir `lines.ts`**

```ts
import type { StudyCard, Verdict } from "../../shared/schemas.js";
import type { AnimName } from "./animations.js";

export type Segment = string | { em: string };
export type Line = Segment[];

export type CompanionEvent =
  | { type: "session_start" }
  | { type: "card_shown"; card: StudyCard }
  | { type: "answer"; card: StudyCard; correct: boolean; kind: "recognition" | "cloze" }
  | { type: "produce_pending"; card: StudyCard }
  | { type: "produce_failed"; card: StudyCard }
  | { type: "verdict"; card: StudyCard; verdict: Verdict }
  | { type: "leveled_up"; card: StudyCard; level: number }
  | { type: "session_done"; correct: number; total: number; streak: number | null };

export interface Memory {
  correctStreak: number;
  spokeFirst: boolean;
}

export const FRESH_MEMORY: Memory = { correctStreak: 0, spokeFirst: false };

export interface Reaction {
  anim: AnimName | null;
  line: Line | null;
  sticky: boolean;
  memory: Memory;
}

export type Rng = () => number;

const FIRST_CORRECT: Line[] = [["¡Esa la tienes!"], ["¡Bien ahí!"], ["¡Eso!"]];
const FALLBACK_MISS: Line[] = [["Casi. Esta vuelve pronto."], ["Tranqui, la repasamos luego."], ["Se te escapó. Ya volverá."]];

export const lineText = (line: Line): string =>
  line.map((s) => (typeof s === "string" ? s : s.em)).join("");

function pick(options: Line[], rng: Rng): Line {
  return [...options[Math.min(options.length - 1, Math.floor(rng() * options.length))]!];
}

function missLine(card: StudyCard, kind: "recognition" | "cloze", rng: Rng): Line {
  const { lemma, false_friend, common_errors, usage_note } = card.lexeme;
  if (kind === "cloze" && false_friend) {
    return ["Ojo: ", { em: lemma }, " no es ", { em: false_friend.es_word }, `. ${false_friend.warning}`];
  }
  const error = common_errors[0];
  if (error) return ["Error típico con ", { em: lemma }, `: ${error}`];
  if (usage_note) return [`Pista: ${usage_note}`];
  return pick(FALLBACK_MISS, rng);
}

function say(anim: AnimName, line: Line, memory: Memory, sticky = false): Reaction {
  return { anim, line, sticky, memory };
}

function silent(anim: AnimName | null, memory: Memory): Reaction {
  return { anim, line: null, sticky: false, memory };
}

export function react(event: CompanionEvent, memory: Memory, rng: Rng): Reaction {
  switch (event.type) {
    case "session_start":
      return silent("idle", FRESH_MEMORY);
    case "card_shown":
      return silent(null, memory);
    case "produce_pending":
      return silent("thinking", memory);
    case "produce_failed":
      return silent("idle", memory);
    case "answer": {
      if (!event.correct) {
        return say("oops", missLine(event.card, event.kind, rng), { ...memory, correctStreak: 0 });
      }
      const streak = memory.correctStreak + 1;
      const next = { correctStreak: streak, spokeFirst: true };
      if (!memory.spokeFirst) return say("happy", pick(FIRST_CORRECT, rng), next);
      if (streak % 3 === 0) return say("happy", [`¡${streak === 3 ? "Tres" : streak} seguidas!`], next);
      return silent("happy", next);
    }
    case "verdict": {
      const { natural, grammatical } = event.verdict;
      if (natural) return say("wow", ["¡Sonaste nativo!"], memory);
      if (grammatical) return say("talk", ["Correcta, pero un nativo lo diría distinto. Mira abajo."], memory);
      return say("oops", ["Casi. Te dejé la corrección abajo."], memory);
    }
    case "leveled_up":
      return say("celebrate", ["¡", { em: event.card.lexeme.lemma }, ` subió a nivel ${event.level}!`], memory);
    case "session_done": {
      const { correct, total, streak } = event;
      const racha = streak ? ` · racha de ${streak} día${streak === 1 ? "" : "s"}` : "";
      return say("wave", [`${correct} de ${total} bien${racha}. ¡Nos vemos!`], memory, true);
    }
  }
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npx vitest run tests/unit/companion-lines.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Checkpoint:** `npm run typecheck` limpio.

---

### Task 3: `store.ts` (TDD)

**Files:**
- Create: `src/client/companion/store.ts`
- Test: `tests/unit/companion-store.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANIMATIONS } from "../../src/client/companion/animations.js";
import { bubbleMs, emitCompanion, resetCompanion, useCompanion } from "../../src/client/companion/store.js";
import type { StudyCard } from "../../src/shared/schemas.js";

const card: StudyCard = {
  user_card_id: 1, mastery_level: 2, state: 1, reps: 2, is_new: false,
  lexeme: {
    id: 7, lemma: "actually", pos: "adverb", cefr: "A2", ipa: null,
    definition_en: "in fact", definition_es: "en realidad", usage_note: null,
    false_friend: null, collocations: [], common_errors: [],
  },
  context: null,
};
const st = () => useCompanion.getState();
const hit = () => emitCompanion({ type: "answer", card, correct: true, kind: "cloze" });

beforeEach(() => {
  vi.useFakeTimers();
  resetCompanion(() => 0);
});
afterEach(() => vi.useRealTimers());

describe("companion store", () => {
  it("una animación de una vez vuelve a idle al terminar", () => {
    hit();
    vi.advanceTimersByTime(10_000);
    hit();
    expect(st().anim).toBe("happy");
    expect(st().line).toBeNull();
    vi.advanceTimersByTime(ANIMATIONS.happy.durationMs);
    expect(st().anim).toBe("idle");
  });

  it("con frase abierta, al terminar la animación pasa a talk y luego a idle", () => {
    emitCompanion({ type: "leveled_up", card, level: 3 });
    vi.advanceTimersByTime(ANIMATIONS.celebrate.durationMs);
    expect(st().anim).toBe("talk");
    vi.advanceTimersByTime(bubbleMs(st().line!));
    expect(st().line).toBeNull();
    expect(st().anim).toBe("idle");
  });

  it("un evento nuevo interrumpe al actual", () => {
    emitCompanion({ type: "answer", card, correct: false, kind: "cloze" });
    const before = st().playId;
    emitCompanion({ type: "leveled_up", card, level: 3 });
    expect(st().anim).toBe("celebrate");
    expect(st().playId).toBe(before + 1);
  });

  it("card_shown justo después de leveled_up no borra la celebración", () => {
    emitCompanion({ type: "leveled_up", card, level: 3 });
    emitCompanion({ type: "card_shown", card });
    expect(st().anim).toBe("celebrate");
    expect(st().line).not.toBeNull();
  });

  it("dismiss cierra el globito y deja de hablar", () => {
    emitCompanion({ type: "verdict", card, verdict: {
      uses_target_correctly: true, grammatical: true, natural: false, grade: 3,
      native_version: "x", feedback_es: "y", error_tags: [],
    } });
    expect(st().anim).toBe("talk");
    st().dismiss();
    expect(st().line).toBeNull();
    expect(st().anim).toBe("idle");
  });

  it("session_done no se cierra solo", () => {
    emitCompanion({ type: "session_done", correct: 3, total: 4, streak: 2 });
    vi.advanceTimersByTime(60_000);
    expect(st().line).not.toBeNull();
  });

  it("session_start cierra el globito y reinicia la memoria", () => {
    emitCompanion({ type: "session_done", correct: 3, total: 4, streak: 2 });
    hit();
    emitCompanion({ type: "session_start" });
    expect(st().line).toBeNull();
    hit();
    expect(st().line).not.toBeNull();
  });

  it("thinking se mantiene hasta el veredicto", () => {
    emitCompanion({ type: "produce_pending", card });
    vi.advanceTimersByTime(30_000);
    expect(st().anim).toBe("thinking");
  });

  it("la duración del globito está acotada entre 2,5 y 9 segundos", () => {
    expect(bubbleMs(["a"])).toBe(2545);
    expect(bubbleMs(["x".repeat(1000)])).toBe(9000);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run tests/unit/companion-store.test.ts`
Expected: FAIL, `Cannot find module .../companion/store.js`

- [ ] **Step 3: Escribir `store.ts`**

```ts
import { create } from "zustand";
import { ANIMATIONS, type AnimName } from "./animations.js";
import { FRESH_MEMORY, lineText, react, type CompanionEvent, type Line, type Memory, type Rng } from "./lines.js";

interface CompanionState {
  anim: AnimName;
  playId: number;
  line: Line | null;
  lineId: number;
  emit: (event: CompanionEvent) => void;
  dismiss: () => void;
}

export const bubbleMs = (line: Line): number =>
  Math.min(9000, Math.max(2500, 2500 + 45 * lineText(line).length));

let memory: Memory = FRESH_MEMORY;
let rng: Rng = Math.random;
let onceTimer: ReturnType<typeof setTimeout> | undefined;
let lineTimer: ReturnType<typeof setTimeout> | undefined;

export const useCompanion = create<CompanionState>((set, get) => {
  const rest = (): AnimName => (get().line ? "talk" : "idle");

  const play = (anim: AnimName) => {
    clearTimeout(onceTimer);
    onceTimer = undefined;
    set((s) => ({ anim, playId: s.playId + 1 }));
    const a = ANIMATIONS[anim];
    if (!a.loop) {
      onceTimer = setTimeout(() => {
        onceTimer = undefined;
        set((s) => ({ anim: rest(), playId: s.playId + 1 }));
      }, a.durationMs);
    }
  };

  const closeLine = () => {
    clearTimeout(lineTimer);
    lineTimer = undefined;
    set({ line: null });
    if (onceTimer === undefined && get().anim === "talk") play("idle");
  };

  return {
    anim: "idle",
    playId: 0,
    line: null,
    lineId: 0,
    emit: (event) => {
      if (event.type === "session_start") closeLine();
      const r = react(event, memory, rng);
      memory = r.memory;
      if (r.line) {
        clearTimeout(lineTimer);
        lineTimer = undefined;
        const line = r.line;
        set((s) => ({ line, lineId: s.lineId + 1 }));
        if (!r.sticky) lineTimer = setTimeout(closeLine, bubbleMs(line));
      }
      if (r.anim) play(r.anim === "idle" ? rest() : r.anim);
    },
    dismiss: closeLine,
  };
});

export const emitCompanion = (event: CompanionEvent): void => useCompanion.getState().emit(event);

export function resetCompanion(nextRng: Rng = Math.random): void {
  clearTimeout(onceTimer);
  clearTimeout(lineTimer);
  onceTimer = lineTimer = undefined;
  memory = FRESH_MEMORY;
  rng = nextRng;
  useCompanion.setState({ anim: "idle", playId: 0, line: null, lineId: 0 });
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run tests/unit/companion-store.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Checkpoint:** `npm test` (todos) y `npm run typecheck`.

---

### Task 4: Componentes de render

**Files:**
- Create: `src/client/companion/Sprite.tsx`, `SpeechBubble.tsx`, `Companion.tsx`
- Modify: `src/client/index.css` (al final)

- [ ] **Step 1: `Sprite.tsx`**

```tsx
import type { CSSProperties } from "react";
import { ANIMATIONS, FRAME_SIZE, type AnimName } from "./animations.js";

export function Sprite({ anim, scale }: { anim: AnimName; scale: number }) {
  const a = ANIMATIONS[anim];
  const size = Math.round(FRAME_SIZE * scale);
  const style = {
    width: size,
    height: size,
    backgroundImage: `url(${a.src})`,
    backgroundSize: `${a.frames * size}px ${size}px`,
    "--companion-end": `${-(a.frames - 1) * size}px`,
    animation: a.frames > 1
      ? `companion-play ${a.durationMs}ms steps(${a.frames}, jump-none) ${a.loop ? "infinite" : "1 forwards"}`
      : "none",
  } as CSSProperties;
  return <div className="companion-sprite" style={style} aria-hidden="true" data-anim={anim} />;
}
```

- [ ] **Step 2: `SpeechBubble.tsx`**

```tsx
import type { Line } from "./lines.js";

export function SpeechBubble({ line, onDismiss }: { line: Line; onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="companion-bubble pointer-events-auto relative max-w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white px-4 py-3 text-left text-sm leading-snug text-ink shadow-lg dark:border-white/10 dark:bg-slate-800 dark:text-paper"
    >
      {line.map((s, i) => (typeof s === "string" ? <span key={i}>{s}</span> : <em key={i}>{s.em}</em>))}
      <span
        aria-hidden="true"
        className="absolute -bottom-1.5 right-8 h-3 w-3 rotate-45 border-b border-r border-black/10 bg-white dark:border-white/10 dark:bg-slate-800"
      />
    </button>
  );
}
```

- [ ] **Step 3: `Companion.tsx`**

```tsx
import { useEffect, useState } from "react";
import { ANIMATIONS, type AnimName } from "./animations.js";
import { SpeechBubble } from "./SpeechBubble.js";
import { Sprite } from "./Sprite.js";
import { useCompanion } from "./store.js";

const WIDE = "(min-width: 640px)";

function useScale(): number {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const onChange = () => setWide(m.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);
  return wide ? 2 : 1.5;
}

function useMissing(): ReadonlySet<AnimName> {
  const [missing, setMissing] = useState<ReadonlySet<AnimName>>(() => new Set());
  useEffect(() => {
    for (const a of Object.values(ANIMATIONS)) {
      const img = new Image();
      img.onerror = () => setMissing((m) => new Set(m).add(a.name));
      img.src = a.src;
    }
  }, []);
  return missing;
}

export function Companion() {
  const { anim, playId, line, lineId, dismiss } = useCompanion();
  const scale = useScale();
  const missing = useMissing();
  if (missing.has("idle")) return null;

  return (
    <div
      data-testid="companion"
      className="pointer-events-none fixed right-3 z-20 flex flex-col items-end gap-2"
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
    >
      <div role="status" aria-live="polite" className="flex justify-end">
        {line && <SpeechBubble key={lineId} line={line} onDismiss={dismiss} />}
      </div>
      <Sprite key={playId} anim={missing.has(anim) ? "idle" : anim} scale={scale} />
    </div>
  );
}
```

- [ ] **Step 4: CSS al final de `src/client/index.css`**

```css
@keyframes companion-play {
  to { background-position: var(--companion-end) 0; }
}
.companion-sprite { image-rendering: pixelated; background-repeat: no-repeat; }
.companion-bubble { animation: card-in .18s ease-out; }

@media (prefers-reduced-motion: reduce) {
  .companion-sprite, .companion-bubble { animation: none !important; }
}
```

- [ ] **Step 5: Checkpoint:** `npm run typecheck`.

---

### Task 5: Conectar los eventos

**Files:** `src/client/main.tsx`, `src/client/routes/Study.tsx`, `src/client/components/ClozeCard.tsx`, `RecognitionCard.tsx`, `ProductionCard.tsx`

- [ ] **Step 1: `main.tsx`** — importar y montar junto a la pestaña:

```tsx
import { Companion } from "./companion/Companion.js";
```
```tsx
      {tab === "study" ? <Study /> : <Progress />}
      {tab === "study" && <Companion />}
```

- [ ] **Step 2: `Study.tsx`**

Import:
```tsx
import { emitCompanion } from "../companion/store.js";
```
Reemplazar el efecto de carga y agregar el de tarjeta mostrada (antes de los `return` tempranos):
```tsx
  useEffect(() => {
    if (!data) return;
    s.load(data.cards, data.warmup_count);
    emitCompanion({ type: "session_start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (current) emitCompanion({ type: "card_shown", card: current });
  }, [current]);
```
`onSuccess` del repaso:
```tsx
    onSuccess: (res, v) => {
      if (res.leveled_up) emitCompanion({ type: "leveled_up", card: v.card, level: res.mastery_level });
      s.advance(v.grade, res.leveled_up);
    },
```
Contenedor principal: `className="mx-auto max-w-lg px-4 pt-6 pb-36 sm:pb-48"`.
En `Summary`, contenedor `className="mx-auto max-w-lg px-4 pt-10 pb-48"` y el efecto:
```tsx
  useEffect(() => {
    const total = grades.length;
    api.post<{ current_streak: number }>("/api/session/complete", {})
      .then((r) => {
        setStreak(r.current_streak);
        emitCompanion({ type: "session_done", correct: aciertos, total, streak: r.current_streak });
      })
      .catch(() => {
        setStreak(null);
        emitCompanion({ type: "session_done", correct: aciertos, total, streak: null });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```
(Se conserva el comentario existente sobre la racha.)

- [ ] **Step 3: `ClozeCard.tsx`** — después de calcular `answer`:
```tsx
  const choose = (value: string) => {
    setPicked(value);
    emitCompanion({ type: "answer", card, correct: value === answer, kind: "cloze" });
  };
```
Reemplazar `onClick={() => setPicked(o)}` por `onClick={() => choose(o)}` y `<TypeAnswer onAnswer={setPicked} />` por `<TypeAnswer onAnswer={choose} />`. Import `emitCompanion`.

- [ ] **Step 4: `RecognitionCard.tsx`**
```tsx
  const grade = (g: number) => {
    emitCompanion({ type: "answer", card, correct: g >= 2, kind: "recognition" });
    onGrade(g);
  };
```
`<GradeButtons onGrade={grade} disabled={busy} />`. Import `emitCompanion`.

- [ ] **Step 5: `ProductionCard.tsx`** — `submit`:
```tsx
  async function submit() {
    setSending(true);
    setError(null);
    emitCompanion({ type: "produce_pending", card });
    try {
      const v = await api.post<Verdict>("/api/produce", {
        lexeme_id: card.lexeme.id,
        sentence: sentence.trim(),
      });
      setVerdict(v);
      emitCompanion({ type: "verdict", card, verdict: v });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo evaluar.");
      emitCompanion({ type: "produce_failed", card });
    } finally {
      setSending(false);
    }
  }
```
Import `emitCompanion`.

- [ ] **Step 6: Checkpoint:** `npm run typecheck && npm test`.

---

### Task 6: E2E con Playwright

**Files:** Create `playwright.config.ts`, `tests/e2e/companion.spec.ts`; Modify `tsconfig.node.json` (agregar `"playwright.config.ts"` a `include`).

- [ ] **Step 1: `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env");
} catch {}

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
```

- [ ] **Step 2: `tests/e2e/companion.spec.ts`**

```ts
import { expect, test, type Page } from "@playwright/test";

const ref = new URL(process.env.VITE_SUPABASE_URL ?? "https://ckjoklnmedodnrrqzqpk.supabase.co").hostname.split(".")[0];

const card = {
  user_card_id: 1, mastery_level: 2, state: 1, reps: 2, is_new: false,
  lexeme: {
    id: 7, lemma: "actually", pos: "adverb", cefr: "A2", ipa: null,
    definition_en: "in fact", definition_es: "en realidad", usage_note: null,
    false_friend: { es_word: "actualmente", warning: "«Actualmente» se dice currently." },
    collocations: [], common_errors: [],
  },
  context: {
    id: 11, text: "I actually like it.", gloss_es: "En realidad me gusta.", level: "A2",
    cloze_start: 2, cloze_end: 10, distractors: ["currently", "really", "already"],
    native_variant: null, audio_url: null,
  },
};

function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "e2e-token", refresh_token: "e2e-refresh", token_type: "bearer",
    expires_in: 3600, expires_at: now + 3600,
    user: {
      id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated",
      email: "e2e@palabro.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
    },
  };
}

async function setup(page: Page) {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: `sb-${ref}-auth-token`, value: JSON.stringify(fakeSession()) },
  );
  await page.route(/supabase\.co/, (r) => r.fulfill({ status: 200, json: {} }));
  await page.route("**/api/session/today", (r) => r.fulfill({ json: { cards: [card], warmup_count: 0, deferred: 0 } }));
  await page.route("**/api/review", (r) =>
    r.fulfill({ json: { due: new Date().toISOString(), mastery_level: 2, leveled_up: false, leveled_down: false } }));
  await page.route("**/api/session/complete", (r) => r.fulfill({ json: { current_streak: 3 } }));
  await page.goto("/");
}

const sprite = (page: Page) => page.getByTestId("companion").locator(".companion-sprite");

test("el perro aparece en la pestaña Estudiar", async ({ page }) => {
  await setup(page);
  await expect(page.getByTestId("companion")).toBeVisible();
  await expect(sprite(page)).toHaveAttribute("data-anim", "idle");
});

test("fallar un hueco muestra el falso amigo y no tapa Continuar", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setup(page);
  await page.getByRole("button", { name: "currently" }).click();
  await expect(page.getByRole("status")).toContainText("actualmente");
  await expect(sprite(page)).toHaveAttribute("data-anim", "oops");
  await page.screenshot({ path: "test-results/companion-mobile.png" });
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Sesión completa")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("racha de 3 días");
  await expect(sprite(page)).toHaveAttribute("data-anim", "wave");
});

test("con movimiento reducido el perro no se anima", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  await expect(sprite(page)).toHaveCSS("animation-name", "none");
});
```

- [ ] **Step 3: Correr**

Run (con Node 24 en el PATH): `npx playwright test`
Expected: 3 passed. Si la sesión falsa de Supabase no pasa el control de acceso (aparece el Login), revisar la clave de `localStorage` que usa supabase-js (`sb-<ref>-auth-token`) antes de tocar otra cosa.

- [ ] **Step 4: Validar a ojo `test-results/companion-mobile.png`**: perro a ×1.5 nítido, globito legible, sin tapar la tarjeta.

---

### Task 7: Verificación final y documentación

- [ ] `npm run typecheck` limpio · `npm test` todo verde · `npx playwright test` 3/3.
- [ ] Dev server: estudiar con las tarjetas simuladas en el panel del navegador y capturar pantalla (escritorio y 375 px).
- [ ] Spec: registrar las decisiones tomadas al escribir el plan (§3.1 `kind`, `session_start`, `produce_failed`; montaje en `main.tsx`; script único `build.py`).
- [ ] HANDOFF §2 "Pendiente": agregar el acompañante como hecho y la regla de regenerar sprites con `scripts/sprites/build.py`.
