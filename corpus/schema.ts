/**
 * Forma de cada entrada del corpus tal como la produce el modelo.
 *
 * Este contenido se genera UNA vez, se versiona en git y lo consumen
 * todos los usuarios para siempre. Es el activo mas valioso del
 * proyecto: la calidad del corpus ES la calidad de la app.
 */
import { z } from "zod";
import { CEFR, POS } from "../src/shared/schemas.js";

export const corpusContextSchema = z.object({
  text: z.string().min(5).max(200),
  gloss_es: z.string().min(3).max(220),
  level: z.enum(CEFR),
  /** Como lo diria un nativo si la frase sonara rara. Alimenta ¿Nativo o no? */
  // El modelo omite la clave en vez de mandarla como null: nullish + default.
  native_variant: z.string().max(200).nullish().default(null),
});

export const corpusEntrySchema = z.object({
  lemma: z.string().min(1),
  pos: z.enum(POS),
  cefr: z.enum(CEFR),
  ipa: z.string().max(60),
  definition_en: z.string().min(10).max(220),
  definition_es: z.string().min(2).max(220),
  usage_note: z.string().max(300).nullish().default(""),

  /**
   * El campo de mayor valor para hispanohablantes. `null` cuando la
   * palabra no tiene falso amigo — la mayoria no lo tiene, y forzarlo
   * hace que el modelo invente.
   */
  false_friend: z
    .object({ es_word: z.string(), warning: z.string().max(240) })
    .nullish()
    .default(null),

  collocations: z.array(z.string()).min(2).max(6),

  /** Errores tipicos de hispanohablantes con ESTA palabra. */
  common_errors: z.array(z.string()).max(4).nullish().default([]),

  /** 5 frases graduadas de facil a dificil. */
  contexts: z.array(corpusContextSchema).min(3).max(5),
});

export type CorpusEntry = z.infer<typeof corpusEntrySchema>;

/**
 * Esquema en el dialecto que acepta Gemini (subconjunto de OpenAPI).
 * Se escribe a mano en vez de derivarlo de Zod porque Gemini rechaza
 * varias construcciones que Zod genera. Zod valida DESPUES, que es
 * donde de verdad importa.
 */
export const geminiResponseSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    required: [
      "lemma", "pos", "cefr", "ipa", "definition_en", "definition_es",
      "usage_note", "collocations", "common_errors", "contexts",
    ],
    properties: {
      lemma: { type: "STRING" },
      pos: { type: "STRING", enum: [...POS] },
      cefr: { type: "STRING", enum: [...CEFR] },
      ipa: { type: "STRING" },
      definition_en: { type: "STRING" },
      definition_es: { type: "STRING" },
      usage_note: { type: "STRING" },
      false_friend: {
        type: "OBJECT",
        nullable: true,
        properties: { es_word: { type: "STRING" }, warning: { type: "STRING" } },
      },
      collocations: { type: "ARRAY", items: { type: "STRING" } },
      common_errors: { type: "ARRAY", items: { type: "STRING" } },
      contexts: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          required: ["text", "gloss_es", "level"],
          properties: {
            text: { type: "STRING" },
            gloss_es: { type: "STRING" },
            level: { type: "STRING", enum: [...CEFR] },
            native_variant: { type: "STRING", nullable: true },
          },
        },
      },
    },
  },
} as const;
