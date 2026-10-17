"use client";
import { useCallback, useEffect, useState } from "react";
import type { medicalTagsDashboard } from "@/server/services/medical-tags";
import { request } from "@/lib/api";
import { dateLabel } from "@/lib/config";
type Data = JSONSerialized<Awaited<ReturnType<typeof medicalTagsDashboard>>>;
type JSONSerialized<T> = T extends Date
  ? string
  : T extends object
    ? { [K in keyof T]: JSONSerialized<T[K]> }
    : T;
type Tag = Data["tags"][number];
export function MedicalTags({ patient = false }: { patient?: boolean }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [formVersion, setFormVersion] = useState(0),
    [editing, setEditing] = useState<Tag | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/medical-tags", {
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
      .then((body) => {
        if (!controller.signal.aborted) setData(body);
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
      const result = await request("/api/medical-tags", input);
      setMessage(result.message);
      setEditing(null);
      setFormVersion((v) => v + 1);
      setData(await load());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack" aria-label="Medical tags">
      <h2>Clinician-authored medical tags</h2>
      <p>
        Visit evidence and follow-up recommendations. Clinic staff separately
        approve each request’s P1–P4 priority. Tags never assign urgency or
        change appointments.
      </p>
      {!patient && (
        <p>
          Clinical credential verification is simulated. Real accounts require
          an explicit clinical author grant from their clinic administrator. In
          Demo Mode, Cedar’s synthetic clinician can demonstrate this workflow.
        </p>
      )}
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
            Refresh medical tags
          </button>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!data && !error && <p role="status">Loading medical tags…</p>}
      {data && !data.canAuthor && !patient && (
        <p>
          Read-only approved scheduling evidence. Ask your administrator for
          clinical author permission to create, edit or review tags. Private
          clinical notes and drafts are hidden.
        </p>
      )}
      {data?.canAuthor && (
        <form
          className="card stack"
          key={`${editing?.id ?? "new"}:${formVersion}`}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const date = (key: string) =>
              form.get(key)
                ? new Date(`${form.get(key)}T12:00:00Z`).toISOString()
                : null;
            void act({
              type: editing ? "edit" : "create",
              ...(editing
                ? { tagId: editing.id, expectedVersion: editing.version }
                : {
                    sourceBookingId: form.get("sourceBookingId"),
                    needTitle: form.get("needTitle"),
                    ...(form.get("needId")
                      ? { needId: form.get("needId") }
                      : {}),
                  }),
              kind: form.get("kind"),
              label: form.get("label"),
              clinicalNotes: form.get("clinicalNotes"),
              followUpRecommendation: form.get("followUpRecommendation"),
              recommendedFrom: date("recommendedFrom"),
              recommendedBy: date("recommendedBy"),
              requiresReferral: form.has("requiresReferral"),
              requiresAuthorization: form.has("requiresAuthorization"),
              reason: form.get("reason"),
            });
          }}
        >
          <h3>
            {editing
              ? "Edit medical tag — returns to draft"
              : "Create visit medical tag"}
          </h3>
          {!editing && (
            <>
              <label>
                Visit source
                <select name="sourceBookingId" required>
                  <option value="">Choose a started visit</option>
                  {data.encounters.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.patient.name} · {e.slot.service} ·{" "}
                      {dateLabel(e.slot.start)} · {e.slot.provider}
                    </option>
                  ))}
                </select>
              </label>
              {!data.encounters.length && (
                <p>
                  No started visits available at your clinic. Future, cancelled
                  or replaced bookings cannot be used.
                </p>
              )}
              <label>
                Medical need title
                <input
                  name="needTitle"
                  required
                  minLength={3}
                  maxLength={160}
                />
              </label>
              <label>
                Existing medical need ID (optional)
                <input
                  name="needId"
                  placeholder="Leave blank to create a separate clinical need"
                />
              </label>
            </>
          )}
          <label>
            Tag type
            <select name="kind" defaultValue={editing?.kind ?? "FOLLOW_UP"}>
              <option value="FOLLOW_UP">Follow-up</option>
              <option value="SERVICE_REQUIREMENT">Service requirement</option>
              <option value="CLINICAL_NOTE">Clinical note</option>
            </select>
          </label>
          <label>
            Tag label
            <input
              name="label"
              required
              minLength={3}
              maxLength={160}
              defaultValue={editing?.label}
            />
          </label>
          <label>
            Clinical notes (patient and authorized clinicians only)
            <textarea
              name="clinicalNotes"
              maxLength={4000}
              defaultValue={
                editing && "clinicalNotes" in editing
                  ? editing.clinicalNotes
                  : ""
              }
            />
          </label>
          <label>
            Scheduling follow-up recommendation (shared with this clinic’s
            scheduling staff after approval)
            <textarea
              name="followUpRecommendation"
              maxLength={4000}
              defaultValue={editing?.followUpRecommendation}
            />
          </label>
          <label>
            Recommended from (UTC date)
            <input
              name="recommendedFrom"
              type="date"
              defaultValue={editing?.recommendedFrom?.slice(0, 10)}
            />
          </label>
          <label>
            Recommended by (UTC date)
            <input
              name="recommendedBy"
              type="date"
              defaultValue={editing?.recommendedBy?.slice(0, 10)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="requiresReferral"
              defaultChecked={editing?.requiresReferral}
            />{" "}
            Referral required (evidence only)
          </label>
          <label>
            <input
              type="checkbox"
              name="requiresAuthorization"
              defaultChecked={editing?.requiresAuthorization}
            />{" "}
            Prior authorization required (evidence only)
          </label>
          <label>
            Audit reason
            <input name="reason" required minLength={3} maxLength={500} />
          </label>
          <button
            className="primary"
            disabled={busy || (!editing && !data.encounters.length)}
          >
            Save draft medical tag
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(null)}>
              Cancel editing
            </button>
          )}
        </form>
      )}
      {data && !data.tags.length && (
        <p>
          No {data.canAuthor ? "medical" : "approved medical"} tags available.
          Appointment search and waitlists remain available.
        </p>
      )}
      {data?.tags.map((tag) => (
        <article
          className="card stack"
          key={tag.id}
          aria-label={`Medical tag ${tag.label}`}
        >
          <h3>
            {tag.label} · {tag.state}
          </h3>
          <p>
            Medical need: {tag.need.title} · {tag.need.service}
            {data.canAuthor && "id" in tag.need
              ? ` · Need ID ${tag.need.id}`
              : ""}
            {!patient && (
              <>
                {" "}
                · Patient{" "}
                {data.patients.find((p) => p.id === tag.patientId)?.name ??
                  tag.patientId}
              </>
            )}
          </p>
          <p>
            {tag.followUpRecommendation ||
              "No scheduling recommendation supplied."}
          </p>
          {"clinicalNotes" in tag && tag.clinicalNotes && (
            <p>Clinical notes: {tag.clinicalNotes}</p>
          )}
          <p>
            Timeframe:{" "}
            {tag.recommendedFrom
              ? dateLabel(tag.recommendedFrom)
              : "No start specified"}{" "}
            →{" "}
            {tag.recommendedBy
              ? dateLabel(tag.recommendedBy)
              : "No deadline specified"}
          </p>
          <p>
            Referral: {tag.requiresReferral ? "Required" : "Not specified"} ·
            Prior authorization:{" "}
            {tag.requiresAuthorization ? "Required" : "Not specified"}.
            Requirements still need staff verification.
          </p>
          <p>
            Source:{" "}
            {tag.sourceType === "SYNTHETIC_RECORD_REVIEW"
              ? `clinician-reviewed synthetic record import ${tag.sourceImportId}`
              : `clinician visit ${tag.sourceBookingId}`}{" "}
            · {data.clinics.find((c) => c.id === tag.clinicId)?.name}. Author:{" "}
            {data.authors.find((a) => a.id === tag.authorId)?.name}. Version{" "}
            {tag.version} · {dateLabel(tag.updatedAt)}
          </p>
          {"sourceExcerpt" in tag && tag.sourceExcerpt && (
            <blockquote>{tag.sourceExcerpt}</blockquote>
          )}
          {tag.reviewedAt && (
            <p>
              Reviewed by{" "}
              {data.authors.find((a) => a.id === tag.reviewedById)?.name} ·{" "}
              {dateLabel(tag.reviewedAt)}
            </p>
          )}
          {data.canAuthor && tag.state !== "RETIRED" && (
            <div className="button-row">
              <button disabled={busy} onClick={() => setEditing(tag)}>
                Edit medical tag
              </button>
              {tag.state === "DRAFT" && (
                <button
                  disabled={busy}
                  onClick={() => {
                    const reason = prompt(
                      "Reason for clinical review approval",
                    );
                    if (reason)
                      void act({
                        type: "approve",
                        tagId: tag.id,
                        expectedVersion: tag.version,
                        reason,
                      });
                  }}
                >
                  Approve medical tag
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => {
                  const reason = prompt("Reason for retiring medical tag");
                  if (reason)
                    void act({
                      type: "retire",
                      tagId: tag.id,
                      expectedVersion: tag.version,
                      reason,
                    });
                }}
              >
                Retire medical tag
              </button>
            </div>
          )}
          {"revisions" in tag && (
            <details>
              <summary>Medical tag audit history</summary>
              {tag.revisions?.map((r) => (
                <div key={r.id}>
                  <p>
                    Version {r.version} · {r.action} · Actor {r.actorId} ·{" "}
                    {dateLabel(r.createdAt)} · {r.reason}
                  </p>
                  <pre
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {JSON.stringify(r.snapshot, null, 2)}
                  </pre>
                </div>
              ))}
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
