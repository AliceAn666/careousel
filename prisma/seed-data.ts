import { Prisma } from "@prisma/client";
import { OFFER_MINUTES, PLANS, SERVICES } from "../src/lib/config";
export async function seedData(tx: Prisma.TransactionClient, now = new Date()) {
  await tx.$executeRaw`SELECT set_config('careousel.synthetic_reset', 'on', true)`;
  await tx.medicalTagRevision.deleteMany();
  await tx.medicalTag.deleteMany();
  await tx.medicalNeed.deleteMany();
  await tx.accountSession.deleteMany();
  await tx.staffInvitation.deleteMany();
  await tx.clinicMembership.deleteMany();
  await tx.loginThrottle.deleteMany();
  await tx.account.deleteMany();
  await tx.priorityHistory.deleteMany();
  await tx.waitlistPriority.deleteMany();
  await tx.notification.deleteMany();
  await tx.offer.deleteMany();
  await tx.notificationGroup.deleteMany();
  await tx.notificationSequence.deleteMany();
  await tx.suggestion.deleteMany();
  await tx.waitlist.deleteMany();
  await tx.booking.updateMany({ data: { replacementId: null } });
  await tx.booking.deleteMany();
  await tx.audit.deleteMany();
  await tx.slot.deleteMany();
  await tx.symptomTag.deleteMany();
  await tx.intake.deleteMany();
  await tx.user.deleteMany();
  await tx.clinic.deleteMany();
  const clinics = [
    [
      "harbor",
      "Harbor Medical",
      "San Francisco",
      "120 Marina Boulevard",
      "Coordinated, compassionate care near the waterfront.",
    ],
    [
      "cedar",
      "Cedar Health",
      "San Francisco",
      "48 California Street",
      "A welcoming neighborhood clinic with earlier openings.",
    ],
    [
      "summit",
      "Summit Specialty",
      "Oakland",
      "310 Grand Avenue",
      "Specialist care with a personal approach.",
    ],
    [
      "willow",
      "Willow Care",
      "Berkeley",
      "62 University Avenue",
      "Accessible care, centered around your schedule.",
    ],
  ];
  for (const [id, name, city, address, description] of clinics)
    await tx.clinic.create({ data: { id, name, city, address, description } });
  const names = [
    "Avery Morgan",
    "Jordan Lee",
    "Sam Rivera",
    "Taylor Chen",
    "Casey Brooks",
    "Riley Patel",
    "Jamie Park",
    "Alex Reed",
    "Drew Ellis",
    "Quinn Davis",
    "Robin Blake",
    "Skyler Diaz",
  ];
  for (let i = 0; i < names.length; i++)
    await tx.user.create({
      data: {
        id: i === 0 ? "avery" : `patient-${i}`,
        name: names[i],
        role: "PATIENT",
        plan: PLANS[i % 4],
        // Avery is a new patient who must complete the intake questionnaire;
        // everyone else is a returning synthetic patient.
        visitType: i === 0 ? "FIRST" : "FOLLOW_UP",
      },
    });
  for (const [id, name] of clinics)
    await tx.user.create({
      data: {
        id: `staff-${id}`,
        name: `${name} staff`,
        role: "STAFF",
        clinicId: id,
      },
    });
  const date = (days: number, hour = 17) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };
  for (let i = 0; i < 48; i++) {
    const clinic = clinics[i % 4][0];
    const start = date(2 + Math.floor(i / 4), 17 + (i % 3));
    await tx.slot.create({
      data: {
        id: `slot-${i}`,
        clinicId: clinic,
        service: SERVICES[i % 3],
        provider: ["Dr. Maya Lin", "Dr. Noah Reed", "Dr. Elena Cruz"][i % 3],
        start,
        end: new Date(+start + 1800000),
        price: 9000 + (i % 4) * 2500,
        plans: i % 3 === 0 ? [...PLANS] : [PLANS[i % 4], "Self-pay"],
      },
    });
  }
  for (const [id, clinicId, days] of [
    ["later", "harbor", 28],
    ["earlier", "cedar", 7],
  ] as const) {
    const start = date(days, 20);
    await tx.slot.create({
      data: {
        id,
        clinicId,
        service: "Dermatology",
        provider: "Dr. Maya Lin",
        start,
        end: new Date(+start + 1800000),
        price: 12000,
        plans: [...PLANS],
        status: "BOOKED",
      },
    });
  }
  const overlapBookingStart = date(16, 17);
  const scenarioSlots = [
    {
      id: "seed-pending-slot",
      clinicId: "willow",
      service: "Dermatology",
      start: date(20, 17),
      status: "HELD",
    },
    {
      id: "seed-expired-slot",
      clinicId: "willow",
      service: "Dermatology",
      start: date(21, 17),
      status: "AVAILABLE",
    },
    {
      id: "seed-overlap-booked",
      clinicId: "harbor",
      service: "Dermatology",
      start: overlapBookingStart,
      status: "BOOKED",
    },
    {
      id: "seed-overlap-candidate",
      clinicId: "harbor",
      service: "Dermatology",
      start: new Date(+overlapBookingStart - 15 * 60000),
      status: "AVAILABLE",
    },
    {
      id: "seed-tie-slot",
      clinicId: "summit",
      service: "Cardiology",
      start: date(18, 17),
      status: "AVAILABLE",
    },
    {
      id: "seed-no-match-slot",
      clinicId: "summit",
      service: "Cardiology",
      start: date(22, 17),
      status: "BOOKED",
    },
  ] as const;
  for (const slot of scenarioSlots)
    await tx.slot.create({
      data: {
        ...slot,
        end: new Date(+slot.start + 1800000),
        provider: "Dr. Kira Bell",
        price: 12000,
        plans: [...PLANS],
      },
    });
  await tx.booking.create({
    data: { id: "avery-original", patientId: "avery", slotId: "later" },
  });
  await tx.booking.create({
    data: {
      id: "cedar-cancellation",
      patientId: "patient-1",
      slotId: "earlier",
    },
  });
  await tx.booking.create({
    data: {
      id: "seed-overlap-booking",
      patientId: "patient-8",
      slotId: "seed-overlap-booked",
    },
  });
  await tx.booking.create({
    data: {
      id: "seed-no-match-booking",
      patientId: "patient-1",
      slotId: "seed-no-match-slot",
    },
  });
  for (let i = 2; i < 6; i++)
    await tx.waitlist.create({
      data: {
        id: `wait-${i}`,
        patientId: `patient-${i}`,
        service: "Dermatology",
        plan: i === 3 ? "Unknown plan" : "Blue Horizon",
        city: i === 4 ? "Oakland" : "",
        clinicIds: [],
        maxPrice: i === 5 ? 5000 : 20000,
        earliest: now,
        latest: date(27, 23),
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        createdAt: new Date(+now + i * 1000),
      },
    });
  const scenarioWaitlist = async (
    id: string,
    patientId: string,
    service: string,
    clinicIds: string[],
    createdAt: Date,
    options: { latest?: Date; startHour?: number; endHour?: number } = {},
  ) =>
    tx.waitlist.create({
      data: {
        id,
        patientId,
        service,
        plan: "Blue Horizon",
        city: "",
        clinicIds,
        maxPrice: 20000,
        earliest: now,
        latest: options.latest ?? date(35, 23),
        startHour: options.startHour ?? 0,
        endHour: options.endHour ?? 24,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        createdAt,
      },
    });
  await scenarioWaitlist(
    "seed-overlap-waitlist",
    "patient-8",
    "Dermatology",
    ["harbor"],
    new Date(+now + 6000),
    { latest: date(17, 23) },
  );
  const tieCreatedAt = new Date(+now + 8000);
  await scenarioWaitlist(
    "seed-tie-a",
    "patient-6",
    "Cardiology",
    ["summit"],
    tieCreatedAt,
    { latest: date(19, 23) },
  );
  await scenarioWaitlist(
    "seed-tie-b",
    "patient-7",
    "Cardiology",
    ["summit"],
    tieCreatedAt,
    { latest: date(19, 23) },
  );
  await scenarioWaitlist(
    "seed-service-mismatch",
    "patient-9",
    "Cardiology",
    ["cedar"],
    new Date(+now + 10000),
  );
  await scenarioWaitlist(
    "seed-time-mismatch",
    "patient-10",
    "Dermatology",
    ["willow"],
    new Date(+now + 11000),
    { startHour: 22, endHour: 24 },
  );
  await scenarioWaitlist(
    "seed-offer-waitlist",
    "patient-11",
    "Dermatology",
    ["willow"],
    new Date(+now + 12000),
  );
  const pendingOffer = await tx.offer.create({
    data: {
      id: "seed-pending-offer",
      slotId: "seed-pending-slot",
      waitlistId: "seed-offer-waitlist",
      patientId: "patient-11",
      reason: "Seeded pending invitation",
      expiresAt: new Date(+now + OFFER_MINUTES * 60000),
    },
  });
  const expiredOffer = await tx.offer.create({
    data: {
      id: "seed-expired-offer",
      slotId: "seed-expired-slot",
      waitlistId: "seed-offer-waitlist",
      patientId: "patient-11",
      status: "EXPIRED",
      reason: "Seeded expired invitation",
      expiresAt: new Date(+now - 60000),
    },
  });
  await tx.notification.createMany({
    data: [pendingOffer, expiredOffer].map((offer) => ({
      patientId: "patient-11",
      offerId: offer.id,
      title: "An earlier appointment is ready",
      body: "This synthetic demo invitation illustrates offer status.",
    })),
  });
  // Historical legacy tags are retained verbatim for compatibility; they are
  // not approved request priorities and no longer drive the priority UI.
  const clinicTags: [string, string, string, number][] = [
    ["patient-1", "cedar", "Chest pain", 7],
    ["patient-1", "cedar", "Foot abrasion", 2],
    ["patient-2", "cedar", "Eczema flare", 5],
    ["patient-4", "harbor", "Skin rash", 3],
    ["patient-8", "harbor", "Mole check", 3],
    ["patient-8", "harbor", "Back pain", 6],
  ];
  for (const [patientId, clinicId, label, score] of clinicTags)
    await tx.symptomTag.create({
      data: { patientId, clinicId, label, score, source: "CLINIC" },
    });
}
