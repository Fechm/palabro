import { useMemo, useState } from "react";
import type { StudyCard } from "../../shared/schemas.js";
import { LexemeHeader } from "./LexemeHeader.js";
import { emitCompanion } from "../companion/store.js";

/**
 * Niveles 2 y 3 — Hueco en la frase.
 *
 * A diferencia del reconocimiento, aquí sí hay respuesta correcta
 * objetiva, así que la nota la pone el sistema y no el usuario: acertar
 * a la primera es Bien, fallar es Otra vez. Dejar que uno se autocalifique
 * cuando existe respuesta verificable invita a engañarse.
 */
export function ClozeCard({
  card, onGrade, busy,
}: { card: StudyCard; onGrade: (g: number) => void; busy?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const ctx = card.context;

  const options = useMemo(() => {
    if (!ctx) return [];
    const answer = ctx.text.slice(ctx.cloze_start, ctx.cloze_end);
    return [answer, ...ctx.distractors.slice(0, 3)]
      .map((v) => ({ v, k: Math.random() }))
      .sort((a, b) => a.k - b.k)
      .map(({ v }) => v);
  }, [ctx]);

  if (!ctx) return null;
  // Si el corpus no trajo distractores suficientes, se teclea la respuesta
  // en vez de mostrar una opción múltiple de una sola opción.
  const typed = options.length < 2;
  const answer = ctx.text.slice(ctx.cloze_start, ctx.cloze_end);
  const before = ctx.text.slice(0, ctx.cloze_start);
  const after = ctx.text.slice(ctx.cloze_end);
  const correct = picked === answer;
  const choose = (value: string) => {
    setPicked(value);
    emitCompanion({ type: "answer", card, correct: value === answer, kind: "cloze" });
  };

  return (
    <div className="card-in">
      <LexemeHeader card={card} />

      <blockquote className="mb-6 rounded-2xl bg-white p-5 text-xl leading-relaxed shadow-sm dark:bg-white/5">
        {before}
        <span
          className={
            picked
              ? correct
                ? "rounded bg-emerald-100 px-2 font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                : "rounded bg-red-100 px-2 font-semibold text-red-700 line-through dark:bg-red-500/20 dark:text-red-400"
              : "rounded bg-black/10 px-6 dark:bg-white/15"
          }
        >
          {picked ?? " "}
        </span>
        {after}
      </blockquote>

      {!picked ? (
        typed ? (
          <TypeAnswer onAnswer={choose} />
        ) : (
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => choose(o)}
              className="rounded-xl border border-black/10 bg-white py-4 text-lg transition hover:border-indigo-400 dark:border-white/10 dark:bg-white/5"
            >
              {o}
            </button>
          ))}
        </div>
        )
      ) : (
        <div className="space-y-4">
          {!correct && (
            <p className="text-center">
              La correcta era <strong>{answer}</strong>
            </p>
          )}
          <p className="text-center text-sm opacity-70">{ctx.gloss_es}</p>
          <button
            onClick={() => onGrade(correct ? 3 : 1)}
            disabled={busy}
            className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-40"
          >
            Continuar
          </button>
        </div>
      )}
    </div>
  );
}

function TypeAnswer({ onAnswer }: { onAnswer: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onAnswer(value.trim()); }}
      className="space-y-3"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="Escribe la palabra que falta"
        className="w-full rounded-xl border border-black/10 bg-white p-4 text-lg outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-white/5"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-40"
      >
        Comprobar
      </button>
    </form>
  );
}
