/**
 * Contratos compartidos por cliente, servidor y modelo.
 *
 * Se definen UNA vez aqui y se usan en tres lugares:
 *   · el cliente valida antes de enviar
 *   · el servidor valida al recibir
 *   · el mismo esquema se le pasa al modelo como JSON Schema
 *
 * Cambiar un contrato rompe la compilacion en los tres sitios a la vez.
 * Ese es el verdadero motivo de usar TypeScript en todo el stack.
 */
import { z } from "zod";

// ═══ Vocabulario cerrado ═════════════════════════════════════════════

export const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const POS = [
  "noun", "verb", "adjective", "adverb", "preposition",
  "conjunction", "pronoun", "determiner", "phrase",
] as const;

/** Etiquetas de error con vocabulario CERRADO: texto libre no se puede agregar. */
export const ERROR_TAGS = [
  "word_order", "preposition", "false_friend", "register",
  "collocation", "tense", "article", "plural", "spelling", "meaning",
] as const;

export const GAME_MODES = [
  "speed_round", "native_or_not", "false_friend_hunt",
  "sentence_builder", "collocation_chain", "duel",
  "session_quiz", "listening",
] as const;

/** Escala FSRS: 1 Again · 2 Hard · 3 Good · 4 Easy */
export const gradeSchema = z.number().int().min(1).max(4);
export const masterySchema = z.number().int().min(1).max(5);

// ═══ Contenido ════════════════════════════════════════════════════════

export const falseFriendSchema = z.object({
  es_word: z.string(),
  warning: z.string(),
});

export const contextSchema = z.object({
  id: z.number().int(),
  text: z.string(),
  gloss_es: z.string(),
  level: z.enum(CEFR),
  cloze_start: z.number().int(),
  cloze_end: z.number().int(),
  distractors: z.array(z.string()),
  native_variant: z.string().nullable(),
  audio_url: z.string().nullable(),
});

export const lexemeSchema = z.object({
  id: z.number().int(),
  lemma: z.string(),
  pos: z.enum(POS),
  cefr: z.enum(CEFR),
  ipa: z.string().nullable(),
  definition_en: z.string(),
  definition_es: z.string(),
  usage_note: z.string().nullable(),
  false_friend: falseFriendSchema.nullable(),
  collocations: z.array(z.string()),
  common_errors: z.array(z.string()),
  audio_url: z.string().nullable().optional(),
});

// ═══ Sesion de estudio ════════════════════════════════════════════════

export const studyCardSchema = z.object({
  user_card_id: z.number().int(),
  mastery_level: masterySchema,
  state: z.number().int().min(0).max(3),
  reps: z.number().int(),
  is_new: z.boolean(),
  lexeme: lexemeSchema,
  context: contextSchema.nullable(),
  next: z.object({ 1: z.number(), 2: z.number(), 3: z.number(), 4: z.number() }).optional(),
});
export type StudyCard = z.infer<typeof studyCardSchema>;

export const sessionResponseSchema = z.object({
  cards: z.array(studyCardSchema),
  /** Indices de `cards` que van al bloque de calentamiento. */
  warmup_count: z.number().int(),
});

export const reviewRequestSchema = z.object({
  user_card_id: z.number().int(),
  grade: gradeSchema,
  card_type: masterySchema,
  context_id: z.number().int().nullable(),
  latency_ms: z.number().int().nonnegative().max(600_000).optional(),
});
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

export const reviewResponseSchema = z.object({
  due: z.string(),
  mastery_level: masterySchema,
  leveled_up: z.boolean(),
  leveled_down: z.boolean(),
});

// ═══ Produccion libre: el veredicto del modelo ═══════════════════════

/**
 * `grammatical` y `natural` son campos SEPARADOS a proposito. Es la
 * diferencia entre "no tienes errores" y "suenas como nativo", que es
 * justo el salto que la app quiere provocar. Si se le pide al modelo
 * "evalua la frase" a secas, colapsa ambas cosas y se pierde la senal.
 */
export const verdictSchema = z.object({
  uses_target_correctly: z.boolean(),
  grammatical: z.boolean(),
  natural: z.boolean(),
  grade: gradeSchema,
  native_version: z.string(),
  feedback_es: z.string().max(400),
  error_tags: z.array(z.enum(ERROR_TAGS)).max(4),
});
export type Verdict = z.infer<typeof verdictSchema>;

export const produceRequestSchema = z.object({
  lexeme_id: z.number().int(),
  sentence: z.string().trim().min(3).max(300),
});

export const explainRequestSchema = z.object({
  lexeme_id: z.number().int(),
  question: z.string().trim().min(3).max(200),
});

export const explainResponseSchema = z.object({
  answer_es: z.string(),
  examples: z.array(z.string()).max(3),
});

// ═══ Progreso y juego ═════════════════════════════════════════════════

export const progressSchema = z.object({
  words_seen: z.number().int(),
  due_tomorrow: z.number().int(),
  levels: z.record(z.string(), z.number().int()),
  study_days: z.array(z.object({ day: z.string(), n: z.number().int() })),
  words_usable: z.number().int(),
  /** Cobertura REAL del ingles conversacional, no puntos inventados. */
  coverage_pct: z.number(),
  due_now: z.number().int(),
  current_streak: z.number().int().nullable(),
  longest_streak: z.number().int().nullable(),
  freezes_left: z.number().int().nullable(),
  top_errors: z.array(z.object({ tag: z.string(), n: z.number().int() })),
});

export const vocabWordSchema = z.object({
  lexeme_id: z.number().int(),
  lemma: z.string(),
  pos: z.enum(POS),
  cefr: z.enum(CEFR),
  definition_es: z.string(),
  audio_url: z.string().nullable(),
  mastery_level: masterySchema,
  due: z.string(),
  example: z.string().nullable(),
  example_es: z.string().nullable(),
});
export type VocabWord = z.infer<typeof vocabWordSchema>;

export const gameResultSchema = z.object({
  mode: z.enum(GAME_MODES),
  score: z.number().int().nonnegative(),
  max_score: z.number().int().positive(),
  duration_ms: z.number().int().nonnegative().optional(),
  /** Lexemas FALLADOS: solo estos adelantan su repaso. */
  missed_lexeme_ids: z.array(z.number().int()).max(100),
});

export const apiErrorSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});
