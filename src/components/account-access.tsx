"use client";

import { useState } from "react";
import { request } from "@/lib/api";
import { PLANS } from "@/lib/config";
import styles from "./account-access.module.css";

type FieldName = "username" | "name" | "email" | "password" | "invitationToken";
type FieldErrors = Partial<Record<FieldName, string>>;

const demoEmail = /@(?:[^@]+\.)?(?:example\.(?:com|org|net)|example|test)$/i;
const usernameFormat = /^[a-z0-9][a-z0-9_.-]{2,39}$/i;
const emailHint = "Use a fictional address such as patient@example.com. Gmail and real email domains are not accepted in this demo.";

function validate(values: Record<string, string>, registering: boolean): FieldErrors {
  const errors: FieldErrors = {};
  const username = (values.username ?? "").trim();
  const password = values.password ?? "";
  if (!username) errors.username = "Username is required.";
  else if (!usernameFormat.test(username))
    errors.username = "Use 3–40 letters, numbers, dots, underscores, or hyphens. Start with a letter or number.";
  if (!password) errors.password = "Password is required.";
  else if (registering && (password.length < 12 || password.length > 128))
    errors.password = "Choose a password between 12 and 128 characters.";
  if (registering) {
    if (!(values.name ?? "").trim())
      errors.name = "Display name is required.";
    else if (values.name.trim().length < 2)
      errors.name = "Display name must be at least 2 characters.";
    const email = (values.email ?? "").trim();
    if (!email)
      errors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = "Enter a valid fictional email address.";
    else if (!demoEmail.test(email))
      errors.email = "Only fictional example/test email addresses are accepted. Try patient@example.com.";
    if ("invitationToken" in values && !values.invitationToken?.trim())
      errors.invitationToken = "Invitation token is required.";
  }
  return errors;
}

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
  const [tab, setTab] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const registering = tab === "register";

  function changeTab(next: "login" | "register") {
    setTab(next);
    setError("");
    setMessage("");
    setFieldErrors({});
  }

  function clearEditedError(field: string) {
    if (field in fieldErrors)
      setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    setError("");
    setMessage("");
  }

  const inputError = (field: FieldName) => ({
    "aria-invalid": Boolean(fieldErrors[field]) || (tab === "login" && Boolean(error) && (field === "username" || field === "password")),
    "aria-describedby": fieldErrors[field] ? `${field}-error` : undefined,
    className: fieldErrors[field] || (tab === "login" && error && (field === "username" || field === "password")) ? styles.invalidInput : undefined,
  });

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <button className="text-button" onClick={onHome}>
          Careousel home
        </button>
        <h1>
          {registering
            ? entrance === "PATIENT"
              ? "Create Patient Account"
              : "Create Clinic Staff Account"
            : entrance === "PATIENT"
              ? "Patient Login"
              : "Clinic Staff Login"}
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
                type="button"
                className={tab === "login" ? "primary" : "secondary"}
                aria-pressed={tab === "login"}
                onClick={() => changeTab("login")}
              >
                Log in
              </button>
              <button
                type="button"
                className={registering ? "primary" : "secondary"}
                aria-pressed={registering}
                onClick={() => changeTab("register")}
              >
                {entrance === "PATIENT"
                  ? "Create patient account"
                  : "Redeem staff invitation"}
              </button>
            </div>
            {message && (
              <p role="status" className={styles.successMessage}>
                {message}
              </p>
            )}
            <form
              className={styles.form}
              noValidate
              onChange={(event) => {
                const target = event.target as HTMLInputElement | HTMLSelectElement;
                if (target.name) clearEditedError(target.name);
              }}
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const form = event.currentTarget;
                const body = Object.fromEntries(
                  new FormData(form).entries(),
                ) as Record<string, string>;
                const errors = validate(body, registering);
                setError("");
                setMessage("");
                setFieldErrors(errors);
                const firstInvalid = Object.keys(errors)[0];
                if (firstInvalid) {
                  form.querySelector<HTMLInputElement>(
                    `[name="${firstInvalid}"]`,
                  )?.focus();
                  return;
                }
                setBusy(true);
                try {
                  if (!registering) {
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
                    form.reset();
                    setFieldErrors({});
                    setTab("login");
                    setMessage(result.message);
                  }
                } catch (e) {
                  const detail = e instanceof Error ? e.message : "Request failed.";
                  if (/fictional example\/test email|fictional example\/test/i.test(detail))
                    setFieldErrors({ email: "Only fictional example/test email addresses are accepted. Try patient@example.com." });
                  else if (!registering && /invalid credentials|invalid username or password/i.test(detail))
                    setError("Invalid username or password.");
                  else if (/username or email is unavailable/i.test(detail))
                    setError("That username or email is already in use. Choose a different fictional account.");
                  else
                    setError(detail);
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
                  minLength={3}
                  maxLength={40}
                  {...inputError("username")}
                />
              </label>
              {fieldErrors.username && (
                <p id="username-error" role="alert" className={styles.fieldError}>
                  {fieldErrors.username}
                </p>
              )}
              {registering && (
                <>
                  <label>
                    Display name (fictional)
                    <input name="name" minLength={2} maxLength={60} {...inputError("name")} />
                  </label>
                  {fieldErrors.name && (
                    <p id="name-error" role="alert" className={styles.fieldError}>
                      {fieldErrors.name}
                    </p>
                  )}
                  <label>
                    {entrance === "STAFF"
                      ? "Invited work email (mock)"
                      : "Email (fictional)"}
                    <input
                      name="email"
                      type="email"
                      autoComplete="off"
                      placeholder="patient@example.com"
                      {...inputError("email")}
                      aria-describedby={fieldErrors.email ? "email-error email-hint" : "email-hint"}
                    />
                  </label>
                  <p id="email-hint" className={styles.hint}>
                    {emailHint}
                  </p>
                  {fieldErrors.email && (
                    <p id="email-error" role="alert" className={styles.fieldError}>
                      {fieldErrors.email}
                    </p>
                  )}
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
                    <>
                      <label>
                        Invitation token
                        <input
                          name="invitationToken"
                          autoComplete="off"
                          minLength={32}
                          maxLength={128}
                          {...inputError("invitationToken")}
                        />
                      </label>
                      {fieldErrors.invitationToken && (
                        <p id="invitationToken-error" role="alert" className={styles.fieldError}>
                          {fieldErrors.invitationToken}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
              <label>
                Password (at least 12 characters)
                <input
                  name="password"
                  type="password"
                  autoComplete={registering ? "new-password" : "current-password"}
                  minLength={12}
                  maxLength={128}
                  {...inputError("password")}
                />
              </label>
              {fieldErrors.password && (
                <p id="password-error" role="alert" className={styles.fieldError}>
                  {fieldErrors.password}
                </p>
              )}
              {error && (
                <p role="alert" className={styles.formError}>
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Working…"
                  : !registering
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
