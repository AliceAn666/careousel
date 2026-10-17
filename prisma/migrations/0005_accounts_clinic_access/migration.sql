-- Additive: no legacy identities, sessions, bookings or priority rows are rewritten.
CREATE TABLE "Account" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE REFERENCES "User"(id),
 username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(username=lower(username)), CHECK(email=lower(email))
);
CREATE TABLE "AccountSession" (
 id TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE, "accountId" TEXT NOT NULL REFERENCES "Account"(id),
 "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AccountSession_accountId_idx" ON "AccountSession"("accountId");
CREATE TABLE "ClinicMembership" (
 id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL UNIQUE REFERENCES "Account"(id),
 "clinicId" TEXT NOT NULL REFERENCES "Clinic"(id), role TEXT NOT NULL CHECK(role IN ('ADMIN','STAFF')),
 status TEXT NOT NULL CHECK(status IN ('PENDING','ACTIVE','REVOKED')),
 "verifiedById" TEXT REFERENCES "User"(id), "verifiedAt" TIMESTAMP(3),
 "verificationMode" TEXT NOT NULL DEFAULT 'MOCK' CHECK("verificationMode"='MOCK'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "StaffInvitation" (
 id TEXT PRIMARY KEY, "clinicId" TEXT NOT NULL REFERENCES "Clinic"(id), email TEXT NOT NULL,
 "tokenHash" TEXT NOT NULL UNIQUE, "invitedById" TEXT NOT NULL REFERENCES "User"(id),
 "expiresAt" TIMESTAMP(3) NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','USED','REVOKED')),
 "usedById" TEXT REFERENCES "Account"(id), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(email=lower(email))
);
CREATE TABLE "LoginThrottle" (
 bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL CHECK(attempts>=0), "windowStart" TIMESTAMP(3) NOT NULL
);
