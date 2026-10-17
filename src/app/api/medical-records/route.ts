import { assertOrigin, currentUser } from "@/server/auth/session";
import { apiError } from "@/server/http";
import { DomainError } from "@/server/services/scheduling";
import {
  medicalRecordsDashboard,
  mutateMedicalRecords,
} from "@/server/services/medical-records";
async function actor() {
  const user = await currentUser();
  if (!user) throw new DomainError("Login required.", 401);
  return user.id;
}
export async function GET(request: Request) {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(await medicalRecordsDashboard(await actor(), query), {
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
      await mutateMedicalRecords(await actor(), await request.json()),
    );
  } catch (error) {
    return apiError(error);
  }
}
