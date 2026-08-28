import { createHash, timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isServiceTokenValid(authorization: string | null, expectedSecret: string | undefined) {
  if (!authorization?.startsWith("Bearer ") || !expectedSecret) return false;
  const supplied = authorization.slice("Bearer ".length);
  return timingSafeEqual(digest(supplied), digest(expectedSecret));
}

export function authorizeIntegrationRequest(request: Request) {
  return isServiceTokenValid(request.headers.get("authorization"), getServerEnv().N8N_SERVICE_SECRET);
}
