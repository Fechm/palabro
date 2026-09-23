/**
 * Valida el corpus generado y calcula los huecos (cloze).
 *
 *   npm run corpus:validate
 *   npm run corpus:validate -- --in corpus/data/parts/rev-001.jsonl --report-only
 *
 * Un paso barato que ahorra mucho dolor: el corpus es un activo
 * permanente, y un error aqui lo arrastras durante años.
 *
 * Entrada:  corpus/data/corpus.jsonl        (crudo del modelo)
 * Salida:   corpus/data/corpus.clean.jsonl  (validado, con cloze)
 *           corpus/data/rejected.jsonl      (para regenerar)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { corpusEntrySchema, type CorpusEntry } from "./schema.js";
import { CEFR } from "../src/shared/schemas.js";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "data");
const argv = process.argv.slice(2);
const inArg = argv.indexOf("--in");
const IN = inArg >= 0 && argv[inArg + 1] ? argv[inArg + 1]! : join(DATA, "corpus.jsonl");
const REPORT_ONLY = argv.includes("--report-only");
const CLEAN = join(DATA, "corpus.clean.jsonl");
const REJECTED = join(DATA, "rejected.jsonl");

type Entry = CorpusEntry & { freq_rank: number };

/** Formas flexionadas habituales, para localizar la palabra en la frase. */
function inflections(lemma: string): string[] {
  const l = lemma.toLowerCase();
  const out = [l, `${l}s`, `${l}es`, `${l}ed`, `${l}ing`, `${l}'s`];
  if (l.endsWith("e")) out.push(`${l.slice(0, -1)}ing`, `${l}d`);
  if (l.endsWith("y")) out.push(`${l.slice(0, -1)}ies`, `${l.slice(0, -1)}ied`);
  if (l.endsWith("ay") || l.endsWith("ey") || l.endsWith("oy")) out.push(`${l}s`);
  const last = l.at(-1);
  if (last && "bdfglmnprt".includes(last) && l.length >= 3) {
    out.push(`${l}${last}ing`, `${l}${last}ed`); // stop -> stopping
  }
  return [...new Set(out)].sort((a, b) => b.length - a.length); // la mas larga primero
}

