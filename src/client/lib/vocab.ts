import { formatInterval } from "../../shared/interval.js";
import type { VocabWord } from "../../shared/schemas.js";

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function filterWords(words: readonly VocabWord[], query: string, level: number | null): VocabWord[] {
  const q = normalize(query);
  return words.filter((w) =>
    (level === null || w.mastery_level === level) &&
    (!q || normalize(w.lemma).includes(q) || normalize(w.definition_es).includes(q)));
}

export function dueLabel(due: string, now = Date.now()): string {
  const ms = Date.parse(due) - now;
  return ms <= 0 ? "toca repasarla hoy" : `vuelve ${formatInterval(ms)}`;
}
