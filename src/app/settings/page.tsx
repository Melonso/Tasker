import { requireUser } from "@/auth/session";
import { SettingsForm } from "@/components/settings-form";
import { TelegramLinkControl } from "@/components/telegram-link-control";
import { PushNotificationControl } from "@/components/push-notification-control";
import { GoogleCalendarControl } from "@/components/google-calendar-control";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { getDatabaseClient } from "@/db/client";
import { googleConnections, notificationPreferences, pushSubscriptions, telegramConnections } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { googleOAuthConfigured } from "@/integrations/google/client";

const integrationCards = [
  {
    mark: "G",
    title: "Google Calendar",
    description: "Synchronizuj wszystkie zadania posiadające termin.",
    action: "Połącz konto Google",
    tone: "google",
  },
  {
    mark: "↗",
    title: "Telegram",
    description: "Twórz zadania głosem i odbieraj przypomnienia.",
    action: "Połącz Telegram",
    tone: "telegram",
  },
  {
    mark: "●",
    title: "Powiadomienia push",
    description: "Odbieraj alerty nawet przy zamkniętej karcie Taskera.",
    action: "Włącz powiadomienia",
    tone: "push",
  },
];

export const metadata = { title: "Moje ustawienia" };

export default async function SettingsPage() {
  const user = await requireUser();
  const { db } = getDatabaseClient();
  const [[telegramConnection], [pushCount], [googleConnection], preferenceRows] = await Promise.all([
    db
      .select({ status: telegramConnections.status })
      .from(telegramConnections)
      .where(eq(telegramConnections.userId, user.id))
      .limit(1),
    db
      .select({ value: count() })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id)),
    db
      .select({ status: googleConnections.status, lastSyncedAt: googleConnections.lastSyncedAt })
      .from(googleConnections)
      .where(eq(googleConnections.userId, user.id))
      .limit(1),
    db
      .select({ channel: notificationPreferences.channel, enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id)),
  ]);
  const preferences = new Map(preferenceRows.map((preference) => [preference.channel, preference.enabled]));
  return (
    <div className="page-stack narrow-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Twoje konto</p>
          <h1>Moje ustawienia</h1>
          <p>Połącz usługi i dopasuj sposób, w jaki Tasker pilnuje terminów.</p>
        </div>
      </header>

      <section className="panel settings-section">
        <div className="panel-heading">
          <div><p className="eyebrow">Integracje</p><h2>Połączone usługi</h2></div>
        </div>
        <div className="integration-grid">
          {integrationCards.map((integration) => (
            <article className="integration-card" key={integration.title}>
              <span className={`integration-mark ${integration.tone}`}>{integration.mark}</span>
              <div>
                <strong>{integration.title}</strong>
                <p>{integration.description}</p>
              </div>
              {integration.title === "Google Calendar" ? (
                <GoogleCalendarControl
                  configured={googleOAuthConfigured()}
                  connected={googleConnection?.status === "CONNECTED"}
                  needsAttention={googleConnection?.status === "NEEDS_ATTENTION"}
                  lastSyncedAt={googleConnection?.lastSyncedAt?.toLocaleString("pl-PL", { timeZone: user.timeZone })}
                />
              ) : integration.title === "Telegram" ? (
                <TelegramLinkControl connected={telegramConnection?.status === "CONNECTED"} />
              ) : integration.title === "Powiadomienia push" ? (
                <PushNotificationControl deviceCount={pushCount?.value ?? 0} />
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel settings-section">
        <div className="panel-heading">
          <div><p className="eyebrow">Kanały</p><h2>Gdzie wysyłać przypomnienia</h2></div>
        </div>
        <NotificationPreferencesForm
          telegramEnabled={preferences.get("TELEGRAM") ?? true}
          webPushEnabled={preferences.get("WEB_PUSH") ?? true}
        />
      </section>

      <section className="panel settings-section">
        <div className="panel-heading">
          <div><p className="eyebrow">Preferencje</p><h2>Terminy i przypomnienia</h2></div>
        </div>
        <SettingsForm
          avatarDataUrl={user.avatarDataUrl}
          defaultTaskHour={user.defaultTaskHour}
          firstName={user.firstName}
          language={user.language}
          lastName={user.lastName}
          overdueReminderHour={user.overdueReminderHour}
          timeZone={user.timeZone}
        />
      </section>
    </div>
  );
}
