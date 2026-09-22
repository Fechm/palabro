# Datos del corpus

## `wordlist.csv` — la lista de partida (NO se genera, se descarga)

Formato: `freq_rank,lemma,pos` (la cabecera es opcional, `pos` tambien).

```csv
freq_rank,lemma,pos
1,the,determiner
2,be,verb
3,of,preposition
```

### De donde sacarla

**NGSL (New General Service List)** — 2.801 palabras que cubren ~92% del
ingles general. Es la recomendada: esta hecha exactamente para esto.

- Sitio: <https://www.newgeneralservicelist.com/>
- Licencia: CC BY-SA. **Revisa los terminos antes de publicar** y manten
  la atribucion en `CREDITS.md`.

Complementos opcionales:
- **NAWL** — vocabulario academico
- **TSL** — lenguaje de examenes (TOEIC)

> El corpus derivado hereda la licencia de la lista de origen.

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
