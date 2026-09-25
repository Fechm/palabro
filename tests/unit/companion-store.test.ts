import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANIMATIONS } from "../../src/client/companion/animations.js";
import { emitCompanion, idleVariantDelay, resetCompanion, STUCK_MS, talkMs, useCompanion } from "../../src/client/companion/store.js";
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
const shown = () => emitCompanion({ type: "card_shown", card, kind: "cloze", index: 1, total: 4 });
const start = () => emitCompanion({ type: "session_start", reviews: 2, fresh: 1, tutorial: false });

beforeEach(() => {
  vi.useFakeTimers();
  resetCompanion(() => 0);
});
afterEach(() => vi.useRealTimers());

describe("companion store", () => {
  it("una animación de una vez vuelve a idle al terminar", () => {
    hit();
    st().dismiss();
    hit();
    expect(st().anim).toBe("happy");
    expect(st().line).toBeNull();
    vi.advanceTimersByTime(ANIMATIONS.happy.durationMs);
    expect(st().anim).toBe("idle");
  });

  it("con frase abierta, al terminar la animación pasa a talk y el globito se queda", () => {
    emitCompanion({ type: "leveled_up", card, level: 3 });
    vi.advanceTimersByTime(ANIMATIONS.celebrate.durationMs);
    expect(st().anim).toBe("talk");
    vi.advanceTimersByTime(60_000);
    expect(st().line).not.toBeNull();
  });

  it("habla solo el tiempo de lectura; después descansa con el globito abierto", () => {
    emitCompanion({ type: "leveled_up", card, level: 3 });
    const line = st().line!;
    vi.advanceTimersByTime(talkMs(line) + 1);
    expect(st().anim).toBe("idle");
    expect(st().line).toEqual(line);
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
    shown();
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

  it("session_start reemplaza el globito por el saludo y reinicia la memoria", () => {
    emitCompanion({ type: "session_done", correct: 3, total: 4, streak: 2 });
    hit();
    start();
    expect(st().line).toBeNull();
    shown();
    expect(st().line).toEqual(["Hoy tienes 2 repasos y 1 palabra nueva. ¡Vamos!"]);
    st().dismiss();
    hit();
    expect(st().line).not.toBeNull();
  });

  it("a los 30 s sin responder da una pista con la animación idea", () => {
    shown();
    vi.advanceTimersByTime(STUCK_MS - 1);
    expect(st().line).toBeNull();
    vi.advanceTimersByTime(1);
    expect(st().anim).toBe("idea");
    expect(st().line).not.toBeNull();
  });

  it("si respondes antes de los 30 s no hay pista", () => {
    shown();
    vi.advanceTimersByTime(10_000);
    emitCompanion({ type: "answer", card, correct: true, kind: "cloze" });
    st().dismiss();
    vi.advanceTimersByTime(STUCK_MS);
    expect(st().line).toBeNull();
  });

  it("en reposo, cada tanto bosteza o se rasca", () => {
    hit();
    st().dismiss();
    vi.advanceTimersByTime(ANIMATIONS.happy.durationMs);
    expect(st().anim).toBe("idle");
    vi.advanceTimersByTime(idleVariantDelay(() => 0));
    expect(["yawn", "scratch"]).toContain(st().anim);
  });

  it("thinking se mantiene hasta el veredicto", () => {
    emitCompanion({ type: "produce_pending", card });
    vi.advanceTimersByTime(30_000);
    expect(st().anim).toBe("thinking");
  });

});
