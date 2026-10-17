import { cookies } from "next/headers";
import {
  assertOrigin,
  currentIdentity,
  signSession,
} from "@/server/auth/session";
import { DomainError } from "@/server/services/scheduling";
import { apiError } from "@/server/http";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (process.env.DEMO_MODE !== "true")
      throw new DomainError("Demo Mode is unavailable.", 403);
    if ((await currentIdentity())?.mode === "account")
      throw new DomainError("Log out before entering Demo Mode.", 409);
    const input = await request.json();
    if (input.confirm !== true)
      throw new DomainError("Explicit Demo Mode confirmation required.", 400);
    (await cookies()).set("careousel_demo", signSession("demo-mode"), {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 86400,
    });
    return Response.json({
      message:
        "Demo Mode enabled. Synthetic identities only. Data was not reset.",
    });
  } catch (error) {
    return apiError(error);
  }
}
