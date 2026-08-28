import type { ReminderKind } from "@/domain/reminders";

const reminderLead: Record<ReminderKind, string> = {
  SEVEN_DAYS_BEFORE: "Termin za 7 dni",
  ONE_DAY_BEFORE: "Termin jutro",
  ONE_HOUR_BEFORE: "Termin za godzinę",
  OVERDUE_DAILY: "Zadanie po terminie",
};

export function reminderRecipientIds(
  kind: ReminderKind,
  authorId: string,
  assigneeId: string,
) {
  if (kind !== "OVERDUE_DAILY" || authorId === assigneeId) return [assigneeId];
  return [assigneeId, authorId];
}

export function reminderContent({
  kind,
  taskTitle,
  dueAt,
  timeZone,
}: {
  kind: ReminderKind;
  taskTitle: string;
  dueAt: Date;
  timeZone: string;
}) {
  const dueLabel = new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dueAt);
  const title = reminderLead[kind];
  const body = `${taskTitle} · termin ${dueLabel}`;
  return { title, body };
}

const reminderOffsets: Partial<Record<ReminderKind, number>> = {
  SEVEN_DAYS_BEFORE: 7 * 24 * 60 * 60 * 1_000,
  ONE_DAY_BEFORE: 24 * 60 * 60 * 1_000,
  ONE_HOUR_BEFORE: 60 * 60 * 1_000,
};

export function reminderMatchesCurrentTask({
  kind,
  scheduledAt,
  dueAt,
  now,
}: {
  kind: ReminderKind;
  scheduledAt: Date;
  dueAt: Date;
  now: Date;
}) {
  if (kind === "OVERDUE_DAILY") return dueAt.getTime() <= now.getTime();
  const offset = reminderOffsets[kind];
  if (!offset) return false;
  return Math.abs(dueAt.getTime() - offset - scheduledAt.getTime()) < 1_000;
}
