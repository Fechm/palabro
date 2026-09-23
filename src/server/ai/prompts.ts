import type { Verdict } from "../../shared/schemas.js";

export interface LexemeContext {
  lemma: string;
  pos: string;
  definition_en: string;
  definition_es: string;
  usage_note: string | null;
  collocations: string[];
  common_errors: string[];
  false_friend: { es_word: string; warning: string } | null;
}

/**
 * Aquí está el truco que hace que un modelo gratuito pequeño dé feedback
 * de calidad: no le pedimos que SEPA inglés, le pedimos que compare
 * contra información que ya le damos.
 *
 * La definición exacta, las colocaciones válidas, el falso amigo y los
 * errores típicos salen del corpus precomputado. Es RAG casero, sin
 * vectores ni embeddings — y es la diferencia entre un free tier que
 * sirve y uno que decepciona.
 */
export function evaluationPrompt(lex: LexemeContext, sentence: string): string {
  const ff = lex.false_friend
    ? `\nFALSO AMIGO conocido: se confunde con "${lex.false_friend.es_word}". ${lex.false_friend.warning}`
    : "";
  const errs = lex.common_errors.length
    ? `\nERRORES TIPICOS de hispanohablantes con esta palabra:\n${lex.common_errors.map((e) => `  - ${e}`).join("\n")}`
    : "";
  const note = lex.usage_note ? `\nNOTA DE USO: ${lex.usage_note}` : "";

  return `Evalua la frase que ha escrito un estudiante hispanohablante de ingles.

PALABRA OBJETIVO: "${lex.lemma}" (${lex.pos})
SIGNIFICADO: ${lex.definition_en}  /  ${lex.definition_es}
COLOCACIONES CORRECTAS: ${lex.collocations.join(", ")}${note}${ff}${errs}

FRASE DEL ESTUDIANTE:
"${sentence}"

Evalua CUATRO cosas por separado:

1. uses_target_correctly — ¿usa "${lex.lemma}" con el significado indicado arriba? Si la usa con otro sentido, es false.
2. grammatical — ¿la frase es gramaticalmente correcta?
3. natural — ¿un nativo la diria asi? Una frase puede ser correcta y sonar rara. Este campo es independiente del anterior.
4. grade — 1 si no usa bien la palabra, 2 si hay error gramatical, 3 si es correcta pero poco natural, 4 si esta perfecta.

native_version: como lo diria un nativo. Si la frase ya es perfecta, repitela tal cual.
feedback_es: UNA o DOS frases en espanol, concretas y utiles. Di que cambiar y por que. Nada de "buen trabajo".
error_tags: solo de esta lista, maximo 4: word_order, preposition, false_friend, register, collocation, tense, article, plural, spelling, meaning. Si no hay errores, lista vacia.

Responde solo con el JSON.`;
}

export function explanationPrompt(lex: LexemeContext, question: string): string {
  return `Eres un profesor de ingles para hispanohablantes. Responde breve y concreto.

PALABRA: "${lex.lemma}" (${lex.pos})
SIGNIFICADO: ${lex.definition_en} / ${lex.definition_es}
COLOCACIONES: ${lex.collocations.join(", ")}
${lex.usage_note ? `NOTA: ${lex.usage_note}` : ""}
${lex.false_friend ? `FALSO AMIGO: "${lex.false_friend.es_word}" — ${lex.false_friend.warning}` : ""}

PREGUNTA DEL ESTUDIANTE: ${question}

Responde en espanol en 2-4 frases (answer_es) y da hasta 3 ejemplos en ingles (examples).
Si la pregunta no tiene que ver con esta palabra, dilo amablemente y redirige.
Responde solo con el JSON.`;
}

/** Esquema en el dialecto de Gemini (subconjunto de OpenAPI). */
export const VERDICT_JSON_SCHEMA = {
  type: "OBJECT",
  required: ["uses_target_correctly", "grammatical", "natural", "grade",
             "native_version", "feedback_es", "error_tags"],
  properties: {
    uses_target_correctly: { type: "BOOLEAN" },
    grammatical: { type: "BOOLEAN" },
    natural: { type: "BOOLEAN" },
    grade: { type: "INTEGER" },
    native_version: { type: "STRING" },
    feedback_es: { type: "STRING" },
    error_tags: { type: "ARRAY", items: { type: "STRING" } },
  },
} as const;

export const EXPLAIN_JSON_SCHEMA = {
  type: "OBJECT",
  required: ["answer_es", "examples"],
  properties: {
    answer_es: { type: "STRING" },
    examples: { type: "ARRAY", items: { type: "STRING" } },
  },
} as const;

/** Respuesta de emergencia si ningún proveedor contesta. */
export function fallbackVerdict(sentence: string, lemma: string): Verdict {
  const uses = new RegExp(`\\b${lemma.toLowerCase()}`, "i").test(sentence);
  return {
    uses_target_correctly: uses,
    grammatical: true,
    natural: true,
    grade: uses ? 3 : 1,
    native_version: sentence,
    feedback_es: uses
      ? "No se pudo evaluar en detalle ahora mismo. Tu frase contiene la palabra; inténtalo de nuevo más tarde para recibir corrección."
      : `Tu frase no contiene "${lemma}". Escríbela usando esa palabra.`,
    error_tags: [],
  };
}
