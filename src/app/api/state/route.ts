import { currentUser } from "@/server/auth/session";
import { getState } from "@/server/services/scheduling";
import { apiError } from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await getState(await currentUser()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
