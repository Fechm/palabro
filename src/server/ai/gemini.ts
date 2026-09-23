import type { Env } from "../env.js";

export class AiError extends Error {
  constructor(message: string, public retryable: boolean) { super(message); }
}

/** Free tier de Google AI Studio: 1.500 peticiones/día. */
export async function askGemini<T>(
  env: Env,
  prompt: string,
  schema: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!env.GEMINI_API_KEY) throw new AiError("sin GEMINI_API_KEY", false);

  // Alias que Google mantiene apuntando al Flash vigente: los modelos
  // concretos se retiran para cuentas nuevas sin aviso.
  const model = env.GEMINI_MODEL ?? "gemini-flash-latest";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
      signal: signal ?? null,
    },
  );

  // 429 cuota agotada · 503 modelo saturado: ambos se resuelven cayendo
  // al proveedor de respaldo, no reintentando aquí.
  if (res.status === 429 || res.status === 503) {
    throw new AiError(`gemini ${res.status}`, true);
  }
  if (!res.ok) throw new AiError(`gemini ${res.status}`, res.status >= 500);

  const json = await res.json<{
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  }>();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new AiError("gemini: respuesta vacía", true);

  return JSON.parse(text) as T;
}
