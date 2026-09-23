# Palabro — contexto de traspaso

> **Para quien lee esto:** eres una sesión de Claude con acceso directo al
> código. Este proyecto se construyó en una sesión remota (contenedor en la
> nube) que no podía tocar el disco del usuario. Aquí está todo lo que
> necesitas para continuar sin repetir trabajo ni deshacer decisiones.
>
> Fecha del traspaso: 2026-09-23 · 5 commits · 66 archivos

---

## 1. Qué es esto

App para aprender inglés, para **un grupo cerrado de 10 personas
hispanohablantes**. No es Duolingo: la tesis del proyecto es que las apps de
idiomas entrenan **reconocimiento** y no **producción**, y que ahí está el
fallo. Reconocer `ubiquitous` en una lista es trivial; usarla en una frase
propia es lo que la fija.

Cada palabra sube por cinco niveles de dominio:

| Nivel | Qué pide | Estado |
|---|---|---|
| 1 | Ves la frase, deduces el significado | ✅ implementado |
| 2 | Hueco en la frase original | ✅ implementado |
| 3 | Hueco en una frase nueva | ✅ implementado |
| 4 | **Escribes tu propia oración** (la evalúa un modelo) | ✅ implementado |
| 5 | Escuchas y respondes hablando | ❌ pendiente |

**Restricción dura del proyecto: coste cero.** Todo vive en capas gratuitas.
No introduzcas nada de pago sin preguntar al usuario.

---

## 2. Estado actual, sin adornos

### Verificado de verdad
- **Esquema aplicado en Postgres 17 real** (proyecto Supabase `ckjoklnmedodnrrqzqpk`).
  8 tablas, todas con RLS. Prueba funcional end-to-end ejecutada dentro de una
  transacción con rollback: trigger, sesión, repaso, progreso, racha y la regla
  de los minijuegos.
- **API arrancada con `wrangler dev`**: health 200, sin token 401, token
  manipulado 401, token válido llega a la capa de datos, body inválido 400.
- **Generación de corpus probada contra la API de Gemini**: 20 palabras,
  20 válidas.
- **Cliente abierto en Chromium real con Playwright**: renderiza, cero errores
  de consola, el flujo de magic link llega a la confirmación.
- `npm run typecheck` limpio en los tres entornos · **55/55 tests** · **3/3 E2E**.

### NO verificado
- **Nadie ha estudiado una tarjeta real.** La base está vacía: hasta que se
  genere y siembre el corpus, la app muestra "no tienes tarjetas pendientes".
- La evaluación de producción (`/api/produce`) nunca se ha ejercitado
  extremo a extremo con un usuario autenticado real.
- Nunca se ha desplegado a Cloudflare.
- Los workflows de GitHub Actions nunca han corrido.

### Pendiente, en orden de prioridad
1. **Generar y sembrar el corpus** — desbloquea todo lo demás. La lista ya está
   corregida (trampa 14); falta que Gemini responda: el 2026-09-23 todos los modelos
   Flash devolvían 503 en el free tier.
2. **Probar el loop completo** con un usuario real. Aquí van a salir cosas.
3. **Desplegar** a Cloudflare Workers.
4. Nivel 5 (audio): Whisper en Workers AI para la parte oral.
5. Los seis minijuegos: la API los acepta (`POST /api/game/result`), la
   interfaz no existe. Empezar por **contrarreloj** (solo SQL, sin IA) y
   **¿nativo o no?** (usa `contexts.native_variant`, ya en el corpus).
6. TTS precomputado a R2 para `contexts.audio_url`.

### Hecho después del traspaso (2026-09-23)
- **Acompañante corgi** en la pestaña Estudiar: reacciona a aciertos, fallos,
  veredictos y subidas de nivel, y en los fallos cita el falso amigo / error
  típico / nota de uso del corpus. Diseño en
  `docs/superpowers/specs/2026-09-23-companion-perro-design.md`.
  Sprites: la IA genera la hoja → `python scripts/sprites/build.py assets-src/companion/sheet.webp`
  → `public/companion/*.png` + `src/client/companion/manifest.json`. **Nunca editar los PNG a mano.**

---

## 3. Arquitectura

Un solo despliegue: el mismo Worker sirve el front estático y `/api/*`.
Sin CORS, sin dos URLs, sin dos pipelines.

```
navegador (PWA)
      |
      v
Cloudflare Worker ---- GET /*     -> assets estáticos (no se facturan)
                  \--- /api/*     -> Hono
                          |
              +-----------+-----------+
              v                       v
        Supabase                 Modelo (free tier)
        Postgres + Auth          Gemini Flash -> Workers AI
```

### Mapa de archivos

