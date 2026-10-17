import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { locked, DomainError } from "../services/scheduling";
import { hashPassword, verifyPassword, tokenHash } from "./passwords";
import { ensureStaffAccess } from "./access";
import { PLANS } from "../../lib/config";
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_.-]{2,39}$/);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(120)
  .refine(
    (value) =>
      /@(?:[^@]+\.)?(?:example\.(?:com|org|net)|example|test)$/.test(value),
    "Use a fictional example/test email address.",
  );
const password = z.string().min(12).max(128);
const credentials = {
  username,
  email,
  password,
  name: z.string().trim().min(2).max(60),
};
export const patientRegistration = z
  .object({ ...credentials, plan: z.enum(PLANS) })
  .strict();
export const staffRegistration = z
  .object({ ...credentials, invitationToken: z.string().min(32).max(128) })
  .strict();
export const loginSchema = z
  .object({ username, password, entrance: z.enum(["PATIENT", "STAFF"]) })
  .strict();
async function executionTime(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  return row.now;
}
async function uniqueAccount(
  tx: Prisma.TransactionClient,
  input: { username: string; email: string },
) {
  if (
    await tx.account.findFirst({
      where: { OR: [{ username: input.username }, { email: input.email }] },
    })
  )
    throw new DomainError("Username or email is unavailable.", 409);
}
async function createAccount(
  tx: Prisma.TransactionClient,
  input:
    z.infer<typeof staffRegistration> | z.infer<typeof patientRegistration>,
  passwordHash: string,
  clinicId?: string,
) {
  await uniqueAccount(tx, input);
  const user = await tx.user.create({
    data: {
      id: `account-user-${randomBytes(16).toString("hex")}`,
      name: input.name,
      role: clinicId ? "STAFF" : "PATIENT",
      clinicId: clinicId ?? null,
      visitType: clinicId ? null : "FIRST",
      plan: "plan" in input ? input.plan : "Blue Horizon",
    },
  });
  return tx.account.create({
    data: {
      userId: user.id,
      username: input.username,
      email: input.email,
      passwordHash,
    },
  });
}
export async function registerPatient(raw: unknown) {
  const input = patientRegistration.parse(raw),
    hash = await hashPassword(input.password);
  await locked((tx) => createAccount(tx, input, hash));
  return { message: "Patient account created. Log in to continue." };
}
export async function login(raw: unknown) {
  const input = loginSchema.parse(raw);
  const result = await locked(async (tx) => {
    const now = await executionTime(tx),
      bucket = tokenHash(input.username);
    let throttle = await tx.loginThrottle.findUnique({ where: { bucket } });
    if (throttle && +now - +throttle.windowStart >= 15 * 60000) {
      await tx.loginThrottle.delete({ where: { bucket } });
      throttle = null;
    }
    if (throttle && throttle.attempts >= 5)
      return {
        error: "Too many login attempts. Try again after 15 minutes.",
        status: 429,
      };
    const account = await tx.account.findUnique({
      where: { username: input.username },
      include: { user: true, membership: true },
    });
    const valid = account
      ? await verifyPassword(input.password, account.passwordHash)
      : (await hashPassword(input.password), false);
    if (
      !account ||
      !valid ||
      account.status !== "ACTIVE" ||
      account.user.role !== input.entrance
    ) {
      await tx.loginThrottle.upsert({
        where: { bucket },
        create: { bucket, attempts: 1, windowStart: now },
        update: { attempts: { increment: 1 } },
      });
      return { error: "Invalid credentials or login entrance.", status: 401 };
    }
    if (
      account.user.role === "STAFF" &&
      (account.membership?.status !== "ACTIVE" ||
        account.membership.clinicId !== account.user.clinicId)
    )
      return {
        error: "Clinic access is pending approval or revoked.",
        status: 403,
      };
    await tx.loginThrottle.deleteMany({ where: { bucket } });
    const token = `a_${randomBytes(32).toString("hex")}`;
    await tx.accountSession.create({
      data: {
        accountId: account.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(+now + 86400000),
      },
    });
    return { token, role: account.user.role };
  });
  if ("error" in result) throw new DomainError(result.error!, result.status);
  return result;
}
async function administrator(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  await ensureStaffAccess(tx, user);
  const account = await tx.account.findUnique({
    where: { userId },
    include: { membership: true },
  });
  if (
    account?.membership?.role !== "ADMIN" ||
    account.membership.status !== "ACTIVE"
  )
    throw new DomainError("Clinic administrator access required.", 403);
  return { user, account, membership: account.membership };
}
export async function inviteStaff(userId: string, raw: unknown) {
  const input = z.object({ email }).strict().parse(raw);
  return locked(async (tx) => {
    const admin = await administrator(tx, userId),
      now = await executionTime(tx);
    if (
      await tx.staffInvitation.findFirst({
        where: {
          clinicId: admin.membership.clinicId,
          email: input.email,
          status: "PENDING",
          expiresAt: { gt: now },
        },
      })
    )
      throw new DomainError("An invitation is already pending for this email.");
    const token = randomBytes(32).toString("hex");
    const invitation = await tx.staffInvitation.create({
      data: {
        clinicId: admin.membership.clinicId,
        email: input.email,
        tokenHash: tokenHash(token),
        invitedById: userId,
        expiresAt: new Date(+now + 7 * 86400000),
      },
    });
    await tx.audit.create({
      data: {
        clinicId: admin.membership.clinicId,
        actor: admin.user.name,
        action: "Created mock staff invitation",
      },
    });
    return {
      message: "Mock invitation created. No email was sent.",
      invitationToken: token,
      expiresAt: invitation.expiresAt,
    };
  });
}
export async function redeemInvitation(raw: unknown) {
  const input = staffRegistration.parse(raw),
    hash = await hashPassword(input.password);
  return locked(async (tx) => {
    const now = await executionTime(tx),
      invitation = await tx.staffInvitation.findUnique({
        where: { tokenHash: tokenHash(input.invitationToken) },
      });
    if (
      invitation?.status === "USED" &&
      invitation.email === input.email &&
      invitation.usedById
    ) {
      const existing = await tx.account.findUnique({
        where: { id: invitation.usedById },
      });
      if (
        existing?.username === input.username &&
        (await verifyPassword(input.password, existing.passwordHash))
      )
        return {
          message:
            "Staff account already created. Log in after administrator approval.",
        };
    }
    if (
      !invitation ||
      invitation.email !== input.email ||
      invitation.status !== "PENDING" ||
      invitation.expiresAt <= now
    )
      throw new DomainError(
        "Invitation is invalid, expired or already used.",
        403,
      );
    const existing = await tx.account.findFirst({
      where: { OR: [{ username: input.username }, { email: input.email }] },
      include: { membership: true, user: true },
    });
    let account;
    if (existing) {
      if (
        existing.username !== input.username ||
        existing.email !== input.email ||
        existing.status !== "ACTIVE" ||
        existing.user.role !== "STAFF" ||
        existing.membership?.role !== "STAFF" ||
        existing.membership.status !== "REVOKED" ||
        existing.membership.clinicId !== invitation.clinicId ||
        !(await verifyPassword(input.password, existing.passwordHash))
      )
        throw new DomainError(
          "This existing account cannot use this staff invitation.",
          403,
        );
      // Re-enroll a revoked staff identity with fresh institution authorization;
      // preserve its user/history and never revive its old revoked sessions.
      account = existing;
      await tx.clinicMembership.update({
        where: { id: existing.membership.id },
        data: {
          status: "PENDING",
          canAuthorMedicalTags: false,
          verifiedAt: null,
          verifiedById: null,
        },
      });
    } else {
      account = await createAccount(tx, input, hash, invitation.clinicId);
      await tx.clinicMembership.create({
        data: {
          accountId: account.id,
          clinicId: invitation.clinicId,
          role: "STAFF",
          status: "PENDING",
        },
      });
    }
    await tx.staffInvitation.update({
      where: { id: invitation.id },
      data: { status: "USED", usedById: account.id },
    });
    return {
      message:
        "Staff account created. Clinic administrator approval is required before login. Verification is simulated.",
    };
  });
}
export async function manageAccess(userId: string, raw: unknown) {
  const input = z
    .discriminatedUnion("type", [
      z.object({
        type: z.literal("clinicalPermission"),
        membershipId: z.string(),
        enabled: z.boolean(),
        expectedEnabled: z.boolean(),
        reason: z.string().trim().min(3).max(500),
      }),
      z.object({ type: z.literal("approve"), membershipId: z.string() }),
      z.object({ type: z.literal("revoke"), membershipId: z.string() }),
      z.object({
        type: z.literal("revokeInvitation"),
        invitationId: z.string(),
      }),
    ])
    .parse(raw);
  return locked(async (tx) => {
    const admin = await administrator(tx, userId),
      now = await executionTime(tx);
    if (input.type === "revokeInvitation") {
      const invitation = await tx.staffInvitation.findFirst({
        where: { id: input.invitationId, clinicId: admin.membership.clinicId },
      });
      if (!invitation) throw new DomainError("Invitation not found.", 404);
      if (invitation.status === "USED")
        throw new DomainError(
          "Invitation already used. Revoke the staff membership instead.",
        );
      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { status: "REVOKED" },
      });
    } else {
      const member = await tx.clinicMembership.findFirst({
        where: { id: input.membershipId, clinicId: admin.membership.clinicId },
      });
      if (!member) throw new DomainError("Membership not found.", 404);
      if (input.type === "clinicalPermission") {
        if (member.status !== "ACTIVE")
          throw new DomainError("Active membership required.", 403);
        if (member.canAuthorMedicalTags !== input.expectedEnabled)
          throw new DomainError("Permission changed; refresh and retry.");
        await tx.clinicMembership.update({
          where: { id: member.id },
          data: { canAuthorMedicalTags: input.enabled },
        });
        await tx.audit.create({
          data: {
            clinicId: member.clinicId,
            actor: userId,
            action: `Clinical permission ${input.enabled ? "granted" : "revoked"} for ${member.id}: ${input.reason}`,
          },
        });
        return {
          message:
            "Clinical permission saved. Credential verification remains simulated.",
        };
      }
      if (input.type === "approve" && member.status === "REVOKED")
        throw new DomainError(
          "Revoked access needs a new authorized enrollment.",
        );
      if (
        input.type === "revoke" &&
        member.role === "ADMIN" &&
        member.status === "ACTIVE" &&
        (await tx.clinicMembership.count({
          where: { clinicId: member.clinicId, role: "ADMIN", status: "ACTIVE" },
        })) <= 1
      )
        throw new DomainError(
          "Cannot revoke the last active clinic administrator.",
        );
      const status = input.type === "approve" ? "ACTIVE" : "REVOKED";
      if (member.status === status)
        return { message: "Access decision already saved." };
      await tx.clinicMembership.update({
        where: { id: member.id },
        data: {
          status,
          ...(status === "REVOKED" ? { canAuthorMedicalTags: false } : {}),
          verifiedById: userId,
          verifiedAt: now,
        },
      });
      if (status === "REVOKED")
        await tx.accountSession.updateMany({
          where: { accountId: member.accountId, revokedAt: null },
          data: { revokedAt: now },
        });
    }
    await tx.audit.create({
      data: {
        clinicId: admin.membership.clinicId,
        actor: admin.user.name,
        action: `Mock staff access: ${input.type}`,
      },
    });
    return { message: "Clinic access decision saved." };
  });
}
export async function accessDashboard(userId: string) {
  return locked(async (tx) => {
    const admin = await administrator(tx, userId);
    const members = await tx.clinicMembership.findMany({
      where: { clinicId: admin.membership.clinicId },
      select: {
        id: true,
        role: true,
        status: true,
        verificationMode: true,
        canAuthorMedicalTags: true,
        account: {
          select: {
            username: true,
            email: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const invitations = await tx.staffInvitation.findMany({
      where: { clinicId: admin.membership.clinicId },
      select: { id: true, email: true, status: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
    return { members, invitations };
  });
}
// Trusted CLI / isolated fixtures only; deliberately no HTTP bootstrap endpoint.
export async function provisionMockAdministrator(raw: unknown) {
  if (process.env.DEMO_MODE !== "true")
    throw new DomainError(
      "Mock administrator provisioning requires DEMO_MODE.",
      403,
    );
  const input = z
      .object({ ...credentials, clinicId: z.string() })
      .strict()
      .parse(raw),
    hash = await hashPassword(input.password);
  return locked(async (tx) => {
    if (!(await tx.clinic.findUnique({ where: { id: input.clinicId } })))
      throw new DomainError("Unknown synthetic clinic.");
    if (
      await tx.clinicMembership.count({
        where: { clinicId: input.clinicId, role: "ADMIN", status: "ACTIVE" },
      })
    )
      throw new DomainError(
        "This clinic already has an administrator; use authorized administration.",
      );
    const account = await createAccount(
      tx,
      { ...input, invitationToken: "bootstrap-only" },
      hash,
      input.clinicId,
    );
    await tx.clinicMembership.create({
      data: {
        accountId: account.id,
        clinicId: input.clinicId,
        role: "ADMIN",
        status: "ACTIVE",
        verifiedById: account.userId,
        verifiedAt: await executionTime(tx),
      },
    });
    await tx.audit.create({
      data: {
        clinicId: input.clinicId,
        actor: input.name,
        action: "Explicit mock administrator bootstrap",
      },
    });
    return {
      message:
        "Mock administrator provisioned without changing clinic scheduling data.",
    };
  });
}
