/**
 * Arma la cola de estudio del día.
 *
 * Función pura, sin acceso a red ni base de datos, para poder probarla.
 * Aquí no hay algoritmo: hay diseño de producto. La forma de la sesión
 * decide si alguien sigue usando la app el día 30.
 */
import { EFFORTFUL_LEVELS } from "../shared/mastery.js";

/** Escribir frases cansa. Más de 4 por sesión y la gente abandona. */
export const MAX_EFFORTFUL = 4;
/** Arrancar acertando mete a la persona en ritmo. */
export const WARMUP_SIZE = 3;

export interface Buildable {
  user_card_id: number;
  mastery_level: number;
  is_new: boolean;
}

export interface BuiltSession<T extends Buildable> {
  cards: T[];
  warmup_count: number;
  /** Vencidas hoy que se dejan para mañana por el tope de esfuerzo. */
  deferred: number;
}

const isEffortful = (c: Buildable) => EFFORTFUL_LEVELS.includes(c.mastery_level as 4 | 5);

export function buildSession<T extends Buildable>(input: T[]): BuiltSession<T> {
  // El RPC devuelve como mucho una tarjeta por lexema, así que no hace
  // falta vigilar repeticiones consecutivas del mismo lexema.
  const effortfulAll = input.filter(isEffortful);
  const light = input.filter((c) => !isEffortful(c));

  // Las que sobran del tope NO se pierden: su `due` no cambia, así que
  // reaparecen mañana.
  const effortful = effortfulAll.slice(0, MAX_EFFORTFUL);
  const deferred = effortfulAll.length - effortful.length;

  // ── Acto 1: calentamiento ────────────────────────────────────────────
  // Tarjetas ya vistas y de nivel bajo: victorias rápidas, sin sorpresas.
  const warmupPool = light.filter((c) => !c.is_new && c.mastery_level <= 2);
  const warmup = warmupPool.slice(0, WARMUP_SIZE);
  const warmupIds = new Set(warmup.map((c) => c.user_card_id));

  const rest = light.filter((c) => !warmupIds.has(c.user_card_id));

  // ── Acto 3: cierre ───────────────────────────────────────────────────
  // Terminar con una producción libre deja la sensación de haber hecho
  // algo real, no de haber pasado tarjetas.
  const closer = effortful.length > 0 ? effortful[effortful.length - 1]! : undefined;
  const middleEffortful = closer ? effortful.slice(0, -1) : effortful;

  // ── Acto 2: el trabajo ───────────────────────────────────────────────
  // Las de esfuerzo se reparten por el bloque en vez de apelotonarse.
  const middle = interleave(rest, middleEffortful);

  const cards = [...warmup, ...middle, ...(closer ? [closer] : [])];
  return { cards, warmup_count: warmup.length, deferred };
}

/** Reparte `sparse` de forma pareja dentro de `dense`. */
function interleave<T>(dense: T[], sparse: T[]): T[] {
  if (sparse.length === 0) return dense;
  if (dense.length === 0) return sparse;

  const out: T[] = [];
  const step = Math.max(1, Math.floor(dense.length / (sparse.length + 1)));
  let s = 0;

  for (let i = 0; i < dense.length; i++) {
    out.push(dense[i]!);
    if (s < sparse.length && (i + 1) % step === 0) out.push(sparse[s++]!);
  }
  while (s < sparse.length) out.push(sparse[s++]!);
  return out;
}
