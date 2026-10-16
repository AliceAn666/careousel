import type { Prisma } from "@prisma/client";
import { PLANS, SERVICES } from "../src/lib/config";
// Additive synthetic fixtures: never update/reset existing bookings or slots.
export async function addExpandedServices(
  tx: Prisma.TransactionClient,
  now = new Date(),
) {
  const clinics = await tx.clinic.findMany({ orderBy: { id: "asc" } });
  for (const [clinicIndex, clinic] of clinics.entries()) {
    for (const [index, service] of SERVICES.slice(3).entries()) {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() + 14 + index);
      start.setUTCHours(17 + clinicIndex, 0, 0, 0);
      const duration =
        service === "Physical therapy" || service === "Nutrition consultation"
          ? 60
          : 30;
      await tx.slot.createMany({
        data: [
          {
            id: `expanded-${clinic.id}-${index}`,
            clinicId: clinic.id,
            service,
            provider: `Demo ${service} team`,
            start,
            end: new Date(+start + duration * 60000),
            price: 5000 + index * 1500,
            plans: [...PLANS],
          },
        ],
        skipDuplicates: true,
      });
    }
  }
}
