import { fsrs, generatorParameters, Rating, type Card, type Grade, State } from "ts-fsrs";

/** Estado FSRS tal como viaja entre Postgres y el Worker. */
export interface FsrsRow {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));
const previewScheduler = fsrs(generatorParameters({ enable_fuzz: false }));

function toCard(row: FsrsRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps ?? 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    ...(row.last_review ? { last_review: new Date(row.last_review) } : {}),
  };
}

function toRow(card: Card): FsrsRow {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** Programa el siguiente repaso. `grade` es la escala FSRS: 1..4. */
export function schedule(row: FsrsRow, grade: number, now = new Date()): FsrsRow {
  const { card } = scheduler.next(toCard(row), now, grade as Grade);
  return toRow(card);
}

export type NextIntervals = Record<1 | 2 | 3 | 4, number>;

export function previewIntervals(row: FsrsRow, now = new Date()): NextIntervals {
  const preview = previewScheduler.repeat(toCard(row), now);
  const ms = (r: Grade) => Math.max(0, preview[r].card.due.getTime() - now.getTime());
  return { 1: ms(Rating.Again), 2: ms(Rating.Hard), 3: ms(Rating.Good), 4: ms(Rating.Easy) };
}

/**
 * Adelanta el repaso sin tocar el estado del algoritmo. Lo usa la regla
 * asimétrica de los minijuegos: fallar puede traer una palabra antes,
 * acertar nunca extiende el intervalo.
 */
export function bringForward(row: FsrsRow, at: Date): FsrsRow {
  const due = new Date(row.due);
  return { ...row, due: (at < due ? at : due).toISOString() };
}
