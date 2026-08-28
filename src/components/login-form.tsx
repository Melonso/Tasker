"use client";

import { useActionState } from "react";

import { loginAction } from "@/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});

  return (
    <form action={action} className="login-form">
      <label>
        Adres e-mail
        <input autoComplete="email" name="email" placeholder="imie@dpkomis.pl" required type="email" />
      </label>
      <label>
        Hasło
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="primary-button full-width" disabled={pending} type="submit">
        {pending ? "Logowanie…" : "Zaloguj się"}
      </button>
    </form>
  );
}
