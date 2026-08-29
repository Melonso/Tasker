import { asc, eq } from "drizzle-orm";

import { requireRole } from "@/auth/session";
import { UserAvatar } from "@/components/user-avatar";
import { getDatabaseClient } from "@/db/client";
import { teamMembers, teams, users } from "@/db/schema";
import { addTeamMemberAction, createTeamAction, removeTeamMemberAction } from "@/teams/actions";

export const metadata = { title: "Zespoły" };

export default async function TeamsPage() {
  const user = await requireRole("BUSINESS_OWNER");
  const { db } = getDatabaseClient();
  const [storedTeams, activeUsers] = await Promise.all([
    db
      .select({
        id: teams.id,
        name: teams.name,
        isExternal: teams.isExternal,
        memberId: users.id,
        memberFirstName: users.firstName,
        memberLastName: users.lastName,
        memberAvatarDataUrl: users.avatarDataUrl,
      })
      .from(teams)
      .leftJoin(teamMembers, eq(teams.id, teamMembers.teamId))
      .leftJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teams.createdById, user.id))
      .orderBy(asc(teams.name), asc(users.firstName)),
    db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.firstName), asc(users.lastName)),
  ]);
  const grouped = new Map<string, { id: string; name: string; isExternal: boolean; members: typeof storedTeams }>();
  for (const row of storedTeams) {
    const group = grouped.get(row.id) ?? { id: row.id, name: row.name, isExternal: row.isExternal, members: [] };
    if (row.memberId) group.members.push(row);
    grouped.set(row.id, group);
  }

  return (
    <div className="page-stack narrow-page">
      <header className="page-header"><div><p className="eyebrow">Współpraca</p><h1>Zespoły</h1><p>Grupuj użytkowników i udostępniaj zadania całemu zespołowi.</p></div></header>
      <section className="panel settings-section">
        <div className="panel-heading"><div><p className="eyebrow">Nowy zespół</p><h2>Utwórz grupę</h2></div></div>
        <form action={createTeamAction} className="team-create-form">
          <label>Nazwa<input maxLength={160} name="name" placeholder="np. Marketing" required /></label>
          <label className="checkbox-label"><input name="isExternal" type="checkbox" /> Zespół może zawierać osoby zewnętrzne</label>
          <button className="primary-button" type="submit">Utwórz zespół</button>
        </form>
      </section>
      {[...grouped.values()].map((team) => {
        const memberIds = new Set(team.members.flatMap((member) => member.memberId ? [member.memberId] : []));
        return (
          <section className="panel team-panel" key={team.id}>
            <div className="panel-heading"><div><p className="eyebrow">{team.isExternal ? "Zespół zewnętrzny" : "Zespół firmowy"}</p><h2>{team.name}</h2></div><span className="muted-chip">{team.members.length} osób</span></div>
            <div className="team-member-list">
              {team.members.map((member) => (
                <article key={member.memberId}>
                  <UserAvatar avatarDataUrl={member.memberAvatarDataUrl} firstName={member.memberFirstName ?? ""} lastName={member.memberLastName ?? ""} />
                  <strong>{member.memberFirstName} {member.memberLastName}</strong>
                  {member.memberId !== user.id ? (
                    <form action={removeTeamMemberAction}><input name="teamId" type="hidden" value={team.id} /><input name="userId" type="hidden" value={member.memberId ?? ""} /><button className="text-button" type="submit">Usuń</button></form>
                  ) : <span className="muted-chip">Właściciel</span>}
                </article>
              ))}
            </div>
            <form action={addTeamMemberAction} className="team-add-form">
              <input name="teamId" type="hidden" value={team.id} />
              <label>Dodaj osobę<select name="userId" required>{activeUsers.filter((person) => !memberIds.has(person.id)).map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</select></label>
              <button className="secondary-button" disabled={activeUsers.every((person) => memberIds.has(person.id))} type="submit">Dodaj do zespołu</button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
