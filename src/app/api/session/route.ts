import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { assertOrigin, signSession } from "@/server/auth/session";
import { apiError } from "@/server/http";
import { DomainError } from "@/server/services/scheduling";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (process.env.DEMO_MODE !== "true")
      throw new DomainError("Demo persona switching is disabled.", 403);
    const { id } = z
      .object({ id: z.string().max(100) })
      .parse(await request.json());
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new DomainError("Unknown demo persona.", 400);
    (await cookies()).set("careousel_session", signSession(id), {
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
    (await cookies()).delete("careousel_session");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
