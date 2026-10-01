"use client";

import { useActionState, useState } from "react";

import { createTelegramLinkCodeAction, type TelegramLinkState } from "@/integrations/actions";

const initialState: TelegramLinkState = {};
const TELEGRAM_BOT_URL = "https://t.me/dpkomis_tasker_bot";

export function TelegramLinkControl({ connected }: { connected: boolean }) {
  const [state, action, pending] = useActionState(createTelegramLinkCodeAction, initialState);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(TELEGRAM_BOT_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

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

      <div className="telegram-bot-strip">
        <span className="telegram-bot-caption">Bot Telegram</span>
        <div className="telegram-bot-action-row">
          <a
            className="telegram-bot-link"
            href={TELEGRAM_BOT_URL}
            rel="noopener noreferrer"
            target="_blank"
            title="Otwórz bota w Telegramie"
          >
            <span aria-hidden="true" className="telegram-bot-icon">↗</span>
            <span className="telegram-bot-handle">@dpkomis_tasker_bot</span>
          </a>
          <button
            className="telegram-copy-button"
            onClick={handleCopy}
            type="button"
          >
            {copied ? "Skopiowano!" : "Kopiuj link"}
          </button>
        </div>
      </div>
    </div>
  );
}
