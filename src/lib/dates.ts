import { z } from "zod";

/** A real calendar date in YYYY-MM-DD form (rejects e.g. 2026-02-31). */
export function isCalendarDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** A 24-hour clock time in HH:mm form. */
export function isClockTimeKey(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export const dateKeySchema = z.string().refine(isCalendarDateKey, "Podaj prawidłową datę.");
export const timeKeySchema = z.string().refine(isClockTimeKey, "Podaj prawidłową godzinę.");
