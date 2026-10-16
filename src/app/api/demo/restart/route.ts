import { cookies } from "next/headers";
import { assertOrigin } from "@/server/auth/session";
import { restartDemo } from "@/server/services/scheduling";
import { apiError } from "@/server/http";
// Home page entry: sign out of any persona and restore the demo baseline.
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    await restartDemo();
    (await cookies()).delete("careousel_session");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
