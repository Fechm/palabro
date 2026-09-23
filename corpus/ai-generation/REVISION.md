# Revisión de un lote del corpus de Palabro

Eres el **segundo par de ojos**. El generador ya pasó el validador automático; tú
buscas lo que el validador NO puede ver. Asume que hay errores y encuéntralos.
Contexto y reglas: `corpus/data/parts/INSTRUCCIONES.md` y `corpus/prompt.ts`.

## Qué revisar en cada entrada (en este orden de importancia)

1. **Distractores (el defecto más probable).** Para CADA frase, reemplaza el hueco
   (la palabra objetivo o su inflexión) por cada distractor y lee la frase entera.
   Si el resultado es inglés correcto y natural —aunque signifique otra cosa—, el
   distractor es inválido: reemplázalo por uno que deje la frase agramatical o
   absurda, de la misma categoría gramatical y nivel parecido.
   Ejemplos de inválidos: `I don't [see].`, `put it over [here]`, `get [here]`,
   `Let me [see] when you get home.`
2. **false_friend.** Solo vale si la palabra española se PARECE gráficamente y
   significa algo DISTINTO. Si es dudoso, forzado o inventado → `null`.
   Si la palabra tiene un falso amigo real y conocido y falta, agrégalo.
3. **Frases.** Deben sonar a inglés hablado real, contener la palabra (lema o
   inflexión regular, nunca irregular), 4–15 palabras, graduadas A1/A2 → B2/C1.
4. **Español.** Neutro latinoamericano con tuteo (sin vosotros ni voseo). gloss_es
   natural y fiel a la frase. common_errors concretos de hispanohablantes, no generalidades.
5. **definition_en** sin la palabra misma y con palabras más frecuentes que ella.
   **ipa** plausible en inglés americano. **cefr** razonable.

## Salida
- `corpus/data/parts/rev-XXX.jsonl`: el lote completo corregido (mismo orden,
  mismas entradas, mismo `freq_rank`). Si una entrada está bien, cópiala igual.
- Escríbelo con un script de Python que lea `gen-XXX.jsonl`, aplique tus cambios
  explícitos y escriba `rev-XXX.jsonl` (así cada cambio queda trazable).
- Verificación obligatoria: Rechazadas 0, Avisos 0, mismo número de entradas:
  ```bash
  export PATH="/c/Users/felipe.chavez/nodejs-24:$PATH"
  cd /c/Privado/proyecto-cards/palabro
  npx tsx corpus/validate.ts --in corpus/data/parts/rev-XXX.jsonl --report-only
  ```

## Prohibido
Tocar archivos fuera de `corpus/data/parts/`, modificar `gen-XXX.jsonl`, git, npm install, APIs externas.
