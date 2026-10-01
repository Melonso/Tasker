import { dateTimePartsInZone, zonedDateTimeToUtc } from "@/domain/reminders";

export type NoteReminderFrequency = "DAILY" | "WEEKLY";

export function nextNoteReminderAt({
  now,
  timeZone,
  frequency,
  weekday,
  hour,
  minute,
}: {
  now: Date;
  timeZone: string;
  frequency: NoteReminderFrequency;
  weekday: number | null;
  hour: number;
  minute: number;
}) {
  const localNow = dateTimePartsInZone(now, timeZone);
  const localDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
  const currentWeekday = localDate.getUTCDay();
  const requestedWeekday = frequency === "WEEKLY" ? (weekday ?? 1) : currentWeekday;
  const daysAhead = frequency === "WEEKLY" ? (requestedWeekday - currentWeekday + 7) % 7 : 0;
  let candidateDate = new Date(localDate.getTime() + daysAhead * 24 * 60 * 60 * 1_000);
  let candidate = zonedDateTimeToUtc({
    year: candidateDate.getUTCFullYear(),
    month: candidateDate.getUTCMonth() + 1,
    day: candidateDate.getUTCDate(),
    hour,
    minute,
  }, timeZone);

  if (candidate.getTime() <= now.getTime()) {
    candidateDate = new Date(candidateDate.getTime() + (frequency === "WEEKLY" ? 7 : 1) * 24 * 60 * 60 * 1_000);
    candidate = zonedDateTimeToUtc({
      year: candidateDate.getUTCFullYear(),
      month: candidateDate.getUTCMonth() + 1,
      day: candidateDate.getUTCDate(),
      hour,
      minute,
    }, timeZone);
  }

  return candidate;
}
