"use client";

import { useState } from "react";

interface GoogleCalendarControlProps {
  configured: boolean;
  connected: boolean;
  needsAttention: boolean;
  lastSyncedAt?: string;
}

export function GoogleCalendarControl({
  configured,
  connected,
  needsAttention,
  lastSyncedAt,
}: GoogleCalendarControlProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function disconnect() {
    if (!window.confirm("Odłączyć Google Calendar i usunąć zdarzenia utworzone przez Taskera?")) return;
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/integrations/google/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Nie udało się odłączyć kalendarza.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się odłączyć kalendarza.");
      setPending(false);
    }
  }

  if (!configured) {
    return <p className="integration-status">Oczekuje na klienta OAuth typu Web.</p>;
  }
  if (connected && !needsAttention) {
    return (
      <div className="push-control">
        <span className="status-badge green">Połączono</span>
        {lastSyncedAt ? <small>Ostatnia synchronizacja: {lastSyncedAt}</small> : null}
        <button className="text-button" disabled={pending} onClick={disconnect} type="button">
          {pending ? "Odłączam…" : "Odłącz konto"}
        </button>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    );
  }
  return (
    <div className="push-control">
      {needsAttention ? <span className="status-badge amber">Wymaga ponownego połączenia</span> : null}
      <a className="secondary-button" href="/api/integrations/google/connect">
        {needsAttention ? "Połącz ponownie" : "Połącz konto Google"}
      </a>
    </div>
  );
}