```
src/
  shared/           <- el que más importa: contratos Zod compartidos
    schemas.ts        cliente, servidor y modelo usan LOS MISMOS esquemas
    mastery.ts        progresión de dominio (con tests)
  server/           <- Hono sobre Workers
    index.ts          montaje de rutas + handler del cron
    middleware/auth   verifica el JWT de Supabase contra su JWKS (ES256, firma local, ~1ms)
    routes/           session, review, produce, explain, progress, game
    ai/               gemini.ts -> workers-ai.ts (cascada), prompts.ts
    fsrs.ts           puente entre las filas de Postgres y ts-fsrs
    session-builder   función PURA que arma la cola del día (con tests)
    scheduled.ts      cron: keep-alive de Supabase + pendientes
  client/           <- React 19 + Vite
    main.tsx          auth gate + navegación por pestañas
    routes/           Study.tsx, Progress.tsx
    components/       RecognitionCard, ClozeCard, ProductionCard, Login
    store/session.ts  Zustand: cola en curso, índice, notas dadas
    lib/              supabase.ts (SOLO auth), api.ts (fetch con JWT)
corpus/             <- se ejecuta una vez, offline
  build-wordlist.ts   construye la lista de 2.800 palabras
  generate.ts         lotes de 10, checkpoint, reanudable
  validate.ts         valida y calcula los huecos
  seed.ts             siembra en Supabase
  data/wordlist.csv   YA GENERADA, versionada
supabase/migrations/  5 migraciones, TODAS aplicadas en el proyecto real
```

### Stack

| Capa | Elección | Por qué |
|---|---|---|
| Front | React 19 · Vite 7 · Tailwind 4 · PWA | instalable en el móvil |
| API | Hono sobre Cloudflare Workers | sin cold start, edge, gratis |
| Datos | Supabase, SQL plano + RPC, **sin ORM** | 8 tablas; un ORM no paga |
| Repaso | ts-fsrs 5.4 | implementación de referencia de FSRS |
| IA | Gemini Flash -> Workers AI | ambos free tier |

---

## 4. Decisiones de diseño — NO las deshagas sin entenderlas

Estas son las que más cuestan de recuperar si se rompen.

### 4.1 FSRS y `mastery_level` son ejes ortogonales
> **FSRS decide CUÁNDO aparece una tarjeta. `mastery_level` decide QUÉ te
> pregunta cuando aparece.**

Mezclarlos rompe una de las dos cosas: o el algoritmo de repaso (que asume que
la pregunta es siempre la misma) o la progresión pedagógica. Están en columnas
separadas de `user_cards` a propósito.

### 4.2 El estado FSRS NO viaja al cliente
`/api/session/today` lo elimina de la respuesta. Se recalcula en el servidor al
recibir el repaso. Si viajara al navegador, cualquiera lo manipularía desde la
consola y el log de `reviews` dejaría de servir para nada.

### 4.3 `reviews` es append-only y guarda `state_before`
Nunca se actualiza ni se borra. `state_before` es el snapshot FSRS previo al
repaso: permite **recalcular toda la historia** si algún día se cambia de
versión de FSRS o se optimizan parámetros. Sin esa columna, mejorar el
algoritmo obligaría a empezar de cero.

### 4.4 Regla asimétrica de los minijuegos
```
Acertar en un juego  -> NO extiende el intervalo
Fallar en un juego   -> SÍ adelanta el `due`
```
Adelantar repasos futuros degrada FSRS: responder bien una tarjeta programada
para dentro de 10 días no aporta señal. Por eso los juegos **solo pueden
empeorar tu agenda, nunca mejorarla**. Implementado en `penalize_from_game`.
Los juegos escriben en `game_sessions`, **jamás** en `reviews`.

### 4.5 El prompt inyecta el corpus precomputado
`src/server/ai/prompts.ts` mete en el prompt la definición exacta, las
colocaciones válidas, el falso amigo y los errores típicos que ya están en la
base. **No le pedimos al modelo que sepa inglés, le pedimos que compare contra
lo que ya le damos.** Es RAG casero sin vectores, y es lo que hace que un
modelo gratuito pequeño dé feedback útil. Si alguien "simplifica" el prompt
quitando ese contexto, la calidad se cae por un precipicio.

### 4.6 `grammatical` y `natural` son campos separados
Es la diferencia entre "no tienes errores" y "suenas como nativo" — el salto
que la app quiere provocar. Si se le pide al modelo "evalúa la frase" a secas,
colapsa ambas cosas y se pierde la señal. La interfaz los muestra como dos
insignias distintas.

