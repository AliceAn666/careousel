import { Prisma } from "@prisma/client";
import { OFFER_MINUTES, PLANS, SERVICES } from "../src/lib/config";
export async function seedData(tx: Prisma.TransactionClient, now = new Date()) {
  await tx.clinicNotification.deleteMany();
  await tx.notification.deleteMany();
  await tx.offer.deleteMany();
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
        // Seeded patients are returning patients with clinic-entered
        // priorities; newly registered patients are first visits.
        visitType: "FOLLOW_UP",
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
  // ---- Extra demo population -------------------------------------------
  // More returning patients, afternoon openings, a few confirmed bookings and
  // waitlists. Waitlists prefer 2–6 pm Pacific, so they match these afternoon
  // openings without changing the scripted morning scenarios above.
  const extraPatients: [string, (typeof PLANS)[number]][] = [
    ["Morgan Hayes", "Blue Horizon"],
    ["Parker Quinn", "Aster Health"],
    ["Reese Kim", "United Demo"],
    ["Hayden Cole", "Pacific Care"],
    ["Emerson Ward", "Blue Horizon"],
    ["Rowan Ortiz", "Aster Health"],
    ["Sage Turner", "Blue Horizon"],
    ["Finley Shaw", "Pacific Care"],
  ];
  for (const [i, [name, plan]] of extraPatients.entries())
    await tx.user.create({
      data: {
        id: `patient-${12 + i}`,
        name,
        role: "PATIENT",
        plan,
        visitType: "FOLLOW_UP",
      },
    });
  const doctors = ["Dr. Ana Flores", "Dr. Ben Okafor", "Dr. Chloe Wu"];
  for (let d = 0; d < 30; d++)
    for (const k of [0, 1]) {
      const start = date(3 + d, 22 + k);
      const n = d * 2 + k;
      await tx.slot.create({
        data: {
          id: `extra-${d}-${k}`,
          clinicId: clinics[(d + k * 2) % 4][0],
          service: SERVICES[(d + k) % 3],
          provider: doctors[n % 3],
          start,
          end: new Date(+start + 1800000),
          price: 9500 + (n % 3) * 2000,
          plans: n % 2 ? [...PLANS] : [PLANS[n % 4], "Self-pay"],
        },
      });
    }
  const extraBookings: [string, string][] = [
    ["patient-12", "extra-2-0"],
    ["patient-13", "extra-5-1"],
    ["patient-14", "extra-9-0"],
    ["patient-15", "extra-12-1"],
    ["patient-16", "extra-16-0"],
    ["patient-17", "extra-20-1"],
  ];
  for (const [patientId, slotId] of extraBookings) {
    await tx.booking.create({ data: { patientId, slotId } });
    await tx.slot.update({ where: { id: slotId }, data: { status: "BOOKED" } });
  }
  const extraWaitlists: [string, string, string[]][] = [
    ["patient-12", "Dermatology", []],
    ["patient-13", "Cardiology", []],
    ["patient-14", "Primary care", ["cedar", "harbor"]],
    ["patient-15", "Dermatology", ["cedar"]],
    ["patient-16", "Cardiology", ["harbor", "willow"]],
    ["patient-17", "Primary care", []],
    ["patient-18", "Dermatology", []],
    ["patient-19", "Cardiology", ["cedar", "summit"]],
    ["patient-18", "Primary care", ["harbor"]],
  ];
  for (const [i, [patientId, service, clinicIds]] of extraWaitlists.entries())
    await tx.waitlist.create({
      data: {
        id: `extra-wait-${i}`,
        patientId,
        service,
        plan: extraPatients[Number(patientId.slice(8)) - 12][1],
        city: "",
        clinicIds,
        maxPrice: 20000,
        earliest: now,
        latest: date(35, 23),
        startHour: 14,
        endHour: 18,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        createdAt: new Date(+now + 20000 + i * 1000),
      },
    });
  const extraTags: [string, string, string, number][] = [
    ["patient-12", "cedar", "Psoriasis", 5],
    ["patient-12", "cedar", "Itchy rash", 3],
    ["patient-13", "summit", "Palpitations", 8],
    ["patient-13", "summit", "Shortness of breath", 6],
    ["patient-14", "harbor", "Persistent cough", 4],
    ["patient-15", "cedar", "Acne flare", 2],
    ["patient-15", "cedar", "Mole change", 7],
    ["patient-16", "willow", "High blood pressure", 6],
    ["patient-17", "harbor", "Migraine", 5],
    ["patient-17", "harbor", "Sprained ankle", 3],
    ["patient-17", "harbor", "Fatigue", 2],
    ["patient-18", "cedar", "Skin infection", 8],
    ["patient-18", "harbor", "Sore throat", 3],
    ["patient-19", "summit", "Chest tightness", 9],
  ];
  for (const [patientId, clinicId, label, score] of extraTags)
    await tx.symptomTag.create({
      data: { patientId, clinicId, label, score, source: "CLINIC" },
    });
  // Clinic-entered priorities for returning patients. One patient can carry
  // several tags, each with its own severity score (1–10).
  const clinicTags: [string, string, string, number][] = [
    ["avery", "harbor", "Mole check", 4],
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
