import { NextResponse } from "next/server";

import { authorizeIntegrationRequest } from "@/integrations/service-auth";

export async function GET(request: Request) {
  if (!authorizeIntegrationRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return NextResponse.json({
    status: "ready",
    contractVersion: 1,
    capabilities: [
      "TELEGRAM_LINK",
      "CREATE_TASK_DRAFT",
      "CONFIRM_TASK_DRAFT",
      "CANCEL_TASK_DRAFT",
      "CLAIM_TELEGRAM_NOTIFICATIONS",
      "REPORT_TELEGRAM_NOTIFICATION_RESULT",
    ],
  });
}
