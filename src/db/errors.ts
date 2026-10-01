/** True for a PostgreSQL unique constraint violation, also when wrapped by Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { code?: unknown }).code === "23505") return true;
  return isUniqueViolation((error as { cause?: unknown }).cause);
}
