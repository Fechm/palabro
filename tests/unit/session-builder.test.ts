import { describe, it, expect } from "vitest";
import { buildSession, MAX_EFFORTFUL, WARMUP_SIZE } from "../../src/server/session-builder.js";

const card = (id: number, mastery: number, is_new = false) =>
  ({ user_card_id: id, mastery_level: mastery, is_new });

describe("buildSession — forma de la sesión diaria", () => {
  it("limita las tarjetas de esfuerzo y aplaza el resto", () => {
    const input = [...Array(8)].map((_, i) => card(i + 1, 4));
    const s = buildSession(input);
    expect(s.cards.filter((c) => c.mastery_level >= 4)).toHaveLength(MAX_EFFORTFUL);
    expect(s.deferred).toBe(4);
  });

  it("empieza con calentamiento de tarjetas ya vistas y fáciles", () => {
    const input = [card(1, 1), card(2, 2), card(3, 1), card(4, 3), card(5, 4)];
    const s = buildSession(input);
    expect(s.warmup_count).toBe(3);
    for (const c of s.cards.slice(0, 3)) expect(c.mastery_level).toBeLessThanOrEqual(2);
  });

  it("no mete tarjetas nuevas en el calentamiento", () => {
    // Arrancar con algo que nunca has visto no es un calentamiento.
    const input = [card(1, 1, true), card(2, 1, true), card(3, 2)];
    const s = buildSession(input);
    expect(s.warmup_count).toBe(1);
    expect(s.cards[0]!.user_card_id).toBe(3);
  });

  it("termina con una tarjeta de producción cuando la hay", () => {
    const input = [card(1, 1), card(2, 2), card(3, 3), card(4, 4)];
    const s = buildSession(input);
    expect(s.cards.at(-1)!.mastery_level).toBe(4);
  });

  it("no pierde ninguna tarjeta que quepa en la sesión", () => {
    const input = [card(1, 1), card(2, 2), card(3, 3), card(4, 4), card(5, 5)];
    const s = buildSession(input);
    expect(s.cards).toHaveLength(5);
    expect(new Set(s.cards.map((c) => c.user_card_id)).size).toBe(5);
  });

  it("reparte las de esfuerzo en vez de apelotonarlas al final", () => {
    const input = [
      ...[...Array(10)].map((_, i) => card(i + 1, 2)),
      card(20, 4), card(21, 4),
    ];
    const s = buildSession(input);
    const posiciones = s.cards
      .map((c, i) => (c.mastery_level >= 4 ? i : -1))
      .filter((i) => i >= 0);
    // La primera no debe quedar pegada al final de la cola.
    expect(posiciones[0]!).toBeLessThan(s.cards.length - 2);
  });

  it("aguanta una sesión vacía", () => {
    const s = buildSession([]);
    expect(s.cards).toHaveLength(0);
    expect(s.warmup_count).toBe(0);
  });

  it("aguanta una sesión de puro contenido nuevo", () => {
    const input = [...Array(5)].map((_, i) => card(i + 1, 1, true));
    const s = buildSession(input);
    expect(s.cards).toHaveLength(5);
    expect(s.warmup_count).toBe(0);
    expect(WARMUP_SIZE).toBe(3);
  });
});
