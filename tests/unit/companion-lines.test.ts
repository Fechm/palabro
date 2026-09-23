import { describe, expect, it } from "vitest";
import { FRESH_MEMORY, lineText, react, type CompanionEvent, type Memory } from "../../src/client/companion/lines.js";
import type { StudyCard, Verdict } from "../../src/shared/schemas.js";

const rng = () => 0;
const FF = { es_word: "actualmente", warning: "«Actualmente» se dice currently." };

function card(lexeme: Partial<StudyCard["lexeme"]> = {}): StudyCard {
  return {
    user_card_id: 1, mastery_level: 2, state: 1, reps: 2, is_new: false,
    lexeme: {
      id: 7, lemma: "actually", pos: "adverb", cefr: "A2", ipa: null,
      definition_en: "in fact", definition_es: "en realidad", usage_note: null,
      false_friend: null, collocations: [], common_errors: [], ...lexeme,
    },
    context: null,
  };
}

const miss = (c: StudyCard, kind: "cloze" | "recognition" = "cloze"): CompanionEvent =>
  ({ type: "answer", card: c, correct: false, kind });
const hit = (): CompanionEvent => ({ type: "answer", card: card(), correct: true, kind: "cloze" });

function verdict(over: Partial<Verdict>): Verdict {
  return {
    uses_target_correctly: true, grammatical: true, natural: true, grade: 3,
    native_version: "I actually like it.", feedback_es: "Bien.", error_tags: [], ...over,
  };
}

function run(events: CompanionEvent[], memory: Memory = FRESH_MEMORY) {
  const out = [];
  for (const e of events) {
    const r = react(e, memory, rng);
    memory = r.memory;
    out.push(r);
  }
  return out;
}

describe("react: fallos", () => {
  it("en hueco prioriza el falso amigo", () => {
    const r = react(miss(card({ false_friend: FF, common_errors: ["x"], usage_note: "y" })), FRESH_MEMORY, rng);
    expect(r.anim).toBe("oops");
    expect(r.line).toEqual(["Ojo: ", { em: "actually" }, " no es ", { em: "actualmente" }, ". «Actualmente» se dice currently."]);
  });

  it("sin falso amigo usa el error típico", () => {
    const r = react(miss(card({ common_errors: ["decir «actually» por «currently»"] })), FRESH_MEMORY, rng);
    expect(lineText(r.line!)).toBe("Error típico con actually: decir «actually» por «currently»");
  });

  it("sin error típico usa la nota de uso", () => {
    const r = react(miss(card({ usage_note: "Va al inicio o antes del verbo." })), FRESH_MEMORY, rng);
    expect(lineText(r.line!)).toBe("Pista: Va al inicio o antes del verbo.");
  });

  it("sin datos del corpus cae a una frase de respaldo no vacía", () => {
    const r = react(miss(card()), FRESH_MEMORY, rng);
    expect(lineText(r.line!).length).toBeGreaterThan(5);
  });

  it("en reconocimiento se salta el falso amigo, que ya está en la tarjeta", () => {
    const r = react(miss(card({ false_friend: FF, common_errors: ["x"] }), "recognition"), FRESH_MEMORY, rng);
    expect(lineText(r.line!)).toBe("Error típico con actually: x");
  });

  it("ninguna frase de fallo reprocha", () => {
    const cards = [card(), card({ false_friend: FF }), card({ common_errors: ["x"] }), card({ usage_note: "y" })];
    for (const value of [0, 0.34, 0.67, 0.99]) {
      for (const c of cards) {
        for (const kind of ["cloze", "recognition"] as const) {
          const text = lineText(react(miss(c, kind), FRESH_MEMORY, () => value).line!).toLowerCase();
          expect(text).not.toMatch(/\bmal\b|fallaste|error tuyo|otra vez fallaste/);
        }
      }
    }
  });
});

describe("react: aciertos", () => {
  it("habla en el primero de la sesión y cada 3 seguidos; un fallo reinicia", () => {
    const spoke = run([hit(), hit(), hit(), miss(card()), hit(), hit(), hit()]).map((r) => r.line !== null);
    expect(spoke).toEqual([true, false, true, true, false, false, true]);
  });

  it("todos los aciertos animan happy", () => {
    expect(run([hit(), hit()]).map((r) => r.anim)).toEqual(["happy", "happy"]);
  });

  it("la tercera seguida dice ¡Tres seguidas!", () => {
    expect(lineText(run([hit(), hit(), hit()])[2]!.line!)).toBe("¡Tres seguidas!");
  });

  it("session_start reinicia la memoria", () => {
    const [, , , r] = run([hit(), hit(), { type: "session_start" }, hit()]);
    expect(r!.line).not.toBeNull();
  });
});

describe("react: producción", () => {
  it("natural → wow", () => {
    const r = react({ type: "verdict", card: card(), verdict: verdict({}) }, FRESH_MEMORY, rng);
    expect([r.anim, lineText(r.line!)]).toEqual(["wow", "¡Sonaste nativo!"]);
  });

  it("gramatical pero no natural → talk", () => {
    const r = react({ type: "verdict", card: card(), verdict: verdict({ natural: false }) }, FRESH_MEMORY, rng);
    expect([r.anim, lineText(r.line!)]).toEqual(["talk", "Correcta, pero un nativo lo diría distinto. Mira abajo."]);
  });

  it("no gramatical → oops", () => {
    const r = react({ type: "verdict", card: card(), verdict: verdict({ natural: false, grammatical: false }) }, FRESH_MEMORY, rng);
    expect([r.anim, lineText(r.line!)]).toEqual(["oops", "Casi. Te dejé la corrección abajo."]);
  });

  it("produce_pending piensa y produce_failed vuelve a idle", () => {
    expect(react({ type: "produce_pending", card: card() }, FRESH_MEMORY, rng).anim).toBe("thinking");
    expect(react({ type: "produce_failed", card: card() }, FRESH_MEMORY, rng).anim).toBe("idle");
  });
});

describe("react: resto", () => {
  it("leveled_up celebra con la palabra en cursiva", () => {
    const r = react({ type: "leveled_up", card: card(), level: 3 }, FRESH_MEMORY, rng);
    expect(r.anim).toBe("celebrate");
    expect(r.line).toEqual(["¡", { em: "actually" }, " subió a nivel 3!"]);
  });

  it("session_done es sticky y cuenta la racha en singular y plural", () => {
    const one = react({ type: "session_done", correct: 4, total: 5, streak: 1 }, FRESH_MEMORY, rng);
    const many = react({ type: "session_done", correct: 4, total: 5, streak: 5 }, FRESH_MEMORY, rng);
    const none = react({ type: "session_done", correct: 4, total: 5, streak: null }, FRESH_MEMORY, rng);
    expect(one.sticky).toBe(true);
    expect(one.anim).toBe("wave");
    expect(lineText(one.line!)).toBe("4 de 5 bien · racha de 1 día. ¡Nos vemos!");
    expect(lineText(many.line!)).toContain("racha de 5 días");
    expect(lineText(none.line!)).toBe("4 de 5 bien. ¡Nos vemos!");
  });

  it("card_shown no cambia nada", () => {
    const r = react({ type: "card_shown", card: card() }, FRESH_MEMORY, rng);
    expect([r.anim, r.line]).toEqual([null, null]);
  });
});
