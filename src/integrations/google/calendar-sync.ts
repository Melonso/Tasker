import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { calendar_v3, google } from "googleapis";

import { getDatabaseClient } from "@/db/client";
import { calendarEventLinks, googleConnections, tasks } from "@/db/schema";
import { getServerEnv } from "@/lib/env";

import { authorizedGoogleClient, type GoogleConnection } from "./client";

function googleStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("response" in error)) return null;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : null;
}

function eventBody(task: {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date;
  status: "OPEN" | "WAITING";
}): calendar_v3.Schema$Event {
  const start = task.dueAt;
  const end = new Date(start.getTime() + 30 * 60 * 1_000);
  const taskUrl = `${getServerEnv().APP_BASE_URL.replace(/\/$/, "")}/tasks/${task.id}`;
  const statusLine = task.status === "WAITING" ? "Status: oczekujące" : "Status: bieżące";
  return {
    summary: task.title,
    description: [task.description, statusLine, `Otwórz w Taskerze: ${taskUrl}`].filter(Boolean).join("\n\n"),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 7 * 24 * 60 },
        { method: "popup", minutes: 24 * 60 },
        { method: "popup", minutes: 60 },
      ],
    },
    extendedProperties: { private: { taskerTaskId: task.id } },
  };
}

async function createEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  task: Parameters<typeof eventBody>[0],
) {
  const response = await calendar.events.insert({ calendarId, requestBody: eventBody(task), sendUpdates: "none" });
  if (!response.data.id) throw new Error("Google Calendar nie zwrócił identyfikatora zdarzenia.");
  return response.data;
}

export async function syncGoogleCalendarConnection(connection: GoogleConnection) {
  const { db } = getDatabaseClient();
  const oauth = await authorizedGoogleClient(connection);
  const calendar = google.calendar({ version: "v3", auth: oauth });
  const calendarId = connection.calendarId || "primary";

  const [desiredTasks, existingLinks] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        dueAt: tasks.dueAt,
        status: tasks.status,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(and(
        isNotNull(tasks.dueAt),
        inArray(tasks.status, ["OPEN", "WAITING"]),
        or(eq(tasks.authorId, connection.userId), eq(tasks.assigneeId, connection.userId)),
      )),
    db
      .select()
      .from(calendarEventLinks)
      .where(eq(calendarEventLinks.userId, connection.userId)),
  ]);

  const desiredIds = new Set(desiredTasks.map((task) => task.id));
  const linkByTask = new Map(existingLinks.map((link) => [link.taskId, link]));
  let created = 0;
  let updated = 0;
  let deleted = 0;
  let unchanged = 0;

  for (const rawTask of desiredTasks) {
    if (!rawTask.dueAt || !["OPEN", "WAITING"].includes(rawTask.status)) continue;
    const task = { ...rawTask, dueAt: rawTask.dueAt, status: rawTask.status as "OPEN" | "WAITING" };
    const link = linkByTask.get(task.id);
    if (link?.lastSyncedAt && link.lastSyncedAt >= task.updatedAt) {
      unchanged += 1;
      continue;
    }

    let event: calendar_v3.Schema$Event;
    if (link) {
      try {
        const response = await calendar.events.patch({
          calendarId: link.calendarId,
          eventId: link.eventId,
          requestBody: eventBody(task),
          sendUpdates: "none",
        });
        event = response.data;
        updated += 1;
      } catch (error) {
        if (googleStatus(error) !== 404 && googleStatus(error) !== 410) throw error;
        event = await createEvent(calendar, calendarId, task);
        created += 1;
      }
    } else {
      event = await createEvent(calendar, calendarId, task);
      created += 1;
    }
    if (!event.id) throw new Error("Brak identyfikatora zdarzenia po synchronizacji.");
    const now = new Date();
    await db
      .insert(calendarEventLinks)
      .values({
        taskId: task.id,
        userId: connection.userId,
        calendarId,
        eventId: event.id,
        etag: event.etag,
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [calendarEventLinks.taskId, calendarEventLinks.userId],
        set: { calendarId, eventId: event.id, etag: event.etag, lastSyncedAt: now, updatedAt: now },
      });
  }

  for (const link of existingLinks) {
    if (desiredIds.has(link.taskId)) continue;
    try {
      await calendar.events.delete({ calendarId: link.calendarId, eventId: link.eventId, sendUpdates: "none" });
    } catch (error) {
      if (googleStatus(error) !== 404 && googleStatus(error) !== 410) throw error;
    }
    await db.delete(calendarEventLinks).where(eq(calendarEventLinks.id, link.id));
    deleted += 1;
  }

  await db
    .update(googleConnections)
    .set({ status: "CONNECTED", lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(googleConnections.userId, connection.userId));
  return { created, updated, deleted, unchanged };
}

export async function processGoogleCalendarBatch(limit = 10) {
  const { db } = getDatabaseClient();
  const connections = await db
    .select()
    .from(googleConnections)
    .where(eq(googleConnections.status, "CONNECTED"))
    .limit(Math.min(Math.max(limit, 1), 50));
  let synced = 0;
  let failed = 0;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  for (const connection of connections) {
    try {
      const result = await syncGoogleCalendarConnection(connection);
      synced += 1;
      created += result.created;
      updated += result.updated;
      deleted += result.deleted;
    } catch (error) {
      failed += 1;
      console.error("Google Calendar synchronization failed", {
        userId: connection.userId,
        error: error instanceof Error ? error.message : "Nieznany błąd",
      });
    }
  }
  return { claimed: connections.length, synced, failed, created, updated, deleted };
}

export async function removeGoogleCalendarConnection(connection: GoogleConnection) {
  const { db } = getDatabaseClient();
  const oauth = await authorizedGoogleClient(connection);
  const calendar = google.calendar({ version: "v3", auth: oauth });
  const links = await db
    .select()
    .from(calendarEventLinks)
    .where(eq(calendarEventLinks.userId, connection.userId));
  for (const link of links) {
    try {
      await calendar.events.delete({ calendarId: link.calendarId, eventId: link.eventId, sendUpdates: "none" });
    } catch (error) {
      if (googleStatus(error) !== 404 && googleStatus(error) !== 410) throw error;
    }
  }
  const accessToken = oauth.credentials.access_token;
  if (accessToken) await oauth.revokeToken(accessToken).catch(() => undefined);
  await db.transaction(async (tx) => {
    await tx.delete(calendarEventLinks).where(eq(calendarEventLinks.userId, connection.userId));
    await tx.delete(googleConnections).where(eq(googleConnections.userId, connection.userId));
  });
}
