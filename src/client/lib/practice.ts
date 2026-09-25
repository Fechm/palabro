export type Rng = () => number;

export interface Choice<T> {
  item: T;
  answer: string;
  options: string[];
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function buildChoices<T>(
  items: readonly T[],
  answerOf: (item: T) => string,
  rounds: number,
  rng: Rng,
  optionCount = 4,
): Choice<T>[] {
  const seen = new Set<string>();
  const unique = items.filter((it) => {
    const a = answerOf(it).trim();
    if (!a || seen.has(a)) return false;
    seen.add(a);
    return true;
  });
  if (unique.length < optionCount) return [];
  return shuffle(unique, rng).slice(0, rounds).map((item) => {
    const answer = answerOf(item);
    const others = shuffle(unique.filter((o) => o !== item), rng).slice(0, optionCount - 1).map(answerOf);
    return { item, answer, options: shuffle([answer, ...others], rng) };
  });
}