/** Devuelve [inicio, fin) de la palabra objetivo dentro del texto, o null. */
function findSpan(text: string, lemma: string): [number, number] | null {
  const lower = text.toLowerCase();
  for (const form of inflections(lemma)) {
    const re = new RegExp(`\\b${form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    const m = re.exec(lower);
    if (m && m.index >= 0) return [m.index, m.index + m[0].length];
  }
  return null;
}

type Cefr = (typeof CEFR)[number];
const CEFR_ORDER: Record<Cefr, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

interface Problem { lemma: string; issue: string }

function main() {
  if (!existsSync(IN)) {
    console.error(`No existe ${IN}. Corre primero: npm run corpus:generate`);
    process.exit(1);
  }

  const lines = readFileSync(IN, "utf8").split("\n").filter((l) => l.trim());
  const clean: unknown[] = [];
  const rejected: unknown[] = [];
  const problems: Problem[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    let raw: Entry;
    try { raw = JSON.parse(line); } catch { problems.push({ lemma: "?", issue: "JSON invalido" }); continue; }

    const parsed = corpusEntrySchema.safeParse(raw);
    if (!parsed.success) {
      problems.push({ lemma: raw?.lemma ?? "?", issue: `esquema: ${parsed.error.issues[0]?.message}` });
      rejected.push(raw);
      continue;
    }
    const e = parsed.data;
    const key = `${e.lemma.toLowerCase()}|${e.pos}`;

    // ── Duplicados ────────────────────────────────────────────────────
    if (seen.has(key)) { problems.push({ lemma: e.lemma, issue: "duplicado" }); continue; }

    // ── La definicion no puede usar la palabra definida ───────────────
    const defRe = new RegExp(`\\b${e.lemma.toLowerCase()}\\b`);
    if (defRe.test(e.definition_en.toLowerCase())) {
      problems.push({ lemma: e.lemma, issue: "definition_en usa la palabra misma" });
      rejected.push(raw); continue;
    }

    // ── El IPA debe parecer IPA ───────────────────────────────────────
    if (!/^\/.+\/$/.test(e.ipa.trim())) {
      problems.push({ lemma: e.lemma, issue: `ipa sospechoso: "${e.ipa}"` });
    }

    // ── Cada frase debe contener realmente la palabra ─────────────────
    const contexts: any[] = [];
    let contextFailures = 0;
    let distractorShortfall = 0;
    for (const ctx of e.contexts) {
      const span = findSpan(ctx.text, e.lemma);
      if (!span) { contextFailures++; continue; }
      const words = ctx.text.trim().split(/\s+/).length;
      if (words < 3 || words > 20) { contextFailures++; continue; }
      // Un distractor igual a la respuesta convierte la tarjeta en una
      // trampa: se filtran, junto con los duplicados.
      const answer = ctx.text.slice(span[0], span[1]).toLowerCase();
      const distractors = [...new Set((ctx.distractors ?? []).map((d) => d.trim()))]
        .filter((d) => d && d.toLowerCase() !== answer);
      if (distractors.length < 3) distractorShortfall++;

      contexts.push({ ...ctx, distractors, cloze_start: span[0], cloze_end: span[1] });
    }

    if (contexts.length < 3) {
      problems.push({ lemma: e.lemma, issue: `solo ${contexts.length} frases utiles de ${e.contexts.length}` });
      rejected.push(raw); continue;
    }
    if (contextFailures > 0) {
      problems.push({ lemma: e.lemma, issue: `${contextFailures} frase(s) descartada(s)` });
    }
    if (distractorShortfall > 0) {
      problems.push({ lemma: e.lemma, issue: `${distractorShortfall} frase(s) con menos de 3 distractores` });
    }

    // ── Colocaciones distintas entre si ───────────────────────────────
    const colls = [...new Set(e.collocations.map((c) => c.toLowerCase().trim()))];
    if (colls.length < 2) {
      problems.push({ lemma: e.lemma, issue: "menos de 2 colocaciones utiles" });
    }

    seen.add(key);
    clean.push({
      ...e,
      freq_rank: raw.freq_rank ?? 99_999,
      collocations: colls,
      contexts: contexts
        // Graduadas primero por nivel CEFR y, a igualdad de nivel, por
        // longitud. Ordenar solo por longitud dejaba frases B1 antes que A2.
        .sort((a, b) =>
          CEFR_ORDER[a.level as Cefr] - CEFR_ORDER[b.level as Cefr] ||
          a.text.length - b.text.length)
        .map((c, i) => ({ ...c, ord: i + 1 })),
    });
  }

  if (!REPORT_ONLY) writeFileSync(CLEAN, clean.map((c) => JSON.stringify(c)).join("\n") + "\n");
  if (rejected.length && !REPORT_ONLY) {
    writeFileSync(REJECTED, rejected.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }

  // ── Informe ─────────────────────────────────────────────────────────
  console.log(`\nEntradas leidas:   ${lines.length}`);
  console.log(`Validas:           ${clean.length}`);
  console.log(`Rechazadas:        ${rejected.length}`);
  console.log(`Avisos:            ${problems.length}`);

  if (problems.length) {
    console.log("\nPrimeros 25 avisos:");
    const shown = REPORT_ONLY ? problems : problems.slice(0, 25);
    for (const p of shown) console.log(`  · ${p.lemma}: ${p.issue}`);
    if (problems.length > shown.length) console.log(`  … y ${problems.length - shown.length} mas`);
  }

  const withFF = clean.filter((c: any) => c.false_friend).length;
  const withErrors = clean.filter((c: any) => c.common_errors?.length).length;
  console.log(`\nCon falso amigo:   ${withFF} (${((withFF / clean.length) * 100).toFixed(1)}%)`);
  console.log(`Con errores tipicos: ${withErrors} (${((withErrors / clean.length) * 100).toFixed(1)}%)`);
  console.log(`\nSalida: ${CLEAN}`);

  if (rejected.length) {
    console.log(`\nPara regenerar lo rechazado: borra esas lineas de corpus.jsonl y vuelve a correr corpus:generate`);
  }
}

main();
