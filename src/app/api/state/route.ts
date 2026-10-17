import { currentIdentity, explicitDemoMode } from "@/server/auth/session";
import { getState } from "@/server/services/scheduling";
import { apiError } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const identity = await currentIdentity(),
      demoMode = identity?.mode !== "account" && (await explicitDemoMode());
    const state = await getState(identity?.user ?? null, { demoMode });
    return Response.json(
      {
        ...state,
        auth: {
          demoMode,
          mode: identity?.mode ?? "anonymous",
          username: identity?.username ?? null,
          clinicRole: identity?.clinicRole ?? null,
          demoAvailable: process.env.DEMO_MODE === "true",
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
