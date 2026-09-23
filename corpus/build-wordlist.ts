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
 *  · lemmatization-lists (michmech) — pares lema/forma del ingles, para
 *    llevar cada inflexion a su lema. ODbL 1.0.
 *
 * La lista cruda trae mucha basura: fragmentos de contraccion ('s, 't),
 * nombres de personajes, interjecciones y todas las formas flexionadas
 * por separado. Este script las limpia.
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLemmaFile, pickLemma, preferForm } from "./lemmatize.js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "data");
const FREQ = join(DATA, "en_50k.txt");
const DICT = join(DATA, "words_alpha.txt");
const LEMMAS = join(DATA, "lemmatization-en.txt");
const OUT = join(DATA, "wordlist.csv");

const FREQ_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt";
const DICT_URL = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";
const LEMMAS_URL = "https://raw.githubusercontent.com/michmech/lemmatization-lists/master/lemmatization-en.txt";

const SHORT_OK = new Set(["go", "tv"]);

const PROPER_NOUNS = new Set([
  "john","jesus","sam","michael","george","david","york","charlie","america","paul","mary","ben",
  "james","danny","paris","london","alex","jim","tony","adam","steve","sarah","richard","jane",
  "johnny","tommy","eddie","jake","robert","chris","charles","amy","roger","kim","jeff","france",
  "kevin","dan","england","daniel","eric","thomas","scott","pete","kate","dave","brian","william",
  "larry","simon","jerry","andy","jason","santa","tim","alan","europe","emily","kelly","alice",
  "walter","rachel","rome","arthur","lucy","phil","emma","carl","annie","india","gary","luke",
  "claire","fred","washington","carter","louis","josh","sean","susan","germany","africa","kyle",
  "clark","blake","japan","california","elizabeth","chicago","karen","jackson","helen","julie",
  "taylor","gordon","joey","mexico","greg","jones","ricky","jamie","amanda","maggie","marty",
  "howard","hitler","barry","anne","johnson","patrick","terry","andrew","hollywood","jackie",
  "jesse","sara","stan","marie","doug","abby","jean","linda","bruce","katie","roy","todd","lou",
  "albert","parker","joseph","oliver","wilson","donna","italy","vincent","angela","jessica",
  "steven","charlotte","justin","kong","jordan","betty","edward","texas","nathan","margaret","ross",
  "lewis","tyler","catherine","stephen","rebecca","barbara","russia","tina","jeremy","ellen",
  "kenny","nina","carlos","michelle","brad","oscar","chloe","tokyo","davis","wayne","ian","spain",
  "nancy","russell","judy","beth","angeles","martha","harvey","ann","jonathan","dennis","dylan",
  "eva","francisco","jess","jennifer","anthony","cooper","boston","ron","derek","virginia","vince",
  "matthew","francis","britain","vic","casey","jacob","liz","gus","nate","olivia","louise",
  "williams","ralph","keith","malcolm","ethan","cole","stanley","rita","maya","toby","jin","sammy",
  "philip","carrie","julian","alexander","florida","aaron","lois","victoria","ruth","diane","craig",
  "harold","monica","diana","miami","owen","marshall","scotland","canada","han","von","marco","fbi",
  "cia","joan","herr","karl","shawn","natalie","nelson","korea","janet","harris","mia","raymond","sonny",
  "wendy","juan","riley","sydney","neil","gloria","shane","felix","moscow","logan","noah","evan","christine","mel",
  "graham","ivan","lincoln","travis","leslie","brandon",
]);

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
  "whoo","heh","gosh","jeez","blah","gimme","indistinct","thou","thy","mrs","indistinctly",
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
  await ensure(LEMMAS, LEMMAS_URL, "lista de lemas");

  const dict = new Set(
    readFileSync(DICT, "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean),
  );

  const lemmas = parseLemmaFile(readFileSync(LEMMAS, "utf8"));
  const excluded = (w: string) => NOISE.has(w) || FUNCTION_WORDS.has(w) || PROPER_NOUNS.has(w);
  const counts = new Map<string, number>();
  for (const line of readFileSync(FREQ, "utf8").split("\n")) {
    const [w, n] = line.trim().split(" ");
    if (w && n) counts.set(w.toLowerCase(), Number(n));
  }

  const accepted: string[] = [];
  const acceptedSet = new Set<string>();
  const stats = { total: 0, noAlpha: 0, noise: 0, notInDict: 0, tooShort: 0, inflected: 0, lemmatized: 0 };

  for (const line of readFileSync(FREQ, "utf8").split("\n")) {
    const word = line.split(" ")[0]?.trim().toLowerCase();
    if (!word) continue;
    stats.total++;

    if (!/^[a-z]+$/.test(word) || word.length < 2) { stats.noAlpha++; continue; }
    if (excluded(word))                             { stats.noise++;  continue; }
    if (!dict.has(word))                            { stats.notInDict++; continue; }

    const picked = pickLemma(word, lemmas, excluded);
    const lemma = picked && preferForm(word, picked, counts);
    if (!lemma || excluded(lemma))                    { stats.noise++; continue; }
    if (lemma.length < 3 && !SHORT_OK.has(lemma))     { stats.tooShort++; continue; }
    if (!dict.has(lemma))                             { stats.notInDict++; continue; }
    if (acceptedSet.has(lemma))                       { stats.inflected++; continue; }
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
  console.log(`  demasiado cortas:           ${stats.tooShort}`);
  console.log(`  formas flexionadas:         ${stats.inflected}`);
  console.log(`  reducidas a su lema:        ${stats.lemmatized}`);
  console.log(`\nSaltadas (palabras funcion): ${skip}`);
  console.log(`Escritas en wordlist.csv:    ${selected.length}`);
  console.log(`\nPrimeras 15: ${selected.slice(0, 15).join(", ")}`);
  console.log(`Ultimas 10:  ${selected.slice(-10).join(", ")}`);
  console.log(`\nSalida: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
