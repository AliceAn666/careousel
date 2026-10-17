import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { staffRegistration } from "../src/server/auth/accounts";
import { invitationPlan } from "../src/server/auth/provisioning-plan";
import { locked } from "../src/server/services/scheduling";
import { db } from "../src/server/db";
export const manifestSchema = z
  .array(
    z
      .object({
        clinicId: z.enum(["cedar", "harbor", "willow", "summit"]),
        email: staffRegistration.shape.email,
        token: staffRegistration.shape.invitationToken,
        administratorUserId: z.string().min(1),
      })
      .strict(),
  )
  .length(8)
  .superRefine((rows, ctx) => {
    if (
      new Set(rows.map((r) => r.token)).size !== 8 ||
      new Set(rows.map((r) => r.email)).size !== 8 ||
      ["cedar", "harbor", "willow", "summit"].some(
        (c) => rows.filter((r) => r.clinicId === c).length !== 2,
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Require eight distinct invitations, two per synthetic clinic.",
      });
  });
try {
  if (
    process.env.DEMO_MODE !== "true" ||
    !process.argv.includes("--confirm-demo-invitations")
  )
    throw new Error(
      "Explicit demo invitation confirmation and DEMO_MODE required.",
    );
  const file = process.env.DEMO_INVITATION_MANIFEST;
  if (!file) throw new Error("Private DEMO_INVITATION_MANIFEST required.");
  const rows = manifestSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const statements = rows.flatMap((r) =>
    invitationPlan(r, r.administratorUserId),
  );
  if (process.env.PROVISION_SQL_FILE) {
    await writeFile(
      process.env.PROVISION_SQL_FILE,
      JSON.stringify({ statements }),
      { mode: 0o600 },
    );
    console.log(
      "Private hashed invitation plan written. No database write performed.",
    );
  } else {
    const status = await locked(async (tx) => {
      const result = [];
      for (let i = 0; i < statements.length; i++) {
        if (i % 3 === 2)
          result.push(...(await tx.$queryRawUnsafe<object[]>(statements[i])));
        else await tx.$executeRawUnsafe(statements[i]);
      }
      return result;
    });
    console.log(JSON.stringify(status));
  }
} catch {
  console.error(
    "Invitation provisioning stopped. Check target, private manifest and administrator authority; no token values are logged.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
