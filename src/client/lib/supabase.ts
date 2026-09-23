import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Copia .env.example a .env.",
  );
}

/**
 * El cliente de Supabase se usa SOLO para autenticación: magic link,
 * sesión y refresco del token.
 *
 * Los datos NUNCA se leen ni escriben directamente desde aquí; van todos
 * por el Worker. El armado de la sesión y el cálculo de FSRS son lógica
 * de servidor: si el navegador pudiera escribir en user_cards, cualquiera
 * alteraría su progreso desde la consola y el log de repasos dejaría de
 * servir para nada.
 */
export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
