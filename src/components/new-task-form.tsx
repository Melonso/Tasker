"use client";

import { useActionState } from "react";
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

export function NewTaskForm({ assignees, currentUserId }: { assignees: AssigneeOption[]; currentUserId: string }) {
  const [state, action, pending] = useActionState(createTaskAction, {});

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
          <select defaultValue="PRIVATE" name="visibility">
            <option value="PRIVATE">Prywatne</option>
            <option value="COMPANY">Firmowe</option>
            <option value="SHARED">Udostępnione</option>
          </select>
        </label>
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
      </div>
      {state.error ? <p className="form-error task-form-error" role="alert">{state.error}</p> : null}
      <div className="form-actions task-form-actions">
        <Link className="secondary-button" href="/">Anuluj</Link>
        <button className="primary-button" disabled={pending} type="submit">{pending ? "Zapisywanie…" : "Utwórz zadanie"}</button>
      </div>
    </form>
  );
}
