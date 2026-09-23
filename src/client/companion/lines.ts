import type { StudyCard, Verdict } from "../../shared/schemas.js";
import type { AnimName } from "./animations.js";

export type Segment = string | { em: string };
export type Line = Segment[];

export type CompanionEvent =
  | { type: "session_start" }
  | { type: "card_shown"; card: StudyCard }
  | { type: "answer"; card: StudyCard; correct: boolean; kind: "recognition" | "cloze" }
  | { type: "produce_pending"; card: StudyCard }
  | { type: "produce_failed"; card: StudyCard }
  | { type: "verdict"; card: StudyCard; verdict: Verdict }
  | { type: "leveled_up"; card: StudyCard; level: number }
  | { type: "session_done"; correct: number; total: number; streak: number | null };

export interface Memory {
  correctStreak: number;
  spokeFirst: boolean;
}

export const FRESH_MEMORY: Memory = { correctStreak: 0, spokeFirst: false };

export interface Reaction {
  anim: AnimName | null;
  line: Line | null;
  sticky: boolean;
  memory: Memory;
}

export type Rng = () => number;

const FIRST_CORRECT: Line[] = [["¡Esa la tienes!"], ["¡Bien ahí!"], ["¡Eso!"]];
const FALLBACK_MISS: Line[] = [["Casi. Esta vuelve pronto."], ["Tranqui, la repasamos luego."], ["Se te escapó. Ya volverá."]];

export const lineText = (line: Line): string =>
  line.map((s) => (typeof s === "string" ? s : s.em)).join("");

function pick(options: Line[], rng: Rng): Line {
  return [...options[Math.min(options.length - 1, Math.floor(rng() * options.length))]!];
}

function missLine(card: StudyCard, kind: "recognition" | "cloze", rng: Rng): Line {
  const { lemma, false_friend, common_errors, usage_note } = card.lexeme;
  if (kind === "cloze" && false_friend) {
    return ["Ojo: ", { em: lemma }, " no es ", { em: false_friend.es_word }, `. ${false_friend.warning}`];
  }
  const error = common_errors[0];
  if (error) return ["Error típico con ", { em: lemma }, `: ${error}`];
  if (usage_note) return [`Pista: ${usage_note}`];
  return pick(FALLBACK_MISS, rng);
}

function say(anim: AnimName, line: Line, memory: Memory, sticky = false): Reaction {
  return { anim, line, sticky, memory };
}

function silent(anim: AnimName | null, memory: Memory): Reaction {
  return { anim, line: null, sticky: false, memory };
}

export function react(event: CompanionEvent, memory: Memory, rng: Rng): Reaction {
  switch (event.type) {
    case "session_start":
      return silent("idle", FRESH_MEMORY);
    case "card_shown":
      return silent(null, memory);
    case "produce_pending":
      return silent("thinking", memory);
    case "produce_failed":
      return silent("idle", memory);
    case "answer": {
      if (!event.correct) {
        return say("oops", missLine(event.card, event.kind, rng), { ...memory, correctStreak: 0 });
      }
      const streak = memory.correctStreak + 1;
      const next = { correctStreak: streak, spokeFirst: true };
      if (!memory.spokeFirst) return say("happy", pick(FIRST_CORRECT, rng), next);
      if (streak % 3 === 0) return say("happy", [`¡${streak === 3 ? "Tres" : streak} seguidas!`], next);
      return silent("happy", next);
    }
    case "verdict": {
      const { natural, grammatical } = event.verdict;
      if (natural) return say("wow", ["¡Sonaste nativo!"], memory);
      if (grammatical) return say("talk", ["Correcta, pero un nativo lo diría distinto. Mira abajo."], memory);
      return say("oops", ["Casi. Te dejé la corrección abajo."], memory);
    }
    case "leveled_up":
      return say("celebrate", ["¡", { em: event.card.lexeme.lemma }, ` subió a nivel ${event.level}!`], memory);
    case "session_done": {
      const { correct, total, streak } = event;
      const racha = streak ? ` · racha de ${streak} día${streak === 1 ? "" : "s"}` : "";
      return say("wave", [`${correct} de ${total} bien${racha}. ¡Nos vemos!`], memory, true);
    }
  }
}
