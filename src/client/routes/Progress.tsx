import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NEW_PER_DAY_OPTIONS, type Settings } from "../../shared/auth.js";
import { api } from "../lib/api.js";
import { supabase } from "../lib/supabase.js";
import { buildCalendar, intensity, localToday } from "../lib/calendar.js";

interface ProgressData {
  words_seen: number;
  words_usable: number;
  coverage_pct: number | string;
  due_now: number;
  due_tomorrow?: number;
  levels?: Record<string, number>;
  study_days?: { day: string; n: number }[];
  current_streak: number | null;
  longest_streak: number | null;
  freezes_left: number | null;
  top_errors: { tag: string; n: number }[];
}

const ETIQUETAS: Record<string, string> = {
  word_order: "Orden de palabras", preposition: "Preposiciones",
  false_friend: "Falsos amigos", register: "Registro",
  collocation: "Colocaciones", tense: "Tiempos verbales",
  article: "Artículos", plural: "Plurales",
  spelling: "Ortografía", meaning: "Significado",
};

export const LEVELS = [
  { level: 1, name: "Reconocer", what: "adivinas el significado en una frase" },
  { level: 2, name: "Completar", what: "completas el hueco en la frase que ya viste" },
  { level: 3, name: "Transferir", what: "completas el hueco en una frase nueva" },
  { level: 4, name: "Usar", what: "escribes tu propia oración" },
  { level: 5, name: "Hablar", what: "respondes hablando" },
] as const;

const TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago";
  } catch {
    return "America/Santiago";
  }
})();