### 4.7 Quién pone la nota, por tipo de tarjeta
- **Reconocimiento** → el usuario (4 botones FSRS). No hay respuesta
  verificable; solo él sabe si lo recordó.
- **Hueco** → el sistema. Hay respuesta objetiva. Autocalificarse cuando existe
  respuesta verificable invita a engañarse.
- **Producción** → el veredicto del modelo (`verdictToGrade`).

### 4.8 Forma de la sesión (`session-builder.ts`, función pura)
Calentamiento de 3 tarjetas fáciles **ya vistas** (arrancar acertando mete a la
persona en ritmo), tope de **4 tarjetas de producción** por sesión (escribir
cansa; 20 seguidas y la gente abandona), las de esfuerzo repartidas en vez de
apelotonadas, y cierre con una producción. Lo que sobra del tope **no se
pierde**: su `due` no cambia y vuelve mañana.

### 4.9 La métrica visible NO son puntos inventados
Es la **cobertura real del inglés conversacional**: `lexemes.coverage` guarda el
aporte marginal de cada palabra según su rango de frecuencia, y `get_progress`
suma el de las que el usuario ya domina. Poder decir *"las 340 palabras que
dominas cubren el 61% del inglés conversacional"* es cierto y motiva; "Nivel 7,
2.340 XP" no significa nada.

La fórmula está en `corpus/seed.ts` y es una **aproximación** calibrada contra
cifras conocidas (1.000 palabras ≈ 78%, 2.000 ≈ 86%, 2.800 ≈ 90%):
`c(n) ≈ 11.6 / n`. Sustituible por datos reales del corpus que se use.

### 4.10 Anti-Duolingo en la gamificación
La racha se mantiene **solo** completando las tarjetas del día
(`POST /api/session/complete`), nunca con minijuegos: si se pudiera farmear,
mediría adherencia en vez de aprendizaje. Hay 2 congeladores al mes, que se
gastan solos: perder una racha de 60 días por un viaje es la causa #1 de
abandono.

### 4.11 Quién habla con la base de datos
- **Auth** → el front habla directo con Supabase (`lib/supabase.ts`). El SDK
  maneja magic link, sesión y refresco mejor de lo que lo haríamos nosotros.
- **Datos** → **siempre** por el Worker. Nunca desde el front.

La RLS sigue activa como segunda línea de defensa, pero el armado de sesión y
FSRS son lógica de servidor.

---

## 5. Trampas ya pisadas — no vuelvas a caer

1. **Gemini OMITE las claves opcionales** en vez de mandarlas como `null`.
   Usa `.nullish().default(...)` en Zod, nunca `.nullable()` a secas.
2. **Los modelos concretos de Gemini se retiran sin aviso** para cuentas
   nuevas. Usa el alias `gemini-flash-latest`; override con `GEMINI_MODEL`.
3. **503 de Gemini es frecuente** en free tier (modelo saturado). Backoff
   largo (15s) y caída a Workers AI, no reintentar corto.
4. **ts-fsrs 5.x tiene `learning_steps`.** Sin esa columna el estado del
   algoritmo se pierde entre repasos.
5. **`handle_new_user()` quedaba expuesta** en `/rest/v1/rpc/` por ser
   SECURITY DEFINER. Toda función SECURITY DEFINER necesita su
   `revoke all ... from public, anon, authenticated`, **incluidas las de
   trigger**. Lo detectó el linter de Supabase, no los tests.
6. **No pongas `build.outDir` en `vite.config.ts`.** El plugin de Cloudflare
   ya emite en `dist/<entorno>`; fijarlo producía `dist/client/client` y
   wrangler no encontraba el `index.html`. **El despliegue habría fallado.**
7. **Los tipos de workerd, Node y navegador son incompatibles.** Hay tres
   tsconfig separados por eso. `npm run typecheck` corre los tres. No los
   unifiques: mezclarlos esconde errores reales.
8. **`@cloudflare/vitest-pool-workers` está fuera** a propósito: exige
   vitest 4, que dispara un bug de resolución de npm. Volverá cuando haya
   tests del Worker.
9. **Supabase firma los JWT con ES256 (JWKS), no con HS256.** Verificar con
   el JWT secret rechaza a todo usuario real. `src/server/jwt.ts` valida
   contra `/auth/v1/.well-known/jwks.json` y comprueba el `issuer`.
10. **Aplicar migraciones por el MCP les pone otro timestamp.** Los nombres de
   `supabase/migrations/` deben coincidir con `supabase_migrations.schema_migrations`,
   o `db push` intentará reaplicarlas. Tras aplicar una por MCP, renombra el
   archivo a la versión que quedó registrada.
11. **`npm run dev` necesita sesión de Cloudflare** (`npx wrangler login`): el
   binding de Workers AI siempre es remoto, incluso en local.
