"use client";
import { useCallback, useEffect, useState } from "react";
import { request } from "@/lib/api";
import { dateLabel } from "@/lib/config";
import styles from "./account-access.module.css";
type Dashboard = {
  members: {
    id: string;
    role: string;
    canAuthorMedicalTags: boolean;
    status: string;
    account: { username: string; email: string; user: { name: string } };
  }[];
  invitations: {
    id: string;
    email: string;
    status: string;
    expiresAt: string;
  }[];
};
export function ClinicAccess() {
  const [state, setState] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/clinic/access", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setState(data);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/clinic/access", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data as Dashboard;
      })
      .then(setState)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  async function act(data: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await request("/api/clinic/access", data);
      setMessage(result.message);
      setToken(result.invitationToken ?? "");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="info-banner">
        <div>
          <strong>Clinic administrator access · mock verification</strong>
          <p>
            Invite individual staff, approve pending enrollment, and revoke
            access. Invitations are delivered manually with a one-time token; no
            email or real employment verification occurs. No fixed staff-account
            limit.
          </p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <form
        className={`card ${styles.form}`}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void act({ type: "invite", email: data.get("email") });
        }}
      >
        <label>
          Staff work email (mock)
          <input
            type="email"
            name="email"
            placeholder="staff@cedar.example.test"
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          Create mock invitation
        </button>
      </form>
      {token && (
        <div className={styles.token}>
          <strong>Copy this one-time invitation token now</strong>
          <p>{token}</p>
          <small>
            Shown only once. The recipient uses Clinic Staff Login → Redeem
            staff invitation with the exact invited fictional email.
            Administrator approval still required.
          </small>
        </div>
      )}
      <h2>Clinic members</h2>
      {state?.members.map((member) => (
        <article className={`card ${styles.member}`} key={member.id}>
          <div>
            <h3>{member.account.user.name}</h3>
            <p>
              {member.account.username} · {member.account.email}
            </p>
            <p>
              {member.role} · {member.status} · Mock verification
            </p>
          </div>
          <div className={styles.tabs}>
            {member.status === "ACTIVE" && (
              <button
                disabled={busy}
                onClick={() => {
                  const reason = prompt(
                    "Reason for granting or revoking clinical author permission (credential verification is simulated)",
                  );
                  if (reason)
                    void act({
                      type: "clinicalPermission",
                      membershipId: member.id,
                      enabled: !member.canAuthorMedicalTags,
                      expectedEnabled: member.canAuthorMedicalTags,
                      reason,
                    });
                }}
              >
                {member.canAuthorMedicalTags
                  ? "Revoke clinical author permission"
                  : "Grant clinical author permission"}
              </button>
            )}

            {member.status === "PENDING" && (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act({ type: "approve", membershipId: member.id })
                }
              >
                Approve staff access
              </button>
            )}
            {member.status !== "REVOKED" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Revoke this clinic membership? Active sessions will lose access.",
                    )
                  )
                    void act({ type: "revoke", membershipId: member.id });
                }}
              >
                Revoke access
              </button>
            )}
          </div>
        </article>
      ))}
      <h2>Invitations</h2>
      {state?.invitations.map((invitation) => (
        <article className={`card ${styles.member}`} key={invitation.id}>
          <p>
            {invitation.email} · {invitation.status} · Expires{" "}
            {dateLabel(invitation.expiresAt)}
          </p>
          {invitation.status === "PENDING" && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act({
                  type: "revokeInvitation",
                  invitationId: invitation.id,
                })
              }
            >
              Revoke invitation
            </button>
          )}
        </article>
      ))}
      {!state && (
        <button
          className="secondary"
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          Retry access dashboard
        </button>
      )}
    </div>
  );
}
