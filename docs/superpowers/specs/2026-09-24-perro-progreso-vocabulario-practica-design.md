# Perro v3, Progreso, Mi vocabulario, mini test y modo escucha — diseño

Fecha: 2026-09-24 · Estado: implementado; falta aplicar la migración, sincronizar audio_url y desplegar

Pedido de Felipe (2026-09-24): rehacer la animación del perro con las hojas
nuevas y construir todas las funcionalidades propuestas: arreglar Progreso,
Mi vocabulario, calendario, mini test al final de la sesión, la franja del
perro y el modo escucha. Se suma conectar el audio de ElevenLabs ya generado.

## 1. Sprites v3

- Fuentes versionadas: `assets-src/companion/sheet-v3.webp` (las 8
  animaciones de siempre, redibujadas) y `extras-v3.webp` (`yawn`,
  `scratch`, `point`, `idea`). Reemplazan a `sheet.webp`.
- `scripts/sprites/build.py` se reescribe para este formato: una animación
  por fila, cuadros separados por transparencia (ya no vienen pegados), los
  brillos sueltos se asignan al cuadro más cercano, cada hoja tiene su propia
  escala (el perro sentado del primer cuadro mide 46 px) y se fuerzan dos
  índigos del pañuelo en la paleta (el median-cut los perdía).
- Cuadros rectangulares: el manifiesto pasa a `{ frameWidth, frameHeight }`.

| Animación | Cuadros | Uso nuevo |
|---|---|---|
| `yawn`, `scratch` | 5 | variación en reposo: tras 15–25 s en `idle`, una de las dos, una vez |
| `point` | 4 | mensajes del tutorial (apunta a la izquierda, hacia la tarjeta) |
| `idea` | 5 | pistas cuando te quedas pegado |

## 2. La franja del perro

Diseño aprobado en la conversación del 2026-09-24 (franja propia, globito
persistente, tutorial, saludo, mitad, pista a los 30 s, tocar para pronunciar).
Ajuste: el perro va a la **derecha** y el globito a su izquierda, porque
`point` apunta a la izquierda.

- Barra fija sobre la navegación, del ancho de la tarjeta (`max-w-lg`). El
  globito ocupa el resto y hace salto de línea; sin mensaje queda vacío.
- El globito ya no se cierra solo: se reemplaza por uno nuevo o se toca para cerrarlo.
- Tutorial una vez por cuenta: `user_stats.tutorial_done` (GET/PUT `/api/settings`).
  Mensajes: saludo, primera tarjeta de significado, primer revelado, primer
  hueco, primera oración propia. Mientras dura, tiene prioridad. Se marca al
  terminar la primera sesión.
- Saludo diario: "Hoy tienes N repasos y M palabras nuevas." Mitad: solo con 6+ tarjetas.
- Pegado 30 s: una pista por tarjeta (significado → botón; hueco → primera
  letra; oración → una colocación).
- Tocar al perro: pronuncia la palabra de la tarjeta (audio de ElevenLabs si
  existe, si no la voz del navegador). Sin tarjeta, saluda.

## 3. Audio de las palabras

- `lexemes.audio_url` (texto, nulo). Se llena con `/audio/words/<lemma>.mp3`
  para los lemas que tienen archivo en `public/audio/words/`.
- `get_study_session` la incluye en el JSON del lexema; `lexemeSchema` la agrega.
- `LexemeHeader`, el perro, Mi vocabulario y el modo escucha la usan.
- Atribución: "Voz de las palabras: ElevenLabs" en `CREDITS.md` y al pie de Progreso.

## 4. Progreso

`get_progress(p_user_id, p_tz default 'America/Santiago')` agrega:
- `levels`: palabras vistas por nivel 1–5.
- `due_tomorrow`: repasos que vencen mañana (día en la zona del usuario).
- `study_days`: `[{ day, n }]` de los últimos 35 días (repasos por día, desde `reviews`).

Pantalla:
1. Tarjeta de cobertura con una línea que la explica: "Una palabra cuenta
   cuando ya puedes escribir una oración con ella (nivel 4)".
2. Escalera de niveles: 5 barras con el nombre de cada nivel y su cantidad.
3. Pronóstico: "Mañana te tocan N repasos".
4. Calendario: 5 semanas, intensidad por cantidad de repasos, hoy marcado.
5. Lo existente (palabras por día, racha, errores frecuentes) + atribución.

El cliente envía su zona horaria (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
como `?tz=`; el servidor la valida contra un patrón simple y usa la de Chile si no calza.

## 5. Mi vocabulario (pestaña "Palabras")

- Navegación: Estudiar · Palabras · Progreso.
- `GET /api/vocab` → `get_vocabulary(p_user_id)`: palabras vistas (`reps > 0`),
  con lema, nivel, definición en español, audio, próxima fecha de repaso y
  una frase de ejemplo con su traducción.
- Buscador (inglés o español), filtro por nivel, fila expandible con la frase,
  botón de audio y "vuelve en …".
- Botón "Practicar escuchando" que abre el modo escucha.

## 6. Mini test al final de la sesión

- Al terminar la última tarjeta, antes del resumen: hasta 5 palabras de la
  sesión, "¿Qué significa *X*?" con 4 opciones (definiciones de otras
  palabras de la misma sesión). Se puede saltar.
- Solo aparece si la sesión tuvo 4 o más palabras distintas.
- Resultado a `/api/game/result` con modo `session_quiz`: las falladas
  adelantan su repaso (regla asimétrica existente); acertar no cambia nada.
- No toca la racha ni FSRS directamente.

## 7. Modo escucha

- Desde Palabras. 10 rondas con palabras vistas que tienen audio: suena la
  palabra y eliges entre 4 lemas escritos (distractores de tus otras palabras).
  Botón para repetir el audio. Necesita 4+ palabras con audio.
- Resultado a `/api/game/result` con modo `listening`, misma regla asimétrica.

## 8. Datos (una migración)

- `lexemes.audio_url`, `user_stats.tutorial_done boolean default false`.
- `game_sessions.mode` admite `session_quiz` y `listening`; `GAME_MODES` también.
- `get_study_session` con `audio_url`; `get_progress` con `p_tz`; `get_vocabulary` nueva.
- Compatibilidad: `get_progress(uuid)` sigue funcionando por el valor por defecto,
  así el Worker desplegado no se rompe si la migración se aplica antes del deploy.

## 9. Pruebas

- Unitarias: reglas nuevas de `lines.ts` (tutorial, saludo, mitad, pegado, tocar),
  store (globito persistente, variación en reposo), armado del mini test y del
  modo escucha (funciones puras), calendario (armado de semanas).
- Playwright con red simulada: franja visible sin tapar botones a 375 px,
  globito visible a los 10 s, tocar al perro pronuncia, tutorial y su PUT,
  Progreso (escalera, pronóstico, calendario), Palabras (búsqueda, filtro),
  mini test (aparece, se responde, envía el resultado, se puede saltar) y
  modo escucha (reproduce, responde, envía el resultado).
