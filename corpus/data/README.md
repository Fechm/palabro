# Datos del corpus

## `wordlist.csv` — la lista de partida (generada por `npm run corpus:wordlist`)

Formato: `freq_rank,lemma` (acepta una tercera columna `pos` opcional).

```csv
freq_rank,lemma
1,know
2,just
3,there
```

### Cómo se construye

`corpus/build-wordlist.ts` descarga tres fuentes (ver `CREDITS.md`) y:

1. ordena por frecuencia en subtítulos (inglés hablado real);
2. descarta interjecciones, palabras función, fragmentos de contracción,
   nombres propios y palabras de menos de 3 letras (salvo `go` y `tv`);
3. lleva cada inflexión a su lema con `lemmatization-lists` (*went → go*,
   *eyes → eye*), salvo que la forma sea lema propio (*building*, *better*)
   o un adjetivo en -ing/-ed que domina sobre su verbo por 1,5× o más
   (*interesting*, *tired*); la lógica está en `corpus/lemmatize.ts`.

La lista de nombres propios se revisó a mano. Si cambias `--limit`,
revisa las palabras nuevas del final: ahí aparecen nombres que antes quedaban fuera.

> El corpus derivado hereda la licencia CC BY-SA de la lista de frecuencias.

## Archivos generados (versionados en git)

| Archivo | Que es |
|---|---|
| `corpus.jsonl` | Salida cruda del modelo. Es el checkpoint: no lo borres |
| `corpus.clean.jsonl` | Validado, con huecos calculados. Es lo que se siembra |
| `rejected.jsonl` | Entradas que no pasaron validacion, para regenerar |

## Flujo

```bash
npm run corpus:generate -- --limit 50   # prueba corta primero
npm run corpus:validate                 # revisa el informe
npm run corpus:generate                 # el resto
npm run corpus:validate
npm run corpus:seed
```

Revisa a mano una muestra del ~5% antes de dar el corpus por bueno.
Es una tarde de trabajo sobre un activo que dura años.
