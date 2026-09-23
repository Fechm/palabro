import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { rpc } from "../db.js";
import { buildSession } from "../session-builder.js";
import type { FsrsRow } from "../fsrs.js";

interface RawCard {
  user_card_id: number;
  mastery_level: number;
  state: number;
  reps: number;
  is_new: boolean;
  fsrs: FsrsRow & { level_streak: number };
  lexeme: unknown;
  context: unknown;
}

export const session = new Hono<{ Bindings: Env; Variables: Vars }>();

session.get("/today", async (c) => {
  const raw = await rpc<RawCard[]>(c.env, "get_study_session", {
    p_user_id: c.get("userId"),
    p_due_limit: 20,
    p_new_limit: 5,
  });

  const built = buildSession(raw);

  // El estado FSRS no sale al cliente: se recalcula en el servidor al
  // recibir el repaso. Si viajara al navegador, sería manipulable.
  const cards = built.cards.map(({ fsrs: _fsrs, ...rest }) => rest);

  return c.json({ cards, warmup_count: built.warmup_count, deferred: built.deferred });
});

/** Se llama al terminar la sesión. Solo esto mueve la racha. */
session.post("/complete", async (c) => {
  const streak = await rpc<unknown>(c.env, "record_study_day", {
    p_user_id: c.get("userId"),
  });
  return c.json(streak);
});
