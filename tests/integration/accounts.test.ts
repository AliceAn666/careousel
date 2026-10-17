import { beforeEach, afterAll, expect, it } from "vitest";
import { db } from "../../src/server/db";
import { seedData } from "../../prisma/seed-data";
import {
  locked,
  performAction,
  getState,
} from "../../src/server/services/scheduling";
import {
  registerPatient,
  login,
  provisionMockAdministrator,
  inviteStaff,
  redeemInvitation,
  manageAccess,
  accessDashboard,
} from "../../src/server/auth/accounts";
import { tokenHash } from "../../src/server/auth/passwords";
const password = "SyntheticPassword!123";
const patient = {
  username: "patient.one",
  name: "Synthetic Patient",
  email: "patient@example.test",
  password,
  plan: "Blue Horizon",
};
const adminInput = {
  username: "cedar.admin",
  name: "Synthetic Cedar Admin",
  email: "admin@cedar.example.test",
  password,
  clinicId: "cedar",
};
async function admin() {
  await provisionMockAdministrator(adminInput);
  return (
    await db.account.findUniqueOrThrow({
      where: { username: adminInput.username },
    })
  ).userId;
}
const invited = {
  username: "cedar.staff",
  name: "Synthetic Staff",
  email: "staff@cedar.example.test",
  password,
};
beforeEach(async () => {
  await locked((tx) => seedData(tx));
});
afterAll(async () => {
  await db.$disconnect();
});
it("creates a real patient account, hashes credentials, normalizes username and issues distinct opaque persisted sessions", async () => {
  const before = await db.booking.count();
  await registerPatient({ ...patient, username: "Patient.One" });
  const account = await db.account.findUniqueOrThrow({
    where: { username: patient.username },
    include: { user: true },
  });
  expect(account.user.role).toBe("PATIENT");
  expect(account.user.clinicId).toBeNull();
  expect(account.passwordHash).not.toContain(password);
  const a = await login({
      username: patient.username,
      password,
      entrance: "PATIENT",
    }),
    b = await login({
      username: patient.username,
      password,
      entrance: "PATIENT",
    });
  expect(a.token).not.toBe(b.token);
  expect(
    await db.accountSession.count({ where: { accountId: account.id } }),
  ).toBe(2);
  expect(
    (
      await db.accountSession.findUniqueOrThrow({
        where: { tokenHash: tokenHash(a.token!) },
      })
    ).expiresAt.getTime(),
  ).toBeGreaterThan(Date.now());
  expect(await db.booking.count()).toBe(before);
  await expect(
    registerPatient({ ...patient, role: "STAFF" }),
  ).rejects.toThrow();
  await expect(
    login({ username: patient.username, password, entrance: "STAFF" }),
  ).rejects.toThrow(/Invalid/);
});
it("persists failed-attempt throttling instead of rolling it back with authentication errors", async () => {
  await registerPatient(patient);
  for (let i = 0; i < 5; i++)
    await expect(
      login({
        username: patient.username,
        password: "IncorrectPassword!123",
        entrance: "PATIENT",
      }),
    ).rejects.toThrow(/Invalid/);
  await expect(
    login({ username: patient.username, password, entrance: "PATIENT" }),
  ).rejects.toThrow(/Too many/);
  await db.loginThrottle.updateMany({
    data: { windowStart: new Date(Date.now() - 16 * 60000) },
  });
  expect(
    (await login({ username: patient.username, password, entrance: "PATIENT" }))
      .token,
  ).toMatch(/^a_/);
  expect(await db.loginThrottle.count()).toBe(0);
});
it("requires exact invitation email and administrator approval; replay is idempotent only with the same account credentials", async () => {
  const actor = await admin(),
    invitation = await inviteStaff(actor, { email: invited.email });
  await expect(
    redeemInvitation({
      ...invited,
      email: "other@cedar.example.test",
      invitationToken: invitation.invitationToken,
    }),
  ).rejects.toThrow(/invalid/);
  await redeemInvitation({
    ...invited,
    invitationToken: invitation.invitationToken,
  });
  await redeemInvitation({
    ...invited,
    invitationToken: invitation.invitationToken,
  });
  expect(
    await db.account.count({ where: { username: invited.username } }),
  ).toBe(1);
  await expect(
    redeemInvitation({
      ...invited,
      username: "another.user",
      invitationToken: invitation.invitationToken,
    }),
  ).rejects.toThrow(/already used/);
  const account = await db.account.findUniqueOrThrow({
    where: { username: invited.username },
    include: { membership: true },
  });
  await expect(
    login({ username: invited.username, password, entrance: "STAFF" }),
  ).rejects.toThrow(/pending/);
  await expect(
    performAction(account.userId, {
      type: "createSlot",
      service: "Dermatology",
      price: 10000,
      start: new Date(Date.now() + 86400000),
    }),
  ).rejects.toThrow(/pending/);
  await manageAccess(actor, {
    type: "approve",
    membershipId: account.membership!.id,
  });
  await manageAccess(actor, {
    type: "approve",
    membershipId: account.membership!.id,
  });
  expect(
    (await login({ username: invited.username, password, entrance: "STAFF" }))
      .token,
  ).toMatch(/^a_/);
  const state = await getState(
    await db.user.findUniqueOrThrow({ where: { id: account.userId } }),
  );
  expect(state.slots.every((s) => s.clinicId === "cedar")).toBe(true);
  await expect(
    inviteStaff(account.userId, { email: "other@example.test" }),
  ).rejects.toThrow(/administrator/);
});
it("revokes active sessions and denies stale in-flight user snapshots inside scheduling reads and writes", async () => {
  const actor = await admin(),
    inv = await inviteStaff(actor, { email: invited.email });
  await redeemInvitation({ ...invited, invitationToken: inv.invitationToken });
  const account = await db.account.findUniqueOrThrow({
    where: { username: invited.username },
    include: { membership: true, user: true },
  });
  await manageAccess(actor, {
    type: "approve",
    membershipId: account.membership!.id,
  });
  const session = await login({
    username: invited.username,
    password,
    entrance: "STAFF",
  });
  await manageAccess(actor, {
    type: "revoke",
    membershipId: account.membership!.id,
  });
  expect(
    (
      await db.accountSession.findUniqueOrThrow({
        where: { tokenHash: tokenHash(session.token!) },
      })
    ).revokedAt,
  ).not.toBeNull();
  await expect(getState(account.user)).rejects.toThrow(/revoked/);
  await expect(
    performAction(account.userId, {
      type: "cancel",
      bookingId: "cedar-cancellation",
    }),
  ).rejects.toThrow(/revoked/);
  expect(
    (
      await db.booking.findUniqueOrThrow({
        where: { id: "cedar-cancellation" },
      })
    ).status,
  ).toBe("CONFIRMED");
});
it("re-enrolls revoked staff only with a fresh invitation, existing credentials and renewed approval", async () => {
  const actor = await admin(),
    first = await inviteStaff(actor, { email: invited.email });
  await redeemInvitation({
    ...invited,
    invitationToken: first.invitationToken,
  });
  const account = await db.account.findUniqueOrThrow({
    where: { username: invited.username },
    include: { membership: true },
  });
  await manageAccess(actor, {
    type: "approve",
    membershipId: account.membership!.id,
  });
  const prior = await login({
    username: invited.username,
    password,
    entrance: "STAFF",
  });
  await manageAccess(actor, {
    type: "revoke",
    membershipId: account.membership!.id,
  });
  const fresh = await inviteStaff(actor, { email: invited.email });
  await expect(
    redeemInvitation({
      ...invited,
      password: "DifferentPassword!123",
      invitationToken: fresh.invitationToken,
    }),
  ).rejects.toThrow(/cannot use/);
  await redeemInvitation({
    ...invited,
    invitationToken: fresh.invitationToken,
  });
  await expect(
    login({ username: invited.username, password, entrance: "STAFF" }),
  ).rejects.toThrow(/pending/);
  await manageAccess(actor, {
    type: "approve",
    membershipId: account.membership!.id,
  });
  expect(
    (
      await db.account.findUniqueOrThrow({
        where: { username: invited.username },
      })
    ).userId,
  ).toBe(account.userId);
  expect(
    (
      await db.accountSession.findUniqueOrThrow({
        where: { tokenHash: tokenHash(prior.token!) },
      })
    ).revokedAt,
  ).not.toBeNull();
  expect(
    (await login({ username: invited.username, password, entrance: "STAFF" }))
      .token,
  ).not.toBe(prior.token);
});

