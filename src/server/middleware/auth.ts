import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import type { Env, Vars } from "../env.js";

/**
 * Verifica el JWT de Supabase comprobando la FIRMA localmente, sin ida y
 * vuelta a Supabase en cada petición. Cuesta ~1ms y no consume cuota.
 */
export const auth = createMiddleware<{ Bindings: Env; Variables: Vars }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "unauthorized" }, 401);
    }

    try {
      const secret = new TextEncoder().encode(c.env.SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(header.slice(7), secret, {
        algorithms: ["HS256"],
      });
      if (!payload.sub) return c.json({ error: "unauthorized" }, 401);
      c.set("userId", payload.sub);
    } catch {
      return c.json({ error: "unauthorized", detail: "token inválido o expirado" }, 401);
    }

    await next();
  },
);
