import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { db } from "../db.js";
import { explainRequestSchema, explainResponseSchema } from "../../shared/schemas.js";
import { ask } from "../ai/index.js";
import { explanationPrompt, EXPLAIN_JSON_SCHEMA, type LexemeContext } from "../ai/prompts.js";

export const explain = new Hono<{ Bindings: Env; Variables: Vars }>();

explain.post("/", async (c) => {
  const parsed = explainRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "bad_request", detail: parsed.error.issues[0]?.message }, 400);
  }
  const { lexeme_id, question } = parsed.data;

  const { data: lex, error } = await db(c.env)
    .from("lexemes")
    .select("lemma,pos,definition_en,definition_es,usage_note,collocations,common_errors,false_friend")
    .eq("id", lexeme_id)
    .single();
  if (error || !lex) return c.json({ error: "not_found" }, 404);

  try {
    const { value } = await ask(
      c.env,
      explanationPrompt(lex as LexemeContext, question),
      EXPLAIN_JSON_SCHEMA,
      explainResponseSchema,
    );
    return c.json(value);
  } catch {
    return c.json({ error: "ai_unavailable", detail: "Inténtalo de nuevo en un momento." }, 503);
  }
});
