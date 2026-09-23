import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANIMATIONS } from "../../src/client/companion/animations.js";
import { bubbleMs, emitCompanion, resetCompanion, useCompanion } from "../../src/client/companion/store.js";
import type { StudyCard } from "../../src/shared/schemas.js";

const card: StudyCard = {
  user_card_id: 1, mastery_level: 2, state: 1, reps: 2, is_new: false,
  lexeme: {
    id: 7, lemma: "actually", pos: "adverb", cefr: "A2", ipa: null,
    definition_en: "in fact", definition_es: "en realidad", usage_note: null,
    false_friend: null, collocations: [], common_errors: [],
  },
  context: null,
};
const st = () => useCompanion.getState();
const hit = () => emitCompanion({ type: "answer", card, correct: true, kind: "cloze" });

beforeEach(() => {
  vi.useFakeTimers();
  resetCompanion(() => 0);
});
afterEach(() => vi.useRealTimers());

describe("companion store", () => {
  it("una animación de una vez vuelve a idle al terminar", () => {
    hit();
    vi.advanceTimersByTime(10_000);
    hit();
    expect(st().anim).toBe("happy");
    expect(st().line).toBeNull();
    vi.advanceTimersByTime(ANIMATIONS.happy.durationMs);
    expect(st().anim).toBe("idle");
  });

  it("con frase abierta, al terminar la animación pasa a talk y luego a idle", () => {
    emitCompanion({ type: "leveled_up", card, level: 3 });
    vi.advanceTimersByTime(ANIMATIONS.celebrate.durationMs);
    expect(st().anim).toBe("talk");
    vi.advanceTimersByTime(bubbleMs(st().line!));
    expect(st().line).toBeNull();
    expect(st().anim).toBe("idle");
  });

  it("un evento nuevo interrumpe al actual", () => {
    emitCompanion({ type: "answer", card, correct: false, kind: "cloze" });
    const before = st().playId;
    emitCompanion({ type: "leveled_up", card, level: 3 });
    expect(st().anim).toBe("celebrate");
    expect(st().playId).toBe(before + 1);
  });

  it("card_shown justo después de leveled_up no borra la celebración", () => {
    emitCompanion({ type: "leveled_up", card, level: 3 });
    emitCompanion({ type: "card_shown", card });
    expect(st().anim).toBe("celebrate");
    expect(st().line).not.toBeNull();
  });

  it("dismiss cierra el globito y deja de hablar", () => {
    emitCompanion({ type: "verdict", card, verdict: {
      uses_target_correctly: true, grammatical: true, natural: false, grade: 3,
      native_version: "x", feedback_es: "y", error_tags: [],
    } });
    expect(st().anim).toBe("talk");
    st().dismiss();
    expect(st().line).toBeNull();
    expect(st().anim).toBe("idle");
  });

  it("session_done no se cierra solo", () => {
    emitCompanion({ type: "session_done", correct: 3, total: 4, streak: 2 });
    vi.advanceTimersByTime(60_000);
    expect(st().line).not.toBeNull();
  });

  it("session_start cierra el globito y reinicia la memoria", () => {
    emitCompanion({ type: "session_done", correct: 3, total: 4, streak: 2 });
    hit();
    emitCompanion({ type: "session_start" });
    expect(st().line).toBeNull();
    hit();
    expect(st().line).not.toBeNull();
  });

  it("thinking se mantiene hasta el veredicto", () => {
    emitCompanion({ type: "produce_pending", card });
    vi.advanceTimersByTime(30_000);
    expect(st().anim).toBe("thinking");
  });

  it("la duración del globito está acotada entre 2,5 y 9 segundos", () => {
    expect(bubbleMs(["a"])).toBe(2545);
    expect(bubbleMs(["x".repeat(1000)])).toBe(9000);
  });
});
