import { useState } from "react";
import type { StudyCard } from "../../shared/schemas.js";
import { LexemeHeader } from "./LexemeHeader.js";
import { GradeButtons } from "./GradeButtons.js";
import { SpeakButton } from "./SpeakButton.js";
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

      <p className="mb-2 text-sm font-medium opacity-70">
        ¿Qué significa <em>{card.lexeme.lemma}</em> en esta frase?
      </p>

      {card.context && (
        <blockquote className="mb-6 flex items-start gap-3 rounded-2xl bg-white p-5 text-xl leading-relaxed shadow-sm dark:bg-white/5">
          <span className="flex-1">{card.context.text}</span>
          <SpeakButton text={card.context.text} audioUrl={card.context.audio_url} label="Escuchar la frase" />
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
            <p className="text-xl font-semibold">{card.lexeme.definition_es}</p>
            {card.context && (
              <p className="mt-2 text-sm opacity-80">
                <span className="opacity-60">La frase: </span>{card.context.gloss_es}
              </p>
            )}
            <details className="mt-3 border-t border-black/5 pt-3 text-sm dark:border-white/5">
              <summary className="cursor-pointer text-indigo-500">Ver en inglés</summary>
              <p className="mt-2 opacity-70">{card.lexeme.definition_en}</p>
            </details>
          </div>

          {card.lexeme.false_friend && (
            <div className="rounded-2xl border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-500/10">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Ojo: falso amigo con «{card.lexeme.false_friend.es_word}»
              </p>
              <p className="mt-1 text-sm">{card.lexeme.false_friend.warning}</p>
            </div>
          )}

          <p className="text-center text-sm opacity-70">¿La sabías? Tu respuesta decide cuándo vuelve.</p>
          <GradeButtons onGrade={grade} disabled={busy} next={card.next} />
        </div>
      )}
    </div>
  );
}
