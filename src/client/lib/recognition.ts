import type { StudyCard } from "../../shared/schemas.js";
import { shuffle, type Rng } from "./practice.js";

export const THINK_MS = 3_000;
export const FAST_MS = 8_000;
export const SLOW_MS = 30_000;

export function recognitionGrade(correct: boolean, elapsedMs: number): 1 | 2 | 3 | 4 {
  if (!correct) return 1;
  if (elapsedMs < FAST_MS) return 4;
  if (elapsedMs < SLOW_MS) return 3;
  return 2;
}

export function meaningOptions(card: StudyCard, sessionCards: readonly StudyCard[], rng: Rng): string[] | null {
  const answer = card.lexeme.definition_es.trim();
  const pool = [
    ...(card.lexeme.meaning_distractors ?? []),
    ...shuffle(sessionCards.filter((c) => c.lexeme.id !== card.lexeme.id).map((c) => c.lexeme.definition_es), rng),
  ];
  const distractors: string[] = [];
  for (const d of pool) {
    const t = d.trim();
    if (t && t !== answer && !distractors.includes(t)) distractors.push(t);
    if (distractors.length === 3) break;
  }
  return distractors.length === 3 ? shuffle([answer, ...distractors], rng) : null;
}
