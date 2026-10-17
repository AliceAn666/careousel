import { assertOrigin, currentUser } from "@/server/auth/session";
import { apiError } from "@/server/http";
import { DomainError } from "@/server/services/scheduling";
import {
  medicalTagsDashboard,
  mutateMedicalTag,
} from "@/server/services/medical-tags";
async function actor() {
  const user = await currentUser();
  if (!user) throw new DomainError("Login required.", 401);
  return user.id;
}
export async function GET() {
  try {
    return Response.json(await medicalTagsDashboard(await actor()), {
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
      await mutateMedicalTag(await actor(), await request.json()),
    );
  } catch (error) {
    return apiError(error);
  }
}
