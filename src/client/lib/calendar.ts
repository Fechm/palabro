export interface DayCell {
  day: string;
  n: number;
  future: boolean;
  today: boolean;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function localToday(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function buildCalendar(days: readonly { day: string; n: number }[], today: string, weeks = 5): DayCell[][] {
  const counts = new Map(days.map((d) => [d.day, d.n]));
  const end = new Date(`${today}T00:00:00Z`);
  const weekday = (end.getUTCDay() + 6) % 7;
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - weekday - 7 * (weeks - 1));
  const out: DayCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + w * 7 + d);
      const day = iso(date);
      row.push({ day, n: counts.get(day) ?? 0, future: day > today, today: day === today });
    }
    out.push(row);
  }
  return out;
}

export function intensity(n: number): 0 | 1 | 2 | 3 {
  if (n === 0) return 0;
  if (n < 10) return 1;
  if (n < 30) return 2;
  return 3;
}
