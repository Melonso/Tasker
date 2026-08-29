import Link from "next/link";

import { requireUser, type AuthenticatedUser } from "@/auth/session";
import { UserAvatar } from "@/components/user-avatar";
import {
  completeTaskAction,
  rescheduleTaskAction,
  rescheduleTaskPresetAction,
  setTaskPlannedForTodayAction,
} from "@/tasks/actions";
import { groupTodayTasks, localDateKey } from "@/tasks/presentation";
import { listTasksForView, type TaskView } from "@/tasks/queries";

const viewCopy: Record<TaskView, { eyebrow: string; title: string; description: string }> = {
  today: { eyebrow: "Plan dnia", title: "Najważniejsze na dziś", description: "Najpierw zadania, potem statystyki." },
  current: { eyebrow: "Bieżące", title: "Twoje aktywne zadania", description: "Sprawy przypisane do Ciebie." },
  waiting: { eyebrow: "Oczekujące", title: "Czekające na odpowiedź", description: "Zadania wstrzymane do czasu informacji lub zdarzenia." },
  delegated: { eyebrow: "Delegowane", title: "Przekazane innym", description: "Zadania, za które oczekujesz informacji zwrotnej." },
  recurring: { eyebrow: "Cykliczne", title: "Powtarzające się zadania", description: "Zadania odtwarzane zgodnie z harmonogramem." },
  done: { eyebrow: "Archiwum", title: "Zrobione", description: "Historia zakończonych zadań." },
};

function parseView(value: string | undefined): TaskView {
  return ["current", "waiting", "delegated", "recurring", "done"].includes(value ?? "")
    ? (value as TaskView)
    : "today";
}

function dueLabel(dueAt: Date | null, timeZone: string) {
  if (!dueAt) return "Bez terminu";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dueAt);
}

function inputDate(dueAt: Date | null, timeZone: string) {
  if (!dueAt) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dueAt);
}

function inputTime(dueAt: Date | null, timeZone: string) {
  if (!dueAt) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(dueAt);
}

type TaskListItem = Awaited<ReturnType<typeof listTasksForView>>[number];

function TaskRow({
  task,
  user,
  today,
  compactStatus = false,
}: {
  task: TaskListItem;
  user: AuthenticatedUser;
  today: string;
  compactStatus?: boolean;
}) {
  const overdue = task.isOverdue;
  const delegated = task.authorId === user.id && task.assigneeId !== user.id;
  const ownTask = task.assigneeId === user.id;
  const plannedToday = task.plannedForDate === today;
  const statusLabel = overdue
    ? "Po terminie"
    : task.status === "COMPLETED"
      ? "Zrobione"
      : delegated
        ? "Delegowane"
        : task.status === "WAITING"
          ? "Oczekujące"
          : "Bieżące";
  const priorityLabel = task.priority === "URGENT" ? "Pilne" : task.priority === "HIGH" ? "Wysoki priorytet" : null;

  return (
    <article className="task-row database-task-row">
      {task.status !== "COMPLETED" ? (
        <form action={completeTaskAction}>
          <input name="taskId" type="hidden" value={task.id} />
          <button className="task-check" type="submit" aria-label={`Oznacz „${task.title}” jako zrobione`} />
        </form>
      ) : <span className="task-check completed-check">✓</span>}
      <UserAvatar avatarDataUrl={task.assigneeAvatarDataUrl} firstName={task.assigneeFirstName} lastName={task.assigneeLastName} size={34} />
      <div className="task-copy">
        <strong><Link className="task-title-link" href={`/tasks/${task.id}`}>{task.title}</Link></strong>
        <span className="task-meta-line">
          <time>{dueLabel(task.dueAt, user.timeZone)}</time>
          {delegated ? <> · {task.assigneeFirstName} {task.assigneeLastName}</> : null}
          {priorityLabel ? <em className={`priority-label ${task.priority.toLowerCase()}`}>{priorityLabel}</em> : null}
        </span>
      </div>
      {!compactStatus ? (
        <span className={`status-badge ${overdue ? "red" : delegated ? "blue" : task.status === "WAITING" ? "amber" : "green"}`}>
          {statusLabel}
        </span>
      ) : null}
      {task.status !== "COMPLETED" ? (
        <details className="task-menu">
          <summary className="more-button" aria-label={`Opcje zadania „${task.title}”`}>•••</summary>
          <div className="task-menu-popover">
            {ownTask ? (
              <form action={setTaskPlannedForTodayAction}>
                <input name="taskId" type="hidden" value={task.id} />
                <input name="planned" type="hidden" value={plannedToday ? "false" : "true"} />
                <button className="task-menu-action" type="submit">
                  <span aria-hidden="true">{plannedToday ? "−" : "★"}</span>
                  {plannedToday ? "Usuń z planu na dziś" : "Dodaj do planu na dziś"}
                </button>
              </form>
            ) : null}
            <form action={rescheduleTaskPresetAction} className="reschedule-presets">
              <input name="taskId" type="hidden" value={task.id} />
              <span>Przesuń szybko</span>
              <button name="preset" type="submit" value="TOMORROW">Jutro</button>
              <button name="preset" type="submit" value="NEXT_WEEK">Za tydzień</button>
            </form>
            <form action={rescheduleTaskAction} className="reschedule-popover">
              <strong>Przesuń termin</strong>
              <input name="taskId" type="hidden" value={task.id} />
              <label>Data<input defaultValue={inputDate(task.dueAt, user.timeZone)} name="dueDate" required type="date" /></label>
              <label>Godzina<input defaultValue={inputTime(task.dueAt, user.timeZone)} name="dueTime" type="time" /></label>
              <button className="primary-button" type="submit">Zapisz termin</button>
            </form>
          </div>
        </details>
      ) : <span />}
    </article>
  );
}

