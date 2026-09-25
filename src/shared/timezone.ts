export const DEFAULT_TZ = "America/Santiago";

export function safeTimeZone(tz: string | undefined): string {
  return tz && tz.length <= 64 && /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) ? tz : DEFAULT_TZ;
}
