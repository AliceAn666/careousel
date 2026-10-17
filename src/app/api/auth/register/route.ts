import { assertOrigin, currentIdentity } from "@/server/auth/session";
import { registerPatient } from "@/server/auth/accounts";
import { DomainError } from "@/server/services/scheduling";
import { apiError } from "@/server/http";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (await currentIdentity())
      throw new DomainError("Log out before creating another account.", 409);
    return Response.json(await registerPatient(await request.json()), {
      status: 201,
    });
  } catch (error) {
    return apiError(error);
  }
}
