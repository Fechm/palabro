import type { StudyCard, Verdict } from "../../shared/schemas.js";
import type { CardKind } from "../../shared/mastery.js";
import type { AnimName } from "./animations.js";

export type { CardKind };
export type Segment = string | { em: string };
export type Line = Segment[];

export type CompanionEvent =
  | { type: "session_start"; reviews: number; fresh: number; tutorial: boolean }
  | { type: "card_shown"; card: StudyCard; kind: CardKind; index: number; total: number }
  | { type: "revealed"; card: StudyCard }
  | { type: "answer"; card: StudyCard; correct: boolean; kind: "recognition" | "cloze" }
  | { type: "produce_pending"; card: StudyCard }
  | { type: "produce_failed"; card: StudyCard }
  | { type: "verdict"; card: StudyCard; verdict: Verdict }
  | { type: "leveled_up"; card: StudyCard; level: number }
  | { type: "stuck"; card: StudyCard; kind: CardKind }
  | { type: "poke"; card: StudyCard | null }
  | { type: "session_done"; correct: number; total: number; streak: number | null };

type TutorialStep = CardKind | "reveal";

export interface Memory {
  correctStreak: number;
  spokeFirst: boolean;
  tutorial: boolean;
  taught: readonly TutorialStep[];
  greeting: Line | null;
}

export const FRESH_MEMORY: Memory = { correctStreak: 0, spokeFirst: false, tutorial: false, taught: [], greeting: null };

export interface Reaction {
  anim: AnimName | null;
  line: Line | null;
  memory: Memory;
}

export type Rng = () => number;

const FIRST_CORRECT: Line[] = [["¡Esa la tienes!"], ["¡Bien ahí!"], ["¡Eso!"]];
const FALLBACK_MISS: Line[] = [["Casi. Esta vuelve pronto."], ["Tranqui, la repasamos luego."], ["Se te escapó. Ya volverá."]];
const HELLO: Line[] = [["¡Hola! ¿Estudiamos un rato?"], ["¡Guau! Aquí estoy."], ["¡Hola! Cuando quieras seguimos."]];

const TUTORIAL: Record<TutorialStep, Line> = {
  recognition: ["Lee la frase y piensa qué significa la palabra. En unos segundos te muestro opciones."],
  reveal: ["Elige el significado. Si no la sabes, toca ", { em: "No sé" }, ": vuelve pronto y también así se aprende."],
  cloze: ["Elige la palabra que falta en la frase."],
  production: ["Escribe tu propia frase con la palabra. Te corrijo como un profe."],
};

export const lineText = (line: Line): string =>
  line.map((s) => (typeof s === "string" ? s : s.em)).join("");

function pick(options: Line[], rng: Rng): Line {
  return [...options[Math.min(options.length - 1, Math.floor(rng() * options.length))]!];
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function greeting(reviews: number, fresh: number): Line {
  const parts = [reviews > 0 && plural(reviews, "repaso", "repasos"), fresh > 0 && plural(fresh, "palabra nueva", "palabras nuevas")]
    .filter(Boolean)
    .join(" y ");
  return parts ? [`Hoy tienes ${parts}. ¡Vamos!`] : ["¡Vamos!"];
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

function hint(card: StudyCard, kind: CardKind): Line {
  if (kind === "recognition") {
    return ["Si no te sale, toca ", { em: "No sé" }, ": también así se aprende."];
  }
  if (kind === "cloze" && card.context) {
    const answer = card.context.text.slice(card.context.cloze_start, card.context.cloze_end);
    return ["Pista: empieza con «", { em: answer.charAt(0).toLowerCase() }, "»."];
  }
  const idea = card.lexeme.collocations[0];
  if (idea) return ["Una idea: usa «", { em: idea }, "»."];
  return ["Una idea: cuenta algo que hiciste hoy usando ", { em: card.lexeme.lemma }, "."];
}

function teach(step: TutorialStep, memory: Memory): Reaction | null {
  if (!memory.tutorial || memory.taught.includes(step)) return null;
  return { anim: "point", line: TUTORIAL[step], memory: { ...memory, taught: [...memory.taught, step] } };
}

function say(anim: AnimName, line: Line, memory: Memory): Reaction {
  return { anim, line, memory };
}

function silent(anim: AnimName | null, memory: Memory): Reaction {
  return { anim, line: null, memory };
}

export function react(event: CompanionEvent, memory: Memory, rng: Rng): Reaction {
  switch (event.type) {
    case "session_start": {
      const day = greeting(event.reviews, event.fresh);
      const hello: Line = event.tutorial ? ["¡Hola! Soy Palabro y te acompaño mientras estudias. ", ...day] : day;
      return silent("wave", { ...FRESH_MEMORY, tutorial: event.tutorial, greeting: hello });
    }
    case "card_shown": {
      const greet = memory.greeting;
      const rest = { ...memory, greeting: null };
      const taught = teach(event.kind, rest);
      if (greet) {
        return taught
          ? say("point", [...greet, " ", ...taught.line!], taught.memory)
          : say("wave", greet, rest);
      }
      if (taught) return taught;
      if (event.total >= 6 && event.index === Math.floor(event.total / 2)) {
        return say("happy", ["¡Vas en la mitad!"], memory);
      }
      return silent(null, memory);
    }
    case "revealed":
      return teach("reveal", memory) ?? silent(null, memory);
    case "produce_pending":
      return silent("thinking", memory);
    case "produce_failed":
      return silent("idle", memory);
    case "stuck":
      return say("idea", hint(event.card, event.kind), memory);
    case "poke":
      return event.card ? silent("happy", memory) : say("wave", pick(HELLO, rng), memory);
    case "answer": {
      if (!event.correct) {
        return say("oops", missLine(event.card, event.kind, rng), { ...memory, correctStreak: 0 });
      }
      const streak = memory.correctStreak + 1;
      const next = { ...memory, correctStreak: streak, spokeFirst: true };
      if (!memory.spokeFirst) return say("happy", pick(FIRST_CORRECT, rng), next);
      if (streak % 3 === 0) return say("happy", [`¡${streak === 3 ? "Tres" : streak} seguidas!`], next);
      return silent("happy", next);
    }
    case "verdict": {
      const { natural, grammatical } = event.verdict;
      if (natural) return say("wow", ["¡Sonaste nativo!"], memory);
      if (grammatical) return say("talk", ["Correcta, pero un nativo lo diría distinto. Mira arriba."], memory);
      return say("oops", ["Casi. Te dejé la corrección arriba."], memory);
    }
    case "leveled_up":
      return say("celebrate", ["¡", { em: event.card.lexeme.lemma }, ` subió a nivel ${event.level}!`], memory);
    case "session_done": {
      const { correct, total, streak } = event;
      const racha = streak ? ` · racha de ${streak} día${streak === 1 ? "" : "s"}` : "";
      return say("wave", [`${correct} de ${total} bien${racha}. ¡Nos vemos!`], memory);
    }
  }
}
