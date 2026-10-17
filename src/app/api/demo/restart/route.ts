import { assertOrigin, currentUser } from "@/server/auth/session";
import { restartDemo, DomainError } from "@/server/services/scheduling";
import { apiError } from "@/server/http";
// Explicit authorized reset only; this is never a login or homepage operation.
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    if (!user) throw new DomainError("Select a demo persona to continue.", 401);
    return Response.json(await restartDemo(user.id, await request.json()));
  } catch (e) {
    return apiError(e);
  }
}
