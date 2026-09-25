import { create } from "zustand";
import type { StudyCard } from "../../shared/schemas.js";
import { buildChoices, type Choice } from "../lib/practice.js";

export const QUIZ_ROUNDS = 5;

interface SessionState {
  cards: StudyCard[];
  index: number;
  warmupCount: number;
  startedAt: number;
  cardShownAt: number;
  /** Notas dadas, para el resumen final. */
  grades: number[];
  levelUps: number;
  quiz: Choice<StudyCard>[];
  quizDone: boolean;

  load: (cards: StudyCard[], warmupCount: number) => void;
  advance: (grade: number, leveledUp: boolean) => void;
  finishQuiz: () => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set) => ({
  cards: [],
  index: 0,
  warmupCount: 0,
  startedAt: 0,
  cardShownAt: 0,
  grades: [],
  levelUps: 0,
  quiz: [],
  quizDone: false,

  load: (cards, warmupCount) =>
    set({
      cards, warmupCount, index: 0,
      startedAt: Date.now(), cardShownAt: Date.now(),
      grades: [], levelUps: 0,
      quiz: buildChoices(cards, (c) => c.lexeme.definition_es, QUIZ_ROUNDS, Math.random),
      quizDone: false,
    }),

  advance: (grade, leveledUp) =>
    set((s) => ({
      index: s.index + 1,
      cardShownAt: Date.now(),
      grades: [...s.grades, grade],
      levelUps: s.levelUps + (leveledUp ? 1 : 0),
    })),

  finishQuiz: () => set({ quizDone: true }),

  reset: () => set({ cards: [], index: 0, grades: [], levelUps: 0, quiz: [], quizDone: false }),
}));

export const shouldLoadSession = (state: { cards: readonly unknown[] }): boolean =>
  state.cards.length === 0;

export const selectCurrent = (s: SessionState): StudyCard | undefined => s.cards[s.index];
export const selectDone = (s: SessionState): boolean =>
  s.cards.length > 0 && s.index >= s.cards.length;