it("denies foreign-clinic administrators, patients, invalid/expired/revoked tokens and last-administrator removal", async () => {
  const actor = await admin();
  await provisionMockAdministrator({
    ...adminInput,
    username: "harbor.admin",
    email: "admin@harbor.example.test",
    clinicId: "harbor",
  });
  const foreign = await db.account.findUniqueOrThrow({
    where: { username: "harbor.admin" },
  });
  const invite = await inviteStaff(actor, { email: invited.email });
  const stored = await db.staffInvitation.findUniqueOrThrow({
    where: { tokenHash: tokenHash(invite.invitationToken) },
  });
  await expect(
    manageAccess(foreign.userId, {
      type: "revokeInvitation",
      invitationId: stored.id,
    }),
  ).rejects.toThrow(/not found/);
  await expect(accessDashboard("avery")).rejects.toThrow(/Staff/);
  await db.staffInvitation.update({
    where: { id: stored.id },
    data: { expiresAt: new Date(0) },
  });
  await expect(
    redeemInvitation({ ...invited, invitationToken: invite.invitationToken }),
  ).rejects.toThrow(/expired/);
  await manageAccess(actor, {
    type: "revokeInvitation",
    invitationId: stored.id,
  });
  await expect(
    redeemInvitation({ ...invited, invitationToken: invite.invitationToken }),
  ).rejects.toThrow(/invalid/);
  const membership = await db.clinicMembership.findFirstOrThrow({
    where: { account: { userId: actor } },
  });
  await expect(
    manageAccess(actor, { type: "revoke", membershipId: membership.id }),
  ).rejects.toThrow(/last active/);
  await expect(
    performAction(actor, { type: "reset", confirmation: "RESET" }),
  ).rejects.toThrow(/explicit synthetic/);
  expect(await db.booking.count()).toBeGreaterThan(0);
});

