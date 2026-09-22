import { describe, it, expect } from "vitest";
import { applyGrade, verdictToGrade, MASTERY } from "../../src/shared/mastery.js";

describe("applyGrade — progresion de dominio", () => {
  it("sube de nivel tras DOS aciertos seguidos, no uno", () => {
    const start = { mastery_level: 1, level_streak: 0 };
    const first = applyGrade(start, 3);
    expect(first.mastery_level).toBe(1);
    expect(first.leveled_up).toBe(false);
    expect(first.level_streak).toBe(1);

    const second = applyGrade(first, 3);
    expect(second.mastery_level).toBe(2);
    expect(second.leveled_up).toBe(true);
    expect(second.level_streak).toBe(0);
  });

  it("'Again' baja un nivel y resetea la racha", () => {
    const r = applyGrade({ mastery_level: 3, level_streak: 1 }, 1);
    expect(r.mastery_level).toBe(2);
    expect(r.level_streak).toBe(0);
    expect(r.leveled_down).toBe(true);
  });

  it("nunca baja del nivel 1", () => {
    const r = applyGrade({ mastery_level: 1, level_streak: 0 }, 1);
    expect(r.mastery_level).toBe(1);
    expect(r.leveled_down).toBe(false);
  });

  it("nunca sube del nivel 5", () => {
    const r = applyGrade({ mastery_level: MASTERY.SPEAKING, level_streak: 1 }, 4);
    expect(r.mastery_level).toBe(MASTERY.SPEAKING);
    expect(r.leveled_up).toBe(false);
  });

  it("'Hard' mantiene el nivel pero rompe la racha", () => {
    const r = applyGrade({ mastery_level: 2, level_streak: 1 }, 2);
    expect(r.mastery_level).toBe(2);
    expect(r.level_streak).toBe(0);
  });
});

describe("verdictToGrade — veredicto del modelo a nota FSRS", () => {
  it("usar mal la palabra es siempre Again", () => {
    expect(verdictToGrade({ uses_target_correctly: false, grammatical: true, natural: true })).toBe(1);
  });

  it("distingue gramatical de natural", () => {
    // Correcto pero no suena nativo: Good, no Easy. Ese matiz es el
    // diferenciador de la app.
    expect(verdictToGrade({ uses_target_correctly: true, grammatical: true, natural: false })).toBe(3);
    expect(verdictToGrade({ uses_target_correctly: true, grammatical: true, natural: true })).toBe(4);
  });

  it("error gramatical es Hard", () => {
    expect(verdictToGrade({ uses_target_correctly: true, grammatical: false, natural: false })).toBe(2);
  });
});
