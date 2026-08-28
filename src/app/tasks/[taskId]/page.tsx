import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/auth/session";
import { UserAvatar } from "@/components/user-avatar";
import {
  addTaskCommentAction,
  cancelTaskAction,
  completeTaskAction,
  resumeTaskAction,
  waitTaskAction,
} from "@/tasks/actions";
import { getTaskDetails } from "@/tasks/queries";

function dateTime(value: Date | null, timeZone: string) {
  if (!value) return "Brak terminu";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

const statusLabels = {
  OPEN: "Bieżące",
  WAITING: "Oczekujące",
  COMPLETED: "Zrobione",
  CANCELED: "Anulowane",
};

export default async function TaskDetailsPage({ params }: { params: Promise<{ taskId: string }> }) {
  const user = await requireUser();
  const { taskId } = await params;
  const task = await getTaskDetails(user, taskId);
  if (!task) notFound();
  const editable = task.authorId === user.id || task.assigneeId === user.id;
  const active = task.status === "OPEN" || task.status === "WAITING";

  return (
    <div className="page-stack narrow-page">
      <header className="page-header task-detail-header">
        <div>
          <Link className="back-link" href="/">← Wróć do zadań</Link>
          <p className="eyebrow">Szczegóły zadania</p>
          <h1>{task.title}</h1>
          <p>{task.description || "Brak dodatkowego opisu."}</p>
        </div>
        <span className={`status-badge ${task.status === "COMPLETED" ? "green" : task.status === "WAITING" ? "amber" : task.status === "CANCELED" ? "neutral" : "blue"}`}>
          {statusLabels[task.status]}
        </span>
      </header>

      <section className="panel task-detail-panel">
        <dl className="task-metadata">
          <div><dt>Wykonawca</dt><dd className="person-value"><UserAvatar avatarDataUrl={task.assigneeAvatarDataUrl} firstName={task.assigneeFirstName} lastName={task.assigneeLastName} size={30} />{task.assigneeFirstName} {task.assigneeLastName}</dd></div>
          <div><dt>Autor</dt><dd className="person-value"><UserAvatar avatarDataUrl={task.authorAvatarDataUrl} firstName={task.authorFirstName} lastName={task.authorLastName} size={30} />{task.authorFirstName} {task.authorLastName}</dd></div>
          <div><dt>Termin</dt><dd>{dateTime(task.dueAt, user.timeZone)}</dd></div>
          <div><dt>Widoczność</dt><dd>{task.visibility}</dd></div>
          <div><dt>Priorytet</dt><dd>{task.priority}</dd></div>
        </dl>
        {task.waitingReason ? <div className="waiting-note"><strong>Powód oczekiwania</strong><p>{task.waitingReason}</p></div> : null}
        {editable && active ? (
          <div className="detail-actions">
            <form action={completeTaskAction}>
              <input name="taskId" type="hidden" value={task.id} />
              <button className="primary-button" type="submit">✓ Oznacz jako zrobione</button>
            </form>
            {task.status === "WAITING" ? (
              <form action={resumeTaskAction}>
                <input name="taskId" type="hidden" value={task.id} />
                <button className="secondary-button" type="submit">Wznów zadanie</button>
              </form>
            ) : (
              <details className="inline-details">
                <summary className="secondary-button">Ustaw oczekiwanie</summary>
                <form action={waitTaskAction} className="inline-action-form">
                  <input name="taskId" type="hidden" value={task.id} />
                  <label>Powód<textarea maxLength={500} name="reason" required rows={3} /></label>
                  <button className="primary-button" type="submit">Zapisz</button>
                </form>
              </details>
            )}
            {task.authorId === user.id ? (
              <form action={cancelTaskAction}>
                <input name="taskId" type="hidden" value={task.id} />
                <button className="danger-button" type="submit">Anuluj zadanie</button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="panel comments-panel">
        <div className="panel-heading"><div><p className="eyebrow">Informacja zwrotna</p><h2>Komentarze</h2></div><span className="muted-chip">{task.comments.length}</span></div>
        <div className="comment-list">
          {task.comments.map((comment) => (
            <article className="comment" key={comment.id}>
              <UserAvatar avatarDataUrl={comment.authorAvatarDataUrl} firstName={comment.authorFirstName} lastName={comment.authorLastName} />
              <div><strong>{comment.authorFirstName} {comment.authorLastName}</strong><time>{dateTime(comment.createdAt, user.timeZone)}</time><p>{comment.body}</p></div>
            </article>
          ))}
          {!task.comments.length ? <p className="empty-copy">Nie dodano jeszcze komentarzy.</p> : null}
        </div>
        <form action={addTaskCommentAction} className="comment-form">
          <input name="taskId" type="hidden" value={task.id} />
          <textarea aria-label="Nowy komentarz" maxLength={2000} name="body" placeholder="Dodaj informację lub odpowiedź…" required rows={3} />
          <button className="primary-button" type="submit">Dodaj komentarz</button>
        </form>
      </section>

      {task.dueDateHistory.length ? (
        <section className="panel history-panel">
          <div className="panel-heading"><div><p className="eyebrow">Audyt</p><h2>Historia terminów</h2></div></div>
          <ol className="history-list">
            {task.dueDateHistory.map((entry) => (
              <li key={entry.id}><strong>{entry.changedByFirstName} {entry.changedByLastName}</strong> zmienił(a) termin z {dateTime(entry.previousDueAt, user.timeZone)} na {dateTime(entry.newDueAt, user.timeZone)} <time>{dateTime(entry.changedAt, user.timeZone)}</time></li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
