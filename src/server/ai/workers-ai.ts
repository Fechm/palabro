import type { Env } from "../env.js";
import { AiError } from "./gemini.js";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * Respaldo gratuito, en el propio edge: 10.000 Neuronas/día sin API key
 * ni cuenta de terceros, porque el binding ya está en el Worker.
 */
export async function askWorkersAi<T>(env: Env, prompt: string): Promise<T> {
  const res = (await env.AI.run(MODEL as never, {
    messages: [
      {
        role: "system",
        content: "Responde SIEMPRE con un único objeto JSON válido, sin texto ni markdown alrededor.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 700,
  } as never)) as { response?: string };

  const text = res.response;
  if (!text) throw new AiError("workers-ai: respuesta vacía", false);

  // Los modelos abiertos a veces envuelven el JSON en ```json … ```
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) throw new AiError("workers-ai: sin JSON en la respuesta", false);
  return JSON.parse(match[0]) as T;
}
