import { beforeEach, afterAll, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { db } from "../../src/server/db";
import { locked, getState } from "../../src/server/services/scheduling";
import { seedData } from "../../prisma/seed-data";
import {
  exportMockAdministratorPlan,
  provisionMockAdministrator,
  inviteStaff,
  redeemInvitation,
  staffRegistration,
  login,
  manageAccess,
} from "../../src/server/auth/accounts";
import { invitationPlan } from "../../src/server/auth/provisioning-plan";
import { tokenHash } from "../../src/server/auth/passwords";
const password = "IsolatedSyntheticPassword!123";
const fixture = () => ({
  clinicId: "cedar",
  username: "demo.cedar.admin",
  name: "Synthetic administrator",
  email: "admin@cedar.example.test",
  password,
});
beforeEach(async () => {
  await locked((tx) => seedData(tx));
});
afterAll(async () => {
  await db.$disconnect();
});
async function provision() {
  await provisionMockAdministrator(fixture());
  return (
    await db.account.findUniqueOrThrow({
      where: { username: fixture().username },
    })
  ).userId;
}
async function activate(
  actor: string,
  email = "john.baker@cedar.example.test",
  token = randomBytes(32).toString("hex"),
) {
  const statements = invitationPlan({ clinicId: "cedar", email, token }, actor);
  await locked(async (tx) => {
    for (const s of statements.slice(0, -1)) await tx.$executeRawUnsafe(s);
  });
  return token;
}
it("accepts all eight fictional invitation-sheet emails without storing any sheet tokens in fixtures", () => {
  for (const email of [
    "john.baker@cedar.example.test",
    "nina.park@cedar.example.test",
    "kevin.liu@harbor.example.test",
    "emily.chen@harbor.example.test",
    "sarah.kim@willow.example.test",
    "marcus.reed@willow.example.test",
    "olivia.wang@summit.example.test",
    "daniel.moore@summit.example.test",
  ]) {
    expect(staffRegistration.shape.email.safeParse(email).success).toBe(true);
  }
});
it("exports the same safe bootstrap plan, refuses a second administrator and grants no clinical authorship", async () => {
  const plan = await exportMockAdministratorPlan(fixture());
  expect(JSON.stringify(plan)).not.toContain(password);
  await locked(async (tx) => {
    for (const s of plan.statements) await tx.$executeRawUnsafe(s);
  });
  const account = await db.account.findUniqueOrThrow({
    where: { username: fixture().username },
    include: { membership: true },
  });
  expect(account.membership).toMatchObject({
    role: "ADMIN",
    status: "ACTIVE",
    canAuthorMedicalTags: false,
  });
  await expect(
    provisionMockAdministrator({
      ...fixture(),
      username: "another.admin",
      email: "other@cedar.example.test",
    }),
  ).rejects.toThrow(/already has/);
});
it("provisions hash-only seven-day invitations idempotently without resetting used, revoked or expired rows", async () => {
  const actor = await provision();
  const token = await activate(actor);
  const first = await db.staffInvitation.findUniqueOrThrow({
    where: { tokenHash: tokenHash(token) },
  });
  expect(first).toMatchObject({
    clinicId: "cedar",
    email: "john.baker@cedar.example.test",
    invitedById: actor,
    status: "PENDING",
  });
  expect(+first.expiresAt - +first.createdAt).toBeGreaterThanOrEqual(
    7 * 86400000 - 1000,
  );
  expect(JSON.stringify(first)).not.toContain(token);
  await activate(actor, first.email, token);
  expect(await db.staffInvitation.count()).toBe(1);
  expect(
    (await db.staffInvitation.findUniqueOrThrow({ where: { id: first.id } }))
      .expiresAt,
  ).toEqual(first.expiresAt);
  for (const status of ["REVOKED", "USED"]) {
    await db.staffInvitation.update({
      where: { id: first.id },
      data: { status },
    });
    await activate(actor, first.email, token);
    expect(
      (await db.staffInvitation.findUniqueOrThrow({ where: { id: first.id } }))
        .status,
    ).toBe(status);
  }
  await db.staffInvitation.update({
    where: { id: first.id },
    data: { status: "PENDING", expiresAt: new Date(0) },
  });
  await activate(actor, first.email, token);
  expect(
    (await db.staffInvitation.findUniqueOrThrow({ where: { id: first.id } }))
      .expiresAt,
  ).toEqual(new Date(0));
});
it("requires same-clinic active administration and refuses token/email identity conflicts", async () => {
  const actor = await provision();
  await expect(activate("staff-cedar")).rejects.toThrow(/administrator/);
  const token = await activate(actor);
  await expect(
    activate(actor, "different@cedar.example.test", token),
  ).rejects.toThrow(/identity conflict/);
  await expect(
    locked(async (tx) => {
      for (const s of invitationPlan(
        {
          clinicId: "harbor",
          email: "harbor@example.test",
          token: randomBytes(32).toString("hex"),
        },
        actor,
      ).slice(0, -1))
        await tx.$executeRawUnsafe(s);
    }),
  ).rejects.toThrow(/administrator/);
});
it("redeems once under concurrent registration, requires approval, preserves history and rejects duplicates clearly", async () => {
  const actor = await provision(),
    token = await activate(actor);
  const before = await db.booking.count();
  const input = {
    username: "john.baker",
    name: "Synthetic John",
    email: "john.baker@cedar.example.test",
    password,
    invitationToken: `  ${token}\n`,
  };
  const results = await Promise.allSettled([
    redeemInvitation(input),
    redeemInvitation({ ...input, username: "other.john" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const account = await db.account.findUniqueOrThrow({
    where: { email: input.email },
    include: { membership: true, user: true },
  });
  expect(account.membership).toMatchObject({
    status: "PENDING",
    role: "STAFF",
    canAuthorMedicalTags: false,
  });
  expect(
    await db.staffInvitation.findUniqueOrThrow({
      where: { tokenHash: tokenHash(token) },
    }),
  ).toMatchObject({ status: "USED", usedById: account.id });
  await expect(
    login({ username: account.username, password, entrance: "STAFF" }),
  ).rejects.toThrow(/pending/);
  await expect(getState(account.user)).rejects.toThrow(/pending/);
  await manageAccess(actor, {
    type: "approve",
    membershipId: account.membership!.id,
  });
  expect(
    (await login({ username: account.username, password, entrance: "STAFF" }))
      .role,
  ).toBe("STAFF");
  const state = await getState(account.user);
  expect(state.slots.every((s) => s.clinicId === "cedar")).toBe(true);
  const fresh = await activate(actor, "another@cedar.example.test");
  await expect(
    redeemInvitation({
      ...input,
      email: "another@cedar.example.test",
      username: account.username,
      invitationToken: fresh,
    }),
  ).rejects.toThrow(/Username or email is unavailable/);
  await manageAccess(actor, {
    type: "revoke",
    membershipId: account.membership!.id,
  });
  await expect(getState(account.user)).rejects.toThrow(/revoked/);
  expect(await db.booking.count()).toBe(before);
});

it("rejects invalid, mismatched, expired, revoked and used tokens without creating accounts", async () => {
  const actor = await provision(),
    token = await activate(actor);
  const input = {
    username: "invited.staff",
    name: "Synthetic staff",
    email: "john.baker@cedar.example.test",
    password,
    invitationToken: token,
  };
  await expect(
    redeemInvitation({
      ...input,
      invitationToken: randomBytes(32).toString("hex"),
    }),
  ).rejects.toThrow(/invalid/);
  await expect(
    redeemInvitation({ ...input, email: "wrong@example.test" }),
  ).rejects.toThrow(/invalid/);
  const where = { tokenHash: tokenHash(token) };
  await db.staffInvitation.update({ where, data: { expiresAt: new Date(0) } });
  await expect(redeemInvitation(input)).rejects.toThrow(/expired/);
  for (const status of ["REVOKED", "USED"]) {
    await db.staffInvitation.update({
      where,
      data: { status, expiresAt: new Date(Date.now() + 86400000) },
    });
    await expect(redeemInvitation(input)).rejects.toThrow(/already used/);
  }
  expect(await db.account.count({ where: { email: input.email } })).toBe(0);
});
it("returns a clear duplicate-email error while leaving the fresh invitation and account unchanged", async () => {
  const actor = await provision(),
    token = await activate(actor);
  const input = {
    username: "first.staff",
    name: "Synthetic staff",
    email: "john.baker@cedar.example.test",
    password,
    invitationToken: token,
  };
  await redeemInvitation(input);
  const next = await inviteStaff(actor, { email: input.email });
  await expect(
    redeemInvitation({
      ...input,
      username: "second.staff",
      invitationToken: next.invitationToken,
    }),
  ).rejects.toThrow(/Username or email is unavailable/);
  expect(await db.account.count({ where: { email: input.email } })).toBe(1);
  expect(
    (
      await db.staffInvitation.findUniqueOrThrow({
        where: { tokenHash: tokenHash(next.invitationToken) },
      })
    ).status,
  ).toBe("PENDING");
});
