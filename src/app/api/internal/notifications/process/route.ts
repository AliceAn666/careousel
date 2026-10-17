import { timingSafeEqual } from "node:crypto";
import { processNotificationSequences } from "@/server/services/notification-sequences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.NOTIFICATION_CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer "))
    return false;
  const supplied = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

// Called by a trusted external scheduler, never by browser sessions.
// Notification ordering and eligibility are still enforced by the shared service.
export async function POST(request: Request) {
  if (!authorized(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processNotificationSequences();
    return Response.json(
      { ok: true, ...result },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error(
      "Notification processing failed:",
      error instanceof Error ? error.name : "Unknown",
    );
    return Response.json({ error: "Processing unavailable" }, { status: 503 });
  }
}
