import { dateTimePartsInZone, zonedDateTimeToUtc } from "./reminders";

export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function nextRecurringDueAt(currentDueAt: Date, rule: RecurrenceRule, timeZone: string) {
  const current = dateTimePartsInZone(currentDueAt, timeZone);
  const interval = Math.min(Math.max(Math.trunc(rule.interval), 1), 365);
  let year = current.year;
  let month = current.month;
  let day = current.day;

  if (rule.frequency === "DAILY" || rule.frequency === "WEEKLY") {
    const increment = rule.frequency === "DAILY" ? interval : interval * 7;
    const nextDate = new Date(Date.UTC(year, month - 1, day + increment));
    year = nextDate.getUTCFullYear();
    month = nextDate.getUTCMonth() + 1;
    day = nextDate.getUTCDate();
  } else {
    const targetMonth = month - 1 + interval;
    year += Math.floor(targetMonth / 12);
    month = (targetMonth % 12) + 1;
    day = Math.min(day, daysInMonth(year, month));
  }

  return zonedDateTimeToUtc(
    { year, month, day, hour: current.hour, minute: current.minute, second: current.second },
    timeZone,
  );
}

export function recurrenceLabel(rule: RecurrenceRule) {
  const unit = rule.frequency === "DAILY" ? "dzień" : rule.frequency === "WEEKLY" ? "tydzień" : "miesiąc";
  if (rule.interval === 1) return `Co ${unit}`;
  const plural = rule.frequency === "DAILY" ? "dni" : rule.frequency === "WEEKLY" ? "tygodnie" : "miesiące";
  return `Co ${rule.interval} ${plural}`;
}
