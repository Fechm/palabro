/**
 * Siembra el corpus validado en Supabase.
 *
 *   npm run corpus:seed            # contra el proyecto local (supabase start)
 *   npm run corpus:seed -- --remote
 *
 * Idempotente: se puede correr las veces que haga falta.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "data");
const CLEAN = join(DATA, "corpus.clean.jsonl");
const CHUNK = 200;

/**
 * Cobertura marginal de una palabra segun su rango de frecuencia.
 *
 * La cobertura acumulada del ingles hablado se ajusta bien a
 *     C(n) ≈ 11.6 · ln(n) − 2.2
 * en el rango 500–3000, curva calibrada contra las cifras conocidas:
 * las 1.000 palabras mas frecuentes cubren ~78%, las 2.000 ~86% y las
 * 2.800 ~90%. La derivada da el aporte de la palabra n:
 *     c(n) = C(n) − C(n−1) ≈ 11.6 / n
 *
 * Es una APROXIMACION. Si algun dia quieres cifras exactas, sustituye
 * esta funcion por los datos de cobertura del corpus que uses.
 */
function marginalCoverage(rank: number): number {
  if (rank < 1) return 0;
  return 11.6 * Math.log((rank + 1) / rank);
}

function client() {
  const remote = process.argv.includes("--remote");
  const url = remote ? process.env.SUPABASE_URL : (process.env.SUPABASE_URL ?? "http://127.0.0.1:54321");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
    process.exit(1);
  }
  console.log(`Destino: ${url}${remote ? "  (REMOTO)" : "  (local)"}`);
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  if (!existsSync(CLEAN)) {
    console.error(`No existe ${CLEAN}. Corre primero: npm run corpus:validate`);
    process.exit(1);
  }

  const entries = readFileSync(CLEAN, "utf8")
    .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  console.log(`Entradas a sembrar: ${entries.length}`);

  const db = client();
  let lexemesUp = 0, contextsUp = 0;

  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);

    const lexemeRows = chunk.map((e: any) => ({
      lemma: e.lemma,
      pos: e.pos,
      cefr: e.cefr,
      freq_rank: e.freq_rank,
      coverage: Number(marginalCoverage(e.freq_rank).toFixed(4)),
      ipa: e.ipa,
      definition_en: e.definition_en,
      definition_es: e.definition_es,
      usage_note: e.usage_note || null,
      false_friend: e.false_friend ?? null,
      collocations: e.collocations,
      common_errors: e.common_errors ?? [],
    }));

    const { data: inserted, error } = await db
      .from("lexemes")
      .upsert(lexemeRows, { onConflict: "lemma,pos" })
      .select("id,lemma,pos");
    if (error) { console.error("Error insertando lexemes:", error.message); process.exit(1); }
    lexemesUp += inserted?.length ?? 0;

    const idOf = new Map((inserted ?? []).map((r) => [`${r.lemma}|${r.pos}`, r.id]));
    const contextRows = chunk.flatMap((e: any) => {
      const lexemeId = idOf.get(`${e.lemma}|${e.pos}`);
      if (!lexemeId) return [];
      return e.contexts.map((c: any) => ({
        lexeme_id: lexemeId,
        text: c.text,
        gloss_es: c.gloss_es,
        level: c.level,
        cloze_start: c.cloze_start,
        cloze_end: c.cloze_end,
        distractors: c.distractors ?? [],
        native_variant: c.native_variant ?? null,
        ord: c.ord,
      }));
    });

    if (contextRows.length) {
      const { error: ctxErr, count } = await db
        .from("contexts")
        .upsert(contextRows, { onConflict: "lexeme_id,ord", count: "exact" });
      if (ctxErr) { console.error("Error insertando contexts:", ctxErr.message); process.exit(1); }
      contextsUp += count ?? contextRows.length;
    }

    process.stdout.write(`\r  ${Math.min(i + CHUNK, entries.length)}/${entries.length}`);
  }

  const totalCoverage = entries.reduce((s: number, e: any) => s + marginalCoverage(e.freq_rank), 0);
  console.log(`\n\nLexemas:  ${lexemesUp}`);
  console.log(`Contextos: ${contextsUp}`);
  console.log(`Cobertura total del corpus: ${totalCoverage.toFixed(1)}% del ingles conversacional`);
}

main().catch((e) => { console.error(e); process.exit(1); });
