"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import type { AppState } from "@/lib/types";
import { PLANS, SERVICES } from "@/lib/config";
import { request } from "@/lib/api";

// Demo sign-up page. The password field only mimics a real form: it is
// required on the page but never sent or stored.
export function Register({
  kind,
  state,
  onBack,
  onDone,
}: {
  kind: "patient" | "clinic";
  state: AppState;
  onBack: () => void;
  onDone: (kind: "patient" | "clinic") => Promise<void>;
}) {
  const clinic = kind === "clinic";
  const cities = [...new Set(state.clinics.map((c) => c.city))];
  const [plans, setPlans] = useState<string[]>([]),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="landing register-page">
      <header>
        <div className="brand">
          <span className="eyebrow">CAREOUSEL DEMO</span>
        </div>
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={15} />
          Back to home
        </button>
      </header>
      <section className="entry-card register-card">
        <span className="clinic-symbol">
          {clinic ? <Building2 /> : <UserPlus />}
        </span>
        <span className="eyebrow">
          {clinic ? "REGISTER A NEW CLINIC" : "REGISTER A NEW PATIENT"}
        </span>
        <h2>{clinic ? "Set up your clinic" : "Create your patient profile"}</h2>
        <p>
          Demo only. This persona is removed when anyone returns to the home
          page. Fields marked * are required.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setSaving(true);
            setError("");
            try {
              await request(
                "/api/register",
                clinic
                  ? {
                      kind,
                      name: f.get("name"),
                      plans,
                      specialty: f.get("specialty"),
                      city: f.get("city"),
                    }
                  : { kind, name: f.get("name"), plan: f.get("plan") },
              );
              await onDone(kind);
            } catch (err) {
              setError((err as Error).message);
              setSaving(false);
            }
          }}
        >
          <label>
            {clinic ? "Clinic name *" : "Patient name *"}
            <input
              name="name"
              required
              minLength={2}
              maxLength={60}
              autoComplete="off"
              placeholder={
                clinic ? "e.g. Bayview Family Clinic" : "e.g. Morgan Lee"
              }
            />
          </label>
          <label>
            Demo password *
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder="••••••"
            />
            <small className="muted">
              Not saved or checked — please don’t use a real password.
            </small>
          </label>
          {clinic ? (
            <>
              <fieldset>
                <legend>Accepted demo insurance *</legend>
                <div className="check-row">
                  {PLANS.map((p) => (
                    <label key={p} className="inline-check">
                      <input
                        type="checkbox"
                        checked={plans.includes(p)}
                        onChange={(e) =>
                          setPlans(
                            e.target.checked
                              ? [...plans, p]
                              : plans.filter((x) => x !== p),
                          )
                        }
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="form-grid">
                <label>
                  Specialty *
                  <select name="specialty" required defaultValue={SERVICES[0]}>
                    {SERVICES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Location *
                  <select name="city" required defaultValue={cities[0]}>
                    {cities.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : (
            <label>
              Demo insurance *
              <select name="plan" required defaultValue={PLANS[0]}>
                {PLANS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <p role="alert" className="alert error">
              {error}
            </p>
          )}
          <div className="demo-note">
            <ShieldCheck size={16} /> Synthetic demo data only. No real
            identities, insurance checks or payments.
          </div>
          <button
            className="primary full"
            disabled={saving || (clinic && plans.length === 0)}
          >
            {saving
              ? "Creating…"
              : clinic
                ? "Register clinic"
                : "Register patient"}
            <ArrowRight size={17} />
          </button>
        </form>
      </section>
    </main>
  );
}
