import "dotenv/config";
import { provisionMockAdministrator } from "../src/server/auth/accounts";
import { db } from "../src/server/db";
if (!process.argv.includes("--confirm-mock-bootstrap"))
  throw new Error(
    "Explicit --confirm-mock-bootstrap required. Review the target DATABASE_URL; do not run against shared data without approval.",
  );
try {
  const result = await provisionMockAdministrator({
    clinicId: process.env.ADMIN_BOOTSTRAP_CLINIC,
    username: process.env.ADMIN_BOOTSTRAP_USERNAME,
    email: process.env.ADMIN_BOOTSTRAP_EMAIL,
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
    name: process.env.ADMIN_BOOTSTRAP_NAME,
  });
  console.log(result.message);
} finally {
  await db.$disconnect();
}
