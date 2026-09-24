const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function formatInterval(ms: number): string {
  if (ms < HOUR) return `en ${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < DAY * 0.75) return `en ${Math.round(ms / HOUR)} h`;
  const days = Math.round(ms / DAY);
  if (days <= 1) return "mañana";
  if (days < 30) return `en ~${days} días`;
  const months = Math.round(days / 30);
  return `en ~${months} ${months === 1 ? "mes" : "meses"}`;
}
