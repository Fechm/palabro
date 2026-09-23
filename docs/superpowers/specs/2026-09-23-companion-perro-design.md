# Acompañante: Palabro, el corgi — diseño

Fecha: 2026-09-23 · Estado: **implementado** (plan: `docs/superpowers/plans/2026-09-23-companion-perro.md`)

## 1. Qué es y qué no es

Un corgi pixel art fijo en una esquina de la pantalla de estudio, siempre
animado, que **reacciona** a lo que hace el usuario (espejo emocional) y, en
los momentos que lo valen, **dice una frase corta** con información real
de la palabra (compañero con voz).

Es coherente con la tesis del proyecto (HANDOFF §4.10): la motivación sale
del aprendizaje real, no de la culpa. Por eso:

- Un fallo **nunca** produce reproche. El perro ladea la cabeza, no se entristece.
- No hay mensajes de "te extraño", ni notificaciones, ni presión por la racha.
- No afecta a FSRS, a la nota ni a la racha. Es pura presentación.

Fuera de alcance: sonido, evolución del personaje según el progreso,
aparecer fuera de la pestaña Estudiar, frases generadas por IA con llamadas nuevas.

## 2. Assets

### 2.1 Origen y proceso
Los sprites se generan con una IA de imagen (prompts en la conversación del
2026-09-23) y se procesan con un script propio, porque llegan con defectos
sistemáticos: frames pegados, tamaños desiguales, temblor de posición,
etiquetas de texto y bordes suavizados.

- `assets-src/companion/sheet.webp` — imagen original de la IA, versionada,
  para que el proceso sea reproducible.
- `scripts/sprites/build.py` (un solo script) — detecta las bandas y los 8 grupos por
  transparencia (las etiquetas quedan en bandas propias de altura < 100 px y
  se descartan), calcula los cortes entre frames buscando el valle de densidad y, por cada grupo:
  - asigna cada **pieza conectada completa** al frame donde cae su masa; solo
    corta con línea vertical una pieza que ocupe dos frames de verdad (> 400 px en ambos);
  - reduce ×3 promediando solo píxeles opacos, con una cobertura ≥ 35% como pixel opaco;
  - aplica **una paleta común** de 24 colores (23 por median-cut + el dorado
    de los brillos, detectado por azul < 50, que es lo único que lo separa del pelaje);
  - alinea al suelo y al centro del cuerpo, anulando desvíos ≤ 6 px (temblor)
    y conservando los mayores (el salto de `celebrate` o un desplazamiento lateral real);
  - normaliza el tamaño entre animaciones solo si se pide (`--normalizar`); por defecto la
    escala es uniforme (ver §8).
- Salida: `public/companion/<anim>.png` (tira horizontal) +
  `src/client/companion/manifest.json` con `{ frameSize, animations: { <anim>: { frames } } }`.
- Requisitos del script: Python 3 + Pillow + numpy. Se corre a mano, solo
  cuando llegan assets nuevos; no es parte del build ni del CI.

### 2.2 Resultado actual (imagen v2)
Frame de 71×71 px, con el perro de ~46 px de alto (el margen es para el
salto y los brillos).

| Animación | Frames | fps | Tipo | Uso |
|---|---|---|---|---|
| `idle` | 4 | 6 | bucle | estado por defecto |
| `talk` | 4 | 8 | bucle | mientras el globito está abierto |
| `happy` | 4 | 8 | una vez | acierto |
| `oops` | 4 | 6 | una vez | fallo |
| `thinking` | 4 | 4 | bucle | esperando el veredicto del modelo |
| `celebrate` | 5 | 8 | una vez | la palabra sube de nivel |
| `wow` | 4 | 6 | una vez | veredicto `natural: true` |
| `wave` | 5 | 7 | una vez | fin de sesión |

Los fps y el tipo son decisiones de diseño y viven en `animations.ts`; el
número de frames y el tamaño vienen del manifest.

## 3. Arquitectura

```
src/client/companion/
  manifest.json      generado por build.py
  animations.ts      fps y bucle por animación + tipos
  lines.ts           FUNCIÓN PURA: (evento, contexto) -> { anim, line | null }
  store.ts           Zustand: animación actual, frase actual, contador de aciertos
  Companion.tsx      sprite + globito, posicionado fijo
  Sprite.tsx         una animación con CSS steps()
  SpeechBubble.tsx   el globito
```

Principio: **las tarjetas emiten eventos, no saben que el perro existe.**
Emiten con `companion.emit(evento)`. Si mañana se quita el perro, se borra
`<Companion />` de `main.tsx` (se monta ahí y no en `Study.tsx`, que tiene cinco `return` distintos) y las llamadas a `emit` quedan inertes.