export function Progress({ user }: { user: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["progress"],
    queryFn: () => api.get<ProgressData>(`/api/progress?tz=${encodeURIComponent(TZ)}`),
  });

  if (isLoading || !data) {
    return <div className="py-20 text-center opacity-50">Cargando…</div>;
  }

  const cobertura = Number(data.coverage_pct);

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <section className="rounded-3xl bg-indigo-500 p-6 text-white">
        <p className="text-sm opacity-80">Cobertura del inglés conversacional</p>
        <p className="my-1 text-5xl font-bold">{cobertura.toFixed(1)}%</p>
        <p className="text-sm opacity-80">
          con las {data.words_usable} palabras que ya sabes usar
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${Math.min(100, cobertura)}%` }}
          />
        </div>
        <p className="mt-4 text-xs leading-relaxed opacity-80">
          Una palabra cuenta cuando llega al nivel 4, es decir, cuando ya puedes escribir una
          oración con ella. Cada palabra suma según cuánto se usa en conversaciones reales.
        </p>
      </section>

      <LevelLadder levels={data.levels ?? {}} />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Pendientes ahora" value={data.due_now} />
        <Stat label="Te tocan mañana" value={data.due_tomorrow ?? 0} />
      </div>

      <StudyCalendar days={data.study_days ?? []} />

      <DailyNewWords />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Palabras vistas" value={data.words_seen} />
        <Stat label="Racha" value={data.current_streak ?? 0} suffix=" d" />
      </div>

      {data.freezes_left !== null && (
        <p className="text-center text-xs opacity-50">
          Te quedan {data.freezes_left} congeladores de racha este mes ·
          récord: {data.longest_streak ?? 0} día{data.longest_streak === 1 ? "" : "s"}
        </p>
      )}

      {data.top_errors.length > 0 && (
        <section>
          <h3 className="mb-3 font-semibold">En qué fallas más</h3>
          <ul className="space-y-2">
            {data.top_errors.map((e) => (
              <li
                key={e.tag}
                className="flex items-center justify-between rounded-xl bg-white p-3 dark:bg-white/5"
              >
                <span>{ETIQUETAS[e.tag] ?? e.tag}</span>
                <span className="text-sm opacity-50">{e.n} veces</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-black/10 p-4 text-center dark:border-white/10">
        {user && <p className="mb-3 text-sm opacity-60">Conectado como <strong>{user}</strong></p>}
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="w-full rounded-xl bg-black/5 py-3 font-semibold text-red-600 transition hover:bg-black/10 dark:bg-white/10 dark:text-red-400"
        >
          Cerrar sesión
        </button>
      </section>

      <p className="pb-4 text-center text-xs opacity-40">
        Voz de las palabras: <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" className="underline">ElevenLabs</a>
      </p>
    </div>
  );
}

function LevelLadder({ levels }: { levels: Record<string, number> }) {
  const counts = LEVELS.map((l) => levels[String(l.level)] ?? 0);
  const max = Math.max(1, ...counts);
  return (
    <section aria-labelledby="ladder-title" className="rounded-2xl bg-white p-4 dark:bg-white/5">
      <h3 id="ladder-title" className="font-semibold">Tus palabras por nivel</h3>
      <p className="mb-4 text-xs opacity-60">
        Cada palabra sube un nivel con 2 aciertos seguidos y baja uno con «Otra vez».
      </p>
      <ol className="space-y-3">
        {LEVELS.map((l, i) => (
          <li key={l.level} data-testid={`level-${l.level}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span>
                <strong>{l.level}. {l.name}</strong>
                <span className="opacity-60"> · {l.what}</span>
              </span>
              <span className="font-semibold tabular-nums">{counts[i]}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <div
                className={`h-full rounded-full ${l.level >= 4 ? "bg-emerald-500" : "bg-indigo-400"}`}
                style={{ width: `${(counts[i]! / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const SHADES = ["bg-black/5 dark:bg-white/10", "bg-indigo-200 dark:bg-indigo-900", "bg-indigo-400 dark:bg-indigo-600", "bg-indigo-600 dark:bg-indigo-400"];

function StudyCalendar({ days }: { days: { day: string; n: number }[] }) {
  const weeks = buildCalendar(days, localToday(TZ));
  const studied = days.filter((d) => d.n > 0).length;
  return (
    <section aria-labelledby="calendar-title" className="rounded-2xl bg-white p-4 dark:bg-white/5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 id="calendar-title" className="font-semibold">Días de estudio</h3>
        <span className="text-xs opacity-60">{studied} en las últimas 5 semanas</span>
      </div>
      <div className="mx-auto grid max-w-[17rem] grid-cols-7 gap-1.5 text-center text-[10px] opacity-60">
        {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="mx-auto mt-1.5 grid max-w-[17rem] grid-cols-7 gap-1.5">
        {weeks.flat().map((c) => (
          <span
            key={c.day}
            data-testid={`day-${c.day}`}
            data-n={c.n}
            title={c.future ? undefined : `${c.day}: ${c.n} repaso${c.n === 1 ? "" : "s"}`}
            className={`aspect-square rounded-md ${c.future ? "opacity-0" : SHADES[intensity(c.n)]} ${
              c.today ? "ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900" : ""
            }`}
          />
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-center dark:bg-white/5">
      <p className="text-2xl font-bold">{value}{suffix}</p>
      <p className="text-xs opacity-50">{label}</p>
    </div>
  );
}

function DailyNewWords() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/api/settings"),
  });
  const save = useMutation({
    mutationFn: (n: number) => api.put<Settings>("/api/settings", { new_per_day: n }),
    onSuccess: (res) => {
      qc.setQueryData(["settings"], res);
      qc.invalidateQueries({ queryKey: ["session-today"] });
    },
  });
  const current = save.variables ?? data?.new_per_day;

  return (
    <section className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <p className="mb-3 text-sm font-medium" id="new-per-day-label">Palabras nuevas por día</p>
      <div role="radiogroup" aria-labelledby="new-per-day-label" className="grid grid-cols-4 gap-2">
        {NEW_PER_DAY_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={current === n}
            disabled={save.isPending}
            onClick={() => save.mutate(n)}
            className={`rounded-xl py-3 font-semibold transition ${
              current === n ? "bg-indigo-500 text-white" : "bg-black/5 dark:bg-white/10"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs opacity-60">
        Los repasos pendientes se muestran siempre, aparte de este límite.
      </p>
    </section>
  );
}
