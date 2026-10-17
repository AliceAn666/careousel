"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { medicalRecordsDashboard } from "@/server/services/medical-records";
import { importedTagFields, SYNTHETIC_SOURCE } from "@/lib/record-import";
import { SERVICES, dateLabel } from "@/lib/config";
import { request } from "@/lib/api";
type Serialized<T> = T extends Date
  ? string
  : T extends object
    ? { [K in keyof T]: Serialized<T[K]> }
    : T;
type Data = Serialized<Awaited<ReturnType<typeof medicalRecordsDashboard>>>;
type Suggestion = Data["suggestions"][number];
function SuggestionReview({
  suggestion,
  active,
  clinician,
  busy,
  act,
}: {
  suggestion: Suggestion;
  active: boolean;
  clinician: boolean;
  busy: boolean;
  act: (input: unknown) => Promise<void>;
}) {
  const fields = importedTagFields.parse(suggestion.fields);
  return (
    <article
      className="card stack"
      aria-label={`Record suggestion ${fields.service}`}
    >
      <h3>
        {fields.label} ·{" "}
        {suggestion.state === "PENDING"
          ? "UNCONFIRMED SUGGESTION"
          : suggestion.state === "APPROVED"
            ? "CLINICIAN CONFIRMED"
            : "REJECTED"}
      </h3>
      <p>
        Source record {suggestion.recordId} · {suggestion.method} · Version{" "}
        {suggestion.version}
      </p>
      <blockquote>{suggestion.excerpt}</blockquote>
      <p>{suggestion.explanation}</p>
      <p>
        Suggestions are not diagnoses, urgency assessments or approved
        scheduling priorities.
      </p>
      {suggestion.tagId && (
        <p>
          Confirmed medical tag {suggestion.tagId}. Manage subsequent edits
          under Medical tags; P1–P4 remains a separate staff decision.
        </p>
      )}
      {clinician && active && suggestion.state === "PENDING" ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const date = (key: string) =>
              form.get(key)
                ? new Date(`${String(form.get(key))}Z`).toISOString()
                : null;
            const decision =
              (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
                "value",
              ) ?? "SAVE";
            void act({
              type: "review",
              suggestionId: suggestion.id,
              expectedVersion: suggestion.version,
              decision,
              reason: form.get("reason"),
              fields: {
                kind: fields.kind,
                label: form.get("label"),
                service: form.get("service"),
                clinicalNotes: form.get("clinicalNotes"),
                followUpRecommendation: form.get("followUpRecommendation"),
                recommendedFrom: date("recommendedFrom"),
                recommendedBy: date("recommendedBy"),
                requiresReferral: form.has("requiresReferral"),
                requiresAuthorization: form.has("requiresAuthorization"),
              },
            });
          }}
        >
          <label>
            Review tag label
            <input
              name="label"
              defaultValue={fields.label}
              required
              minLength={3}
              maxLength={160}
            />
          </label>
          <label>
            Review service
            <select name="service" defaultValue={fields.service}>
              {SERVICES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Review clinical notes
            <textarea
              name="clinicalNotes"
              defaultValue={fields.clinicalNotes}
              maxLength={4000}
            />
          </label>
          <label>
            Review follow-up recommendation
            <textarea
              name="followUpRecommendation"
              defaultValue={fields.followUpRecommendation}
              maxLength={4000}
            />
          </label>
          <label>
            Review recommended from (UTC)
            <input
              type="datetime-local"
              name="recommendedFrom"
              defaultValue={fields.recommendedFrom?.slice(0, 16)}
            />
          </label>
          <label>
            Review recommended by (UTC)
            <input
              type="datetime-local"
              name="recommendedBy"
              defaultValue={fields.recommendedBy?.slice(0, 16)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="requiresReferral"
              defaultChecked={fields.requiresReferral}
            />{" "}
            Referral requirement evidence
          </label>
          <label>
            <input
              type="checkbox"
              name="requiresAuthorization"
              defaultChecked={fields.requiresAuthorization}
            />{" "}
            Prior authorization requirement evidence
          </label>
          <label>
            Review reason
            <input name="reason" required minLength={3} maxLength={500} />
          </label>
          <div>
            <button disabled={busy} name="decision" value="SAVE">
              Save corrected suggestion
            </button>{" "}
            <button
              className="primary"
              disabled={busy}
              name="decision"
              value="APPROVE"
            >
              Approve extracted tag
            </button>{" "}
            <button disabled={busy} name="decision" value="REJECT">
              Reject suggestion
            </button>
          </div>
        </form>
      ) : (
        <p>
          {fields.followUpRecommendation} Referral:{" "}
          {fields.requiresReferral ? "required" : "not specified"};
          authorization:{" "}
          {fields.requiresAuthorization ? "required" : "not specified"}.
          Recommended{" "}
          {fields.recommendedFrom
            ? dateLabel(fields.recommendedFrom)
            : "no start"}{" "}
          →{" "}
          {fields.recommendedBy
            ? dateLabel(fields.recommendedBy)
            : "no deadline"}
          .
        </p>
      )}
    </article>
  );
}
export function MedicalRecords({
  patient = false,
  onChanged,
}: {
  patient?: boolean;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState({ q: "", mode: "fulltext" });
  const requestId = useRef<string | null>(null);
  const load = useCallback(
    async (query = { q: "", mode: "fulltext" }, signal?: AbortSignal) => {
      const response = await fetch(
        `/api/medical-records?${new URLSearchParams(query)}`,
        { cache: "no-store", signal },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      return body as Data;
    },
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(undefined, controller.signal)
      .then((d) => {
        if (!controller.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [load]);
  async function act(input: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await request("/api/medical-records", input);
      setMessage(result.message);
      setSearch({ q: "", mode: "fulltext" });
      setData(await load());
      requestId.current = null;
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack" aria-label="Synthetic medical records">
      <h2>Patient-authorized synthetic medical records</h2>
      <p>
        Careousel Synthetic FHIR-compatible Source v1. Synthetic examples only:
        no hospital connection, real-record upload or external AI service.
        Historical sample diagnoses are not diagnoses for you.
      </p>
      <p>
        Sample records include a historical condition, follow-up instructions,
        service needs, referral requirements and recommended timeframes. New
        patients do not need previous Careousel tags or appointments.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            onClick={() =>
              void load(search)
                .then(setData)
                .catch((e) => setError(e.message))
            }
          >
            Retry records
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!data && !error && <p role="status">Loading authorized records…</p>}
      {data && (
        <>
          <p>{data.retention}</p>
          {patient && (
            <form
              className="card stack"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                requestId.current ??= crypto.randomUUID();
                void act({
                  type: "authorizeImport",
                  clinicId: form.get("clinicId"),
                  source: SYNTHETIC_SOURCE,
                  consent: form.has("consent"),
                  consentVersion: "SYNTHETIC_V1",
                  requestId: requestId.current,
                });
              }}
            >
              <h3>Authorize a synthetic sample import</h3>
              <label>
                Clinic allowed to use this import
                <select name="clinicId" required>
                  <option value="">Choose one clinic</option>
                  {data.clinics.map((c) => (
                    <option
                      key={c.id}
                      value={c.id}
                      disabled={data.imports.some(
                        (i) => i.clinicId === c.id && i.state === "ACTIVE",
                      )}
                    >
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input type="checkbox" name="consent" required /> I authorize
                importing these synthetic records for this clinic’s clinicians
                to review, with confirmed scheduling evidence available to that
                clinic’s staff. I understand local extraction is optional, no
                external AI is used, and source/audit records are retained after
                I revoke access.
              </label>
              <button className="primary" disabled={busy}>
                Authorize and import synthetic records
              </button>
            </form>
          )}
          <form
            className="card stack"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const query = {
                q: String(form.get("q")),
                mode: String(form.get("mode")),
              };
              setSearch(query);
              void load(query)
                .then(setData)
                .catch((e) => setError(e.message));
            }}
          >
            <label>
              Search imported record text
              <input
                name="q"
                type="search"
                maxLength={160}
                placeholder="follow-up, referral, Cardiology…"
              />
            </label>
            <label>
              Record search method
              <select name="mode">
                <option value="fulltext">PostgreSQL full-text</option>
                <option value="keyword">Literal keyword</option>
              </select>
            </label>
            <button disabled={busy}>Search records</button>
          </form>
          {!data.imports.length && (
            <p>
              No authorized imports yet. Booking and waitlists remain available
              without importing records.
            </p>
          )}
          {data.imports.map((i) => (
            <article
              className="card stack"
              key={i.id}
              aria-label={`Import ${i.id}`}
            >
              <h3>
                {data.clinics.find((c) => c.id === i.clinicId)?.name} ·{" "}
                {i.state}
              </h3>
              <p>
                Source {i.source} · Consent {i.consentVersion} ·{" "}
                {dateLabel(i.consentedAt)} · Version {i.version}
                {!patient &&
                  ` · ${data.patients.find((p) => p.id === i.patientId)?.name}`}
              </p>
              {i.state === "ACTIVE" ? (
                <div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act({
                        type: "extract",
                        importId: i.id,
                        mode: "LOCAL_RULES",
                      })
                    }
                  >
                    Extract local suggestions
                  </button>{" "}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act({
                        type: "extract",
                        importId: i.id,
                        mode: "LOCAL_AI",
                      })
                    }
                  >
                    Try optional local AI with fallback
                  </button>{" "}
                  {patient && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            "Revoke this clinic’s access? Imported tags stop informing scheduling; source records and audit history remain privately retained.",
                          )
                        )
                          void act({
                            type: "revoke",
                            importId: i.id,
                            expectedVersion: i.version,
                          });
                      }}
                    >
                      Revoke record consent
                    </button>
                  )}
                </div>
              ) : (
                <p>
                  Archived for your private inspection. Clinic access,
                  extraction and imported-tag evidence use have stopped.
                </p>
              )}
              {data.records
                .filter((r) => r.importId === i.id)
                .map((r) => (
                  <details key={r.id}>
                    <summary>
                      {r.resourceType} · {r.resourceId}
                    </summary>
                    <p>{r.text}</p>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {JSON.stringify(r.resource, null, 2)}
                    </pre>
                    <small style={{ overflowWrap: "anywhere" }}>
                      Source hash {r.contentHash}
                    </small>
                  </details>
                ))}
              {data.suggestions
                .filter((s) => s.importId === i.id)
                .map((s) => (
                  <SuggestionReview
                    key={`${s.id}:${s.version}`}
                    suggestion={s}
                    active={i.state === "ACTIVE"}
                    clinician={data.clinician}
                    busy={busy}
                    act={act}
                  />
                ))}
              <details>
                <summary>Record consent and review audit history</summary>
                {data.audits
                  .filter((a) => a.importId === i.id)
                  .map((a) => (
                    <p key={a.id}>
                      {a.action} · {dateLabel(a.createdAt)} · Actor {a.actorId}
                      <span style={{ overflowWrap: "anywhere" }}>
                        {" "}
                        · {JSON.stringify(a.details)}
                      </span>
                    </p>
                  ))}
              </details>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