### 3.1 Eventos

```ts
type CompanionEvent =
  | { type: "session_start" }
  | { type: "card_shown"; card: StudyCard }
  | { type: "answer"; card: StudyCard; correct: boolean; kind: "recognition" | "cloze" }
  | { type: "produce_pending"; card: StudyCard }
  | { type: "produce_failed"; card: StudyCard }
  | { type: "verdict"; card: StudyCard; verdict: Verdict }
  | { type: "leveled_up"; card: StudyCard; level: number }
  | { type: "session_done"; correct: number; total: number; streak: number | null };
```

| Evento | Quién lo emite | En qué momento |
|---|---|---|
| `session_start` | `Study.tsx` | al llegar la sesión del día (reinicia la memoria y cierra el globito) |
| `card_shown` | `Study.tsx` | al cambiar la tarjeta actual |
| `answer` (hueco) | `ClozeCard` | **al elegir o teclear la respuesta**, no al pulsar Continuar (el feedback tiene que coincidir con la revelación) |
| `answer` (reconocimiento) | `RecognitionCard` | al pulsar una nota; `correct = grade >= 2` ("Difícil" es recordar con esfuerzo, no fallar; solo "Otra vez" es fallo) |
| `produce_pending` | `ProductionCard` | al enviar la oración |
| `verdict` | `ProductionCard` | al recibir el veredicto |
| `produce_failed` | `ProductionCard` | si `/api/produce` falla; sin esto el perro se quedaría en `thinking` para siempre |
| `leveled_up` | `Study.tsx` | en `onSuccess` del repaso, si `res.leveled_up` (con `res.mastery_level`) |
| `session_done` | `Summary` | al recibir la racha de `/api/session/complete` |

### 3.2 `lines.ts` — la lógica, pura y testeable

`react(event, state, rng) -> { anim, line | null, sticky }`, donde `state`
guarda los aciertos seguidos y `rng` se inyecta para que los tests sean deterministas.

| Evento | Animación | Frase |
|---|---|---|
| `card_shown` | `idle` si no corre otra animación | ninguna; **no** cierra el globito (ver §3.3) |
| `answer` correcto | `happy` | solo en el **primer acierto de la sesión** y cada **3 aciertos seguidos**; frase del banco (p. ej. "¡Esa la tienes!", "¡Tres seguidas!") |
| `answer` incorrecto | `oops` | **dato del corpus**, primer disponible: 1) falso amigo (**solo en hueco**: `RecognitionCard` ya lo muestra al revelar) → "Ojo: *{lemma}* no es *{es_word}*. {warning}"; 2) `common_errors[0]`; 3) `usage_note`; 4) frase de respaldo del banco ("Casi. Esta vuelve pronto.") |
| `produce_pending` | `thinking` (bucle) | ninguna |
| `verdict` natural | `wow` | "¡Sonaste nativo!" |
| `verdict` gramatical, no natural | `talk` | "Correcta, pero un nativo lo diría distinto. Mira abajo." |
| `verdict` no gramatical | `oops` | "Casi. Te dejé la corrección abajo." |
| `leveled_up` | `celebrate` | "¡*{lemma}* subió a nivel {level}!" |
| `session_done` | `wave` | "{correct} de {total}" + " · racha de {n} días" si hay racha |

Decisión respecto a lo conversado: en producción el perro **no** repite
`feedback_es`, porque `ProductionCard` ya lo muestra completo y el globito lo
duplicaría. El perro resume el veredicto y apunta a la tarjeta.

Los textos van en español; las palabras en inglés, en cursiva
(`<em>`). El banco de frases de respaldo tiene 2–4 variantes por evento, elegidas con `rng`.

### 3.3 Reglas de reproducción (`store.ts`)
- Una animación de "una vez" termina en su último frame y vuelve a `idle`
  (o a `talk` si hay una frase abierta).
- Un evento nuevo **interrumpe** al actual: gana el más reciente.
- Mientras hay frase abierta y no corre una animación de "una vez", la animación es `talk`.
- El globito se cierra solo a los `clamp(2500 + 45 ms × caracteres, 2500, 9000)` ms,
  al tocarlo o cuando llega una frase nueva. `sticky` (solo `session_done`) no se cierra solo.
- `card_shown` **no** cierra el globito: `leveled_up` se emite en el mismo
  `onSuccess` que avanza a la siguiente tarjeta, y cerrarlo ahí borraría la
  celebración en el mismo instante en que aparece. Por la misma razón, el falso
  amigo de un fallo sigue visible unos segundos sobre la tarjeta siguiente.

## 4. Render

