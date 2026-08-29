import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/auth/session";
import { UserAvatar } from "@/components/user-avatar";
import {
  addTaskCommentAction,
  cancelTaskAction,
  completeTaskAction,
  pauseTaskRecurrenceAction,
  resumeTaskAction,
  resumeTaskRecurrenceAction,
  updateTaskRecurrenceAction,
  updateTaskSharesAction,
  waitTaskAction,
} from "@/tasks/actions";
import { getTaskDetails, listAssignableUsers, listTeamsForSharing } from "@/tasks/queries";
import { recurrenceLabel } from "@/domain/recurrence";

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
  const [shareUsers, shareTeams] = task.authorId === user.id
    ? await Promise.all([listAssignableUsers(user), listTeamsForSharing(user)])
    : [[], []];
  const sharedUserIds = new Set(task.shares.flatMap((share) => share.userId ? [share.userId] : []));
  const sharedTeamIds = new Set(task.shares.flatMap((share) => share.teamId ? [share.teamId] : []));
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
          <div><dt>Cykl</dt><dd>{task.recurrence ? `${recurrenceLabel(task.recurrence.rule)}${task.recurrence.isPaused ? " · wstrzymany" : ""}` : "Jednorazowe"}</dd></div>
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

        {task.authorId === user.id && active ? (
          <div className="detail-config-grid">
            <form action={updateTaskRecurrenceAction} className="detail-config-card">
              <input name="taskId" type="hidden" value={task.id} />
              <strong>Powtarzanie</strong>
              <label>Częstotliwość
                <select defaultValue={task.recurrence?.rule.frequency ?? "WEEKLY"} name="frequency">
                  <option value="DAILY">Codziennie</option>
                  <option value="WEEKLY">Co tydzień</option>
                  <option value="MONTHLY">Co miesiąc</option>
                </select>
              </label>
              <label>Co ile jednostek
                <input defaultValue={task.recurrence?.rule.interval ?? 1} max={365} min={1} name="interval" type="number" />
              </label>
              <button className="secondary-button" type="submit">{task.recurrence ? "Zmień cykl" : "Włącz cykl"}</button>
            </form>
            {task.recurrence ? (
              <form action={task.recurrence.isPaused ? resumeTaskRecurrenceAction : pauseTaskRecurrenceAction} className="detail-config-card compact-config-card">
                <input name="taskId" type="hidden" value={task.id} />
                <strong>{task.recurrence.isPaused ? "Cykl jest wstrzymany" : "Cykl jest aktywny"}</strong>
                <p>{task.recurrence.isPaused ? "Wznowienie ponownie utworzy następne zadanie po zakończeniu." : "Wstrzymanie zatrzyma tworzenie kolejnych wystąpień."}</p>
                <button className="secondary-button" type="submit">{task.recurrence.isPaused ? "Wznów cykl" : "Wstrzymaj cykl"}</button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>

      {task.visibility === "SHARED" ? (
        <section className="panel sharing-panel">
          <div className="panel-heading"><div><p className="eyebrow">Dostęp</p><h2>Udostępnienie zadania</h2></div></div>
          {task.authorId === user.id ? (
            <form action={updateTaskSharesAction} className="sharing-form">
              <input name="taskId" type="hidden" value={task.id} />
              <div className="share-options">
                {shareUsers.filter((person) => person.id !== task.authorId && person.id !== task.assigneeId).map((person) => (
                  <label key={person.id}>
                    <input defaultChecked={sharedUserIds.has(person.id)} name="shareUserIds" type="checkbox" value={person.id} />
                    <UserAvatar avatarDataUrl={person.avatarDataUrl} firstName={person.firstName} lastName={person.lastName} size={30} />
                    <span>{person.firstName} {person.lastName}</span>
                  </label>
                ))}
                {shareTeams.map((team) => (
                  <label key={team.id}>
                    <input defaultChecked={sharedTeamIds.has(team.id)} name="shareTeamIds" type="checkbox" value={team.id} />
                    <span className="team-mark">Z</span><span>{team.name}</span>
                  </label>
                ))}
              </div>
              <button className="secondary-button" type="submit">Zapisz udostępnienie</button>
            </form>
          ) : (
            <div className="shared-with-list">
              {task.shares.map((share) => <span className="muted-chip" key={share.userId ?? share.teamId}>{share.userId ? `${share.userFirstName} ${share.userLastName}` : share.teamName}</span>)}
            </div>
          )}
        </section>
      ) : null}

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
