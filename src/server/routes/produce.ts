import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { rpc, db } from "../db.js";
import { produceRequestSchema, verdictSchema } from "../../shared/schemas.js";
import { ask } from "../ai/index.js";
import {
  evaluationPrompt, VERDICT_JSON_SCHEMA, fallbackVerdict,
  type LexemeContext,
} from "../ai/prompts.js";

/** Con 10 usuarios sobra de largo; está para frenar un bucle accidental. */
const DAILY_LIMIT = 60;

export const produce = new Hono<{ Bindings: Env; Variables: Vars }>();

produce.post("/", async (c) => {
  const parsed = produceRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "bad_request", detail: parsed.error.issues[0]?.message }, 400);
  }
  const { lexeme_id, sentence } = parsed.data;
  const userId = c.get("userId");

  const used = await rpc<number>(c.env, "productions_today", { p_user_id: userId });
  if (used >= DAILY_LIMIT) {
    return c.json({ error: "daily_limit", detail: "Has alcanzado el límite de evaluaciones de hoy." }, 429);
  }

  const { data: lex, error } = await db(c.env)
    .from("lexemes")
    .select("lemma,pos,definition_en,definition_es,usage_note,collocations,common_errors,false_friend")
    .eq("id", lexeme_id)
    .single();
  if (error || !lex) return c.json({ error: "not_found" }, 404);

  const prompt = evaluationPrompt(lex as LexemeContext, sentence);

  let verdict;
  let model: string;
  try {
    const r = await ask(c.env, prompt, VERDICT_JSON_SCHEMA, verdictSchema);
    verdict = r.value;
    model = r.model;
  } catch (err) {
    // Que ningún proveedor responda no puede dejar al usuario bloqueado
    // a mitad de sesión: se devuelve un veredicto degradado y honesto.
    console.error("ambos proveedores fallaron:", String(err));
    verdict = fallbackVerdict(sentence, (lex as LexemeContext).lemma);
    model = "fallback";
  }

  await db(c.env).from("productions").insert({
    user_id: userId, lexeme_id, sentence, verdict, model_used: model,
  });

  return c.json(verdict);
});