- `Sprite.tsx`: un `div` con la tira como `background-image`,
  `image-rendering: pixelated` y animación `steps(N, jump-none)` hacia
  `-(N-1) × ancho`. **No** usar `steps(N)` hacia `-N × ancho` con `forwards`:
  deja el fondo una posición después del último frame y la animación de
  "una vez" termina en blanco (bug detectado en la vista previa).
- Fin de una animación de "una vez": `onAnimationEnd` avisa al store.
- Los PNG se precargan al montar el componente.
- Escala: **×2 (142 px) desde 640 px de ancho, ×1.5 (106 px) en móvil**. Se
  prefieren escalas enteras, pero ×1 queda demasiado chico; ×1.5 se valida
  visualmente con captura en Playwright antes de darlo por bueno.

## 5. Pantalla

- Solo en la pestaña **Estudiar** (sesión en curso, resumen y estado "sin tarjetas pendientes", donde queda en `idle`).
- Posición `fixed`, esquina inferior derecha, **por encima de la barra de
  navegación inferior** (que también es `fixed`), con margen de seguridad
  para el área segura del iPhone (`env(safe-area-inset-bottom)`).
- El globito se abre **hacia arriba y hacia la izquierda** del perro, con un ancho máximo de
  `min(18rem, 100vw - 2rem)`, para no tapar los botones de respuesta.
- `pointer-events` solo en el perro y el globito: el resto de la esquina no
  bloquea clics sobre la tarjeta.

## 6. Accesibilidad y bordes

- `prefers-reduced-motion: reduce` → primer frame de `idle` fijo; el globito
  sigue funcionando.
- El sprite es decorativo (`aria-hidden="true"`). El globito es
  `role="status"` con `aria-live="polite"`: el falso amigo le llega al lector de pantalla.
- Si una animación falla al cargar, se usa `idle`; si falla `idle`, el
  componente no se renderiza. La app nunca se rompe por un asset.
- Contraste del globito: texto `ink` sobre `paper`, con borde; también en modo oscuro.

## 7. Pruebas

**Unitarias (vitest, `tests/unit/companion-lines.test.ts`)** sobre `lines.ts`:
- prioridad del dato del corpus en el fallo: falso amigo > error típico > nota de uso > respaldo;
- sin datos del corpus → frase de respaldo, nunca `null` ni un texto vacío;
- el acierto habla solo en el primero de la sesión y cada 3 seguidos, y un fallo reinicia el contador;
- reconocimiento con nota 2 cuenta como acierto;
- los 3 casos del veredicto;
- `leveled_up` y `session_done` con y sin racha;
- ninguna frase de fallo contiene palabras de reproche (lista negra simple: "mal", "error tuyo", "otra vez fallaste").

**Unitarias del store**: interrupción por evento nuevo, vuelta a `idle`/`talk`, cierre del globito, y que `card_shown` justo después de `leveled_up` no borre la celebración.

**E2E (Playwright, `tests/e2e/companion.spec.ts`)**, con red simulada:
- `page.route` responde `/api/session/today`, `/api/review`, `/api/produce` y
  `/api/session/complete` con datos de prueba, así que no hace falta un token real;
- se siembra una sesión falsa de Supabase en `localStorage` (con `expires_at`
  futuro) para pasar el control de acceso del cliente;
- casos: el perro aparece; fallar un hueco de una palabra con falso amigo
  muestra ese falso amigo en el globito; con `reducedMotion: "reduce"` no hay animación;
  captura a 375 px de ancho para validar la escala ×1.5 y que no tape los botones.
- `playwright.config.ts` levanta (o reutiliza) el dev server y usa el **Chrome instalado** (`channel: "chrome"`): Playwright 1.63 pide un Chromium que no estaba descargado y así no hace falta bajar nada.

## 8. Decisiones y trampas registradas

1. **Escala uniforme por defecto.** Se probaron tres referencias para igualar
   el tamaño entre animaciones (altura contigua del cuerpo, del pañuelo al suelo,
   ancho del pañuelo) y todas fallan en algún caso: brillos pegados a las orejas,
   patas estiradas en el salto, cabeza ladeada. En la imagen v2 la IA dibujó todo al
   mismo tamaño. Si una imagen futura no lo hace, se regenera antes que forzar la escala.
2. **El fondo de la IA venía transparente de verdad** (RGBA), no pintado. Si una imagen
   futura trae fondo pintado, se pide magenta plano `#FF00FF` y se añade al script.
3. **Dorado vs. naranjo:** el dorado de los brillos `(238,169,18)` y el pelaje
   `(232,162,90)` casi solo se distinguen por el canal azul.
4. **`steps()`**: ver §4.
