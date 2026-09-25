import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { db } from "../db.js";
import { settingsSchema, type Settings } from "../../shared/auth.js";

export const settings = new Hono<{ Bindings: Env; Variables: Vars }>();

async function read(env: Env, userId: string): Promise<Settings> {
  const { data, error } = await db(env)
    .from("user_stats").select("new_per_day,tutorial_done").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`user_stats: ${error.message}`);
  const row = data as Partial<Settings> | null;
  return { new_per_day: row?.new_per_day ?? 20, tutorial_done: row?.tutorial_done ?? false };
}

settings.get("/", async (c) => c.json(await read(c.env, c.get("userId"))));

settings.put("/", async (c) => {
  const parsed = settingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const { error } = await db(c.env)
    .from("user_stats").update(parsed.data).eq("user_id", c.get("userId"));
  if (error) throw new Error(`user_stats: ${error.message}`);
  return c.json(await read(c.env, c.get("userId")));
});
