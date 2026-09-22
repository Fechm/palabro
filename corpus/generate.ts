/**
 * Generador de corpus.
 *
 *   npm run corpus:generate -- --limit 100      # prueba corta
 *   npm run corpus:generate                     # todo
 *
 * Cuatro decisiones que importan:
 *
 *  1. BATCH DE 10 POR PETICION. El limite del free tier de Gemini son
 *     REQUESTS (1.500/dia), no tokens (1M/min). Con 10 palabras por
 *     llamada, 2.800 palabras son 280 peticiones: una tarde, no dos dias.
 *
 *  2. CHECKPOINT A JSONL. Cada lote se escribe apenas llega. Si el
 *     script muere en la palabra 1.400, se reanuda desde ahi. Nunca se
 *     regenera lo ya hecho.
 *
 *  3. VALIDACION CON ZOD antes de aceptar nada. Lo que no pasa se
 *     reencola y se reintenta.
 *
 *  4. BACKOFF ANTE 429. Si se agota la cuota diaria, el script para
 *     limpio y mañana continua donde quedo.
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { corpusEntrySchema, geminiResponseSchema, type CorpusEntry } from "./schema.js";
import { SYSTEM_PROMPT, buildBatchPrompt } from "./prompt.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "data");
const OUT = join(DATA, "corpus.jsonl");
const WORDLIST = join(DATA, "wordlist.csv");

const MODEL = "gemini-2.5-flash";
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const PAUSE_MS = 1_500; // cortesia entre lotes; el free tier limita por minuto

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Falta GEMINI_API_KEY. Consiguela gratis en https://aistudio.google.com/apikey");
  process.exit(1);
}

interface WordRow { lemma: string; pos?: string; freq_rank: number }

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return { limit: Number(get("--limit") ?? Infinity) };
}

/** wordlist.csv: freq_rank,lemma,pos  (pos opcional) */
function loadWordlist(): WordRow[] {
  if (!existsSync(WORDLIST)) {
    console.error(`No encuentro ${WORDLIST}`);
    console.error("Descarga la NGSL (New General Service List) y guardala como");
    console.error("corpus/data/wordlist.csv con columnas: freq_rank,lemma,pos");
    console.error("Ver corpus/data/README.md");
    process.exit(1);
  }
  const lines = readFileSync(WORDLIST, "utf8").trim().split("\n");
  const rows: WordRow[] = [];
  for (const [i, line] of lines.entries()) {
    if (i === 0 && line.toLowerCase().startsWith("freq_rank")) continue; // cabecera
    const [rank, lemma, pos] = line.split(",").map((s) => s?.trim());
    if (!lemma) continue;
    rows.push({ freq_rank: Number(rank), lemma, pos: pos || undefined });
  }
  return rows.sort((a, b) => a.freq_rank - b.freq_rank);
}

/** Lee el checkpoint para saber que ya esta hecho. */
function loadDone(): Set<string> {
  const done = new Set<string>();
  if (!existsSync(OUT)) return done;
  for (const line of readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as CorpusEntry;
      done.add(`${e.lemma}|${e.pos}`);
      done.add(e.lemma); // por si la lista no traia pos
    } catch { /* linea corrupta: se ignora y se regenera */ }
  }
  return done;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini(words: WordRow[]): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildBatchPrompt(words) }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: geminiResponseSchema,
      },
    }),
  });

  if (res.status === 429) throw Object.assign(new Error("rate_limited"), { code: 429 });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as any;
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Respuesta sin contenido");
  return JSON.parse(text);
}

async function generateBatch(words: WordRow[]): Promise<CorpusEntry[]> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await callGemini(words);
      if (!Array.isArray(raw)) throw new Error("La respuesta no es un array");

      const ok: CorpusEntry[] = [];
      for (const item of raw) {
        const parsed = corpusEntrySchema.safeParse(item);
        if (parsed.success) ok.push(parsed.data);
        else console.warn(`  ⚠ descartado "${(item as any)?.lemma}": ${parsed.error.issues[0]?.message}`);
      }
      if (ok.length === 0) throw new Error("Ninguna entrada paso la validacion");
      return ok;
    } catch (err: any) {
      if (err.code === 429) {
        // Cuota diaria agotada: parar limpio, mañana se reanuda.
        console.error("\n⛔ Cuota diaria de Gemini agotada.");
        console.error("   El progreso esta guardado. Vuelve a correr el script mañana.");
        process.exit(0);
      }
      const wait = 2_000 * 2 ** (attempt - 1);
      console.warn(`  ⚠ intento ${attempt}/${MAX_RETRIES} fallo (${err.message}). Reintento en ${wait / 1000}s`);
      if (attempt === MAX_RETRIES) return [];
      await sleep(wait);
    }
  }
  return [];
}

async function main() {
  const { limit } = parseArgs();
  mkdirSync(DATA, { recursive: true });

  const all = loadWordlist();
  const done = loadDone();
  const pending = all
    .filter((w) => !done.has(w.lemma) && !done.has(`${w.lemma}|${w.pos}`))
    .slice(0, limit === Infinity ? undefined : limit);

  console.log(`Lista: ${all.length} palabras · ya generadas: ${done.size ? all.length - pending.length : 0} · pendientes: ${pending.length}`);
  if (pending.length === 0) {
    console.log("Nada que hacer. El corpus esta completo.");
    return;
  }

  const totalBatches = Math.ceil(pending.length / BATCH_SIZE);
  let written = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const n = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`[${n}/${totalBatches}] ${batch.map((w) => w.lemma).join(", ").slice(0, 60)}… `);

    const entries = await generateBatch(batch);
    if (entries.length === 0) {
      failed += batch.length;
      console.log("✗");
      continue;
    }

    // Checkpoint inmediato: una linea JSON por entrada.
    const rankOf = new Map(batch.map((w) => [w.lemma.toLowerCase(), w.freq_rank]));
    for (const e of entries) {
      const withRank = { ...e, freq_rank: rankOf.get(e.lemma.toLowerCase()) ?? 99_999 };
      appendFileSync(OUT, JSON.stringify(withRank) + "\n");
    }
    written += entries.length;
    console.log(`✓ ${entries.length}`);

    await sleep(PAUSE_MS);
  }

  console.log(`\nListo. Generadas ${written} · fallidas ${failed}`);
  console.log(`Salida: ${OUT}`);
  console.log("Siguiente paso: npm run corpus:validate");
}

main().catch((e) => { console.error(e); process.exit(1); });
