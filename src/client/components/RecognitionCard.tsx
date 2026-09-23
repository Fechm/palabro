import { useState } from "react";
import type { StudyCard } from "../../shared/schemas.js";
import { LexemeHeader } from "./LexemeHeader.js";
import { GradeButtons } from "./GradeButtons.js";
import { emitCompanion } from "../companion/store.js";

/**
 * Nivel 1 — Reconocimiento con contexto.
 *
 * Ves la frase en inglés y tratas de deducir el significado ANTES de
 * revelarlo. Ese intento fallido de recuperación es lo que hace que la
 * respuesta se fije; leer la traducción de entrada no enseña nada.
 */
export function RecognitionCard({
  card, onGrade, busy,
}: { card: StudyCard; onGrade: (g: number) => void; busy?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const grade = (g: number) => {
    emitCompanion({ type: "answer", card, correct: g >= 2, kind: "recognition" });
    onGrade(g);
  };

  return (
    <div className="card-in">
      <LexemeHeader card={card} />

      {card.context && (
        <blockquote className="mb-6 rounded-2xl bg-white p-5 text-xl leading-relaxed shadow-sm dark:bg-white/5">
          {card.context.text}
        </blockquote>
      )}

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600"
        >
          Mostrar significado
        </button>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
            <p className="text-lg font-medium">{card.lexeme.definition_es}</p>
            <p className="mt-1 text-sm opacity-60">{card.lexeme.definition_en}</p>
            {card.context && (
              <p className="mt-3 border-t border-black/5 pt-3 text-sm opacity-70 dark:border-white/5">
                {card.context.gloss_es}
              </p>
            )}
          </div>

          {card.lexeme.false_friend && (
            <div className="rounded-2xl border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-500/10">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Ojo: falso amigo con «{card.lexeme.false_friend.es_word}»
              </p>
              <p className="mt-1 text-sm">{card.lexeme.false_friend.warning}</p>
            </div>
          )}

          <GradeButtons onGrade={grade} disabled={busy} />
        </div>
      )}
    </div>
  );
}