it("runs booking, earlier waitlist and atomic replacement for an individual account without touching Avery's appointment", async () => {
  await registerPatient(patient);
  const account = await db.account.findUniqueOrThrow({
    where: { username: patient.username },
  });
  await performAction(account.userId, {
    type: "intake",
    symptoms: [{ area: "skin", pain: 3, duration: "week", worsening: false }],
    warningSigns: [],
  });
  await performAction(account.userId, { type: "book", slotId: "slot-36" });
  const original = await db.booking.findFirstOrThrow({
      where: { patientId: account.userId, status: "CONFIRMED" },
    }),
    now = new Date();
  await performAction(account.userId, {
    type: "waitlist",
    service: "Dermatology",
    plan: "Blue Horizon",
    city: "",
    clinicIds: ["cedar"],
    maxPrice: 20000,
    earliest: now,
    latest: new Date(+now + 35 * 86400000),
    startHour: 0,
    endHour: 24,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    bookingId: original.id,
  });
  const request = await db.waitlist.findFirstOrThrow({
      where: { patientId: account.userId },
    }),
    actor = await admin();
  await performAction(actor, {
    type: "setWaitlistPriority",
    waitlistId: request.id,
    clinicId: "cedar",
    level: "P2",
    expectedVersion: 0,
    reason: "Synthetic professional information reviewed by clinic staff",
  });
  expect(
    (
      await db.waitlistPriority.findFirstOrThrow({
        where: { waitlistId: request.id, clinicId: "cedar" },
      })
    ).assignedById,
  ).toBe(actor);
  await performAction(actor, {
    type: "approve",
    slotId: "slot-9",
    waitlistId: request.id,
    reason: "Synthetic scheduling requirements reviewed",
  });
  expect(
    (await db.booking.findUniqueOrThrow({ where: { id: original.id } })).status,
  ).toBe("CONFIRMED");
  const offer = await db.offer.findFirstOrThrow({
    where: { patientId: account.userId, status: "PENDING" },
  });
  await performAction(account.userId, {
    type: "respond",
    offerId: offer.id,
    accept: true,
  });
  expect(
    (await db.booking.findUniqueOrThrow({ where: { id: original.id } })).status,
  ).toBe("RESCHEDULED");
  expect(
    (await db.booking.findUniqueOrThrow({ where: { id: "avery-original" } }))
      .status,
  ).toBe("CONFIRMED");
  expect(
    await db.booking.count({
      where: { patientId: account.userId, status: "CONFIRMED" },
    }),
  ).toBe(1);
});
