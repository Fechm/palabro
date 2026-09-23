# Generación del corpus de Palabro — instrucciones para cada lote

Repo: `C:\Privado\proyecto-cards\palabro`. App para que **hispanohablantes**
(Chile, grupo cerrado de 10 adultos) aprendan inglés **hablado**. Cada ficha
se guarda para siempre: la precisión importa más que la velocidad.

## Qué leer primero
1. `corpus/prompt.ts` → `SYSTEM_PROMPT`: las 11 reglas innegociables. Síguelas todas.
2. `corpus/schema.ts` → `corpusEntrySchema`: la forma exacta de cada entrada.
3. `corpus/data/corpus.jsonl` → 10 entradas de ejemplo ya aprobadas (know … come).
   Imita su nivel de detalle, su tono y su formato.

## Formato de salida
Un archivo JSONL: **una entrada JSON por línea**, UTF-8, en el mismo orden del lote.
Cada entrada = el objeto de `corpusEntrySchema` + `"freq_rank": <número del lote>`.
Incluye siempre todas las claves (`native_variant: null`, `false_friend: null`,
`common_errors: []` cuando no apliquen). Exactamente 5 `contexts` por palabra.

Escribe el archivo con un script de Python (lista de dicts → `json.dumps(e, ensure_ascii=False)`
por línea) para no romper el JSON a mano. El script puede ir en tu scratchpad o en
`corpus/data/parts/` con nombre `_gen-XXX.py`.

## Reglas extra (aprendidas en el piloto — tan importantes como las 11)

**A. La palabra debe aparecer en cada frase como el lema exacto o con una inflexión
regular:** `lemma`, `lemma+s`, `+es`, `+ed`, `+ing`, `+'s`; si termina en e: `-e+ing`, `+d`;
si termina en y: `-y+ies`, `-y+ied`; consonante doblada: `stop → stopping/stopped`.
**Nunca formas irregulares** (went, got, came, children, better, knew, taken…): el
validador no las encuentra y descarta la frase. Si la palabra es un verbo irregular,
usa presente, `-ing`, infinitivo o el lema tras un modal.
Evita también el posesivo `lemma's` (sky's, mommy's): el hueco se come la `'s` y la frase queda rota.

**B. Distractores: al ponerlo en el hueco, la frase debe quedar agramatical o absurda.**
Que "cambie el significado" NO basta: si la frase resultante es inglés correcto, el
usuario que la elija será marcado como error sin haberlo cometido.
Malos (frases válidas): `I don't [see].` · `Let me [see] when…` · `over [here]` · `get [here]`.
Buenos: `I don't [need].` (falta objeto) · `over [then]` · `Let me [like] when…`.
Prueba mentalmente cada distractor en su frase. Misma categoría gramatical y nivel
parecido, pero incorrecto ahí. Nunca la palabra objetivo ni una inflexión suya.
Con sustantivos o adjetivos muy comunes (donde cualquier palabra creíble deja una
frase válida), rompe la gramática con otra subcategoría —adjetivos predicativos
(asleep, afraid, aware) delante de un sustantivo, verbos intransitivos donde hace
falta objeto—, pero **varía los sets entre entradas**: repetir el mismo trío en
muchas palabras vuelve la tarjeta predecible.
**Lo que mejor enseña** son los errores reales de hispanohablantes que rompen la
frase (calcos: «listen English», «explain me», «a advice»; preposición o partícula
equivocada) y palabras de la misma familia mal usadas. Úsalos antes que adjetivos
predicativos genéricos.

**H.** Si la ficha tiene false_friend, ninguna glosa puede usar la palabra española
engañosa con el sentido que la ficha desaconseja (p. ej. «definitivamente» en la
glosa de *definitely*).

**C. Frases de 4 a 15 palabras** (el validador exige 3–20; apunta a 4–15).

**D. Español neutro latinoamericano con tuteo** en definition_es, gloss_es, usage_note,
false_friend.warning y common_errors: nada de vosotros ni voseo. Glosas naturales,
no traducciones palabra por palabra.

**E. pos:** el sentido más útil para un estudiante (uno de: noun, verb, adjective,
adverb, preposition, conjunction, pronoun, determiner, phrase). Si la palabra es
muy polisémica, la definición puede cubrir 2 sentidos separados por «;».

**F. Contenido adulto:** el vocabulario sale de subtítulos. Las groserías frecuentes
(p. ej. *damn*) se tratan con naturalidad y una usage_note de registro; nada gratuito.

**G. false_friend:** solo si existe de verdad (parecido gráfico + significado distinto).
Ante la duda, `null`. Inventar es peor que omitir.

## Verificación obligatoria antes de terminar
Con Node 24 en el PATH (bash):
```bash
export PATH="/c/Users/felipe.chavez/nodejs-24:$PATH"
cd /c/Privado/proyecto-cards/palabro
npx tsx corpus/validate.ts --in corpus/data/parts/<tu-archivo>.jsonl --report-only
```
Debe dar **Rechazadas: 0** y **Avisos: 0**. Si hay avisos, corrige y repite.
Comprueba también que el número de entradas = número de palabras del lote.

## Prohibido
- Tocar cualquier archivo fuera de `corpus/data/parts/`.
- `corpus.jsonl`, `corpus.clean.jsonl`, git, npm install, llamar a Gemini o a otra API.
