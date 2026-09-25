import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { rpc, RpcError } from "../db.js";
import { DEFAULT_TZ, safeTimeZone } from "../../shared/timezone.js";

export const progress = new Hono<{ Bindings: Env; Variables: Vars }>();

progress.get("/", async (c) => {
  const userId = c.get("userId");
  const tz = safeTimeZone(c.req.query("tz"));
  try {
    return c.json(await rpc<unknown>(c.env, "get_progress", { p_user_id: userId, p_tz: tz }));
  } catch (e) {
    if (!(e instanceof RpcError) || tz === DEFAULT_TZ) throw e;
    return c.json(await rpc<unknown>(c.env, "get_progress", { p_user_id: userId, p_tz: DEFAULT_TZ }));
  }
});
