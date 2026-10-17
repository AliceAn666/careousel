# Free demo deployment (Vercel + Neon + Cloudflare)

This is a deployment recipe, **not evidence that anything has been deployed**. All real sign-ups, sessions, appointment records and notifications must use one persistent Neon PostgreSQL database. Do not connect the public demo to a teammate's local database. Use synthetic data only.

## One-time setup

1. Create a **free** Neon PostgreSQL project. Keep the connection string secret. The project must be new/empty for first-time demo seeding.
2. In Vercel, import the private `AliceAn666/careousel` repo, using `main` as the production branch. Choose the free Hobby plan only if its non-commercial terms apply. Framework Next.js; build with `npm run build`. The build script generates Prisma Client before Next.js compilation.
3. In Vercel Production environment variables configure:
   - `DATABASE_URL` = Neon PostgreSQL connection URL (SSL required; use connection pooling where supported).
   - `SESSION_SECRET` = unique cryptographically random >=32-character secret (never rotate casually; it invalidates sessions).
   - `DEMO_MODE=true` for synthetic hackathon demo flows.
   - `NOTIFICATION_CRON_SECRET` = a **different** unique random >=32-character value.
   - Configure optional AI credentials only if genuinely needed; they are not required for the deterministic matching workflow.
4. Initialize **only the new empty Neon database, exactly once** from a trusted terminal/CI environment, with `DATABASE_URL` pointing to the Neon database: `npm ci --ignore-scripts`, `npm run db:generate`, `npm run db:migrate`. If demo fixture data is explicitly desired and the database has NO valuable records, run `SEED_CONFIRM=RESET_SYNTHETIC_DATA npm run db:seed`. **Seeding/reset deletes existing demo state, so never run it on every deployment or against a shared database.** Back up before modifying an existing database and verify migration checksums.
5. In Vercel deploy Production. Confirm homepage, account registration, demo persona entry, scheduling, waitlist, staff approvals, and data persistence after refresh. Automatic deployments from GitHub occur once the repo is linked, and Production gets new code merged into `main`.
6. For notifications, create one Cloudflare Worker using `deployment/cloudflare/worker.js` and `deployment/cloudflare/wrangler.jsonc` (or paste the JS code into the Cloudflare dashboard and set the cron to `*/15 * * * *`). Set Worker variable `CAREOUSEL_URL` to the actual Vercel Production URL, and Worker **secret** `NOTIFICATION_CRON_SECRET` to exactly the same value configured in Vercel. No secret should go in GitHub source code.
7. Exercise a real authorized P1 send and confirm in-app inbox delivery. The P2–P4 flow retains the **minimum 180-minute** delay and will run at the next scheduled poll (normally <=15 minutes late, with scheduling latency possible). The app may be closed during this time. This does not implement email or SMS.
8. Verify the endpoint rejects missing/wrong bearer tokens with HTTP 401. Do not submit the secret or database URL to a public form or issue.

## Limits and safety

- The Cloudflare Worker is a secure HTTP scheduler only; PostgreSQL access and eligibility/ranking remain in the original Next.js server code.
- This is a hackathon demonstration with synthetic records and demo access, not a production healthcare platform. Avoid entering real health records and protect/admin-limit destructive reset routes before sharing widely.
- **Free quotas and fair-use terms apply**; Neon may scale to zero, so a cold DB wakeup may briefly delay the first visit. Vercel Hobby and Cloudflare Workers have independent free limits. A free plan does not guarantee perfect uptime.
- For judge-friendly release management, link only tested/merged commits to Production; use Vercel Preview deployments for unmerged feature work. Keep Preview databases separate when schema changes are involved.
- Run complete verification using a separate `TEST_DATABASE_URL` named `careousel_test`. Never run test-preparation or reset scripts against the deployed production database.
- Keep the existing local `npm run worker:notifications` as an alternative for true 15-second polling when running a persistent Node process. The secure HTTP cron adapter is only for serverless demo hosting.
