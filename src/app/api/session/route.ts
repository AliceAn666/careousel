import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import {
  assertOrigin,
  signSession,
  currentIdentity,
  explicitDemoMode,
  setSessionCookie,
  logoutSession,
} from "@/server/auth/session";
import { apiError } from "@/server/http";
import { DEMO_PERSONAS } from "@/lib/config";
import { DomainError } from "@/server/services/scheduling";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (process.env.DEMO_MODE !== "true")
      throw new DomainError("Demo persona switching is disabled.", 403);
    if ((await currentIdentity())?.mode === "account")
      throw new DomainError("Log out before entering Demo Mode.", 409);
    const { id, demo } = z
      .object({ id: z.string().max(100), demo: z.literal(true).optional() })
      .parse(await request.json());
    if (!demo && !(await explicitDemoMode()))
      throw new DomainError("Enter explicitly labeled Demo Mode first.", 403);
    if (!(DEMO_PERSONAS as readonly string[]).includes(id))
      throw new DomainError("Unknown demo persona.", 400);
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new DomainError("Unknown demo persona.", 400);
    await setSessionCookie(signSession(id), request);
    (await cookies()).set("careousel_demo", signSession("demo-mode"), {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 86400,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    await logoutSession();
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
