import Link from "next/link";

import { requireUser } from "@/auth/session";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/notifications/actions";
import { listNotifications } from "@/notifications/queries";

export const metadata = { title: "Powiadomienia" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const storedNotifications = await listNotifications(user.id);
  const unread = storedNotifications.filter((notification) => !notification.readAt).length;
  const formatter = new Intl.DateTimeFormat("pl-PL", {
    timeZone: user.timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="page-stack narrow-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Centrum powiadomień</p>
          <h1>Nic nie umyka</h1>
          <p>{unread ? `${unread} nieprzeczytanych komunikatów.` : "Wszystko przeczytane."}</p>
        </div>
        {unread ? (
          <form action={markAllNotificationsReadAction}>
            <button className="secondary-button" type="submit">Oznacz wszystkie jako przeczytane</button>
          </form>
        ) : null}
      </header>

      <section className="panel notification-panel">
        {storedNotifications.length ? (
          <div className="notification-list">
            {storedNotifications.map((notification) => (
              <article className={`notification-row ${notification.readAt ? "" : "unread"}`} key={notification.id}>
                <span className="notification-dot" aria-hidden="true" />
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.body}</p>
                  <time>{formatter.format(notification.createdAt)}</time>
                </div>
                <div className="notification-actions">
                  {notification.taskId ? (
                    <Link className="text-button" href={`/tasks/${notification.taskId}`}>Otwórz zadanie</Link>
                  ) : null}
                  {!notification.readAt ? (
                    <form action={markNotificationReadAction}>
                      <input name="notificationId" type="hidden" value={notification.id} />
                      <button className="text-button" type="submit">Przeczytane</button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">✓</span>
            <h3>Brak powiadomień</h3>
            <p>Pierwsze przypomnienie pojawi się tutaj automatycznie.</p>
          </div>
        )}
      </section>
    </div>
  );
}
