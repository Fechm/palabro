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

export const ADJECTIVE_RATIO = 1.5;

export function preferForm(word: string, lemma: string, counts: ReadonlyMap<string, number>): string {
  if (lemma === word || !/(ing|ed)$/.test(word)) return lemma;
  return (counts.get(word) ?? 0) >= ADJECTIVE_RATIO * (counts.get(lemma) ?? 0) ? word : lemma;
}
