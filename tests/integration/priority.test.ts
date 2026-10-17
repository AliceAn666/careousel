import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { db } from "../../src/server/db";
import { seedData } from "../../prisma/seed-data";
import {
  getState,
  locked,
  performAction,
  restartDemo,
} from "../../src/server/services/scheduling";
const now = new Date();
const intake = {
  type: "intake",
  symptoms: [
    { area: "chest", pain: 7, duration: "week", worsening: true },
    { area: "injury", pain: 2, duration: "day", worsening: false },
  ],
  warningSigns: [],
};
beforeEach(async () => {
  await locked((tx) => seedData(tx, now));
});
afterAll(async () => {
  await db.$disconnect();
});
const user = (id: string) => db.user.findUniqueOrThrow({ where: { id } });

describe("priority scoring", () => {
  it("blocks a first-visit patient until the questionnaire is complete", async () => {
    await expect(
      performAction("avery", { type: "book", slotId: "slot-0" }),
    ).rejects.toThrow(/intake questionnaire/);
    await performAction("avery", intake);
    await performAction("avery", { type: "book", slotId: "slot-0" });
    expect(
      await db.booking.count({
        where: { patientId: "avery", slotId: "slot-0" },
      }),
    ).toBe(1);
  });

  it("stores server-computed tags once and ignores repeat submissions", async () => {
    await performAction("avery", intake);
    await performAction("avery", {
      ...intake,
      symptoms: [{ area: "back", pain: 0, duration: "day", worsening: false }],
    });
    const tags = await db.symptomTag.findMany({
      where: { patientId: "avery" },
      orderBy: { score: "desc" },
    });
    expect(tags.map((t) => [t.label, t.score, t.source])).toEqual([
      ["Chest pain", 7, "QUESTIONNAIRE"],
      ["Wound or injury", 1, "QUESTIONNAIRE"],
    ]);
    const state = await getState(await user("avery"));
    expect(state.user?.intakeCompleted).toBe(true);
  });

  it("does not ask follow-up patients for a questionnaire", async () => {
    await expect(performAction("patient-1", intake)).rejects.toThrow(
      /first-visit/,
    );
    await performAction("patient-1", { type: "book", slotId: "slot-0" });
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
    // Harbor cannot change Cedar's tag, and Avery is not a returning patient.
    await expect(
      performAction("staff-harbor", { type: "deleteTag", tagId: chest.id }),
    ).rejects.toThrow(/your clinic/);
    await expect(
      performAction("staff-cedar", {
        type: "setTag",
        patientId: "avery",
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
    await performAction("avery", intake);
    await performAction("avery", {
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
      bookingId: "avery-original",
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
    const avery = candidates.find((c) => c.name === "Avery Morgan")!;
    expect(avery.visitType).toBe("FIRST");
    expect(avery.tags.map((t) => [t.label, t.score])).toEqual([
      ["Chest pain", 7],
      ["Wound or injury", 1],
    ]);
    const sam = candidates.find((c) => c.name === "Sam Rivera");
    expect(sam?.tags.map((t) => t.label)).toEqual(["Eczema flare"]);
  });

  it("lists only the four demo personas and each clinic's returning patients", async () => {
    const state = await getState(await user("staff-cedar"));
    expect(state.personas.map((p) => p.id)).toEqual([
      "avery",
      "patient-1",
      "staff-cedar",
      "staff-harbor",
    ]);
    expect(state.priorityPatients.map((p) => p.name)).toEqual([
      "Jordan Lee",
      "Sam Rivera",
    ]);
  });
  it("restarting the demo clears questionnaires and clinic edits", async () => {
    await performAction("avery", intake);
    await performAction("staff-cedar", {
      type: "setTag",
      patientId: "patient-1",
      label: "Headache",
      score: 4,
    });
    await restartDemo("staff-cedar", { confirmation: "RESET" }, { now });
    expect(await db.intake.count()).toBe(0);
    expect(await db.symptomTag.count({ where: { patientId: "avery" } })).toBe(
      0,
    );
    expect(await db.symptomTag.count({ where: { label: "Headache" } })).toBe(0);
    expect((await getState(await user("avery"))).user?.intakeCompleted).toBe(
      false,
    );
  });
});
