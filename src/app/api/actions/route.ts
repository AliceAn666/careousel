import { assertOrigin, currentUser } from "@/server/auth/session";
import { performAction, DomainError } from "@/server/services/scheduling";
import { apiError } from "@/server/http";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    if (!user) throw new DomainError("Log in to continue.", 401);
    return Response.json(await performAction(user.id, await request.json()));
  } catch (e) {
    return apiError(e);
  }
}
