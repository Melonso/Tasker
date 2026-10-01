import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export function avatarUrl(userId: string, version: number) {
  return `/api/users/${userId}/avatar?v=${version}`;
}

/**
 * Selects a cacheable URL of the user's avatar instead of the stored data URL, so pages and lists
 * never ship image bytes. The version changes whenever the user row changes.
 */
export function avatarUrlColumn(table: { id: AnyPgColumn; avatarDataUrl: AnyPgColumn; updatedAt: AnyPgColumn }) {
  return sql<string | null>`case
    when ${table.avatarDataUrl} is null then null
    else '/api/users/' || ${table.id} || '/avatar?v=' || floor(extract(epoch from ${table.updatedAt}) * 1000)::bigint
  end`;
}
