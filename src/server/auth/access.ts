import type { Prisma, User } from "@prisma/client";
import { DomainError } from "../services/scheduling";
// Rechecked inside the same lock/transaction as scheduling, so revocation and
// booking cannot race through a cached cookie role.
export async function ensureStaffAccess(
  tx: Prisma.TransactionClient,
  user: User,
) {
  if (user.role !== "STAFF" || !user.clinicId)
    throw new DomainError("Staff clinic access required.", 403);
  const account = await tx.account.findUnique({
    where: { userId: user.id },
    include: { membership: true },
  });
  if (account) {
    if (
      account.status !== "ACTIVE" ||
      account.membership?.status !== "ACTIVE" ||
      account.membership.clinicId !== user.clinicId
    )
      throw new DomainError(
        "Clinic staff access has been revoked or is pending approval.",
        403,
      );
  } else if (
    process.env.DEMO_MODE !== "true" ||
    user.id !== `staff-${user.clinicId}`
  )
    throw new DomainError("An authorized clinic account is required.", 403);
}
