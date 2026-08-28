"use client";

import { useEffect, useState } from "react";

type PushState = "checking" | "unsupported" | "denied" | "disconnected" | "connected";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return { registration, subscription: await registration.pushManager.getSubscription() };
}

export function PushNotificationControl({ deviceCount }: { deviceCount: number }) {
  const [state, setState] = useState<PushState>("checking");
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    async function inspectBrowser() {
      await Promise.resolve();
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      await currentSubscription()
        .then(({ subscription }) => setState(subscription ? "connected" : "disconnected"))
        .catch(() => setState("disconnected"));
    }
    void inspectBrowser();
  }, []);

  async function enable() {
    setPending(true);
    setMessage(undefined);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "disconnected");
        setMessage("Przeglądarka nie udzieliła zgody na powiadomienia.");
        return;
      }
      const keyResponse = await fetch("/api/push/public-key");
      if (!keyResponse.ok) throw new Error("Tasker nie ma jeszcze klucza Web Push.");
      const { publicKey } = (await keyResponse.json()) as { publicKey: string };
      const { registration, subscription: stored } = await currentSubscription();
      const subscription = stored ?? (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      }));
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error("Nie udało się zapisać tego urządzenia.");
      setState("connected");
      setMessage("Powiadomienia są aktywne na tym urządzeniu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się włączyć powiadomień.");
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    setMessage(undefined);
    try {
      const { subscription } = await currentSubscription();
      if (subscription) {
        await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("disconnected");
      setMessage("Powiadomienia wyłączono na tym urządzeniu.");
    } catch {
      setMessage("Nie udało się odłączyć tego urządzenia.");
    } finally {
      setPending(false);
    }
  }

  async function sendTest() {
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      if (!response.ok) throw new Error("Nie udało się zaplanować testu.");
      setMessage("Test wysłany do kolejki — powinien pojawić się w ciągu minuty.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test nie powiódł się.");
    } finally {
      setPending(false);
    }
  }

  if (state === "checking") return <p className="integration-status">Sprawdzam przeglądarkę…</p>;
  if (state === "unsupported") return <p className="form-error">Ta przeglądarka nie obsługuje Web Push.</p>;
  if (state === "denied") {
    return <p className="form-error">Powiadomienia są zablokowane w ustawieniach tej witryny.</p>;
  }

  return (
    <div className="push-control">
      <span className={`status-badge ${state === "connected" ? "green" : "neutral"}`}>
        {state === "connected" ? "Aktywne na tym urządzeniu" : "Wyłączone"}
      </span>
      {deviceCount ? <small>{deviceCount} zapisane urządzenia</small> : null}
      {state === "connected" ? (
        <div className="push-actions">
          <button className="secondary-button" disabled={pending} onClick={sendTest} type="button">Wyślij test</button>
          <button className="text-button" disabled={pending} onClick={disable} type="button">Wyłącz tutaj</button>
        </div>
      ) : (
        <button className="secondary-button" disabled={pending} onClick={enable} type="button">
          {pending ? "Włączam…" : "Włącz powiadomienia"}
        </button>
      )}
      {message ? <p className={message.includes("aktywne") || message.includes("kolejki") ? "form-success" : "form-error"}>{message}</p> : null}
    </div>
  );
}
