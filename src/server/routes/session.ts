import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { db, rpc } from "../db.js";
import { buildSession } from "../session-builder.js";
import { previewIntervals, type FsrsRow } from "../fsrs.js";

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
  const userId = c.get("userId");
  const { data: stats } = await db(c.env)
    .from("user_stats").select("new_per_day").eq("user_id", userId).maybeSingle();

  const raw = await rpc<RawCard[]>(c.env, "get_study_session", {
    p_user_id: userId,
    p_due_limit: 200,
    p_new_limit: (stats as { new_per_day?: number } | null)?.new_per_day ?? 20,
  });

  const built = buildSession(raw);

  // El estado FSRS no sale al cliente: se recalcula en el servidor al
  // recibir el repaso. Si viajara al navegador, sería manipulable.
  const now = new Date();
  const cards = built.cards.map(({ fsrs, ...rest }) => ({ ...rest, next: previewIntervals(fsrs, now) }));

  return c.json({ cards, warmup_count: built.warmup_count, deferred: built.deferred });
});

/** Se llama al terminar la sesión. Solo esto mueve la racha. */
session.post("/complete", async (c) => {
  const streak = await rpc<unknown>(c.env, "record_study_day", {
    p_user_id: c.get("userId"),
  });
  return c.json(streak);
});
