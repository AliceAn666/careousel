import {
  assertOrigin,
  currentIdentity,
  setSessionCookie,
} from "@/server/auth/session";
import { login } from "@/server/auth/accounts";
import { DomainError } from "@/server/services/scheduling";
import { apiError } from "@/server/http";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (await currentIdentity())
      throw new DomainError(
        "Log out before authenticating another account.",
        409,
      );
    const result = await login(await request.json());
    await setSessionCookie(result.token!, request);
    return Response.json({ message: "Logged in.", role: result.role });
  } catch (error) {
    return apiError(error);
  }
}
