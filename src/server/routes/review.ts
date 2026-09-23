import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { rpc } from "../db.js";
import { reviewRequestSchema } from "../../shared/schemas.js";
import { applyGrade } from "../../shared/mastery.js";
import { schedule, type FsrsRow } from "../fsrs.js";

export const review = new Hono<{ Bindings: Env; Variables: Vars }>();

interface CardRow extends FsrsRow {
  id: number;
  mastery_level: number;
  level_streak: number;
  user_id: string;
}

review.post("/", async (c) => {
  const parsed = reviewRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "bad_request", detail: parsed.error.issues[0]?.message }, 400);
  }
  const body = parsed.data;
  const userId = c.get("userId");

  const rows = await rpc<CardRow[]>(c.env, "get_card_state", {
    p_user_id: userId,
    p_user_card_id: body.user_card_id,
  });
  const card = rows?.[0];
  if (!card) return c.json({ error: "not_found" }, 404);

  const before: FsrsRow = {
    due: card.due, stability: card.stability, difficulty: card.difficulty,
    elapsed_days: card.elapsed_days, scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps, reps: card.reps, lapses: card.lapses,
    state: card.state, last_review: card.last_review,
  };

  const next = schedule(before, body.grade);
  const mastery = applyGrade(
    { mastery_level: card.mastery_level, level_streak: card.level_streak },
    body.grade,
  );

  await rpc(c.env, "apply_review", {
    p_user_id: userId,
    p_user_card_id: body.user_card_id,
    p_grade: body.grade,
    p_card_type: body.card_type,
    p_context_id: body.context_id,
    p_latency_ms: body.latency_ms ?? null,
    p_state_before: before,
    p_fsrs: next,
    p_mastery_level: mastery.mastery_level,
    p_level_streak: mastery.level_streak,
  });

  return c.json({
    due: next.due,
    mastery_level: mastery.mastery_level,
    leveled_up: mastery.leveled_up,
    leveled_down: mastery.leveled_down,
  });
});
