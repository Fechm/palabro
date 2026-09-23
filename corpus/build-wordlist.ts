/**
 * Construye corpus/data/wordlist.csv a partir de listas publicas.
 *
 *   npm run corpus:wordlist
 *   npm run corpus:wordlist -- --limit 2800 --skip 40
 *
 * Fuentes (se descargan solas la primera vez):
 *
 *  · FrequencyWords (hermitdave) — frecuencias de OpenSubtitles 2018.
 *    Son subtitulos de cine y television: ingles HABLADO real, que es
 *    exactamente lo que queremos ensenar. CC BY-SA 4.0.
 *
 *  · english-words (dwyl) — 370k palabras inglesas, para descartar
 *    nombres propios y ruido. Dominio publico.
 *
 * La lista cruda trae mucha basura: fragmentos de contraccion ('s, 't),
 * nombres de personajes, interjecciones y todas las formas flexionadas
 * por separado. Este script las limpia.
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "data");
const FREQ = join(DATA, "en_50k.txt");
const DICT = join(DATA, "words_alpha.txt");
const OUT = join(DATA, "wordlist.csv");

const FREQ_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt";
const DICT_URL = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";

/** Interjecciones y muletillas: frecuentisimas en subtitulos, inutiles como tarjeta. */
const NOISE = new Set([
  "uh","oh","ah","ahh","hmm","hm","mm","mmm","huh","ha","haha","hey","hi",
  "wow","ugh","eh","er","um","umm","ooh","aah","whoa","yay","ow","ouch",
  "shh","psst","yep","yup","nope","nah","uhh","mhm","aw","aww","gee","oi",
  "hm","hmmm","ho","la","na","da","ya","yo","huh","eek","ahem",
  "yeah","yea","ok","okay",
  // Fragmentos de contraccion: la lista cruda parte "don't" en "don"+"t".
  "don","didn","doesn","isn","wasn","aren","weren","haven","hasn","hadn",
  "couldn","wouldn","shouldn","mustn","ain","ve","ll","re","em","til",
]);

/**
 * Palabras funcion. Dominan el top de cualquier lista de frecuencia y NO
 * se aprenden con tarjetas: se aprenden usandolas. Una tarjeta que
 * pregunte "que significa 'the'" no ensena nada a nadie.
 *
 * Las preposiciones quedan fuera de la lista principal a proposito: son
 * un dolor real para hispanohablantes ("depend on", no "depend of"),
 * pero se aprenden como colocaciones de palabras con contenido, que es
 * justo lo que el corpus guarda en el campo `collocations`.
 */
const FUNCTION_WORDS = new Set([
  // pronombres
  "i","you","he","she","it","we","they","me","him","her","us","them",
  "my","your","his","its","our","their","mine","yours","hers","ours","theirs",
  "myself","yourself","himself","herself","itself","ourselves","themselves",
  "one","ones","some","any","none","each","every","all","both","few","many","much",
  // determinantes
  "the","a","an","this","that","these","those","such","own",
  // auxiliares y modales
  "be","am","is","are","was","were","been","being","do","does","did","done",
  "have","has","had","having","will","would","shall","should","can","could",
  "may","might","must","let","gonna","wanna","gotta",
  // preposiciones
  "of","to","in","for","on","with","at","by","from","up","about","into","over",
  "after","under","above","below","between","through","during","before",
  "against","among","around","off","out","down","near","upon","onto","within",
  "without","along","across","behind","beyond","toward","towards","per","via",
  // conjunciones
  "and","or","but","if","because","as","until","while","than","though",
  "although","unless","whether","so","nor","yet","since","once",
  // interrogativos y negacion
  "who","what","when","where","why","how","which","whom","whose","not","no","yes",
]);

