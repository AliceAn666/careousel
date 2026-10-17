# Demo staff invitation activation

Only synthetic data is supported. These are institution-authorized **mock** accounts, not verified hospital employees. Normal public signup remains patient-only. All staff require a private invitation, then administrator approval. No clinical-author permission is granted by default.

## Trusted activation procedure

1. Confirm the exact project/branch/database, explicit authorization and a backup before any shared write. Never reset, seed, migrate automatically or overwrite existing accounts.
2. Check each clinic for an ACTIVE Account/User/ADMIN ClinicMembership belonging to that same clinic. Reuse existing authorized administrators. If none exists, use `scripts/provision-mock-admin.ts --confirm-mock-bootstrap` with `DEMO_MODE=true` and the documented `ADMIN_BOOTSTRAP_*` environment variables. Generate a strong random private password, never a published demo password.
3. Keep the eight-row manifest and administrator credentials **outside Git**, permission 0600. The manifest is JSON: each row has `clinicId`, exact fictional `email`, private `token`, and the existing `administratorUserId`. Require two unique invitations for each of cedar/harbor/willow/summit. Never put the actual sheet or its token values in documentation, fixtures, issues, UI or logs.
4. Set `DEMO_INVITATION_MANIFEST` to the private file and run `node --import tsx scripts/provision-demo-staff-invitations.ts --confirm-demo-invitations` with DEMO_MODE and the explicitly reviewed DATABASE_URL. The transaction uses the same advisory lock as scheduling, validates active same-clinic administrators, stores existing `tokenHash()` hashes only, and sets seven days from activation. It refuses token identity conflicts, existing accounts and conflicting pending invitations. Repeat activation preserves status/expiry, including USED, REVOKED and expired rows; it never revives a code. Repeat exports can create fresh unused random row IDs, but token-hash uniqueness prevents duplicate inserts/audits.
5. If direct database networking is unavailable but an authenticated Neon connector is approved, set `PROVISION_SQL_FILE` for either trusted script. It exports a private JSON transaction plan (administrator plan includes userId/accountId), with the same bootstrap SQL used by the normal script and only hashes. Export alone does not activate anything. Execute the statements in one transaction after acquiring advisory lock 728194, using the exact approved project/branch/database. Keep all guards. Verify results against expected hashes, email/clinic and inviter membership; do not log hashes or secrets. No HTTP bootstrap endpoint exists.

## Registration and approval

At `/login/staff`, choose **Redeem staff invitation**, enter a unique username, fictional display name, the exact invited email, complete token and a 12–128 character password. Surrounding token whitespace is normalized; missing/malformed input is shown beneath the token field. Unknown tokens, wrong email and inactive invitations use one privacy-preserving server error rather than a public token-validity lookup.

Successful registration atomically consumes the invitation and creates PENDING membership. The message is `Staff account created. Awaiting administrator approval.` and the form returns to login. Identical credentialed retries remain idempotent; a used token cannot create another account. A revoked staff identity may only re-enroll with a fresh authorized invitation and its existing credentials, followed by approval again.

An authorized administrator signs in at `/login/staff`, opens **Staff access**, finds the new member and clicks **Approve staff access**. Staff can then sign in and see only their clinic. Revocation invalidates sessions. No employee-ID privilege path, auto-approval, default clinical authorship, real email delivery or real credential verification is added.

## Operational evidence

Activation status and expiry may be recorded by clinic/email, never by token value. A real registration test consumes exactly one invitation and leaves it USED; never reset it to PENDING for demonstration. Preserve remaining codes. Local browser tests use generated isolated tokens, never the private sheet. A network-blocked live test must be reported as unexecuted even if isolated tests pass.
