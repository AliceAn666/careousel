import { randomBytes } from "node:crypto";
import { z } from "zod";
import { PLANS, SERVICES } from "../../lib/config";
import { DomainError, locked } from "./scheduling";

// Demo sign-up for a new patient or clinic. There is no password system: the
// page's password field is a placeholder and is never sent to the server.
const name = z.string().trim().min(2).max(60);
export const registrationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("patient"), name, plan: z.enum(PLANS) }),
  z.object({
    kind: z.literal("clinic"),
    name,
    plans: z.array(z.enum(PLANS)).min(1).max(PLANS.length),
    specialty: z.enum(SERVICES),
    city: z.string().trim().min(1).max(80),
  }),
]);

const OPENINGS = 6;
const PROVIDER = "Dr. Demo Provider";

/** Creates the persona and returns the user id to sign in as. */
export async function registerPersona(raw: unknown, now = new Date()) {
  if (process.env.DEMO_MODE !== "true")
    throw new DomainError("Demo registration is disabled.", 403);
  const input = registrationSchema.parse(raw);
  const suffix = randomBytes(4).toString("hex");
  return locked(async (tx) => {
    if (input.kind === "patient") {
      const id = `reg-patient-${suffix}`;
      await tx.user.create({
        data: {
          id,
          name: input.name,
          role: "PATIENT",
          plan: input.plan,
          visitType: "FIRST",
          registered: true,
        },
      });
      return id;
    }
    // Locations come from the existing clinics' cities.
    if (!(await tx.clinic.count({ where: { city: input.city } })))
      throw new DomainError("Choose an existing location.", 400);
    const clinicId = `reg-${suffix}`;
    const plans = [...new Set(input.plans)];
    await tx.clinic.create({
      data: {
        id: clinicId,
        name: input.name,
        city: input.city,
        address: `${input.city} · demo address`,
        description: `Newly registered ${input.specialty} clinic (demo).`,
        specialty: input.specialty,
        plans,
      },
    });
    const staffId = `staff-${clinicId}`;
    await tx.user.create({
      data: {
        id: staffId,
        name: `${input.name} staff`,
        role: "STAFF",
        clinicId,
        registered: true,
      },
    });
    // A few openings so the new clinic shows up in patients' calendars.
    for (let i = 0; i < OPENINGS; i++) {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() + 2 + i * 2);
      start.setUTCHours(17 + (i % 3), 30, 0, 0);
      await tx.slot.create({
        data: {
          clinicId,
          service: input.specialty,
          provider: PROVIDER,
          start,
          end: new Date(+start + 1800000),
          price: 11000,
          plans,
        },
      });
    }
    await tx.audit.create({
      data: {
        clinicId,
        actor: `${input.name} staff`,
        action: "Clinic registered",
      },
    });
    return staffId;
  });
}
