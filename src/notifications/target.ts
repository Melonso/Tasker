export function notificationTargetUrl({
  baseUrl,
  targetPath,
  taskId,
  fallbackPath = "/notifications",
}: {
  baseUrl: string;
  targetPath: string | null;
  taskId: string | null;
  fallbackPath?: string | null;
}) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  if (targetPath) return `${normalizedBase}${targetPath.startsWith("/") ? targetPath : `/${targetPath}`}`;
  if (taskId) return `${normalizedBase}/tasks/${taskId}`;
  if (fallbackPath) return `${normalizedBase}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`;
  return null;
}
