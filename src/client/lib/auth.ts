import { supabase } from "./supabase.js";
import type { RegisterInput, SessionTokens } from "../../shared/auth.js";

export class AuthError extends Error {
  constructor(public code: string, public retryAfterS?: number) {
    super(code);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; retry_after_s?: number };
  if (!res.ok) throw new AuthError(data.error ?? "error", data.retry_after_s);
  return data as T;
}

async function startSession(tokens: SessionTokens): Promise<void> {
  const { error } = await supabase.auth.setSession(tokens);
  if (error) throw new AuthError("session_failed");
}

export async function login(identifier: string, password: string): Promise<void> {
  await startSession(await post<SessionTokens>("login", { identifier, password }));
}

export async function register(input: RegisterInput): Promise<void> {
  await startSession(await post<SessionTokens>("register", input));
}

export function recoveryQuestion(identifier: string): Promise<{ question_id: number }> {
  return post("recovery/question", { identifier });
}

export async function resetPassword(identifier: string, answer: string, newPassword: string): Promise<void> {
  await startSession(await post<SessionTokens>("recovery/reset", {
    identifier, answer, new_password: newPassword,
  }));
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Usuario o contraseña incorrectos.",
  invalid_invite: "El código de invitación no es válido.",
  username_taken: "Ese nombre de usuario ya está en uso.",
  email_taken: "Ese correo ya tiene una cuenta.",
  invalid_answer: "La respuesta no coincide.",
  not_found: "No encontramos una cuenta con ese usuario o correo.",
  registration_closed: "El registro está cerrado por ahora.",
  invalid_input: "Revisa los datos del formulario.",
};

export function authMessage(err: unknown): string {
  if (err instanceof AuthError) {
    if (err.code === "too_many_attempts") {
      const minutes = Math.max(1, Math.ceil((err.retryAfterS ?? 900) / 60));
      return `Demasiados intentos. Prueba de nuevo en ${minutes} minuto${minutes === 1 ? "" : "s"}.`;
    }
    return MESSAGES[err.code] ?? "No se pudo completar. Inténtalo de nuevo.";
  }
  return "No se pudo conectar. Revisa tu conexión.";
}
