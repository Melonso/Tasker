import { updateNotificationPreferencesAction } from "@/settings/actions";

export function NotificationPreferencesForm({
  telegramEnabled,
  webPushEnabled,
}: {
  telegramEnabled: boolean;
  webPushEnabled: boolean;
}) {
  return (
    <form action={updateNotificationPreferencesAction} className="notification-preferences-form">
      <label><input checked disabled readOnly type="checkbox" /><span><strong>W aplikacji</strong><small>Historia alertów jest zawsze dostępna.</small></span></label>
      <label><input defaultChecked={webPushEnabled} name="webPushEnabled" type="checkbox" /><span><strong>Powiadomienia push</strong><small>Alerty systemowe w podłączonych przeglądarkach.</small></span></label>
      <label><input defaultChecked={telegramEnabled} name="telegramEnabled" type="checkbox" /><span><strong>Telegram</strong><small>Przypomnienia wysyłane przez bota Taskera.</small></span></label>
      <button className="secondary-button" type="submit">Zapisz kanały</button>
    </form>
  );
}
