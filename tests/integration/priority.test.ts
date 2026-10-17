import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { db } from "../../src/server/db";
import { seedData } from "../../prisma/seed-data";
import {
  getState,
  locked,
  performAction,
  restartDemo,
} from "../../src/server/services/scheduling";
import { registerPersona } from "../../src/server/services/registration";
import { INTAKE_REQUIRED } from "../../src/lib/config";
const now = new Date();
const intake = {
  type: "intake",
  symptoms: [
    { area: "chest", pain: 7, duration: "week", worsening: true },
    { area: "injury", pain: 2, duration: "day", worsening: false },
  ],
  warningSigns: [],
};
let newPatient = "";
beforeEach(async () => {
  await locked((tx) => seedData(tx, now));
  // Seeded patients are follow-ups; first visits come from registration.
  newPatient = await registerPersona(
    { kind: "patient", name: "Morgan Test", plan: "Blue Horizon" },
    now,
  );
});
afterAll(async () => {
  await db.$disconnect();
});
const user = (id: string) => db.user.findUniqueOrThrow({ where: { id } });

describe("priority scoring", () => {
  it.skipIf(!INTAKE_REQUIRED)(
    "blocks a first-visit patient until the questionnaire is complete",
    async () => {
      await expect(
        performAction(newPatient, { type: "book", slotId: "slot-0" }),
      ).rejects.toThrow(/intake questionnaire/);
      await performAction(newPatient, intake);
      await performAction(newPatient, { type: "book", slotId: "slot-0" });
      expect(
        await db.booking.count({
          where: { patientId: newPatient, slotId: "slot-0" },
        }),
      ).toBe(1);
    },
  );

  it.runIf(!INTAKE_REQUIRED)(
    "lets first-visit patients book while the questionnaire is switched off",
    async () => {
      await performAction(newPatient, { type: "book", slotId: "slot-0" });
      expect(await db.booking.count({ where: { patientId: newPatient } })).toBe(
        1,
      );
    },
  );

  it("stores server-computed tags once and ignores repeat submissions", async () => {
    await performAction(newPatient, intake);
    await performAction(newPatient, {
      ...intake,
      symptoms: [{ area: "back", pain: 0, duration: "day", worsening: false }],
    });
    const tags = await db.symptomTag.findMany({
      where: { patientId: newPatient },
      orderBy: { score: "desc" },
    });
    expect(tags.map((t) => [t.label, t.score, t.source])).toEqual([
      ["Chest pain", 7, "QUESTIONNAIRE"],
      ["Wound or injury", 1, "QUESTIONNAIRE"],
    ]);
    const state = await getState(await user(newPatient));
    expect(state.user?.intakeCompleted).toBe(true);
  });

  it("does not ask the seeded follow-up patients for a questionnaire", async () => {
    for (const id of ["avery", "patient-1"])
      await expect(performAction(id, intake)).rejects.toThrow(/first-visit/);
    await performAction("avery", { type: "book", slotId: "slot-0" });
  });

  it("lets staff edit only their own clinic's tags on their returning patients", async () => {
    await performAction("staff-cedar", {
      type: "setTag",
      patientId: "patient-1",
      label: "Headache",
      score: 4,
    });
    const cedarTags = await db.symptomTag.findMany({
      where: { patientId: "patient-1", clinicId: "cedar" },
    });
    expect(cedarTags.map((t) => t.label).sort()).toEqual([
      "Chest pain",
      "Foot abrasion",
      "Headache",
    ]);
    const chest = cedarTags.find((t) => t.label === "Chest pain")!;
    await performAction("staff-cedar", {
      type: "setTag",
      patientId: "patient-1",
      tagId: chest.id,
      label: "Chest pain",
      score: 9,
    });
    expect(
      (await db.symptomTag.findUniqueOrThrow({ where: { id: chest.id } }))
        .score,
    ).toBe(9);
    // Harbor cannot change Cedar's tag; a new patient is not a returning one.
    await expect(
      performAction("staff-harbor", { type: "deleteTag", tagId: chest.id }),
    ).rejects.toThrow(/your clinic/);
    await expect(
      performAction("staff-cedar", {
        type: "setTag",
        patientId: newPatient,
        label: "Rash",
        score: 3,
      }),
    ).rejects.toThrow(/returning patient/);
    await expect(
      performAction("staff-cedar", {
        type: "setTag",
        patientId: "patient-1",
        label: "chest PAIN",
        score: 2,
      }),
    ).rejects.toThrow(/already has a tag/);
    await expect(
      performAction("patient-1", {
        type: "setTag",
        patientId: "patient-1",
        label: "Rash",
        score: 3,
      }),
    ).rejects.toThrow(/clinic permissions/);
  });

  it("shows tags beside waitlist candidates without changing FIFO order", async () => {
    await performAction(newPatient, intake);
    await performAction(newPatient, {
      type: "waitlist",
      service: "Dermatology",
      plan: "Blue Horizon",
      city: "",
      clinicIds: [],
      maxPrice: 20000,
      earliest: now.toISOString(),
      latest: new Date(+now + 35 * 86400000).toISOString(),
      startHour: 0,
      endHour: 24,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    await performAction("staff-cedar", {
      type: "cancel",
      bookingId: "cedar-cancellation",
    });
    const state = await getState(await user("staff-cedar"));
    const candidates = state.candidates.filter((c) => c.slotId === "earlier");
    // Order stays by waitlist join time, whatever the severity scores are.
    const joined = candidates.map((c) => new Date(c.createdAt).getTime());
    expect(joined).toEqual([...joined].sort((a, b) => a - b));
    const morgan = candidates.find((c) => c.name === "Morgan Test")!;
    expect(morgan.visitType).toBe("FIRST");
    expect(morgan.tags.map((t) => [t.label, t.score])).toEqual([
      ["Chest pain", 7],
      ["Wound or injury", 1],
    ]);
    const sam = candidates.find((c) => c.name === "Sam Rivera");
    expect(sam?.tags.map((t) => t.label)).toEqual(["Eczema flare"]);
  });

  it("lists the four demo personas plus registered ones", async () => {
    const state = await getState(await user("staff-cedar"));
    expect(state.personas.map((p) => p.id)).toEqual([
      "avery",
      "patient-1",
      "staff-cedar",
      "staff-harbor",
      newPatient,
    ]);
    const names = state.priorityPatients.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Jordan Lee", "Sam Rivera"]));
    // Avery is Harbor's patient, not Cedar's.
    expect(names).not.toContain("Avery Morgan");
  });

  it("registers a clinic with its own staff, plans and openings", async () => {
    const staffId = await registerPersona(
      {
        kind: "clinic",
        name: "Bayview Clinic",
        plans: ["Aster Health", "Self-pay"],
        specialty: "Cardiology",
        city: "Oakland",
      },
      now,
    );
    const staff = await user(staffId);
    const clinic = await db.clinic.findUniqueOrThrow({
      where: { id: staff.clinicId! },
      include: { slots: true },
    });
    expect([staff.role, clinic.city, clinic.specialty]).toEqual([
      "STAFF",
      "Oakland",
      "Cardiology",
    ]);
    expect(clinic.slots.length).toBeGreaterThan(0);
    for (const s of clinic.slots) {
      expect(s.service).toBe("Cardiology");
      expect(s.plans).toEqual(["Aster Health", "Self-pay"]);
    }
    await expect(
      registerPersona(
        {
          kind: "clinic",
          name: "Nowhere Clinic",
          plans: ["Self-pay"],
          specialty: "Cardiology",
          city: "Atlantis",
        },
        now,
      ),
    ).rejects.toThrow(/existing location/);
  });

  it("restarting the demo clears registrations, questionnaires and edits", async () => {
    await performAction(newPatient, intake);
    await performAction("staff-cedar", {
      type: "setTag",
      patientId: "patient-1",
      label: "Headache",
      score: 4,
    });
    await restartDemo(now);
    expect(await db.user.count({ where: { registered: true } })).toBe(0);
    expect(await db.intake.count()).toBe(0);
    expect(await db.symptomTag.count({ where: { label: "Headache" } })).toBe(0);
  });
  it("notifies the clinic of direct bookings and declined invitations", async () => {
    await performAction("avery", { type: "book", slotId: "slot-3" });
    const slot = await db.slot.findUniqueOrThrow({ where: { id: "slot-3" } });
    const booked = await db.clinicNotification.findMany({
      where: { clinicId: slot.clinicId },
    });
    expect(booked.map((n) => n.title)).toEqual(["New appointment booked"]);
    expect(booked[0].body).toContain("Avery Morgan");

    // Willow's seeded pending invitation is declined by its patient.
    await performAction("patient-11", {
      type: "respond",
      offerId: "seed-pending-offer",
      accept: false,
    });
    const willow = await getState(await user("staff-willow"));
    expect(willow.clinicNotifications.map((n) => n.title)).toContain(
      "Waitlist invitation declined",
    );
    const n = willow.clinicNotifications[0];
    // Another clinic cannot mark it read; the owning clinic can.
    await expect(
      performAction("staff-cedar", {
        type: "readClinic",
        notificationId: n.id,
      }),
    ).rejects.toThrow(/not found/);
    await performAction("staff-willow", {
      type: "readClinic",
      notificationId: n.id,
    });
    expect(
      (await db.clinicNotification.findUniqueOrThrow({ where: { id: n.id } }))
        .read,
    ).toBe(true);
  });
});
