"use client";

import { useActionState } from "react";

import { createTelegramLinkCodeAction, type TelegramLinkState } from "@/integrations/actions";

const initialState: TelegramLinkState = {};

export function TelegramLinkControl({ connected }: { connected: boolean }) {
  const [state, action, pending] = useActionState(createTelegramLinkCodeAction, initialState);

  return (
    <div className="telegram-link-control">
      <form action={action}>
        <button className="secondary-button" disabled={pending} type="submit">
          {pending ? "Generowanie…" : connected ? "Połącz ponownie" : "Wygeneruj kod połączenia"}
        </button>
      </form>
      {state.code ? (
        <div className="telegram-code" role="status">
          <strong>{state.code}</strong>
          <span>Wyślij do bota: <code>/start {state.code}</code>. Kod wygasa po 10 minutach.</span>
        </div>
      ) : null}
      {state.error ? <p className="form-error">{state.error}</p> : null}
    </div>
  );
}
