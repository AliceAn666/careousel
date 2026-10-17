import "dotenv/config";
import { writeFile } from "node:fs/promises";
import {
  provisionMockAdministrator,
  exportMockAdministratorPlan,
} from "../src/server/auth/accounts";
import { db } from "../src/server/db";
if (!process.argv.includes("--confirm-mock-bootstrap"))
  throw new Error(
    "Explicit --confirm-mock-bootstrap required. Review the target DATABASE_URL; do not run against shared data without approval.",
  );
try {
  const input = {
    clinicId: process.env.ADMIN_BOOTSTRAP_CLINIC,
    username: process.env.ADMIN_BOOTSTRAP_USERNAME,
    email: process.env.ADMIN_BOOTSTRAP_EMAIL,
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
    name: process.env.ADMIN_BOOTSTRAP_NAME,
  };
  const output = process.env.PROVISION_SQL_FILE;
  if (output) {
    const plan = await exportMockAdministratorPlan(input);
    await writeFile(output, JSON.stringify(plan), { mode: 0o600 });
    console.log(
      "Private administrator plan written; execute transactionally through the authorized database connection.",
    );
  } else {
    const result = await provisionMockAdministrator(input);
    console.log(result.message);
  }
} finally {
  await db.$disconnect();
}
