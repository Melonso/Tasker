"use client";

import { useActionState } from "react";

import { activateAccountAction } from "@/auth/invitation-actions";

export function ActivationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(activateAccountAction, {});

  return (
    <form action={action} className="login-form">
      <input name="token" type="hidden" value={token} />
      <label>
        Nowe hasło
        <input autoComplete="new-password" minLength={12} name="password" required type="password" />
        <small>Co najmniej 12 znaków.</small>
      </label>
      <label>
        Powtórz hasło
        <input autoComplete="new-password" minLength={12} name="passwordConfirmation" required type="password" />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="primary-button full-width" disabled={pending} type="submit">
        {pending ? "Aktywowanie…" : "Aktywuj konto"}
      </button>
    </form>
  );
}
