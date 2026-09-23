import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { rpc, db } from "../db.js";
import { gameResultSchema } from "../../shared/schemas.js";

export const game = new Hono<{ Bindings: Env; Variables: Vars }>();

/**
 * Los minijuegos NO escriben en `reviews` ni tocan el estado de FSRS.
 * Solo se aplica la regla asimétrica: las palabras falladas adelantan su
 * repaso; acertar nunca extiende el intervalo.
 */
game.post("/result", async (c) => {
  const parsed = gameResultSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "bad_request", detail: parsed.error.issues[0]?.message }, 400);
  }
  const r = parsed.data;
  const userId = c.get("userId");

  await db(c.env).from("game_sessions").insert({
    user_id: userId,
    mode: r.mode,
    score: r.score,
    max_score: r.max_score,
    duration_ms: r.duration_ms ?? null,
    lexeme_ids: r.missed_lexeme_ids,
  });

  let bumped = 0;
  if (r.missed_lexeme_ids.length > 0) {
    bumped = await rpc<number>(c.env, "penalize_from_game", {
      p_user_id: userId,
      p_lexeme_ids: r.missed_lexeme_ids,
    });
  }

  return c.json({ recorded: true, cards_brought_forward: bumped });
});
