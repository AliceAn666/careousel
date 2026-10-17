"use client";
import { useState } from "react";
import { request } from "@/lib/api";
import { PLANS } from "@/lib/config";
import styles from "./account-access.module.css";
export function AccountAccess({
  entrance,
  onDone,
  onHome,
  onLogout,
  authenticated,
}: {
  entrance: "PATIENT" | "STAFF";
  onDone: () => Promise<void>;
  onHome: () => void;
  onLogout: () => Promise<void>;
  authenticated: boolean;
}) {
  const [tab, setTab] = useState("login"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <button className="text-button" onClick={onHome}>
          Careousel home
        </button>
        <h1>
          {entrance === "PATIENT" ? "Patient Login" : "Clinic Staff Login"}
        </h1>
        <p>
          Individual accounts · synthetic hackathon data only. No real
          insurance, employment or email verification.
        </p>
        {authenticated ? (
          <>
            <p>Log out before signing in as a different account or role.</p>
            <button className="primary" onClick={() => void onLogout()}>
              Log out
            </button>
          </>
        ) : (
          <>
            <div className={styles.tabs}>
              <button
                className={tab === "login" ? "primary" : "secondary"}
                onClick={() => {
                  setTab("login");
                  setError("");
                  setMessage("");
                }}
              >
                Log in
              </button>
              <button
                className={tab !== "login" ? "primary" : "secondary"}
                onClick={() => {
                  setTab("register");
                  setError("");
                  setMessage("");
                }}
              >
                {entrance === "PATIENT"
                  ? "Create patient account"
                  : "Redeem staff invitation"}
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
            <form
              className={styles.form}
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                setMessage("");
                const data = new FormData(event.currentTarget);
                const body = Object.fromEntries(data.entries());
                try {
                  if (tab === "login") {
                    await request("/api/auth/login", {
                      username: body.username,
                      password: body.password,
                      entrance,
                    });
                    await onDone();
                  } else {
                    const result = await request(
                      entrance === "PATIENT"
                        ? "/api/auth/register"
                        : "/api/auth/staff-register",
                      body,
                    );
                    setMessage(result.message);
                    setTab("login");
                  }
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Username
                <input
                  name="username"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={40}
                />
              </label>
              {tab !== "login" && (
                <>
                  <label>
                    Display name (fictional)
                    <input name="name" required minLength={2} maxLength={60} />
                  </label>
                  <label>
                    {entrance === "STAFF"
                      ? "Invited work email (mock)"
                      : "Email (fictional)"}
                    <input
                      name="email"
                      type="email"
                      placeholder="person@example.test"
                      required
                    />
                  </label>
                  {entrance === "PATIENT" ? (
                    <label>
                      Fictional insurance plan
                      <select name="plan" aria-label="Fictional insurance plan">
                        {PLANS.map((plan) => (
                          <option key={plan}>{plan}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Invitation token
                      <input
                        name="invitationToken"
                        autoComplete="off"
                        required
                        minLength={32}
                        maxLength={128}
                      />
                    </label>
                  )}
                </>
              )}
              <label>
                Password (at least 12 characters)
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    tab === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Working…"
                  : tab === "login"
                    ? "Sign in"
                    : entrance === "PATIENT"
                      ? "Register patient"
                      : "Create invited staff account"}
              </button>
            </form>
          </>
        )}
        {entrance === "STAFF" && (
          <p>
            Staff access requires an invitation and administrator approval. An
            employee ID cannot grant access. Invitation delivery and institution
            verification are mocked; no real email is sent.
          </p>
        )}
      </section>
    </main>
  );
}
