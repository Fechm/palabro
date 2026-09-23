import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { rpc } from "../db.js";

export const progress = new Hono<{ Bindings: Env; Variables: Vars }>();

progress.get("/", async (c) => {
  const data = await rpc<unknown>(c.env, "get_progress", { p_user_id: c.get("userId") });
  return c.json(data);
});
