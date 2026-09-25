import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api.js";
import type { Choice } from "../lib/practice.js";

type Mode = "session_quiz" | "listening";

export function PracticeRound<T>({
  mode, title, choices, idOf, prompt, onShow, onDone, onSkip,
}: {
  mode: Mode;
  title: string;
  choices: Choice<T>[];
  idOf: (item: T) => number;
  prompt: (item: T) => ReactNode;
  onShow?: (item: T) => void;
  onDone: () => void;
  onSkip?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [missed, setMissed] = useState<number[]>([]);
  const startedAt = useRef(Date.now());
  const sent = useRef(false);
  const finished = index >= choices.length;
  const current = choices[index];

  useEffect(() => {
    if (current && onShow) onShow(current.item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    if (!finished || sent.current) return;
    sent.current = true;
    void api.post("/api/game/result", {
      mode,
      score: choices.length - missed.length,
      max_score: choices.length,
      duration_ms: Date.now() - startedAt.current,
      missed_lexeme_ids: missed,
    }).catch(() => undefined);
  }, [finished, mode, choices.length, missed]);

  if (finished) {
    const score = choices.length - missed.length;
    return (
      <div className="card-in mx-auto max-w-lg px-4 pt-10 pb-56 text-center">
        <p className="text-sm opacity-60">{title}</p>
        <h2 className="my-2 text-4xl font-bold">{score} de {choices.length}</h2>
        <p className="mb-8 opacity-70">
          {missed.length === 0
            ? "¡Perfecto! Todas bien."
            : "Las que fallaste vuelven antes a tu repaso. Acertar no cambia nada."}
        </p>
        <button
          onClick={onDone}
          className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600"
        >
          Continuar
        </button>
      </div>
    );
  }

  const choose = (option: string) => {
    if (picked) return;
    setPicked(option);
    if (option !== current!.answer) setMissed((m) => [...m, idOf(current!.item)]);
  };

  return (
    <div key={index} className="card-in mx-auto max-w-lg px-4 pt-6 pb-56">
      <div className="mb-6 flex items-center justify-between text-xs opacity-60">
        <span>{title}</span>
        <span>{index + 1} / {choices.length}</span>
      </div>

      <div className="mb-6">{prompt(current!.item)}</div>

      <div className="grid gap-2">
        {current!.options.map((o) => {
          const state = !picked ? "idle" : o === current!.answer ? "right" : o === picked ? "wrong" : "dim";
          return (
            <button
              key={o}
              onClick={() => choose(o)}
              disabled={picked !== null}
              data-state={state}
              className={`rounded-xl border p-4 text-left text-lg transition ${
                state === "right"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15"
                  : state === "wrong"
                    ? "border-red-500 bg-red-50 dark:bg-red-500/15"
                    : state === "dim"
                      ? "border-black/10 opacity-50 dark:border-white/10"
                      : "border-black/10 bg-white hover:border-indigo-400 dark:border-white/10 dark:bg-white/5"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex gap-2">
        {onSkip && !picked && (
          <button onClick={onSkip} className="flex-1 rounded-xl py-4 font-medium opacity-60 hover:opacity-100">
            Saltar
          </button>
        )}
        {picked && (
          <button
            onClick={() => { setPicked(null); setIndex((i) => i + 1); }}
            className="flex-1 rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600"
          >
            {index + 1 === choices.length ? "Ver resultado" : "Siguiente"}
          </button>
        )}
      </div>
    </div>
  );
}
