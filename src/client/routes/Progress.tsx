import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NEW_PER_DAY_OPTIONS } from "../../shared/auth.js";
import { api } from "../lib/api.js";

interface ProgressData {
  words_seen: number;
  words_usable: number;
  coverage_pct: number | string;
  due_now: number;
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

export function Progress() {
  const { data, isLoading } = useQuery({
    queryKey: ["progress"],
    queryFn: () => api.get<ProgressData>("/api/progress"),
  });

  if (isLoading || !data) {
    return <div className="py-20 text-center opacity-50">Cargando…</div>;
  }

  const cobertura = Number(data.coverage_pct);

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      {/*
        La métrica principal NO son puntos inventados: es la cobertura real
        del inglés conversacional, sumando el aporte por frecuencia de cada
        palabra que el usuario ya puede USAR. Ver subir ese número motiva
        porque significa algo.
      */}
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
      </section>

      <DailyNewWords />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Vistas" value={data.words_seen} />
        <Stat label="Racha" value={data.current_streak ?? 0} suffix="d" />
        <Stat label="Pendientes" value={data.due_now} />
      </div>

      {data.freezes_left !== null && (
        <p className="text-center text-xs opacity-50">
          Te quedan {data.freezes_left} congeladores de racha este mes ·
          récord: {data.longest_streak ?? 0} días
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
    </div>
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
    queryFn: () => api.get<{ new_per_day: number }>("/api/settings"),
  });
  const save = useMutation({
    mutationFn: (n: number) => api.put<{ new_per_day: number }>("/api/settings", { new_per_day: n }),
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
