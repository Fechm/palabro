export interface LemmaIndex {
  formToLemmas: Map<string, string[]>;
  lemmas: Set<string>;
}

export function parseLemmaFile(text: string): LemmaIndex {
  const formToLemmas = new Map<string, string[]>();
  const lemmas = new Set<string>();
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const [lemma, form] = raw.trim().toLowerCase().split("\t");
    if (!lemma || !form) continue;
    lemmas.add(lemma);
    const list = formToLemmas.get(form);
    if (!list) formToLemmas.set(form, [lemma]);
    else if (!list.includes(lemma)) list.push(lemma);
  }
  return { formToLemmas, lemmas };
}

export function pickLemma(
  word: string,
  index: LemmaIndex,
  isExcluded: (w: string) => boolean,
): string | null {
  const parents = index.formToLemmas.get(word) ?? [];
  if (parents.some(isExcluded)) return null;
  if (parents.length === 0 || index.lemmas.has(word)) return word;
  return parents[0]!;
}

export const ING_RATIO = 1.5;
export const ED_RATIO = 2.5;

export function preferForm(word: string, lemma: string, counts: ReadonlyMap<string, number>): string {
  if (lemma === word || !/(ing|ed)$/.test(word)) return lemma;
  const ratio = word.endsWith("ed") ? ED_RATIO : ING_RATIO;
  return (counts.get(word) ?? 0) >= ratio * (counts.get(lemma) ?? 0) ? word : lemma;
}

export function isDuplicateForm(
  word: string,
  index: LemmaIndex,
  accepted: ReadonlySet<string>,
  keep: ReadonlySet<string>,
  counts: ReadonlyMap<string, number>,
): boolean {
  if (keep.has(word)) return false;
  const own = counts.get(word) ?? 0;
  return (index.formToLemmas.get(word) ?? [])
    .some((p) => p !== word && accepted.has(p) && (counts.get(p) ?? 0) >= own);
}

const BRITISH_IRREGULAR: Record<string, string> = { grey: "gray", mum: "mom", mummy: "mommy" };

export function isBritishVariant(
  word: string,
  candidates: ReadonlySet<string>,
  counts?: ReadonlyMap<string, number>,
): boolean {
  const our = /our(ite|able|ed|ing|s)?$/.exec(word);
  const options = [
    BRITISH_IRREGULAR[word],
    our ? `${word.slice(0, our.index)}or${our[1] ?? ""}` : undefined,
    word.endsWith("ise") ? `${word.slice(0, -3)}ize` : undefined,
    /[bt]re$/.test(word) ? `${word.slice(0, -2)}er` : undefined,
  ];
  const own = counts?.get(word) ?? 0;
  return options.some((o) => o !== undefined && o !== word && candidates.has(o) && (counts?.get(o) ?? own) >= own);
}
