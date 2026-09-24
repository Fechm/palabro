import { describe, expect, it } from "vitest";
import {
  SECURITY_QUESTIONS, loginSchema, registerSchema, isEmail, normalizeIdentifier,
} from "../../src/shared/auth.js";
import { hashAnswer, normalizeAnswer, verifyAnswer } from "../../src/server/auth/answer.js";
import { lockedUntil, MAX_FAILURES, WINDOW_MS } from "../../src/server/auth/attempts.js";

describe("esquemas", () => {
  const valid = {
    invite: "codigo", username: "Felipe.C_1", email: "f@x.cl", password: "12345678",
    question_id: 1, answer: "Toby",
  };

  it("acepta un registro válido y deja el usuario en minúsculas", () => {
    expect(registerSchema.parse(valid).username).toBe("felipe.c_1");
  });

  it("rechaza usuarios con caracteres o largo inválidos", () => {
    for (const username of ["ab", "con espacio", "ñandú", "a".repeat(21), "con@arroba"]) {
      expect(registerSchema.safeParse({ ...valid, username }).success).toBe(false);
    }
  });

  it("exige contraseña de al menos 8 y pregunta de la lista", () => {
    expect(registerSchema.safeParse({ ...valid, password: "1234567" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, question_id: 99 }).success).toBe(false);
  });

  it("el login acepta usuario o correo", () => {
    expect(loginSchema.safeParse({ identifier: "felipe", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: "", password: "x" }).success).toBe(false);
  });

  it("hay una lista cerrada de preguntas con ids únicos", () => {
    const ids = SECURITY_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });
});

describe("identificador", () => {
  it("distingue correo de usuario y normaliza", () => {
    expect(isEmail("f@x.cl")).toBe(true);
    expect(isEmail("felipe")).toBe(false);
    expect(normalizeIdentifier("  Felipe ")).toBe("felipe");
  });
});

describe("respuesta de seguridad", () => {
  it("normaliza tildes, mayúsculas, signos y espacios", () => {
    expect(normalizeAnswer("  Concepción,  CHILE! ")).toBe("concepcion chile");
  });

  it("verifica la respuesta correcta aunque cambie el formato", async () => {
    const { hash, salt } = await hashAnswer("Temuco");
    expect(await verifyAnswer(" temúco ", hash, salt)).toBe(true);
  });

  it("rechaza una respuesta distinta", async () => {
    const { hash, salt } = await hashAnswer("Temuco");
    expect(await verifyAnswer("Talca", hash, salt)).toBe(false);
  });

  it("usa una sal distinta cada vez", async () => {
    const a = await hashAnswer("Toby");
    const b = await hashAnswer("Toby");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("límite de intentos", () => {
  const now = 1_000_000_000;

  it("no bloquea con menos fallos que el máximo", () => {
    const fails = Array.from({ length: MAX_FAILURES - 1 }, (_, i) => now - i * 1000);
    expect(lockedUntil(fails, now)).toBeNull();
  });

  it("bloquea al llegar al máximo dentro de la ventana, hasta que salga el más antiguo", () => {
    const fails = Array.from({ length: MAX_FAILURES }, (_, i) => now - i * 60_000);
    const oldest = Math.min(...fails);
    expect(lockedUntil(fails, now)).toBe(oldest + WINDOW_MS);
  });

  it("ignora fallos fuera de la ventana", () => {
    const fails = Array.from({ length: MAX_FAILURES }, () => now - WINDOW_MS - 1);
    expect(lockedUntil(fails, now)).toBeNull();
  });
});
