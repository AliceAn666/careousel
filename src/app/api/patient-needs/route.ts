import { assertOrigin, currentUser } from "@/server/auth/session";
import { apiError } from "@/server/http";
import { DomainError, performAction } from "@/server/services/scheduling";
import { patientNeedsDashboard } from "@/server/services/patient-needs";
import { patientNeedAction } from "@/lib/patient-needs";
async function actor() {
  const user = await currentUser();
  if (!user) throw new DomainError("Login required.", 401);
  return user.id;
}
export async function GET() {
  try {
    return Response.json(await patientNeedsDashboard(await actor()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    return Response.json(
      await performAction(
        await actor(),
        patientNeedAction.parse(await request.json()),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
