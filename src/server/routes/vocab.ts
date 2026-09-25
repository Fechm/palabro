import { Hono } from "hono";
import type { Env, Vars } from "../env.js";
import { rpc } from "../db.js";

export const vocab = new Hono<{ Bindings: Env; Variables: Vars }>();

vocab.get("/", async (c) => c.json(await rpc<unknown>(c.env, "get_vocabulary", { p_user_id: c.get("userId") })));
