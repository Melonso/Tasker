import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const roleKeyEnum = pgEnum("role_key", [
  "APP_ADMIN",
  "BUSINESS_OWNER",
  "COMPANY_MEMBER",
  "EXTERNAL",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "OPEN",
  "WAITING",
  "COMPLETED",
  "CANCELED",
]);
export const taskVisibilityEnum = pgEnum("task_visibility", [
  "PRIVATE",
  "COMPANY",
  "SHARED",
]);
export const taskPriorityEnum = pgEnum("task_priority", ["LOW", "NORMAL", "HIGH", "URGENT"]);
export const reminderKindEnum = pgEnum("reminder_kind", [
  "SEVEN_DAYS_BEFORE",
  "ONE_DAY_BEFORE",
  "ONE_HOUR_BEFORE",
  "OVERDUE_DAILY",
]);
export const reminderStatusEnum = pgEnum("reminder_status", [
  "SCHEDULED",
  "PROCESSING",
  "SENT",
  "CANCELED",
  "FAILED",
]);
export const notificationChannelEnum = pgEnum("notification_channel", [
  "IN_APP",
  "WEB_PUSH",
  "TELEGRAM",
]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "PENDING",
  "SENT",
  "FAILED",
  "SKIPPED",
]);
export const connectionStatusEnum = pgEnum("connection_status", [
  "CONNECTED",
  "NEEDS_ATTENTION",
  "DISCONNECTED",
]);
export const commandDraftStatusEnum = pgEnum("command_draft_status", [
  "DRAFT",
  "NEEDS_CLARIFICATION",
  "PROCESSING",
  "CONFIRMED",
  "CANCELED",
  "EXPIRED",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 160 }).notNull(),
    avatarDataUrl: text("avatar_data_url"),
    passwordHash: text("password_hash"),
    timeZone: varchar("time_zone", { length: 80 }).default("Europe/Warsaw").notNull(),
    defaultTaskHour: integer("default_task_hour").default(14).notNull(),
    overdueReminderHour: integer("overdue_reminder_hour").default(9).notNull(),
    language: varchar("language", { length: 12 }).default("pl").notNull(),
    isActive: boolean("is_active").default(false).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: roleKeyEnum("key").notNull().unique(),
  label: varchar("label", { length: 120 }).notNull(),
  ...timestamps,
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  isExternal: boolean("is_external").default(false).notNull(),
  ...timestamps,
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => users.id),
    status: taskStatusEnum("status").default("OPEN").notNull(),
    visibility: taskVisibilityEnum("visibility").default("PRIVATE").notNull(),
    priority: taskPriorityEnum("priority").default("NORMAL").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    waitingReason: text("waiting_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: uuid("completed_by_id").references(() => users.id),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    index("tasks_assignee_status_idx").on(table.assigneeId, table.status),
    index("tasks_author_status_idx").on(table.authorId, table.status),
    index("tasks_due_at_idx").on(table.dueAt),
  ],
);

export const taskShares = pgTable(
  "task_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("task_shares_task_idx").on(table.taskId)],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (table) => [index("task_comments_task_idx").on(table.taskId, table.createdAt)],
);

export const taskRecurrences = pgTable("task_recurrences", {
  taskId: uuid("task_id")
    .primaryKey()
    .references(() => tasks.id, { onDelete: "cascade" }),
  rule: jsonb("rule").$type<{ frequency: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number }>().notNull(),
  nextOccurrenceAt: timestamp("next_occurrence_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const taskDueDateHistory = pgTable(
  "task_due_date_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    changedById: uuid("changed_by_id")
      .notNull()
      .references(() => users.id),
    previousDueAt: timestamp("previous_due_at", { withTimezone: true }),
    newDueAt: timestamp("new_due_at", { withTimezone: true }),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("task_due_history_task_idx").on(table.taskId, table.changedAt)],
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: reminderKindEnum("kind").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: reminderStatusEnum("status").default("SCHEDULED").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("reminders_task_kind_time_unique").on(table.taskId, table.kind, table.scheduledAt),
    index("reminders_due_idx").on(table.status, table.scheduledAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("notifications_user_created_idx").on(table.userId, table.createdAt)],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    status: deliveryStatusEnum("status").default("PENDING").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [uniqueIndex("notification_delivery_idempotency_unique").on(table.idempotencyKey)],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [uniqueIndex("push_subscription_endpoint_unique").on(table.endpoint)],
);

export const googleConnections = pgTable("google_connections", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  status: connectionStatusEnum("status").default("CONNECTED").notNull(),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  calendarId: text("calendar_id"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  ...timestamps,
});

export const calendarEventLinks = pgTable(
  "calendar_event_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull(),
    eventId: text("event_id").notNull(),
    etag: text("etag"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("calendar_event_task_user_unique").on(table.taskId, table.userId)],
);

export const telegramConnections = pgTable("telegram_connections", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  status: connectionStatusEnum("status").default("CONNECTED").notNull(),
  telegramUserId: varchar("telegram_user_id", { length: 80 }).notNull().unique(),
  chatId: varchar("chat_id", { length: 80 }).notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const telegramLinkCodes = pgTable(
  "telegram_link_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("telegram_link_codes_hash_unique").on(table.codeHash),
    index("telegram_link_codes_user_idx").on(table.userId, table.createdAt),
  ],
);

export interface CreateTaskDraftPayload {
  intent: "CREATE_TASK";
  title: string;
  description: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  visibility: "PRIVATE" | "COMPANY" | "SHARED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  clarification: string | null;
}

export const taskCommandDrafts = pgTable(
  "task_command_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 40 }).default("TELEGRAM").notNull(),
    sourceEventId: varchar("source_event_id", { length: 200 }).notNull(),
    status: commandDraftStatusEnum("status").default("DRAFT").notNull(),
    payload: jsonb("payload").$type<CreateTaskDraftPayload>().notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("task_command_drafts_source_event_unique").on(table.source, table.sourceEventId),
    index("task_command_drafts_user_status_idx").on(table.userId, table.status, table.expiresAt),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  invitedById: uuid("invited_by_id").references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    action: varchar("action", { length: 160 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_events_task_created_idx").on(table.taskId, table.createdAt)],
);

export const workerHeartbeats = pgTable("worker_heartbeats", {
  service: varchar("service", { length: 80 }).primaryKey(),
  status: varchar("status", { length: 40 }).default("HEALTHY").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
