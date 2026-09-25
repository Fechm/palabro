/**
 * Genera el audio de pronunciación de cada palabra con ElevenLabs.
 *
 *   npm run audio:words -- --limit 5     # prueba corta: escucha antes de gastar créditos
 *   npm run audio:words                  # el resto
 *
 * Salida: public/audio/words/<lemma>.mp3. Es reanudable: salta lo que ya existe.
 * Antes de empezar consulta los créditos disponibles y no arranca si no alcanzan.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLEAN = join(ROOT, "corpus", "data", "corpus.clean.jsonl");
const OUT = join(ROOT, "public", "audio", "words");
const API = "https://api.elevenlabs.io/v1";

const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || "IRHApOXLvnW57QJPQH2P";
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function remainingCredits(): Promise<number | null> {
  const res = await fetch(`${API}/user/subscription`, { headers: { "xi-api-key": KEY! } });
  if (res.status === 401 && (await res.text()).includes("missing_permissions")) return null;
  if (res.status === 401) throw new Error("ElevenLabs rechazó la clave (401). Revisa ELEVENLABS_API_KEY en .env.");
  if (!res.ok) throw new Error(`No se pudo consultar la suscripción: ${res.status}`);
  const sub = (await res.json()) as { character_count: number; character_limit: number };
  return sub.character_limit - sub.character_count;
}

async function synthesize(text: string): Promise<ArrayBuffer> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${API}/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": KEY!, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: MODEL, language_code: "en" }),
    });
    if (res.ok) return res.arrayBuffer();
    const body = await res.text();
    if (res.status === 429 && attempt < 4) {
      await sleep(5_000 * attempt);
      continue;
    }
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
  }
  throw new Error("ElevenLabs no respondió tras varios intentos");
}

async function main() {
  if (!KEY) {
    console.error("Falta ELEVENLABS_API_KEY en .env");
    process.exit(1);
  }
  const limit = Number(arg("--limit") ?? Infinity);
  const lemmas = [...new Set(
    readFileSync(CLEAN, "utf8").split("\n").filter((l) => l.trim())
      .map((l) => (JSON.parse(l) as { lemma: string }).lemma.toLowerCase()),
  )];
  mkdirSync(OUT, { recursive: true });

  const pending = lemmas.filter((w) => !existsSync(join(OUT, `${w}.mp3`))).slice(0, limit);
  const needed = pending.reduce((s, w) => s + w.length, 0);
  const available = await remainingCredits();
  console.log(`Palabras: ${lemmas.length} · pendientes ahora: ${pending.length} · caracteres: ${needed}`);
  console.log(`Créditos disponibles: ${available ?? "desconocidos (la clave no tiene permiso user_read)"} · modelo ${MODEL}`);
  if (available !== null && needed > available && !process.argv.includes("--force")) {
    console.error("No alcanzan los créditos. Usa --limit para generar una parte, o espera al próximo mes.");
    process.exit(1);
  }

  let done = 0;
  for (const word of pending) {
    try {
      writeFileSync(join(OUT, `${word}.mp3`), Buffer.from(await synthesize(word)));
      done++;
      if (done % 25 === 0 || done === pending.length) console.log(`  ${done}/${pending.length}`);
    } catch (e) {
      console.error(`\nSe detuvo en «${word}»: ${(e as Error).message}`);
      console.error(`Generadas en esta corrida: ${done}. Al volver a correrlo continúa donde quedó.`);
      process.exit(1);
    }
  }
  console.log(`Listo: ${done} audios nuevos en ${OUT}`);
}

main();
