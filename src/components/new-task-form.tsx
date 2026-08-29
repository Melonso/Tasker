"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

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
  const [selectedAssigneeId, setSelectedAssigneeId] = useState(currentUserId);

  return (
    <form action={action} className="task-form panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Szybkie dodawanie</p><h2>Najpierw zapisz to, co ważne</h2></div>
      </div>
      <div className="task-form-body">
        <label className="wide-field">
          Co trzeba zrobić?
          <input autoFocus className="quick-task-title" maxLength={300} name="title" placeholder="Np. wysłać ofertę klientowi" required />
        </label>
        <label>
          Wykonawca
          <select
            name="assigneeId"
            onChange={(event) => setSelectedAssigneeId(event.target.value)}
            required
            value={selectedAssigneeId}
          >
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === currentUserId ? "Ja" : `${person.firstName} ${person.lastName}`}
              </option>
            ))}
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
        {selectedAssigneeId === currentUserId ? (
          <label className="plan-today-toggle wide-field">
            <input name="planForToday" type="checkbox" />
            <span>
              <strong>Dodaj do mojego planu na dziś</strong>
              <small>Pokaż zadanie w sekcji priorytetów, nawet jeśli ma późniejszy termin.</small>
            </span>
          </label>
        ) : null}

        <details className="advanced-task-options wide-field">
          <summary>Więcej opcji <span>Opis, widoczność, udostępnianie i cykliczność</span></summary>
          <div className="advanced-task-body">
            <label className="wide-field">
              Opis
              <textarea maxLength={5000} name="description" placeholder="Dodatkowy kontekst, oczekiwany rezultat…" rows={4} />
            </label>
            <label>
              Widoczność
              <select name="visibility" onChange={(event) => setVisibility(event.target.value)} value={visibility}>
                <option value="PRIVATE">Prywatne</option>
                <option value="COMPANY">Firmowe</option>
                <option value="SHARED">Udostępnione</option>
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
            {visibility === "SHARED" ? (
              <fieldset className="share-picker wide-field">
                <legend>Udostępnij osobom lub zespołom</legend>
                <div className="share-options">
                  {assignees.filter((person) => person.id !== currentUserId).map((person) => (
                    <label key={person.id}>
                      <input name="shareUserIds" type="checkbox" value={person.id} />
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
          </div>
        </details>
      </div>
      {state.error ? <p className="form-error task-form-error" role="alert">{state.error}</p> : null}
      <div className="form-actions task-form-actions">
        <Link className="secondary-button" href="/">Anuluj</Link>
        <button className="primary-button" disabled={pending} type="submit">{pending ? "Zapisywanie…" : "Utwórz zadanie"}</button>
      </div>
    </form>
  );
}