function TodaySection({
  title,
  description,
  tone,
  tasks,
  user,
  today,
}: {
  title: string;
  description: string;
  tone: "red" | "green" | "neutral";
  tasks: TaskListItem[];
  user: AuthenticatedUser;
  today: string;
}) {
  if (!tasks.length) return null;
  return (
    <section className={`today-section ${tone}`}>
      <header>
        <div><h3>{title}</h3><p>{description}</p></div>
        <span>{tasks.length}</span>
      </header>
      <div className="task-list">
        {tasks.map((task) => <TaskRow compactStatus key={task.id} task={task} today={today} user={user} />)}
      </div>
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  const view = parseView((await searchParams).view);
  const [visibleTasks, currentTasks, waitingTasks, delegatedTasks, completedTasks] = await Promise.all([
    listTasksForView(user, view),
    listTasksForView(user, "current"),
    listTasksForView(user, "waiting"),
    listTasksForView(user, "delegated"),
    listTasksForView(user, "done"),
  ]);
  const overdueCount = currentTasks.filter((task) => task.isOverdue).length;
  const copy = viewCopy[view];
  const today = localDateKey(new Date(), user.timeZone);
  const todayGroups = view === "today" ? groupTodayTasks(visibleTasks, today) : null;

  return (
    <div className="page-stack dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <p className="eyebrow">Tasker · {copy.eyebrow}</p>
          <h1>{view === "today" ? `Dzień dobry, ${user.firstName}` : copy.title}</h1>
          <p>{view === "today" ? "Zacznij od jednej najważniejszej rzeczy." : copy.description}</p>
        </div>
        <Link className="primary-button desktop-new-task" href="/tasks/new"><span aria-hidden="true">＋</span> Nowe zadanie</Link>
      </header>

      <section className={`panel task-panel ${view === "today" ? "today-board" : ""}`}>
        <div className="panel-heading">
          <div><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2></div>
          {view === "done" ? <span className="muted-chip">{completedTasks.length} zakończonych</span> : null}
          {view === "today" ? <span className="muted-chip">{visibleTasks.length} do zrobienia</span> : null}
        </div>

        {visibleTasks.length ? (
          view === "today" && todayGroups ? (
            <div className="today-sections">
              <TodaySection description="Najpierw zdecyduj: wykonaj albo przesuń." tasks={todayGroups.overdue} title="Po terminie" tone="red" today={today} user={user} />
              <TodaySection description="Rzeczy świadomie wybrane na dzisiaj." tasks={todayGroups.planned} title="Plan na dziś" tone="green" today={today} user={user} />
              <TodaySection description="Pozostałe zadania z terminem do końca dnia." tasks={todayGroups.dueToday} title="Termin na dziś" tone="neutral" today={today} user={user} />
            </div>
          ) : (
            <div className="task-list">
              {visibleTasks.map((task) => <TaskRow key={task.id} task={task} today={today} user={user} />)}
            </div>
          )
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">✓</span>
            <h3>{view === "today" ? "Plan dnia jest czysty" : "W tym widoku jest pusto"}</h3>
            <p>{view === "done" ? "Zakończone zadania pojawią się tutaj." : view === "today" ? "Dodaj priorytet albo zajrzyj do bieżących zadań." : "Dodaj zadanie lub wybierz inną sekcję."}</p>
            <Link className="secondary-button" href="/tasks/new">Dodaj zadanie</Link>
          </div>
        )}
      </section>

      <details className="dashboard-summary">
        <summary>
          <span>Podsumowanie wszystkich zadań</span>
          <small>Rozwiń, jeśli potrzebujesz liczb</small>
        </summary>
        <div className="summary-strip" aria-label="Podsumowanie zadań">
          <Link href="/?view=current"><span>Bieżące</span><strong>{currentTasks.length}</strong></Link>
          <Link href="/?view=waiting"><span>Oczekujące</span><strong>{waitingTasks.length}</strong></Link>
          <Link href="/?view=delegated"><span>Delegowane</span><strong>{delegatedTasks.length}</strong></Link>
          <Link className={overdueCount ? "has-alert" : ""} href="/"><span>Po terminie</span><strong>{overdueCount}</strong></Link>
        </div>
      </details>
    </div>
  );
}
