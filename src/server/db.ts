import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env.js";

/**
 * Cliente con service_role. El Worker ya verificó el JWT por su cuenta,
 * así que las funciones RPC reciben p_user_id explícito.
 *
 * Nunca se expone al cliente. La RLS sigue activa como segunda línea de
 * defensa para cualquier acceso que no pase por aquí.
 */
export function db(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class RpcError extends Error {
  constructor(public fn: string, message: string) {
    super(`${fn}: ${message}`);
  }
}

export async function rpc<T>(
  env: Env,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db(env).rpc(fn, args);
  if (error) throw new RpcError(fn, error.message);
  return data as T;
}
