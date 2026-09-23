import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import type { Env, Vars } from "../env.js";
import { verifyAccessToken } from "../jwt.js";

const jwksByUrl = new Map<string, JWTVerifyGetKey>();

function projectKeys(supabaseUrl: string): JWTVerifyGetKey {
  let keys = jwksByUrl.get(supabaseUrl);
  if (!keys) {
    keys = createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", supabaseUrl));
    jwksByUrl.set(supabaseUrl, keys);
  }
  return keys;
}

export const auth = createMiddleware<{ Bindings: Env; Variables: Vars }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "unauthorized" }, 401);
    }

    try {
      const url = c.env.SUPABASE_URL;
      c.set("userId", await verifyAccessToken(header.slice(7), projectKeys(url), `${url}/auth/v1`));
    } catch {
      return c.json({ error: "unauthorized", detail: "token inválido o expirado" }, 401);
    }

    await next();
  },
);
