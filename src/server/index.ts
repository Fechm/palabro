import { Hono } from "hono";
import type { Env, Vars } from "./env.js";
import { auth } from "./middleware/auth.js";
import { session } from "./routes/session.js";
import { review } from "./routes/review.js";
import { produce } from "./routes/produce.js";
import { explain } from "./routes/explain.js";
import { progress } from "./routes/progress.js";
import { game } from "./routes/game.js";
import { account } from "./routes/account.js";
import { settings } from "./routes/settings.js";
import { scheduled as runCron } from "./scheduled.js";
import { RpcError } from "./db.js";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.get("/api/health", (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));

app.route("/api/auth", account);

// Todo lo demás bajo /api exige un JWT de Supabase válido.
app.use("/api/*", auth);

app.route("/api/session", session);
app.route("/api/review", review);
app.route("/api/produce", produce);
app.route("/api/explain", explain);
app.route("/api/progress", progress);
app.route("/api/game", game);
app.route("/api/settings", settings);

app.onError((err, c) => {
  console.error(err);
  if (err instanceof RpcError) return c.json({ error: "db_error" }, 500);
  return c.json({ error: "internal_error" }, 500);
});

app.notFound((c) =>
  c.req.path.startsWith("/api/")
    ? c.json({ error: "not_found" }, 404)
    // Cualquier otra ruta la sirve el front (SPA).
    : c.env.ASSETS.fetch(c.req.raw),
);

export default {
  fetch: app.fetch,
  scheduled: (_ev: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runCron(env));
  },
} satisfies ExportedHandler<Env>;
