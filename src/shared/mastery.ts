/**
 * Capa pedagogica, ortogonal a FSRS.
 *
 *   FSRS decide CUANDO aparece la tarjeta.
 *   mastery_level decide QUE te pregunta cuando aparece.
 *
 * Mezclarlos rompe una de las dos cosas: o el algoritmo de repaso (que
 * asume que la pregunta es siempre la misma) o la progresion pedagogica.
 */

export const MASTERY = {
  RECOGNITION: 1, // ves la frase, adivinas el significado
  CLOZE_KNOWN: 2, // hueco en la frase original
  CLOZE_NEW: 3,   // hueco en una frase nueva  → transferencia
  PRODUCTION: 4,  // escribes tu propia oracion → el diferenciador
  SPEAKING: 5,    // escuchas y respondes hablando
} as const;

/** Niveles que cuestan esfuerzo real; se limitan por sesion. */
export const EFFORTFUL_LEVELS = [MASTERY.PRODUCTION, MASTERY.SPEAKING];

/**
 * Dos aciertos seguidos para subir es deliberado: uno solo premia la
 * suerte, tres se hace lento y aburrido.
 */
export const PROMOTION_STREAK = 2;

export interface MasteryState {
  mastery_level: number;
  level_streak: number;
}

export function applyGrade(
  current: MasteryState,
  grade: number,
): MasteryState & { leveled_up: boolean; leveled_down: boolean } {
  const { mastery_level, level_streak } = current;

  if (grade === 1) {
    // Again → baja un nivel y resetea la racha.
    const next = Math.max(1, mastery_level - 1);
    return {
      mastery_level: next,
      level_streak: 0,
      leveled_up: false,
      leveled_down: next < mastery_level,
    };
  }

  if (grade === 2) {
    // Hard → se queda donde esta, pierde la racha.
    return { mastery_level, level_streak: 0, leveled_up: false, leveled_down: false };
  }

  // Good / Easy
  const streak = level_streak + 1;
  if (streak >= PROMOTION_STREAK && mastery_level < MASTERY.SPEAKING) {
    return {
      mastery_level: mastery_level + 1,
      level_streak: 0,
      leveled_up: true,
      leveled_down: false,
    };
  }
  return { mastery_level, level_streak: streak, leveled_up: false, leveled_down: false };
}

/** Traduce el veredicto del modelo a una nota FSRS. */
export function verdictToGrade(v: {
  uses_target_correctly: boolean;
  grammatical: boolean;
  natural: boolean;
}): number {
  if (!v.uses_target_correctly) return 1; // Again
  if (!v.grammatical) return 2;           // Hard
  if (!v.natural) return 3;               // Good
  return 4;                               // Easy
}
