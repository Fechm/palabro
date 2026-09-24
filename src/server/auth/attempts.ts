export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60_000;

export function lockedUntil(failureTimes: readonly number[], now: number): number | null {
  const recent = failureTimes.filter((t) => t > now - WINDOW_MS);
  if (recent.length < MAX_FAILURES) return null;
  return Math.min(...recent) + WINDOW_MS;
}
