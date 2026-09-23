# Créditos y licencias

## Lista de vocabulario

`corpus/data/wordlist.csv` se construye con `npm run corpus:wordlist` a partir de:

| Fuente | Uso | Licencia |
|---|---|---|
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave), frecuencias de OpenSubtitles 2018 | orden por frecuencia del inglés hablado | **CC BY-SA 4.0** |
| [english-words](https://github.com/dwyl/english-words) (dwyl) | descartar palabras que no son inglés | Unlicense (dominio público) |
| [lemmatization-lists](https://github.com/michmech/lemmatization-lists) (Michal Měchura) | llevar cada inflexión a su lema | **ODbL 1.0** |

El contenido generado a partir de esa lista (definiciones, frases de ejemplo,
notas de uso) es obra derivada y **hereda la licencia CC BY-SA**. Si
redistribuyes el corpus, mantén esta atribución y la misma licencia.

## Dependencias principales

| Proyecto | Licencia |
|---|---|
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | MIT |
| [Hono](https://hono.dev) | MIT |
| [React](https://react.dev) | MIT |
| [Zod](https://zod.dev) | MIT |
| [supabase-js](https://github.com/supabase/supabase-js) | MIT |

## Algoritmo de repetición espaciada

**FSRS** (Free Spaced Repetition Scheduler), de Jarrett Ye y colaboradores.
<https://github.com/open-spaced-repetition/fsrs4anki>
