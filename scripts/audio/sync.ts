/**
 * Llena lexemes.audio_url con /audio/words/<lemma>.mp3 para cada lema que tenga
 * archivo en public/audio/words/, y lo deja en null para los que no.
 *
 *   npm run audio:sync
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORDS = join(ROOT, "public", "audio", "words");

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db.from("lexemes").select("id,lemma,audio_url");
  if (error) throw new Error(error.message);
  const rows = data as { id: number; lemma: string; audio_url: string | null }[];

  const changes = rows
    .map((r) => {
      const file = `${r.lemma.toLowerCase()}.mp3`;
      return { id: r.id, before: r.audio_url, after: existsSync(join(WORDS, file)) ? `/audio/words/${file}` : null };
    })
    .filter((c) => c.before !== c.after);

  for (let i = 0; i < changes.length; i += 20) {
    await Promise.all(changes.slice(i, i + 20).map(async (c) => {
      const res = await db.from("lexemes").update({ audio_url: c.after }).eq("id", c.id);
      if (res.error) throw new Error(`lexeme ${c.id}: ${res.error.message}`);
    }));
  }
  const withAudio = rows.length - rows.filter((r) => !existsSync(join(WORDS, `${r.lemma.toLowerCase()}.mp3`))).length;
  console.log(`Lexemas: ${rows.length} · con audio: ${withAudio} · actualizados ahora: ${changes.length}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
