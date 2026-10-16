# Database foundation (implementation branch)

PostgreSQL + Prisma is the proposed persistence layer for the synthetic Careousel demo.

## Setup (after app bootstrap)
1. Install compatible pinned versions of `prisma`, `@prisma/client`, and the supported PostgreSQL driver. Commit the lockfile.
2. Create a local PostgreSQL database and an **independent** test database.
3. Set `DATABASE_URL` in a local untracked `.env` (never commit credentials).
4. Run `npx prisma validate`, then `npx prisma migrate dev --name init`.
5. Add the SQL in `prisma/constraints.sql` to a reviewed migration **after** Prisma's generated table creation SQL. Apply it through Prisma migrations, not a one-off production command.
6. Run `npx prisma generate` and verify indexes using PostgreSQL catalog queries.

This branch provides schema and constraint definitions only. No migration has been generated/applied, no seed data or tests have been executed, and no database connection has been verified. Do not treat it as an operational database yet.

## Integrity contract for scheduling services
- Lock patient first, then slots in deterministic ID order; recheck states and eligibility in the same PostgreSQL transaction.
- Partial indexes allow at most one CONFIRMED booking and one PENDING offer per slot; they do not by themselves enforce slot-status coherence or prevent overlapping appointments for one patient.
- Approval creates a hold and a pending offer; suggestions never reserve capacity.
- Acceptance must atomically reschedule the old booking, confirm the new one, update slot states, fulfill the waitlist, record audit/notification, and preserve the old booking on rollback.
- Expiration must be checked using server time on reads and writes, not browser timers.
- `allowedClinicIds` and `allowedCities` are preference values, not authorization. Validate membership, ownership, visit type, plan and time compatibility server-side.
- Only invented patients, clinics, contacts, plans and payments are allowed.

## Remaining work
Generate and review actual migration SQL, implement seed/reset, add integration tests for concurrency and rollback, and integrate with approved Next.js bootstrap. Coordinate schema changes with Member 1 and booking logic with Member 4.
