# Sesión de estudio: claridad, audio y límite diario — diseño

Fecha: 2026-09-24 · Estado: aprobado en conversación
Origen: feedback de la primera sesión real (Felipe, 2026-09-23).

## 1. Bug: cambiar de pestaña reinicia la sesión
`Study` llama a `s.load(...)` en un `useEffect([data])` que vuelve a correr cada vez que el
componente se monta, y `load` pone `index = 0`. Al ir a Progreso y volver, se pierde el avance.

**Regla:** solo se carga una sesión si no hay una en curso. Función pura
`shouldLoadSession(state) = state.cards.length === 0`. `reset()` (botón del resumen) deja
`cards = []`, así que el ciclo «terminar → ver si queda algo» sigue funcionando.

## 2 y 3. Tarjeta de reconocimiento
- Encabezado con la instrucción: «¿Qué significa *{lemma}* en esta frase?».
- **🔊** junto a la palabra y junto a la frase (§5).
- **IPA oculto** detrás del botón «Ver fonética», que alterna mostrar/ocultar.
- Al revelar se muestran: `definition_es` destacado, `gloss_es` como «La frase: …» y el
  aviso de falso amigo si existe. `definition_en` queda plegado bajo «Ver en inglés»
  (`<details>`).

## 4. Botones de nota con el intervalo
- `/api/session/today` agrega a cada tarjeta `next: { 1: ms, 2: ms, 3: ms, 4: ms }`, el tiempo
  hasta el próximo repaso según cada nota. Solo viajan esos intervalos, **nunca** el
  estado FSRS (regla §4.2 del HANDOFF).
- Se calculan con `scheduler.repeat()` de ts-fsrs usando un planificador **sin fuzz**. El
  repaso real sí usa fuzz, así que los intervalos largos se muestran aproximados («~»).
- `formatInterval(ms)` (pura): `< 1 h` → «en N min», `< 1 día` → «en N h», 1 día →
  «mañana», más → «en ~N días», ≥ 30 días → «en ~N meses».
- `GradeButtons` muestra el intervalo bajo cada etiqueta. En hueco y producción la nota es
  automática: el botón dice «Continuar · vuelve {intervalo}» con la nota ya calculada.

## 5. Audio
- `lib/audio.ts`: `canSpeak(audioUrl?)` y `speak(text, audioUrl?)`.
  - Si hay `audio_url`, reproduce el archivo con `new Audio(url)`.
  - Si no, usa `speechSynthesis` con `lang="en-US"` y `rate=0.9`, prefiriendo una voz
    en-US local.
  - Sin soporte y sin `audio_url` → el botón 🔊 no se muestra.
- La columna `contexts.audio_url` ya existe: pasar a audios pregrabados será llenarla,
  sin tocar la interfaz. La palabra suelta usa voz del navegador (no hay `audio_url` por lexema).

## 6. Palabras nuevas por día
- Migración: `user_stats.new_per_day smallint not null default 20 check (new_per_day in (5,10,20,30))`.
- **Registro:** campo «¿Cuántas palabras nuevas quieres por día?» (5/10/20/30, marcado 20).
  `registerSchema` gana `new_per_day`; `/api/auth/register` lo guarda en `user_stats`
  después de crear la cuenta.
- **Progreso:** selector con los mismos valores. `PUT /api/settings { new_per_day }`
  (autenticado, validado con Zod) actualiza `user_stats`.
- `/api/session/today` lee `new_per_day` y lo pasa como `p_new_limit`; `p_due_limit` sube
  de 20 a 200 para que no queden repasos fuera. Subir el límite a mitad del día agrega
  las palabras restantes en la próxima carga (la función ya descuenta las introducidas hoy).

## Fuera de alcance
Mini test al final de la sesión: irá como minijuego en un diseño aparte, con la regla
asimétrica §4.4 (acertar no extiende el intervalo; fallar lo adelanta).

## Pruebas
- Unitarias: `formatInterval`, `shouldLoadSession`, intervalos por nota (orden creciente
  1 < 2 < 3 < 4 y sin exponer el estado), esquema con `new_per_day`.
- Playwright (API simulada): ir a Progreso y volver mantiene la tarjeta actual; los
  botones muestran intervalos; «Ver fonética» alterna el IPA; «Ver en inglés» está plegado;
  el registro envía `new_per_day`; el selector de Progreso llama a `PUT /api/settings`.
- Real: estudiar varias tarjetas en producción y verificar el límite en la base.
