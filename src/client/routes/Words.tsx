import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { speak } from "../lib/audio.js";
import { buildChoices, type Choice } from "../lib/practice.js";
import type { VocabWord } from "../../shared/schemas.js";
import { SpeakButton } from "../components/SpeakButton.js";
import { PracticeRound } from "../components/PracticeRound.js";
import { dueLabel, filterWords } from "../lib/vocab.js";

export const LISTENING_ROUNDS = 10;

export function Words() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["vocab"],
    queryFn: () => api.get<VocabWord[]>("/api/vocab"),
  });
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [listening, setListening] = useState<Choice<VocabWord>[] | null>(null);

  const words = data ?? [];
  const shown = useMemo(() => filterWords(words, query, level), [words, query, level]);
  const withAudio = useMemo(() => words.filter((w) => w.audio_url), [words]);

  if (listening) {
    return (
      <PracticeRound
        mode="listening"
        title="Modo escucha"
        choices={listening}
        idOf={(w) => w.lexeme_id}
        onShow={(w) => speak(w.lemma, w.audio_url)}
        prompt={(w) => (
          <div className="text-center">
            <p className="mb-4 text-sm opacity-70">¿Qué palabra escuchaste?</p>
            <button
              type="button"
              onClick={() => speak(w.lemma, w.audio_url)}
              className="mx-auto inline-flex items-center gap-2 rounded-full bg-indigo-500 px-6 py-4 font-semibold text-white transition hover:bg-indigo-600"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
              Escuchar de nuevo
            </button>
          </div>
        )}
        onDone={() => { setListening(null); void qc.invalidateQueries({ queryKey: ["vocab"] }); }}
        onSkip={() => setListening(null)}
      />
    );
  }

  if (isLoading) return <div className="py-20 text-center opacity-50">Cargando…</div>;
  if (error) return <div className="py-20 text-center opacity-60">No se pudieron cargar tus palabras.</div>;

  const startListening = () =>
    setListening(buildChoices(withAudio, (w) => w.lemma, LISTENING_ROUNDS, Math.random));

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-28">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-bold">Mis palabras</h2>
        <span className="text-sm opacity-60">{words.length} vistas</span>
      </div>

      <section className="rounded-2xl bg-indigo-500 p-4 text-white">
        <p className="font-semibold">Modo escucha</p>
        <p className="mb-3 text-sm opacity-80">Oyes una palabra y eliges cuál es. Las que falles vuelven antes a tu repaso.</p>
        <button
          onClick={startListening}
          disabled={withAudio.length < 4}
          className="w-full rounded-xl bg-white py-3 font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
        >
          Practicar escuchando
        </button>
        {withAudio.length < 4 && (
          <p className="mt-2 text-xs opacity-80">Se activa cuando tengas 4 palabras vistas con audio.</p>
        )}
      </section>

      {words.length === 0 ? (
        <p className="py-10 text-center opacity-60">Todavía no has visto palabras. Empieza en Estudiar.</p>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en inglés o en español"
            aria-label="Buscar palabra"
            className="w-full rounded-xl border border-black/10 bg-white p-3 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-white/5"
          />
          <div role="radiogroup" aria-label="Filtrar por nivel" className="flex gap-2 overflow-x-auto">
            {[null, 1, 2, 3, 4, 5].map((l) => (
              <button
                key={l ?? "all"}
                type="button"
                role="radio"
                aria-checked={level === l}
                onClick={() => setLevel(l)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  level === l ? "bg-indigo-500 text-white" : "bg-black/5 dark:bg-white/10"
                }`}
              >
                {l === null ? "Todas" : `Nivel ${l}`}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm opacity-60">Ninguna palabra coincide.</p>
          ) : (
            <ul className="space-y-2">
              {shown.map((w) => (
                <li key={w.lexeme_id} className="rounded-xl bg-white dark:bg-white/5">
                  <div className="flex items-center gap-3 p-3">
                    <button
                      type="button"
                      onClick={() => setOpen(open === w.lexeme_id ? null : w.lexeme_id)}
                      aria-expanded={open === w.lexeme_id}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-baseline gap-2">
                        <strong className="text-lg">{w.lemma}</strong>
                        <span className="rounded-full bg-black/5 px-2 text-xs dark:bg-white/10">Nivel {w.mastery_level}</span>
                      </span>
                      <span className="block truncate text-sm opacity-70">{w.definition_es}</span>
                    </button>
                    <SpeakButton text={w.lemma} audioUrl={w.audio_url} label={`Escuchar «${w.lemma}»`} />
                  </div>
                  {open === w.lexeme_id && (
                    <div className="border-t border-black/5 px-3 pt-2 pb-3 text-sm dark:border-white/5">
                      {w.example && <p className="text-base">{w.example}</p>}
                      {w.example_es && <p className="opacity-70">{w.example_es}</p>}
                      <p className="mt-2 text-xs opacity-60">{w.pos} · {w.cefr} · {dueLabel(w.due)}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
