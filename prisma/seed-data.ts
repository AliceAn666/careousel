import { Prisma } from "@prisma/client";
import { PLANS, SERVICES } from "../src/lib/config";
export async function seedData(tx: Prisma.TransactionClient, now = new Date()) {
  await tx.notification.deleteMany();
  await tx.offer.deleteMany();
  await tx.suggestion.deleteMany();
  await tx.waitlist.deleteMany();
  await tx.booking.deleteMany();
  await tx.audit.deleteMany();
  await tx.slot.deleteMany();
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
}
