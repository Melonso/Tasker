export interface TodayTaskPresentation {
  isOverdue: boolean;
  plannedForDate: string | null;
}

export type TodayTaskSection = "overdue" | "planned" | "dueToday";

export function localDateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function localTimeKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function localDateKeyAfterDays(date: Date, timeZone: string, days: number) {
  const [year, month, day] = localDateKey(date, timeZone).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day + days));
  return target.toISOString().slice(0, 10);
}

export function todayTaskSection(
  task: TodayTaskPresentation,
  today: string,
): TodayTaskSection {
  if (task.isOverdue) return "overdue";
  if (task.plannedForDate === today) return "planned";
  return "dueToday";
}

export function groupTodayTasks<T extends TodayTaskPresentation>(tasks: T[], today: string) {
  return tasks.reduce(
    (groups, task) => {
      groups[todayTaskSection(task, today)].push(task);
      return groups;
    },
    { overdue: [] as T[], planned: [] as T[], dueToday: [] as T[] },
  );
}