12. **Sprites CSS: `steps(N, jump-none)` hacia `-(N-1) × ancho`.** Con
   `steps(N)` hacia `-N × ancho` y `forwards`, la animación de una vez termina
   en un frame vacío.
13. **E2E sin usuario real:** `tests/e2e` siembra una sesión falsa de Supabase
   en `localStorage` (`sb-<ref>-auth-token`) y simula `/api/*` con `page.route`.
   Corren con el Chrome instalado (`npx playwright test`, Node 24 en el PATH).
14. **La lista de 2.800 palabras venía rota** (2026-09-23): la lematización por
   sufijos convertía *need → ne*, *thing → th*, *only → on* y descartaba *really*
   o *actually* como "inflexiones" de *real* y *actual*. Faltaban 34 de 47 palabras
   frecuentes de control. Ahora usa `lemmatization-lists` (`corpus/lemmatize.ts`,
   con tests) y una lista de nombres propios revisada a mano. **Regenerar la lista
   invalida el `corpus.jsonl` de lo que salga de ella.**
15. **429 de Gemini no siempre es la cuota diaria.** El cuerpo trae `PerDay` o
   `PerMinute` y un `retryDelay`; con el límite por minuto el generador espera y
   sigue. La API key va en el header `x-goog-api-key`, nunca en la URL.

---

## 6. Puesta en marcha

### Secretos (ninguno está en el repo)

Un **único `.env`** en la raíz (`cp .env.example .env`). No existe `.dev.vars`:
wrangler lee el `.env` cuando no hay `.dev.vars`, Vite expone al bundle solo
las `VITE_*` y los scripts del corpus lo cargan con `--env-file-if-exists`.
```
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY     -> cliente (públicas)
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
GEMINI_API_KEY, GEMINI_MODEL (opcional)       -> Worker y corpus
```
En producción: `wrangler secret put <NOMBRE>`.
La anon key es pública por diseño; lo que protege los datos es la RLS.
**La `service_role` jamás lleva prefijo `VITE_`, ni va al cliente o al repo.**

> ⚠️ El usuario pegó una API key de Gemini en el chat de la sesión anterior.
> Hay que darla por comprometida y revocarla. Si dice que ya lo hizo, bien.

### Comandos

```bash
npm install
npm run dev          # Vite + el Worker en workerd real, con bindings de verdad
npm run typecheck    # los tres entornos
npm test             # 55 tests
npx playwright test  # 3 E2E (Chrome instalado)
npm run build
npm run deploy

# Corpus (una vez)
npm run corpus:wordlist              # ya generada; solo si quieres rehacerla
npm run corpus:generate -- --limit 50  # PRUEBA CORTA PRIMERO
npm run corpus:validate                # lee el informe
npm run corpus:generate                # el resto, ~280 peticiones
npm run corpus:validate
npm run corpus:seed -- --remote
```

### Supabase

Proyecto: `ckjoklnmedodnrrqzqpk` (región us-west-2, Postgres 17.6).
Las 5 migraciones **ya están aplicadas** ahí. Si añades una nueva:
`npx supabase link --project-ref ckjoklnmedodnrrqzqpk && npx supabase db push`
(no necesita Docker; solo `supabase start` lo necesita).

Ojo: el plan free **pausa el proyecto tras ~1 semana sin actividad**. El cron
diario del Worker hace keep-alive por eso.

---

## 7. Notas sobre el usuario y el entorno

- **Habla español.** Todo el código, comentarios y commits van en español.
- Repo: `github.com/Fechm/palabro`, **público**, rama `master`.
  El conector de GitHub no estaba instalado, así que los commits viajaron
  en `.zip`. Conviene comprobar si el remoto está al día:
- Carpeta local: `C:\Privado\proyecto-cards\palabro` (Windows, PowerShell).
- **No tiene Docker**, ni en Windows ni disponible. Nada que dependa de
  `supabase start` o de contenedores locales.
- El corpus deriva de listas CC BY-SA: mantén la atribución en `CREDITS.md`.

---

## 8. Por dónde empezaría yo

1. `git log --oneline` y `npm test` para confirmar que el traspaso llegó entero.
2. Comprobar que `.env` está puesto.
3. `npm run corpus:generate -- --limit 50` y **leer el informe de validación**:
   es la primera vez que el generador corre con distractores, y ahí puede
   saltar algo.
4. Con 50 palabras sembradas, `npm run dev` y **estudiar una sesión real**.
   Ese es el momento de la verdad del proyecto: nadie lo ha hecho todavía.
5. Lo que salga de ahí manda sobre la lista de pendientes de la sección 2.
