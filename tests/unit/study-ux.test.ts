import { describe, expect, it } from "vitest";
import { formatInterval } from "../../src/shared/interval.js";
import { shouldLoadSession } from "../../src/client/store/session.js";
import { previewIntervals, type FsrsRow } from "../../src/server/fsrs.js";
import { registerSchema, NEW_PER_DAY_OPTIONS } from "../../src/shared/auth.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatInterval", () => {
  it("minutos, horas, mañana, días y meses", () => {
    expect(formatInterval(30_000)).toBe("en 1 min");
    expect(formatInterval(10 * MIN)).toBe("en 10 min");
    expect(formatInterval(3 * HOUR)).toBe("en 3 h");
    expect(formatInterval(DAY)).toBe("mañana");
    expect(formatInterval(4 * DAY)).toBe("en ~4 días");
    expect(formatInterval(45 * DAY)).toBe("en ~2 meses");
  });

  it("redondea 1,4 días a mañana y 1,6 a 2 días", () => {
    expect(formatInterval(1.4 * DAY)).toBe("mañana");
    expect(formatInterval(1.6 * DAY)).toBe("en ~2 días");
  });
});

describe("shouldLoadSession", () => {
  it("carga solo si no hay tarjetas en curso", () => {
    expect(shouldLoadSession({ cards: [] })).toBe(true);
    expect(shouldLoadSession({ cards: [{}] as never[] })).toBe(false);
  });
});

describe("previewIntervals", () => {
  const fresh: FsrsRow = {
    due: new Date().toISOString(), stability: 0, difficulty: 0, elapsed_days: 0,
    scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null,
  };

  it("devuelve un intervalo por nota, en orden creciente", () => {
    const now = new Date();
    const p = previewIntervals(fresh, now);
    expect(Object.keys(p)).toEqual(["1", "2", "3", "4"]);
    expect(p[1]).toBeLessThanOrEqual(p[2]);
    expect(p[2]).toBeLessThanOrEqual(p[3]);
    expect(p[3]).toBeLessThan(p[4]);
    expect(p[1]).toBeGreaterThan(0);
  });

  it("solo expone números, nunca el estado del algoritmo", () => {
    const p = previewIntervals(fresh, new Date());
    expect(Object.values(p).every((v) => typeof v === "number")).toBe(true);
  });
});

describe("new_per_day en el registro", () => {
  const base = {
    invite: "c", username: "felipe", email: "f@x.cl", password: "12345678", question_id: 1, answer: "Toby",
  };

  it("acepta solo los valores de la lista y por defecto usa 20", () => {
    expect(NEW_PER_DAY_OPTIONS).toEqual([5, 10, 20, 30]);
    expect(registerSchema.parse(base).new_per_day).toBe(20);
    expect(registerSchema.parse({ ...base, new_per_day: 10 }).new_per_day).toBe(10);
    expect(registerSchema.safeParse({ ...base, new_per_day: 15 }).success).toBe(false);
  });
});
