# Shared foundation

One Next.js App Router application, React, strict TypeScript, Tailwind v4 and shadcn-compatible owned UI components. npm is the only package manager. All direct dependencies are exact pins; package-lock.json locks transitives. Node 24.19.0 / npm 11.9.0 is the verified baseline.

## Ownership and dependency boundaries

| Path | Responsibility |
| --- | --- |
| src/app | Route composition/layout; Patient Portal owns patient routes, Clinic Dashboard owns clinic routes |
| src/components/ui | Shared accessible primitives; Button uses Radix Slot and CVA, configured through components.json |
| src/lib/contracts | Browser-safe Zod DTOs, states, API descriptors and inferred types; coordinate changes with integration owner |
| src/lib | Pure formatters, utilities, shared offer lifetime |
| src/server/auth | Server-issued sessions, ownership, clinic membership, CSRF (backend integration pending) |
| src/server/services | Business transitions and transactions (backend owner) |
| src/server/db | Future server-only Prisma singleton after PR #2 integration |
| prisma | Database teammate exclusively; PR #2, not included in this PR |
| tests/unit, tests/integration, tests/e2e | Contract rules, actual PostgreSQL invariants, browser journeys |

Import shared types from @/lib/contracts. Never import Prisma or server modules into client components. Future server entry points must import server-only. Routes validate and authorize, invoke services, serialize DTOs; services own transactions. Do not use a client role or preference clinic ID as authorization.

## Database handoff

GitHub metadata at review completion reports PR #2 closed, unmerged, draft. Coordinator must arrange reopening or a successor PR with the database owner; do not recreate their work. Reviewed PR #2 Git head 0177554f8e90ef3ecfde0b5125de068dd843d07b: schema.prisma, constraints.sql and README. No files from that PR were copied or altered. Prisma 6.19.3 and matching client preserve its datasource URL/client generator syntax; no client generation or migration runs during app install/build. Merge PR #2 through review, then database owner formats/validates schema, generates client, reviews migrations including partial indexes, and creates separate development/test databases. Database operational readiness is not established by this foundation.

Lock patient first, then slots sorted by ID; recheck all state/expiry/eligibility in the transaction. Unique indexes do not prevent cross-slot patient overlap. Replacement acceptance atomically preserves history, fulfills waitlist, invalidates other offers, updates slots, audit and notifications. Rollback preserves the original booking. Test these against PostgreSQL.

## UI system

Use semantic CSS tokens in globals.css: teal primary, neutral card/background, explicit border, focus ring and destructive color. Use the shared Button and cn utility; add shadcn components to src/components/ui under coordinator review. Body uses system fonts without network fetching. Layout provides skip navigation, main landmark and visible synthetic/insurance/estimate notices. Use textual status labels, explicit form labels, keyboard focus, responsive 375px layouts, and loading/empty/error/success states. Format money with formatMoney and UTC instants with formatClinicTime using the clinic IANA timezone. No portal or working persona selector exists yet.

## Local workflow and verification

```
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Copy .env.example to .env only when integrating persistence; never commit real credentials. App startup/build do not need a database or run seed/reset. `npm run test:integration` is configured but intentionally has no passing placeholder suite: backend/database owners must add isolated PostgreSQL tests and destructive-database guards before using it. Full PRD browser journeys, CI and branch protection remain future tasks; the current browser test checks only foundation accessibility/responsiveness.

Public deployment requires separate explicit authorization. This branch creates no hosting resources and performs no deployment.
