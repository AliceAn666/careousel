import { cookies } from "next/headers";
import { assertOrigin, signSession } from "@/server/auth/session";
import { registerPersona } from "@/server/services/registration";
import { apiError } from "@/server/http";
// Demo registration: create the persona, then sign in as it.
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const id = await registerPersona(await request.json());
    (await cookies()).set("careousel_session", signSession(id), {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 86400,
    });
    return Response.json({ ok: true, id });
  } catch (e) {
    return apiError(e);
  }
}
