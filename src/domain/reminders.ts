export type ReminderKind =
  | "SEVEN_DAYS_BEFORE"
  | "ONE_DAY_BEFORE"
  | "ONE_HOUR_BEFORE"
  | "OVERDUE_DAILY";

export interface ScheduledReminder {
  kind: ReminderKind;
  scheduledAt: Date;
}

const PRE_DUE_OFFSETS = [
  { kind: "SEVEN_DAYS_BEFORE", milliseconds: 7 * 24 * 60 * 60 * 1000 },
  { kind: "ONE_DAY_BEFORE", milliseconds: 24 * 60 * 60 * 1000 },
  { kind: "ONE_HOUR_BEFORE", milliseconds: 60 * 60 * 1000 },
] as const;

export function dateTimePartsInZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function zonedDateTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute?: number; second?: number },
  timeZone: string,
) {
  const desiredAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute ?? 0,
    local.second ?? 0,
  );
  let candidate = new Date(desiredAsUtc);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = dateTimePartsInZone(candidate, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const correction = desiredAsUtc - actualAsUtc;
    if (correction === 0) return candidate;
    candidate = new Date(candidate.getTime() + correction);
  }

  return candidate;
}

export function nextDailyReminder(now: Date, timeZone: string, hour: number) {
  const localNow = dateTimePartsInZone(now, timeZone);
  let candidate = zonedDateTimeToUtc(
    { year: localNow.year, month: localNow.month, day: localNow.day, hour },
    timeZone,
  );

  if (candidate.getTime() <= now.getTime()) {
    const nextLocalDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + 1));
    candidate = zonedDateTimeToUtc(
      {
        year: nextLocalDate.getUTCFullYear(),
        month: nextLocalDate.getUTCMonth() + 1,
        day: nextLocalDate.getUTCDate(),
        hour,
      },
      timeZone,
    );
  }

  return candidate;
}

export function buildReminderSchedule({
  dueAt,
  now,
  timeZone,
  overdueReminderHour = 9,
}: {
  dueAt: Date;
  now: Date;
  timeZone: string;
  overdueReminderHour?: number;
}): ScheduledReminder[] {
  if (dueAt.getTime() <= now.getTime()) {
    return [
      {
        kind: "OVERDUE_DAILY",
        scheduledAt: nextDailyReminder(now, timeZone, overdueReminderHour),
      },
    ];
  }

  const preDue = PRE_DUE_OFFSETS.map((offset) => ({
    kind: offset.kind,
    scheduledAt: new Date(dueAt.getTime() - offset.milliseconds),
  })).filter((reminder) => reminder.scheduledAt.getTime() > now.getTime());
  return [
    ...preDue,
    {
      kind: "OVERDUE_DAILY",
      scheduledAt: nextDailyReminder(dueAt, timeZone, overdueReminderHour),
    },
  ];
}
