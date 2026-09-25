import { useEffect, useMemo, useRef, useState } from "react";
import type { StudyCard } from "../../shared/schemas.js";
import { formatInterval } from "../../shared/interval.js";
import { LexemeHeader } from "./LexemeHeader.js";
import { GradeButtons } from "./GradeButtons.js";
import { SpeakButton } from "./SpeakButton.js";
import { emitCompanion } from "../companion/store.js";
import { useSession } from "../store/session.js";
import { meaningOptions, recognitionGrade, THINK_MS } from "../lib/recognition.js";

/**
 * Nivel 1 — Reconocimiento con contexto.
 *
 * Primero se intenta recordar el significado sin ayuda; las opciones
 * aparecen después. Elegir convierte el intento en un acierto real que
 * pone la nota, en vez de una autocalificación.
 */
export function RecognitionCard({
  card, onGrade, busy,
}: { card: StudyCard; onGrade: (g: number) => void; busy?: boolean }) {
  const sessionCards = useSession((s) => s.cards);
  const options = useMemo(() => meaningOptions(card, sessionCards, Math.random), [card, sessionCards]);
  return options
    ? <ChoiceRecognition card={card} options={options} onGrade={onGrade} busy={busy} />
    : <SelfGradedRecognition card={card} onGrade={onGrade} busy={busy} />;
}

function ChoiceRecognition({
  card, options, onGrade, busy,
}: { card: StudyCard; options: string[]; onGrade: (g: number) => void; busy?: boolean }) {
  const shownAt = useRef(Date.now());
  const continueRef = useRef<HTMLButtonElement>(null);
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [grade, setGrade] = useState<1 | 2 | 3 | 4 | null>(null);
  const answer = card.lexeme.definition_es.trim();

  const showOptions = () => {
    if (choosing) return;
    setChoosing(true);
    emitCompanion({ type: "revealed", card });
  };

  useEffect(() => {
    if (grade) continueRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [grade]);

  useEffect(() => {
    const t = setTimeout(showOptions, THINK_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const respond = (option: string | null) => {
    if (grade) return;
    const correct = option === answer;
    const g = recognitionGrade(correct, Date.now() - shownAt.current);
    setChoosing(true);
    setPicked(option);
    setGrade(g);
    emitCompanion({ type: "answer", card, correct, kind: "recognition" });
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

      {!choosing ? (
        <div className="space-y-3 text-center">
          <p className="opacity-70">Piensa qué significa antes de ver las opciones…</p>
          <button
            onClick={showOptions}
            className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600"
          >
            Ver opciones
          </button>
          <button onClick={() => respond(null)} className="w-full py-2 text-sm font-medium opacity-60 hover:opacity-100">
            No sé
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {options.map((o) => {
            const state = !grade ? "idle" : o === answer ? "right" : o === picked ? "wrong" : "dim";
            if (state === "dim") return null;
            return (
              <button
                key={o}
                onClick={() => respond(o)}
                disabled={grade !== null}
                data-state={state}
                className={`w-full rounded-xl border p-4 text-left text-lg transition ${
                  state === "right"
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15"
                    : state === "wrong"
                      ? "border-red-500 bg-red-50 dark:bg-red-500/15"
                      : "border-black/10 bg-white hover:border-indigo-400 dark:border-white/10 dark:bg-white/5"
                }`}
              >
                {o}
              </button>
            );
          })}
          {!grade && (
            <button onClick={() => respond(null)} className="w-full py-2 text-sm font-medium opacity-60 hover:opacity-100">
              No sé
            </button>
          )}
        </div>
      )}

      {grade && (
        <div className="mt-4 space-y-4">
          <Meaning card={card} />
          <button
            ref={continueRef}
            onClick={() => onGrade(grade)}
            disabled={busy}
            className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-40"
          >
            Continuar{card.next && <span className="font-normal opacity-80"> · vuelve {formatInterval(card.next[grade])}</span>}
          </button>
        </div>
      )}
    </div>
  );
}

function SelfGradedRecognition({
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
          onClick={() => { setRevealed(true); emitCompanion({ type: "revealed", card }); }}
          className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600"
        >
          Mostrar significado
        </button>
      ) : (
        <div className="space-y-4">
          <Meaning card={card} />
          <p className="text-center text-sm opacity-70">¿La sabías? Tu respuesta decide cuándo vuelve.</p>
          <GradeButtons onGrade={grade} disabled={busy} next={card.next} />
        </div>
      )}
    </div>
  );
}

function Meaning({ card }: { card: StudyCard }) {
  return (
    <>
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
    </>
  );
}
