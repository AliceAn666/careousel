import { assertOrigin, currentUser } from "@/server/auth/session";
import { DomainError } from "@/server/services/scheduling";
import {
  getSequencePreview,
  sequenceAction,
} from "@/server/services/notification-sequences";
import { apiError } from "@/server/http";
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) throw new DomainError("Log in first.", 401);
    return Response.json(
      await getSequencePreview(
        user.id,
        new URL(request.url).searchParams.get("slotId") ?? "",
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const user = await currentUser();
    if (!user) throw new DomainError("Log in first.", 401);
    return Response.json(await sequenceAction(user.id, await request.json()));
  } catch (e) {
    return apiError(e);
  }
}
