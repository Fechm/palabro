import type { Env } from "./env.js";
import { db } from "./db.js";

/**
 * Cron diario. Hace dos cosas:
 *
 *  1. Mantiene vivo el proyecto de Supabase. El plan free lo pausa tras
 *     ~1 semana sin actividad; una consulta al día lo evita.
 *  2. Deja calculado quién tiene tarjetas pendientes, para el aviso.
 */
export async function scheduled(env: Env): Promise<void> {
  const client = db(env);

  const { count, error } = await client
    .from("lexemes")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("cron: Supabase no responde:", error.message);
    return;
  }
  console.log(`cron: keep-alive ok · ${count} lexemas en el corpus`);

  const { data: pending, error: pendErr } = await client
    .from("user_cards")
    .select("user_id")
    .lte("due", new Date().toISOString());

  if (pendErr) { console.error("cron:", pendErr.message); return; }

  const porUsuario = new Map<string, number>();
  for (const row of pending ?? []) {
    porUsuario.set(row.user_id, (porUsuario.get(row.user_id) ?? 0) + 1);
  }
  console.log(`cron: ${porUsuario.size} usuarios con tarjetas pendientes`);

  // TODO(fase 2): enviar la notificación push con estos datos.
}
