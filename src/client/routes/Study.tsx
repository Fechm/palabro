import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { useSession, selectCurrent, selectDone, shouldLoadSession } from "../store/session.js";
import { cardKind } from "../../shared/mastery.js";
import type { StudyCard } from "../../shared/schemas.js";
import type { Settings } from "../../shared/auth.js";
import { RecognitionCard } from "../components/RecognitionCard.js";
import { ClozeCard } from "../components/ClozeCard.js";
import { ProductionCard } from "../components/ProductionCard.js";
import { PracticeRound } from "../components/PracticeRound.js";
import { SpeakButton } from "../components/SpeakButton.js";
import { emitCompanion } from "../companion/store.js";

interface SessionResponse {
  cards: StudyCard[];
  warmup_count: number;
  deferred: number;
}
interface ReviewResponse {
  due: string; mastery_level: number; leveled_up: boolean; leveled_down: boolean;
}

export function Study() {
  const qc = useQueryClient();
  const s = useSession();
  const current = useSession(selectCurrent);
  const done = useSession(selectDone);

  const { data, isLoading, error } = useQuery({
    queryKey: ["session-today"],
    queryFn: () => api.get<SessionResponse>("/api/session/today"),
    staleTime: Infinity,
  });

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/api/settings"),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!data || settings.isLoading || !shouldLoadSession(useSession.getState())) return;
    s.load(data.cards, data.warmup_count);
    const fresh = data.cards.filter((c) => c.is_new).length;
    emitCompanion({
      type: "session_start",
      reviews: data.cards.length - fresh,
      fresh,
      tutorial: settings.data ? !settings.data.tutorial_done : false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, settings.isLoading]);

  useEffect(() => {
    if (current) {
      const { index, cards } = useSession.getState();
      emitCompanion({ type: "card_shown", card: current, kind: cardKind(current.mastery_level), index, total: cards.length });
    }
  }, [current]);

  const review = useMutation({
    mutationFn: (v: { card: StudyCard; grade: number }) =>
      api.post<ReviewResponse>("/api/review", {
        user_card_id: v.card.user_card_id,
        grade: v.grade,
        card_type: v.card.mastery_level,
        context_id: v.card.context?.id ?? null,
        latency_ms: Math.min(Date.now() - useSession.getState().cardShownAt, 600_000),
      }),
    onSuccess: (res, v) => {
      if (res.leveled_up) emitCompanion({ type: "leveled_up", card: v.card, level: res.mastery_level });
      s.advance(v.grade, res.leveled_up);
    },
  });

  if (isLoading || settings.isLoading) return <Centered>Preparando tu sesión…</Centered>;
  if (error) return <Centered>No se pudo cargar la sesión. Recarga la página.</Centered>;
  if (done && !s.quizDone && s.quiz.length > 0) {
    return (
      <PracticeRound
        mode="session_quiz"
        title="Mini test de la sesión"
        choices={s.quiz}
        idOf={(c) => c.lexeme.id}
        prompt={(c) => (
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">¿Qué significa <em>{c.lexeme.lemma}</em>?</h2>
            <SpeakButton text={c.lexeme.lemma} audioUrl={c.lexeme.audio_url} label={`Escuchar «${c.lexeme.lemma}»`} />
          </div>
        )}
        onDone={s.finishQuiz}
        onSkip={s.finishQuiz}
      />
    );
  }
  if (done) return <Summary onRestart={() => { s.reset(); qc.invalidateQueries({ queryKey: ["session-today"] }); }} />;
  if (!current) return <Centered>No tienes tarjetas pendientes. Vuelve mañana.</Centered>;

  const onGrade = (g: number) => review.mutate({ card: current, grade: g });
  const inWarmup = s.index < s.warmupCount;
  const kind = cardKind(current.mastery_level);

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-56">
      <Progressbar index={s.index} total={s.cards.length} warmup={inWarmup} />
      {kind === "recognition" ? (
        <RecognitionCard key={current.user_card_id} card={current} onGrade={onGrade} busy={review.isPending} />
      ) : kind === "cloze" ? (
        <ClozeCard key={current.user_card_id} card={current} onGrade={onGrade} busy={review.isPending} />
      ) : (
        <ProductionCard key={current.user_card_id} card={current} onGrade={onGrade} />
      )}
    </div>
  );
}

function Progressbar({ index, total, warmup }: { index: number; total: number; warmup: boolean }) {
  return (
    <div className="mb-6">
      <div className="mb-1 flex justify-between text-xs opacity-50">
        <span>{warmup ? "Calentamiento" : "En marcha"}</span>
        <span>{index + 1} / {total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${(index / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Summary({ onRestart }: { onRestart: () => void }) {
  const qc = useQueryClient();
  const { grades, levelUps, startedAt } = useSession();
  const [streak, setStreak] = useState<number | null>(null);
  const minutos = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
  const aciertos = grades.filter((g) => g >= 3).length;

  useEffect(() => {
    // Solo completar la sesión mueve la racha. Los minijuegos no.
    const total = grades.length;
    const current = qc.getQueryData<Settings>(["settings"]);
    if (current && !current.tutorial_done) {
      api.put<Settings>("/api/settings", { tutorial_done: true })
        .then((r) => qc.setQueryData(["settings"], r))
        .catch(() => undefined);
    }
    api.post<{ current_streak: number }>("/api/session/complete", {})
      .then((r) => {
        setStreak(r.current_streak);
        emitCompanion({ type: "session_done", correct: aciertos, total, streak: r.current_streak });
      })
      .catch(() => {
        setStreak(null);
        emitCompanion({ type: "session_done", correct: aciertos, total, streak: null });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-lg px-4 pt-10 pb-56 text-center">
      <h2 className="mb-2 text-3xl font-bold">Sesión completa</h2>
      <p className="mb-8 opacity-60">
        {aciertos} de {grades.length} bien · {minutos} min
        {streak !== null && ` · racha de ${streak} día${streak === 1 ? "" : "s"}`}
      </p>

      {levelUps > 0 && (
        <p className="mb-8 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
          Subiste de nivel en <strong>{levelUps}</strong> palabra{levelUps === 1 ? "" : "s"}.
        </p>
      )}

      <button
        onClick={onRestart}
        className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600"
      >
        Ver si queda algo pendiente
      </button>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 text-center opacity-60">
      {children}
    </div>
  );
}
