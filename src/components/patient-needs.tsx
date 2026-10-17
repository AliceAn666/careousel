"use client";
import { useCallback, useEffect, useState } from "react";
import type { patientNeedsDashboard } from "@/server/services/patient-needs";
import { needPreferences } from "@/lib/patient-needs";
import type { Action } from "@/lib/types";
import { SERVICES, dateLabel, money } from "@/lib/config";
type Serialized<T> = T extends Date
  ? string
  : T extends object
    ? { [K in keyof T]: Serialized<T[K]> }
    : T;
type Data = Serialized<Awaited<ReturnType<typeof patientNeedsDashboard>>>;
type Need = Data["needs"][number];
function PreferenceFields({
  need,
  plan,
  tags,
  clinics,
}: {
  need?: Need;
  plan: string;
  tags: Data["tags"];
  clinics: Data["clinics"];
}) {
  const now = new Date();
  const p = need
    ? needPreferences.parse(need.preferences)
    : {
        plan,
        city: "",
        clinicIds: [] as string[],
        maxPrice: 20000,
        earliest: now,
        latest: new Date(+now + 90 * 86400000),
        startHour: 0,
        endHour: 24,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      };
  return (
    <>
      <label>
        Need title
        <input
          name="title"
          defaultValue={need?.title}
          required
          minLength={3}
          maxLength={160}
        />
      </label>
      {!need && (
        <label>
          Need service
          <select name="service">
            {SERVICES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      <p>
        Saved insurance: {plan}. Clinics with potential incompatibilities remain
        visible with warnings; a warning is not booking clearance.
      </p>
      <input type="hidden" name="plan" value={plan} />
      <details>
        <summary>
          Search preferences and supporting requirements (optional)
        </summary>
        <label>
          Preferred city (optional)
          <input name="city" defaultValue={p.city} maxLength={80} />
        </label>
        <fieldset>
          <legend>
            Preferred clinics (none selected means the shared network)
          </legend>
          {clinics.map((c) => (
            <label key={c.id}>
              <input
                name="clinicIds"
                type="checkbox"
                value={c.id}
                defaultChecked={p.clinicIds.includes(c.id)}
              />
              {c.name} · {c.city}
            </label>
          ))}
        </fieldset>
        <label>
          Maximum listed price ($)
          <input
            name="maxPrice"
            type="number"
            min={0}
            max={10000}
            defaultValue={p.maxPrice / 100}
            required
          />
        </label>
        <label>
          Search from (UTC)
          <input
            name="earliest"
            type="datetime-local"
            defaultValue={p.earliest.toISOString().slice(0, 16)}
            required
          />
        </label>
        <label>
          Search until (UTC)
          <input
            name="latest"
            type="datetime-local"
            defaultValue={p.latest.toISOString().slice(0, 16)}
            required
          />
        </label>
        <label>
          Earliest clinic-local hour
          <input
            name="startHour"
            type="number"
            min={0}
            max={23}
            defaultValue={p.startHour}
            required
          />
        </label>
        <label>
          Latest clinic-local hour
          <input
            name="endHour"
            type="number"
            min={1}
            max={24}
            defaultValue={p.endHour}
            required
          />
        </label>
        <fieldset>
          <legend>Preferred weekdays</legend>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <label key={d} style={{ display: "inline-flex", marginRight: 12 }}>
              <input
                name="weekdays"
                type="checkbox"
                value={i}
                defaultChecked={p.weekdays.includes(i)}
              />
              {d}
            </label>
          ))}
        </fieldset>
        <label>
          <input
            name="requiresReferral"
            type="checkbox"
            defaultChecked={need?.requiresReferral}
          />{" "}
          Referral requirement (patient-reported; not clinical approval)
        </label>
        <label>
          <input
            name="requiresAuthorization"
            type="checkbox"
            defaultChecked={need?.requiresAuthorization}
          />{" "}
          Prior authorization requirement (patient-reported; not clearance)
        </label>
        <fieldset>
          <legend>
            Approved medical tags as supporting evidence (choose matching
            service)
          </legend>
          {!tags.length && (
            <p>No approved tags. You can still book or join a waitlist.</p>
          )}
          {tags.map((t) => (
            <label key={t.id}>
              <input
                type="checkbox"
                name="tagIds"
                value={t.id}
                defaultChecked={need?.evidence.some((e) => e.tagId === t.id)}
              />
              {t.label} · {t.need.service} ·{" "}
              {t.sourceType === "CLINICIAN_VISIT"
                ? "clinician visit"
                : "clinician-reviewed synthetic record"}
            </label>
          ))}
        </fieldset>
      </details>
    </>
  );
}
function ExternalFields({
  external,
}: {
  external?: NonNullable<Need["externalAppointment"]>;
}) {
  return (
    <>
      <label>
        External clinic name
        <input
          name="clinicName"
          required
          defaultValue={external?.clinicName}
          minLength={2}
          maxLength={160}
        />
      </label>
      <label>
        External appointment date and time (UTC)
        <input
          name="externalStart"
          type="datetime-local"
          defaultValue={external?.start.slice(0, 16)}
          required
        />
      </label>
      <label>
        Reported appointment duration (minutes)
        <input
          name="duration"
          type="number"
          min={1}
          max={1440}
          defaultValue={
            external
              ? (+new Date(external.end) - +new Date(external.start)) / 60000
              : 30
          }
        />
      </label>
      <label>
        External clinic location
        <input
          name="location"
          defaultValue={external?.location}
          required
          minLength={2}
          maxLength={240}
        />
      </label>
      <label>
        External appointment reference (optional)
        <input
          name="reference"
          defaultValue={external?.reference}
          maxLength={160}
        />
      </label>
      <label>
        <input
          type="checkbox"
          name="reportedConfirmed"
          defaultChecked={external?.reportedConfirmed}
        />{" "}
        I report that the external appointment is confirmed (unverified)
      </label>
    </>
  );
}
function preferences(form: FormData) {
  return {
    plan: form.get("plan"),
    city: form.get("city"),
    clinicIds: form.getAll("clinicIds").map(String),
    maxPrice: Math.round(Number(form.get("maxPrice")) * 100),
    earliest: new Date(`${form.get("earliest")}Z`).toISOString(),
    latest: new Date(`${form.get("latest")}Z`).toISOString(),
    startHour: Number(form.get("startHour")),
    endHour: Number(form.get("endHour")),
    weekdays: form.getAll("weekdays").map(Number),
  };
}
function external(form: FormData) {
  const start = new Date(`${form.get("externalStart")}Z`);
  return {
    clinicName: form.get("clinicName"),
    start: start.toISOString(),
    end: new Date(+start + Number(form.get("duration")) * 60000).toISOString(),
    location: form.get("location"),
    reference: form.get("reference"),
    reportedConfirmed: form.has("reportedConfirmed"),
  };
}
export function PatientNeeds({ act }: { act: Action }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [formVersion, setFormVersion] = useState(0),
    [editing, setEditing] = useState<string | null>(null),
    [searching, setSearching] = useState<string | null>(null),
    [original, setOriginal] = useState("NONE");
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/patient-needs", {
      cache: "no-store",
      signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    return body as Data;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then((d) => {
        if (!controller.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [load]);
  async function perform(input: unknown) {
    setBusy(true);
    setError("");
    try {
      if (await act(input)) {
        setData(await load());
        setFormVersion((v) => v + 1);
        setEditing(null);
        setOriginal("NONE");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function save(form: FormData, need?: Need) {
    void perform({
      type: need ? "editNeed" : "createNeed",
      ...(need
        ? { needId: need.id, expectedVersion: need.version }
        : {
            service: form.get("service"),
            original:
              original === "EXTERNAL"
                ? { type: "EXTERNAL", appointment: external(form) }
                : original === "INTERNAL"
                  ? {
                      type: "INTERNAL",
                      bookingId: form.get("originalBookingId"),
                    }
                  : { type: "NONE" },
          }),
      title: form.get("title"),
      preferences: preferences(form),
      requiresReferral: form.has("requiresReferral"),
      requiresAuthorization: form.has("requiresAuthorization"),
      tagIds: form.getAll("tagIds"),
    });
  }
  return (
    <section
      className="stack"
      aria-label="Independent medical needs"
      aria-busy={!data && !error}
    >
      <div className="card">
        <h2>Your independent medical needs</h2>
        <p>
          Manage each service and original appointment separately. Completing
          one need never cancels another need or appointment. No symptoms or
          record import are required.
        </p>
        <p>
          External appointments are patient-reported and unverified. Careousel
          cannot contact, verify or cancel them. After securing new care,
          contact the original clinic yourself.
        </p>
      </div>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            onClick={() =>
              void load()
                .then(setData)
                .catch((e) => setError(e.message))
            }
          >
            Refresh needs
          </button>
        </p>
      )}
      {!data && !error && <p aria-live="polite">Loading medical needs…</p>}
      {data && (
        <>
          <details className="card">
            <summary>Add an independent medical need</summary>
            <form
              className="stack"
              key={formVersion}
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  save(new FormData(event.currentTarget));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <PreferenceFields
                plan={data.plan}
                tags={data.tags}
                clinics={data.clinics}
              />
              <label>
                Original appointment source
                <select
                  value={original}
                  onChange={(e) => setOriginal(e.target.value)}
                >
                  <option value="NONE">No original appointment</option>
                  <option value="INTERNAL">
                    Confirmed Careousel appointment
                  </option>
                  <option value="EXTERNAL">
                    Booked outside Careousel — unverified
                  </option>
                </select>
              </label>
              {original === "INTERNAL" && (
                <label>
                  Original Careousel appointment
                  <select name="originalBookingId" required>
                    {data.bookings.map((b) => (
                      <option value={b.id} key={b.id}>
                        {b.slot.service} · {b.slot.clinic.name} ·{" "}
                        {dateLabel(b.slot.start)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {original === "EXTERNAL" && <ExternalFields />}
              <button className="primary" disabled={busy}>
                Save independent need
              </button>
            </form>
          </details>
          {!data.needs.length && (
            <p>
              No independent needs yet. Existing appointments and legacy
              waitlists below remain unchanged.
            </p>
          )}
          {data.needs.map((need) => (
            <article
              className="card stack"
              key={need.id}
              aria-label={`Medical need ${need.title}`}
            >
              <h3>{need.title}</h3>
              <p>
                {need.service} · {need.state} · Version {need.version}
              </p>
              {need.currentBooking?.status === "CONFIRMED" && (
                <p>
                  Confirmed Careousel appointment:{" "}
                  {need.currentBooking.slot.clinic.name} ·{" "}
                  {dateLabel(need.currentBooking.slot.start)}. Managed by
                  Careousel.
                </p>
              )}
              {need.originalBooking && (
                <p>
                  Original Careousel record:{" "}
                  {need.originalBooking.slot.clinic.name} ·{" "}
                  {dateLabel(need.originalBooking.slot.start)} ·{" "}
                  {need.originalBooking.status}.
                </p>
              )}
              {need.externalAppointment && (
                <div className="info-banner">
                  <div>
                    <strong>
                      External appointment — patient-reported, unverified
                    </strong>
                    <p>
                      {need.externalAppointment.clinicName} ·{" "}
                      {need.externalAppointment.location} ·{" "}
                      {dateLabel(need.externalAppointment.start)}
                    </p>
                    <p>
                      {need.externalAppointment.reportedCancelled
                        ? "You report cancellation outside Careousel, not independently verified"
                        : need.externalAppointment.reportedConfirmed
                          ? "You report it is confirmed; original external appointment remains unchanged"
                          : "You have not reported confirmation; do not assume care is reserved"}
                      . Reference:{" "}
                      {need.externalAppointment.reference || "not supplied"}.
                    </p>
                    {need.state === "SECURED" &&
                      !need.externalAppointment.reportedCancelled && (
                        <p>
                          New care secured. Contact the original clinic yourself
                          about keeping or cancelling the external appointment;
                          Careousel has not cancelled it.
                        </p>
                      )}
                  </div>
                </div>
              )}
              <div className="button-row">
                {!["COMPLETED", "CLOSED"].includes(need.state) ? (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform({
                          type: "requestNeed",
                          needId: need.id,
                          expectedVersion: need.version,
                        })
                      }
                    >
                      Find earlier — join this need’s waitlist
                    </button>
                    <button
                      onClick={() =>
                        setSearching(searching === need.id ? null : need.id)
                      }
                    >
                      Browse appointments for this need
                    </button>
                    <button
                      onClick={() =>
                        setEditing(editing === need.id ? null : need.id)
                      }
                    >
                      Edit this need
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform({
                          type: "completeNeed",
                          needId: need.id,
                          expectedVersion: need.version,
                        })
                      }
                    >
                      Mark this need complete
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform({
                          type: "closeNeed",
                          needId: need.id,
                          expectedVersion: need.version,
                        })
                      }
                    >
                      Close this need
                    </button>
                  </>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform({
                        type: "reopenNeed",
                        needId: need.id,
                        expectedVersion: need.version,
                      })
                    }
                  >
                    Reopen this need
                  </button>
                )}
              </div>
              {editing === need.id && (
                <form
                  className="stack"
                  key={`edit:${need.id}:${need.version}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    save(new FormData(event.currentTarget), need);
                  }}
                >
                  <PreferenceFields
                    need={need}
                    plan={data.plan}
                    tags={data.tags}
                    clinics={data.clinics}
                  />
                  <p>
                    Saving withdraws only this need’s current request and
                    invitations for fresh staff review. Bookings remain
                    unchanged.
                  </p>
                  <button disabled={busy}>Save this need’s preferences</button>
                </form>
              )}
              {need.externalAppointment && (
                <details>
                  <summary>Correct my external appointment report</summary>
                  <form
                    className="stack"
                    onSubmit={(event) => {
                      event.preventDefault();
                      try {
                        const form = new FormData(event.currentTarget);
                        void perform({
                          type: "editExternal",
                          needId: need.id,
                          expectedVersion: need.version,
                          appointment: external(form),
                          reportedCancelled: form.has("reportedCancelled"),
                          reason: form.get("reason"),
                        });
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <ExternalFields external={need.externalAppointment} />
                    <label>
                      <input
                        name="reportedCancelled"
                        type="checkbox"
                        defaultChecked={
                          need.externalAppointment.reportedCancelled
                        }
                      />{" "}
                      I report that I cancelled it outside Careousel
                      (unverified)
                    </label>
                    <label>
                      Reason for correcting this report
                      <input
                        name="reason"
                        minLength={3}
                        maxLength={500}
                        required
                      />
                    </label>
                    <button disabled={busy}>
                      Save patient-reported correction
                    </button>
                  </form>
                </details>
              )}
              {need.waitlists.map((w) => (
                <div key={w.id}>
                  <p>
                    Request {w.id} · {w.status} ·{" "}
                    {w.priorities
                      .map(
                        (p) => `${p.clinicId}: ${p.level ?? "awaiting review"}`,
                      )
                      .join("; ") || "P1–P4 awaiting clinic review"}
                  </p>
                  {w.status === "ACTIVE" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform({ type: "withdraw", waitlistId: w.id })
                      }
                    >
                      Withdraw only this request
                    </button>
                  )}
                </div>
              ))}
              {searching === need.id && (
                <section
                  className="stack"
                  aria-label={`Appointments for ${need.title}`}
                >
                  <h4>{need.service} openings — earliest first</h4>
                  <p>
                    Potentially incompatible clinics remain visible.
                    Requirements and insurance must pass server checks; warnings
                    do not grant eligibility.
                  </p>
                  {!data.openings.some((s) => s.service === need.service) && (
                    <p>
                      No openings for this service. Keep this need’s shared
                      waitlist active.
                    </p>
                  )}
                  {data.openings
                    .filter((s) => s.service === need.service)
                    .map((s) => {
                      const p = needPreferences.parse(need.preferences);
                      const warnings = [
                        ...(!s.plans.includes(data.plan)
                          ? ["Insurance plan not listed — confirm coverage"]
                          : []),
                        ...(s.requiresReferral || need.requiresReferral
                          ? ["Clinic-approved referral required"]
                          : []),
                        ...(s.requiresAuthorization ||
                        need.requiresAuthorization
                          ? ["Clinic-approved prior authorization required"]
                          : []),
                        ...(s.price > p.maxPrice
                          ? ["Above this need’s preferred price"]
                          : []),
                        ...(p.city && p.city !== s.clinic.city
                          ? ["Outside preferred city"]
                          : []),
                      ];
                      return (
                        <div className="card" key={s.id}>
                          <h4>{s.clinic.name}</h4>
                          <p>
                            {s.clinic.city} · {dateLabel(s.start)} ·{" "}
                            {money(s.price)}
                          </p>
                          {warnings.map((w) => (
                            <p key={w} className="demo-note">
                              {w}
                            </p>
                          ))}
                          <button
                            disabled={busy}
                            onClick={() =>
                              void perform({
                                type: "book",
                                slotId: s.id,
                                needId: need.id,
                                expectedNeedVersion: need.version,
                              })
                            }
                          >
                            Book for this need
                          </button>
                        </div>
                      );
                    })}
                </section>
              )}
              <details>
                <summary>This need’s immutable history</summary>
                {need.history.map((h) => (
                  <div key={h.id}>
                    <p>
                      Version {h.version} · {h.action} ·{" "}
                      {dateLabel(h.createdAt)} · Actor {h.actorId}
                    </p>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {JSON.stringify(h.details, null, 2)}
                    </pre>
                  </div>
                ))}
              </details>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
