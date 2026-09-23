import { supabase } from "./supabase.js";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "unauthorized", "Sesión expirada.");

  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new ApiError(
      res.status,
      body.error ?? "error",
      body.detail ?? mensajeSegun(res.status),
    );
  }
  return res.json() as Promise<T>;
}

function mensajeSegun(status: number): string {
  if (status === 429) return "Has alcanzado el límite de evaluaciones de hoy.";
  if (status === 503) return "El servicio de corrección no responde. Inténtalo en un momento.";
  if (status >= 500) return "Algo falló en el servidor.";
  return "No se pudo completar la petición.";
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
};
