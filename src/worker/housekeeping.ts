import { sql } from "drizzle-orm";

import { getDatabaseClient } from "../db/client";

const LOGIN_ATTEMPT_RETENTION_DAYS = 30;

/** Removes expired sessions, used link codes and old login attempts. */
export async function processHousekeeping() {
  const { db } = getDatabaseClient();
  const [sessions, linkCodes, loginAttempts] = await Promise.all([
    db.execute(sql`delete from sessions where expires_at <= now() returning id`),
    db.execute(sql`
      delete from telegram_link_codes
      where expires_at <= now() - interval '1 day'
      returning id
    `),
    db.execute(sql`
      delete from login_attempts
      where created_at <= now() - make_interval(days => ${LOGIN_ATTEMPT_RETENTION_DAYS})
      returning id
    `),
  ]);
  return { sessions: sessions.length, telegramLinkCodes: linkCodes.length, loginAttempts: loginAttempts.length };
}
