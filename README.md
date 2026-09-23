# Palabro

Aprender a **usar** el inglés, no solo a reconocerlo.

La mayoría de las apps de idiomas entrenan reconocimiento: ves una palabra en
una lista y la identificas. Reconocer `ubiquitous` es trivial; usarla en una
frase propia es lo que la fija. Palabro está construida alrededor de esa
diferencia.

## Cómo funciona

Cada palabra sube por cinco niveles de dominio, y solo avanza cuando la
anterior está asentada:

| Nivel | Qué te pide | Qué entrena |
|---|---|---|
| 1 | Ves la frase, deduces el significado | Comprensión |
| 2 | Hueco en la frase original | Recuperación con apoyo |
| 3 | Hueco en una frase **nueva** | Transferencia |
| 4 | **Escribes tu propia oración** | Uso real |
| 5 | Escuchas y respondes hablando | Fluidez oral |

En el nivel 4 un modelo de lenguaje evalúa tu frase y distingue dos cosas que
casi nadie separa: si es **gramatical** y si suena **natural**. Esa es la
diferencia entre no tener errores y sonar como nativo.

### Dos ejes, no uno

> **FSRS decide _cuándo_ aparece una tarjeta. El nivel de dominio decide
> _qué_ te pregunta cuando aparece.**

Mezclarlos rompe una de las dos cosas. Separados, cada uno hace su trabajo.

### La métrica que se muestra no son puntos inventados

El corpus está ordenado por frecuencia real, así que la app puede decirte algo
literalmente cierto: *"las 340 palabras que dominas cubren el 61% del inglés
conversacional"*. Ver ese número subir motiva porque **significa algo**.

## Arquitectura

Un solo despliegue. El mismo Worker sirve el front estático y la API.

```
navegador (PWA)
      │
      ▼
Cloudflare Worker ──── GET /*      → assets estáticos (no se facturan)
                  └─── /api/*      → Hono
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
        Supabase                 Modelo (free tier)
        Postgres + Auth          Gemini Flash → Workers AI
```

| Capa | Tecnología |
|---|---|
| Front | React 19 · Vite · TanStack Router/Query · Tailwind · PWA |
| API | Hono sobre Cloudflare Workers |
| Datos | Supabase (Postgres + Auth), SQL plano y funciones RPC — sin ORM |
| Repaso | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) |
| IA | Gemini Flash (primario) · Workers AI (fallback) |
| Contratos | Zod en `src/shared`, compartido por cliente, servidor y modelo |

Coste de operación: **0**. Todo vive en capas gratuitas, sin cold starts.

## Puesta en marcha

```bash
npm install
cp .dev.vars.example .dev.vars    # secretos del Worker
cp .env.example .env              # variables del cliente (Vite)
npm run db:start                  # Postgres local (necesita Docker)
npm run db:reset                  # aplica migraciones
```

### Generar el corpus

Se hace **una vez**. El contenido queda en la base y lo comparten todos los
usuarios para siempre.

```bash
export GEMINI_API_KEY=...                # gratis en aistudio.google.com/apikey
npm run corpus:wordlist                  # ya viene generada; solo si quieres rehacerla
npm run corpus:generate -- --limit 50    # prueba corta primero
npm run corpus:validate                 # lee el informe
npm run corpus:generate                 # el resto
npm run corpus:validate
npm run corpus:seed
```

El generador va por lotes de 10 palabras, guarda checkpoint tras cada lote y
se reanuda solo si se interrumpe o se agota la cuota diaria.

### Desarrollo

```bash
npm run dev         # Vite + el Worker en workerd real, con bindings de verdad
npm run typecheck   # worker · cliente · node, por separado
npm test
```

## Estado

| Parte | Estado |
|---|---|
| Esquema de datos + RLS + RPC | **aplicado y probado en Postgres 17 real** |
| Contratos Zod compartidos | listo, con tests |
| Lógica de progresión de dominio | listo, con tests |
| Lista de 2.800 palabras | generada y versionada |
| Generador y validador de corpus | **probado contra Gemini de verdad** |
| CI (tipos, tests, migraciones) | listo |
| API (Hono) | listo, probado con wrangler dev |
| Cliente (React) | loop de estudio y progreso, probado en navegador |
| Minijuegos | pendiente |

## ¿Continuando el proyecto?

Lee **[HANDOFF.md](./HANDOFF.md)** antes de tocar nada: recoge el estado real
(qué está verificado y qué no), las decisiones de diseño que no conviene
deshacer y las trampas ya pisadas.

## Licencia y créditos

Ver [CREDITS.md](./CREDITS.md). El corpus deriva de la NGSL y hereda su
licencia.
