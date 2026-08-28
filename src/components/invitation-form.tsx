"use client";

import { useActionState } from "react";

import { createInvitationAction } from "@/auth/invitation-actions";

interface InvitationUser {
  id: string;
  label: string;
}

export function InvitationForm({ users }: { users: InvitationUser[] }) {
  const [state, action, pending] = useActionState(createInvitationAction, {});

  return (
    <form action={action} className="invitation-form">
      <label>
        Użytkownik
        <select defaultValue="" name="userId" required>
          <option disabled value="">Wybierz osobę</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}
        </select>
      </label>
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Tworzenie…" : "Utwórz link aktywacyjny"}
      </button>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.invitationUrl ? (
        <div className="invitation-result" role="status">
          <strong>Link dla: {state.invitedName}</strong>
          <p>Link jest ważny 7 dni i działa tylko raz.</p>
          <input aria-label="Link aktywacyjny" readOnly value={state.invitationUrl} />
        </div>
      ) : null}
    </form>
  );
}
