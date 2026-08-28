import { and, count, eq, sql } from "drizzle-orm";

import { requireRole } from "@/auth/session";
import { InvitationForm } from "@/components/invitation-form";
import { UserAvatar } from "@/components/user-avatar";
import { getDatabaseClient } from "@/db/client";
import {
  notificationDeliveries,
  reminders,
  roles,
  telegramConnections,
  userRoles,
  users,
  workerHeartbeats,
} from "@/db/schema";

const roleLabels: Record<string, string> = {
  APP_ADMIN: "Administrator aplikacji",
  BUSINESS_OWNER: "Właściciel biznesowy",
  COMPANY_MEMBER: "Użytkownik firmowy",
  EXTERNAL: "Użytkownik zewnętrzny",
};

export const metadata = { title: "Administracja" };

export default async function AdminPage() {
  await requireRole("APP_ADMIN");
  const { db } = getDatabaseClient();
  const [rows, [worker], [telegramCount], [failedReminderCount], [failedDeliveryCount]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        avatarDataUrl: users.avatarDataUrl,
        isActive: users.isActive,
        role: roles.key,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id)),
    db
      .select({
        lastSeenAt: workerHeartbeats.lastSeenAt,
        healthy: sql<boolean>`${workerHeartbeats.lastSeenAt} > now() - interval '3 minutes'`,
      })
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.service, "reminder-worker"))
      .limit(1),
    db.select({ value: count() }).from(telegramConnections).where(eq(telegramConnections.status, "CONNECTED")),
    db
      .select({ value: count() })
      .from(reminders)
      .where(
        and(
          eq(reminders.status, "FAILED"),
          sql`${reminders.updatedAt} >= now() - interval '24 hours'`,
        ),
      ),
    db
      .select({ value: count() })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.status, "FAILED"),
          sql`${notificationDeliveries.updatedAt} >= now() - interval '24 hours'`,
        ),
      ),
  ]);
  const usersById = new Map<string, { id: string; email: string; firstName: string; lastName: string; avatarDataUrl: string | null; isActive: boolean; roles: string[] }>();
  for (const row of rows) {
    const current = usersById.get(row.id) ?? { ...row, roles: [] };
    if (row.role) current.roles.push(row.role);
    usersById.set(row.id, current);
  }
  const storedUsers = [...usersById.values()];
  const workerHealthy = worker?.healthy ?? false;
  const errorCount = (failedReminderCount?.value ?? 0) + (failedDeliveryCount?.value ?? 0);
  return (
    <div className="page-stack narrow-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Panel Mateusza</p>
          <h1>Administracja</h1>
          <p>Zarządzaj użytkownikami, integracjami i kondycją systemu.</p>
        </div>
      </header>

      <section className="panel invitation-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Bezpieczny dostęp</p><h2>Link aktywacyjny</h2></div>
          <span className="muted-chip">ważny 7 dni</span>
        </div>
        <InvitationForm users={storedUsers.map((user) => ({
          id: user.id,
          label: `${user.firstName} ${user.lastName} — ${user.email}`,
        }))} />
      </section>

      <section className="summary-grid admin-summary">
        <article className="summary-card accent-green"><span>Użytkownicy</span><strong>{storedUsers.length}</strong><small>{storedUsers.filter((user) => user.isActive).length} aktywnych</small></article>
        <article className={`summary-card ${workerHealthy ? "accent-blue" : "accent-red"}`}><span>Worker</span><strong className="text-status">{workerHealthy ? "Działa" : "Brak pulsu"}</strong><small>{worker ? `Ostatni skan: ${worker.lastSeenAt.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}` : "Nie uruchomił się po wdrożeniu"}</small></article>
        <article className="summary-card accent-amber"><span>Telegram</span><strong>{telegramCount?.value ?? 0}</strong><small>Połączone konta</small></article>
        <article className="summary-card accent-red"><span>Błędy</span><strong>{errorCount}</strong><small>Przypomnienia i dostawy · 24 h</small></article>
      </section>

      <section className="panel user-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Pilotaż</p><h2>Użytkownicy początkowi</h2></div>
          <span className="muted-chip">{storedUsers.length} konta</span>
        </div>
        <div className="user-table" role="table" aria-label="Użytkownicy pilotażowi">
          {storedUsers.map((user) => (
            <div className="user-row" role="row" key={user.email}>
              <UserAvatar avatarDataUrl={user.avatarDataUrl} firstName={user.firstName} lastName={user.lastName} />
              <div className="user-identity">
                <strong>{user.firstName} {user.lastName}</strong>
                <span>{user.email}</span>
              </div>
              <div className="role-list">
                {user.roles.map((role) => <span className="status-badge neutral" key={role}>{roleLabels[role] ?? role}</span>)}
              </div>
              <span className={`status-badge ${user.isActive ? "green" : "amber"}`}>{user.isActive ? "Aktywny" : "Oczekuje"}</span>
              <button className="more-button" type="button" aria-label={`Opcje użytkownika ${user.firstName} ${user.lastName}`}>•••</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
