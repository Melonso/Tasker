import Link from "next/link";

import { requireUser } from "@/auth/session";
import { UserAvatar } from "@/components/user-avatar";
import { completeTaskAction, rescheduleTaskAction } from "@/tasks/actions";
import { listTasksForView, type TaskView } from "@/tasks/queries";

const viewCopy: Record<TaskView, { eyebrow: string; title: string; description: string }> = {
  today: { eyebrow: "Plan dnia", title: "Najważniejsze na dziś", description: "Zadania na dziś i zaległe." },
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

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Tasker · {copy.eyebrow}</p>
          <h1>{view === "today" ? `Dzień dobry, ${user.firstName}` : copy.title}</h1>
          <p>{view === "today" ? `Masz ${visibleTasks.length} zadań na dziś lub po terminie.` : copy.description}</p>
        </div>
        <Link className="primary-button" href="/tasks/new"><span aria-hidden="true">＋</span> Nowe zadanie</Link>
      </header>

      <section className="summary-grid" aria-label="Podsumowanie zadań">
        <article className="summary-card accent-green"><span>Bieżące</span><strong>{currentTasks.length}</strong><small>Przypisane do Ciebie</small></article>
        <article className="summary-card accent-amber"><span>Oczekujące</span><strong>{waitingTasks.length}</strong><small>Czekają na odpowiedź</small></article>
        <article className="summary-card accent-blue"><span>Delegowane</span><strong>{delegatedTasks.length}</strong><small>Przekazane innym</small></article>
        <article className="summary-card accent-red"><span>Po terminie</span><strong>{overdueCount}</strong><small>Alert codziennie o 9:00</small></article>
      </section>

      <section className="panel task-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2></div>
          {view === "done" ? <span className="muted-chip">{completedTasks.length} zakończonych</span> : null}
        </div>

        {visibleTasks.length ? (
          <div className="task-list">
            {visibleTasks.map((task) => {
              const overdue = task.isOverdue;
              const delegated = task.authorId === user.id && task.assigneeId !== user.id;
              return (
                <article className="task-row database-task-row" key={task.id}>
                  {task.status !== "COMPLETED" ? (
                    <form action={completeTaskAction}>
                      <input name="taskId" type="hidden" value={task.id} />
                      <button className="task-check" type="submit" aria-label={`Oznacz „${task.title}” jako zrobione`} />
                    </form>
                  ) : <span className="task-check completed-check">✓</span>}
                  <UserAvatar avatarDataUrl={task.assigneeAvatarDataUrl} firstName={task.assigneeFirstName} lastName={task.assigneeLastName} />
                  <div className="task-copy">
                    <strong><Link className="task-title-link" href={`/tasks/${task.id}`}>{task.title}</Link></strong>
                    <span>{task.assigneeFirstName} {task.assigneeLastName} · {dueLabel(task.dueAt, user.timeZone)}</span>
                    {task.description ? <p>{task.description}</p> : null}
                  </div>
                  <span className={`status-badge ${overdue ? "red" : delegated ? "blue" : "green"}`}>
                    {overdue ? "Po terminie" : task.status === "COMPLETED" ? "Zrobione" : delegated ? "Delegowane" : task.status === "WAITING" ? "Oczekujące" : "Bieżące"}
                  </span>
                  {task.status !== "COMPLETED" ? (
                    <details className="task-menu">
                      <summary className="more-button" aria-label={`Opcje zadania „${task.title}”`}>•••</summary>
                      <form action={rescheduleTaskAction} className="reschedule-popover">
                        <strong>Przesuń termin</strong>
                        <input name="taskId" type="hidden" value={task.id} />
                        <label>Data<input defaultValue={inputDate(task.dueAt, user.timeZone)} name="dueDate" required type="date" /></label>
                        <label>Godzina<input defaultValue={inputTime(task.dueAt, user.timeZone)} name="dueTime" type="time" /></label>
                        <button className="primary-button" type="submit">Zapisz termin</button>
                      </form>
                    </details>
                  ) : <span />}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">✓</span>
            <h3>W tym widoku jest pusto</h3>
            <p>{view === "done" ? "Zakończone zadania pojawią się tutaj." : "Dodaj zadanie lub wybierz inną sekcję."}</p>
            <Link className="secondary-button" href="/tasks/new">Dodaj pierwsze zadanie</Link>
          </div>
        )}
      </section>
    </div>
  );
}
