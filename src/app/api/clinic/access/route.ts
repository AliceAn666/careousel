import { assertOrigin, currentIdentity } from "@/server/auth/session";
import {
  accessDashboard,
  inviteStaff,
  manageAccess,
} from "@/server/auth/accounts";
import { DomainError } from "@/server/services/scheduling";
import { z } from "zod";
import { apiError } from "@/server/http";
async function actor() {
  const identity = await currentIdentity();
  if (identity?.mode !== "account")
    throw new DomainError("Administrator account login required.", 403);
  return identity.user.id;
}
export async function GET() {
  try {
    return Response.json(await accessDashboard(await actor()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const userId = await actor(),
      input = z
        .object({ type: z.string() })
        .passthrough()
        .parse(await request.json());
    if (input.type === "invite")
      return Response.json(await inviteStaff(userId, { email: input.email }));
    return Response.json(await manageAccess(userId, input));
  } catch (error) {
    return apiError(error);
  }
}
