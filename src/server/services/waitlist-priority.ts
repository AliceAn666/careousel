import type { Prisma } from "@prisma/client";
// Minimal authorized projection, not general access to a clinic's patient files.
// A matching candidate is already pre-screened by the existing scheduler.
export function priorityRequestScope(
  clinicId: string,
): Prisma.WaitlistWhereInput {
  return {
    status: "ACTIVE",
    OR: [
      { clinicIds: { has: clinicId } },
      { booking: { slot: { clinicId } } },
      { suggestions: { some: { slot: { clinicId } } } },
    ],
  };
}
export const priorityInclude = {
  clinic: { select: { id: true, name: true } },
  assignedBy: { select: { name: true } },
  history: {
    include: { actor: { select: { name: true } } },
    orderBy: { version: "desc" as const },
  },
} satisfies Prisma.WaitlistPriorityInclude;
