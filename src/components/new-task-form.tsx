"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { UserAvatar } from "@/components/user-avatar";
import { createTaskAction } from "@/tasks/actions";

interface AssigneeOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarDataUrl: string | null;
}

interface ShareTeamOption {
  id: string;
  name: string;
  isExternal: boolean;
}

export function NewTaskForm({
  assignees,
  currentUserId,
  teams,
}: {
  assignees: AssigneeOption[];
  currentUserId: string;
  teams: ShareTeamOption[];
}) {
  const [state, action, pending] = useActionState(createTaskAction, {});
  const [visibility, setVisibility] = useState("PRIVATE");

  return (
    <form action={action} className="task-form panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Nowa sprawa</p><h2>Szczegóły zadania</h2></div>
      </div>
      <div className="task-form-body">
        <label className="wide-field">
          Tytuł
          <input autoFocus maxLength={300} name="title" placeholder="Co trzeba zrobić?" required />
        </label>
        <label className="wide-field">
          Opis
          <textarea maxLength={5000} name="description" placeholder="Dodatkowy kontekst, oczekiwany rezultat…" rows={5} />
        </label>
        <fieldset className="assignee-picker wide-field">
          <legend>Wykonawca</legend>
          <div>
            {assignees.map((person) => (
              <label className="assignee-option" key={person.id}>
                <input defaultChecked={person.id === currentUserId} name="assigneeId" required type="radio" value={person.id} />
                <UserAvatar avatarDataUrl={person.avatarDataUrl} firstName={person.firstName} lastName={person.lastName} />
                <span>
                  <strong>{person.firstName} {person.lastName}</strong>
                  <small>{person.email}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          Widoczność
          <select name="visibility" onChange={(event) => setVisibility(event.target.value)} value={visibility}>
            <option value="PRIVATE">Prywatne</option>
            <option value="COMPANY">Firmowe</option>
            <option value="SHARED">Udostępnione</option>
          </select>
        </label>
        {visibility === "SHARED" ? (
          <fieldset className="share-picker wide-field">
            <legend>Udostępnij osobom lub zespołom</legend>
            <div className="share-options">
              {assignees.filter((person) => person.id !== currentUserId).map((person) => (
                <label key={person.id}>
                  <input name="shareUserIds" type="checkbox" value={person.id} />
                  <UserAvatar avatarDataUrl={person.avatarDataUrl} firstName={person.firstName} lastName={person.lastName} size={30} />
                  <span>{person.firstName} {person.lastName}</span>
                </label>
              ))}
              {teams.map((team) => (
                <label key={team.id}>
                  <input name="shareTeamIds" type="checkbox" value={team.id} />
                  <span className="team-mark">Z</span>
                  <span>{team.name}{team.isExternal ? " · zewnętrzny" : ""}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <label>
          Data terminu
          <input name="dueDate" type="date" />
        </label>
        <label>
          Godzina
          <input name="dueTime" type="time" />
          <small>Pusta oznacza Twoją domyślną godzinę.</small>
        </label>
        <label>
          Priorytet
          <select defaultValue="NORMAL" name="priority">
            <option value="LOW">Niski</option>
            <option value="NORMAL">Normalny</option>
            <option value="HIGH">Wysoki</option>
            <option value="URGENT">Pilny</option>
          </select>
        </label>
        <label>
          Powtarzanie
          <select defaultValue="NONE" name="recurrenceFrequency">
            <option value="NONE">Nie powtarzaj</option>
            <option value="DAILY">Codziennie</option>
            <option value="WEEKLY">Co tydzień</option>
            <option value="MONTHLY">Co miesiąc</option>
          </select>
          <small>Wymaga ustawienia pierwszego terminu.</small>
        </label>
        <label>
          Interwał cyklu
          <input defaultValue={1} max={365} min={1} name="recurrenceInterval" type="number" />
          <small>Na przykład 2 oznacza co 2 tygodnie.</small>
        </label>
      </div>
      {state.error ? <p className="form-error task-form-error" role="alert">{state.error}</p> : null}
      <div className="form-actions task-form-actions">
        <Link className="secondary-button" href="/">Anuluj</Link>
        <button className="primary-button" disabled={pending} type="submit">{pending ? "Zapisywanie…" : "Utwórz zadanie"}</button>
      </div>
    </form>
  );
}
