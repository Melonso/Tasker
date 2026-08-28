import { and, eq, isNull } from "drizzle-orm";

import { createInvitationToken, hashInvitationToken, invitationExpiresAt } from "../auth/invitations";
import { getServerEnv } from "../lib/env";
import { createDatabaseClient } from "./client";
import { auditEvents, invitations, users } from "./schema";

const ADMIN_EMAIL = "mateusz.meloch@dpkomis.pl";
const { db, sql } = createDatabaseClient(1);

try {
  const [administrator] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);
  if (!administrator) throw new Error(`Pilot administrator ${ADMIN_EMAIL} does not exist.`);

  const token = createInvitationToken();
  await db.transaction(async (tx) => {
    await tx
      .delete(invitations)
      .where(and(eq(invitations.email, administrator.email), isNull(invitations.acceptedAt)));
    const [invitation] = await tx
      .insert(invitations)
      .values({
        email: administrator.email,
        tokenHash: hashInvitationToken(token),
        expiresAt: invitationExpiresAt(),
      })
      .returning({ id: invitations.id });
    await tx.insert(auditEvents).values({
      action: "BOOTSTRAP_INVITATION_CREATED",
      metadata: { invitationId: invitation?.id, invitedUserId: administrator.id },
    });
  });

  console.info(`${getServerEnv().APP_BASE_URL}/activate?token=${encodeURIComponent(token)}`);
} finally {
  await sql.end();
}
