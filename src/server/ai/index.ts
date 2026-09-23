import type { ZodType } from "zod";
import type { Env } from "../env.js";
import { askGemini, AiError } from "./gemini.js";
import { askWorkersAi } from "./workers-ai.js";

export interface AiResult<T> { value: T; model: string }

/**
 * Gemini primero (mejor en matices de inglés), Workers AI de respaldo.
 * Son ~15 líneas y evitan que la app se caiga cuando Google satura o se
 * agota la cuota diaria, que en free tier pasa.
 *
 * La respuesta se valida con Zod en los dos casos: un modelo pequeño
 * puede devolver JSON bien formado pero con campos inventados.
 */
export async function ask<T>(
  env: Env,
  prompt: string,
  geminiSchema: unknown,
  validator: ZodType<T>,
): Promise<AiResult<T>> {
  try {
    const raw = await askGemini<unknown>(env, prompt, geminiSchema);
    const parsed = validator.safeParse(raw);
    if (parsed.success) return { value: parsed.data, model: env.GEMINI_MODEL ?? "gemini-flash-latest" };
    console.warn("gemini devolvió algo que no valida:", parsed.error.issues[0]?.message);
  } catch (err) {
    console.warn("gemini falló:", err instanceof AiError ? err.message : String(err));
  }

  const raw = await askWorkersAi<unknown>(env, prompt);
  const parsed = validator.safeParse(raw);
  if (!parsed.success) {
    throw new AiError(`respaldo inválido: ${parsed.error.issues[0]?.message}`, false);
  }
  return { value: parsed.data, model: "workers-ai/llama-3.3-70b" };
}

export { AiError };
