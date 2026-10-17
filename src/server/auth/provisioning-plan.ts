// Trusted CLI transport only. Plans contain hashes, never passwords or invitation tokens.
// Execute each plan in one transaction under the normal scheduling advisory lock.
import { randomBytes } from "node:crypto";
import { tokenHash } from "./passwords";
export const sqlText = (value: string) => `'${value.replaceAll("'", "''")}'`;
function guarded(statement: string) {
  let n = 0;
  while (statement.includes(`$careousel_guard_${n}$`)) n++;
  const tag = `$careousel_guard_${n}$`;
  return statement.replace(/^DO \$\$/, `DO ${tag}`).replace(/\$\$$/, tag);
}
const id = () => `provision-${randomBytes(16).toString("hex")}`;
export function administratorPlan(
  input: { clinicId: string; username: string; email: string; name: string },
  passwordHash: string,
) {
  const userId = id(),
    accountId = id(),
    membershipId = id();
  const q = sqlText,
    clinic = q(input.clinicId);
  return {
    userId,
    accountId,
    statements: [
      guarded(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM "Clinic" WHERE id=${clinic}) THEN RAISE EXCEPTION 'Unknown synthetic clinic'; END IF; IF EXISTS (SELECT 1 FROM "ClinicMembership" WHERE "clinicId"=${clinic} AND role='ADMIN' AND status='ACTIVE') THEN RAISE EXCEPTION 'Clinic already has an administrator'; END IF; END $$`,
      ),
      `INSERT INTO "User" (id,name,role,"clinicId",plan) VALUES (${q(userId)},${q(input.name)},'STAFF',${clinic},'Blue Horizon')`,
      `INSERT INTO "Account" (id,"userId",username,email,"passwordHash") VALUES (${q(accountId)},${q(userId)},${q(input.username)},${q(input.email)},${q(passwordHash)})`,
      `INSERT INTO "ClinicMembership" (id,"accountId","clinicId",role,status,"verifiedById","verifiedAt","canAuthorMedicalTags") VALUES (${q(membershipId)},${q(accountId)},${clinic},'ADMIN','ACTIVE',${q(userId)},clock_timestamp(),false)`,
      `INSERT INTO "Audit" (id,"clinicId",actor,action) VALUES (${q(id())},${clinic},${q(input.name)},'Explicit mock administrator bootstrap')`,
    ],
  };
}
export function invitationPlan(
  input: { clinicId: string; email: string; token: string },
  administratorUserId: string,
) {
  const q = sqlText,
    clinic = q(input.clinicId),
    email = q(input.email),
    hash = q(tokenHash(input.token)),
    actor = q(administratorUserId);
  // Existing USED/REVOKED/expired invitations are reported, never revived or extended.
  return [
    guarded(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM "ClinicMembership" m JOIN "Account" a ON a.id=m."accountId" JOIN "User" u ON u.id=a."userId" WHERE a."userId"=${actor} AND a.status='ACTIVE' AND m.role='ADMIN' AND m.status='ACTIVE' AND m."clinicId"=${clinic} AND u.role='STAFF' AND u."clinicId"=${clinic}) THEN RAISE EXCEPTION 'Active same-clinic administrator required'; END IF; IF EXISTS (SELECT 1 FROM "StaffInvitation" WHERE "tokenHash"=${hash} AND (email<>${email} OR "clinicId"<>${clinic})) THEN RAISE EXCEPTION 'Invitation identity conflict'; END IF; IF NOT EXISTS (SELECT 1 FROM "StaffInvitation" WHERE "tokenHash"=${hash}) AND (EXISTS (SELECT 1 FROM "Account" WHERE email=${email}) OR EXISTS (SELECT 1 FROM "StaffInvitation" WHERE email=${email} AND "clinicId"=${clinic} AND status='PENDING' AND "expiresAt">clock_timestamp())) THEN RAISE EXCEPTION 'Email already enrolled or another invitation is pending'; END IF; END $$`,
    ),
    `WITH created AS (INSERT INTO "StaffInvitation" (id,"clinicId",email,"tokenHash","invitedById","expiresAt",status) VALUES (${q(id())},${clinic},${email},${hash},${actor},clock_timestamp()+INTERVAL '7 days','PENDING') ON CONFLICT ("tokenHash") DO NOTHING RETURNING id) INSERT INTO "Audit" (id,"clinicId",actor,action) SELECT ${q(id())},${clinic},${actor},'Activated predetermined mock staff invitation' FROM created`,
    `SELECT "clinicId",email,CASE WHEN status='PENDING' AND "expiresAt"<=clock_timestamp() THEN 'EXPIRED' ELSE status END AS status,"expiresAt" FROM "StaffInvitation" WHERE "tokenHash"=${hash}`,
  ];
}
