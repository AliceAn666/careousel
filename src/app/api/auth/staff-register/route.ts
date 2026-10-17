import { assertOrigin, currentIdentity } from "@/server/auth/session";
import { redeemInvitation } from "@/server/auth/accounts";
import { DomainError } from "@/server/services/scheduling";
import { apiError } from "@/server/http";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (await currentIdentity())
      throw new DomainError(
        "Log out before redeeming an account invitation.",
        409,
      );
    return Response.json(await redeemInvitation(await request.json()), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
