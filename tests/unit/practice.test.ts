import { describe, expect, it } from "vitest";
import { buildChoices, shuffle } from "../../src/client/lib/practice.js";
import { buildCalendar, intensity, localToday } from "../../src/client/lib/calendar.js";
import { dueLabel, filterWords, normalize } from "../../src/client/lib/vocab.js";
import { safeTimeZone } from "../../src/shared/timezone.js";
import { cardKind } from "../../src/shared/mastery.js";
import { meaningOptions, recognitionGrade } from "../../src/client/lib/recognition.js";
import type { VocabWord } from "../../src/shared/schemas.js";

function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("buildChoices", () => {
  const items = ["uno", "dos", "tres", "cuatro", "cinco", "seis"].map((a, id) => ({ id, a }));

  it("arma rondas con 4 opciones distintas que incluyen la respuesta", () => {
    const rounds = buildChoices(items, (i) => i.a, 5, seq([0.1, 0.7, 0.4, 0.9, 0.2]));
    expect(rounds).toHaveLength(5);
    for (const r of rounds) {
      expect(r.options).toHaveLength(4);
      expect(new Set(r.options).size).toBe(4);
      expect(r.options).toContain(r.answer);
      expect(r.answer).toBe(r.item.a);
    }
    expect(new Set(rounds.map((r) => r.item.id)).size).toBe(5);
  });

  it("no arma nada con menos de 4 respuestas distintas", () => {
    const repeated = [{ a: "x" }, { a: "x" }, { a: "y" }, { a: "z" }];
    expect(buildChoices(repeated, (i) => i.a, 5, Math.random)).toEqual([]);
  });

  it("limita la cantidad de rondas a los elementos disponibles", () => {
    expect(buildChoices(items.slice(0, 4), (i) => i.a, 10, Math.random)).toHaveLength(4);
  });

  it("shuffle conserva los elementos", () => {
    expect(shuffle([1, 2, 3, 4], seq([0.5, 0.1, 0.9])).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("calendario", () => {
  it("arma 5 semanas de lunes a domingo terminando en la semana de hoy", () => {
    const weeks = buildCalendar([{ day: "2026-09-23", n: 20 }], "2026-09-24");
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[4]![0]!.day).toBe("2026-09-21");
    expect(weeks[0]![0]!.day).toBe("2026-08-24");
    const flat = weeks.flat();
    expect(flat.find((c) => c.day === "2026-09-23")!.n).toBe(20);
    expect(flat.find((c) => c.day === "2026-09-24")!.today).toBe(true);
    expect(flat.find((c) => c.day === "2026-09-25")!.future).toBe(true);
  });

  it("la intensidad escala por cantidad de repasos", () => {
    expect([0, 1, 9, 10, 29, 30].map(intensity)).toEqual([0, 1, 1, 2, 2, 3]);
  });

  it("el día local respeta la zona horaria", () => {
    const at = new Date("2026-09-25T02:00:00Z");
    expect(localToday("America/Santiago", at)).toBe("2026-09-24");
    expect(localToday("UTC", at)).toBe("2026-09-25");
  });
});

describe("Mis palabras", () => {
  const word = (lemma: string, definition_es: string, mastery_level: number): VocabWord => ({
    lexeme_id: lemma.length, lemma, pos: "verb", cefr: "A1", definition_es, audio_url: null,
    mastery_level, due: "2026-09-30T00:00:00Z", example: null, example_es: null,
  });
  const words = [word("know", "saber, conocer", 1), word("think", "pensar, creer", 2), word("wait", "esperar", 1)];

  it("busca en inglés y en español sin importar tildes ni mayúsculas", () => {
    expect(filterWords(words, "THI", null).map((w) => w.lemma)).toEqual(["think"]);
    expect(filterWords(words, "creér", null).map((w) => w.lemma)).toEqual(["think"]);
  });

  it("filtra por nivel", () => {
    expect(filterWords(words, "", 1).map((w) => w.lemma)).toEqual(["know", "wait"]);
  });

  it("normalize quita diacríticos", () => {
    expect(normalize(" Canción ")).toBe("cancion");
  });

  it("dueLabel dice hoy o cuándo vuelve", () => {
    const now = Date.parse("2026-09-24T00:00:00Z");
    expect(dueLabel("2026-09-23T00:00:00Z", now)).toBe("toca repasarla hoy");
    expect(dueLabel("2026-09-30T00:00:00Z", now)).toBe("vuelve en ~6 días");
  });
});

describe("zona horaria y tipo de tarjeta", () => {
  it("safeTimeZone acepta zonas IANA y cae a Chile con cualquier otra cosa", () => {
    expect(safeTimeZone("Europe/Madrid")).toBe("Europe/Madrid");
    expect(safeTimeZone("America/Argentina/Buenos_Aires")).toBe("America/Argentina/Buenos_Aires");
    expect(safeTimeZone("UTC")).toBe("UTC");
    expect(safeTimeZone("x'; drop table")).toBe("America/Santiago");
    expect(safeTimeZone(undefined)).toBe("America/Santiago");
  });

  it("cardKind reparte los niveles", () => {
    expect([1, 2, 3, 4, 5].map(cardKind)).toEqual(["recognition", "cloze", "cloze", "production", "production"]);
  });
});

describe("nivel 1 con opciones", () => {
  const card = (id: number, definition_es: string, distractors?: string[]) => ({
    user_card_id: id, mastery_level: 1, state: 0, reps: 0, is_new: true,
    lexeme: {
      id, lemma: `w${id}`, pos: "verb" as const, cefr: "A1" as const, ipa: null, definition_en: "", definition_es,
      usage_note: null, false_friend: null, collocations: [], common_errors: [], meaning_distractors: distractors,
    },
    context: null,
  });

  it("la nota sale del acierto y del tiempo", () => {
    expect(recognitionGrade(false, 1000)).toBe(1);
    expect(recognitionGrade(true, 5000)).toBe(4);
    expect(recognitionGrade(true, 12_000)).toBe(3);
    expect(recognitionGrade(true, 45_000)).toBe(2);
  });

  it("usa las opciones del servidor y agrega la correcta", () => {
    const opts = meaningOptions(card(1, "saber", ["ir", "venir", "decir"]), [], Math.random)!;
    expect([...opts].sort()).toEqual(["decir", "ir", "saber", "venir"]);
  });

  it("completa con definiciones de la sesión sin repetir la correcta", () => {
    const session = [card(2, "pensar"), card(3, "saber"), card(4, "querer"), card(5, "necesitar")];
    const opts = meaningOptions(card(1, "saber", ["ir"]), session, Math.random)!;
    expect(opts).toHaveLength(4);
    expect(opts.filter((o) => o === "saber")).toHaveLength(1);
    expect(opts).toContain("ir");
  });

  it("sin 3 alternativas vuelve a la tarjeta autocalificada", () => {
    expect(meaningOptions(card(1, "saber"), [card(2, "pensar")], Math.random)).toBeNull();
  });
});
