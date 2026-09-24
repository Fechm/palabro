import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { db } from "../db.js";
import { settingsSchema } from "../../shared/auth.js";

export const settings = new Hono<{ Bindings: Env; Variables: Vars }>();

settings.get("/", async (c) => {
  const { data, error } = await db(c.env)
    .from("user_stats").select("new_per_day").eq("user_id", c.get("userId")).maybeSingle();
  if (error) throw new Error(`user_stats: ${error.message}`);
  return c.json({ new_per_day: (data as { new_per_day: number } | null)?.new_per_day ?? 20 });
});

settings.put("/", async (c) => {
  const parsed = settingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const { error } = await db(c.env)
    .from("user_stats").update({ new_per_day: parsed.data.new_per_day }).eq("user_id", c.get("userId"));
  if (error) throw new Error(`user_stats: ${error.message}`);
  return c.json(parsed.data);
});