/** Formas base plausibles de una palabra flexionada. */
function baseForms(w: string): string[] {
  const out: string[] = [];
  const push = (s: string) => { if (s.length >= 2) out.push(s); };

  if (w.endsWith("ies")) { push(w.slice(0, -3) + "y"); push(w.slice(0, -2)); }
  if (w.endsWith("ied")) { push(w.slice(0, -3) + "y"); }
  if (w.endsWith("es"))  { push(w.slice(0, -2)); push(w.slice(0, -1)); }
  if (w.endsWith("s") && !w.endsWith("ss")) push(w.slice(0, -1));
  if (w.endsWith("ed"))  { push(w.slice(0, -2)); push(w.slice(0, -1)); }
  if (w.endsWith("ing")) { push(w.slice(0, -3)); push(w.slice(0, -3) + "e"); }
  // Consonante doblada: stopping -> stop, running -> run
  const m = /^(.*?)([bdfglmnprt])\2(ing|ed)$/.exec(w);
  if (m?.[1] && m[2]) push(m[1] + m[2]);
  if (w.endsWith("ly"))  push(w.slice(0, -2));   // solo para detectar duplicados
  return [...new Set(out)];
}

async function ensure(path: string, url: string, label: string) {
  if (existsSync(path)) return;
  process.stdout.write(`Descargando ${label}… `);
  const res = await fetch(url);
  if (!res.ok) { console.error(`\nFallo (${res.status}) al descargar ${url}`); process.exit(1); }
  writeFileSync(path, await res.text());
  console.log("ok");
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (f: string) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
  return {
    limit: Number(get("--limit") ?? 2800),
    skip: Number(get("--skip") ?? 0),
  };
}

async function main() {
  mkdirSync(DATA, { recursive: true });
  const { limit, skip } = parseArgs();

  await ensure(FREQ, FREQ_URL, "lista de frecuencias (OpenSubtitles)");
  await ensure(DICT, DICT_URL, "diccionario ingles");

  const dict = new Set(
    readFileSync(DICT, "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean),
  );

  const accepted: string[] = [];
  const acceptedSet = new Set<string>();
  const stats = { total: 0, noAlpha: 0, noise: 0, notInDict: 0, inflected: 0, lemmatized: 0 };

  for (const line of readFileSync(FREQ, "utf8").split("\n")) {
    const word = line.split(" ")[0]?.trim().toLowerCase();
    if (!word) continue;
    stats.total++;

    if (!/^[a-z]+$/.test(word) || word.length < 2) { stats.noAlpha++; continue; }
    if (NOISE.has(word) || FUNCTION_WORDS.has(word)) { stats.noise++;  continue; }
    if (!dict.has(word))                            { stats.notInDict++; continue; }

    // Si ya aceptamos su forma base (mas frecuente), esta es una flexion.
    const bases = baseForms(word);
    if (bases.some((b) => acceptedSet.has(b))) { stats.inflected++; continue; }

    // Preferimos el lema sobre la flexion: si "decided" es mas frecuente
    // que "decide" pero "decide" existe, la tarjeta ensena "decide".
    const lemma = bases.find((b) => dict.has(b) && !acceptedSet.has(b)) ?? word;
    if (acceptedSet.has(lemma)) { stats.inflected++; continue; }
    if (lemma !== word) stats.lemmatized++;

    accepted.push(lemma);
    acceptedSet.add(lemma);
    acceptedSet.add(word);
    if (accepted.length >= skip + limit) break;
  }

  const selected = accepted.slice(skip, skip + limit);
  const csv = ["freq_rank,lemma", ...selected.map((w, i) => `${i + 1},${w}`)].join("\n");
  writeFileSync(OUT, csv + "\n");

  console.log(`\nTokens leidos:        ${stats.total}`);
  console.log(`  descartados por forma:      ${stats.noAlpha}`);
  console.log(`  interjecciones y funcion:   ${stats.noise}`);
  console.log(`  fuera del diccionario:      ${stats.notInDict}  (nombres propios, jerga)`);
  console.log(`  formas flexionadas:         ${stats.inflected}`);
  console.log(`  reducidas a su lema:        ${stats.lemmatized}`);
  console.log(`\nSaltadas (palabras funcion): ${skip}`);
  console.log(`Escritas en wordlist.csv:    ${selected.length}`);
  console.log(`\nPrimeras 15: ${selected.slice(0, 15).join(", ")}`);
  console.log(`Ultimas 10:  ${selected.slice(-10).join(", ")}`);
  console.log(`\nSalida: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
