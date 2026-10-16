import { assertOrigin, currentUser } from "@/server/auth/session";
import { DomainError, getState } from "@/server/services/scheduling";
import { explainCandidates } from "@/server/services/recommendations";
import { apiError } from "@/server/http";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const u = await currentUser();
    if (!u || u.role !== "STAFF")
      throw new DomainError("Staff access required.", 403);
    const { slotId } = z
      .object({ slotId: z.string() })
      .parse(await request.json());
    const state = await getState(u);
    if (!state.slots.some((s) => s.id === slotId))
      throw new DomainError("Slot not found.", 404);
    return Response.json(
      await explainCandidates(
        state.candidates.filter((c) => c.slotId === slotId),
      ),
    );
  } catch (e) {
    return apiError(e);
  }
}
