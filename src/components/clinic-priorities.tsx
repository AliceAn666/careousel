"use client";
import { useState } from "react";
import { Plus, Save, Search } from "lucide-react";
import type { Action, AppState } from "@/lib/types";
import {
  PRIORITY_LEVELS,
  PRIORITY_LABELS,
  priorityLabel,
  type PriorityLevel,
} from "@/lib/waitlist-priority";
import { dateLabel } from "@/lib/config";
import { Empty, Modal, PriorityBadge } from "./ui";
import styles from "./request-priority.module.css";

type Request = AppState["priorityRequests"][number];

// One specialty row inside a patient card. The saved reason stays in the
// field; the synthetic referral/authorization approvals are kept but hidden.
function RequestRow({
  request,
  clinicId,
  act,
}: {
  request: Request;
  clinicId: string;
  act: Action;
}) {
  const current = request.priorities[0];
  const [level, setLevel] = useState<PriorityLevel | "">(
    (current?.level as PriorityLevel | null) ?? "",
  );
  const [reason, setReason] = useState(current?.reason ?? ""),
    [saving, setSaving] = useState(false);
  return (
    <form
      className={styles.row}
      aria-label={`${request.patient.name} ${request.service} request`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!level || saving) return;
        setSaving(true);
        try {
          await act({
            type: "setWaitlistPriority",
            waitlistId: request.id,
            clinicId,
            level,
            reason: reason.trim(),
            expectedVersion: current?.version ?? 0,
            referralApproved: current?.referralApproved ?? false,
            authorizationApproved: current?.authorizationApproved ?? false,
          });
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className={styles.service}>
        <strong>{request.service}</strong>
        <PriorityBadge level={current?.level} />
      </div>
      <label>
        Request priority
        <select
          aria-label={`Request priority for ${request.service}`}
          required
          value={level}
          onChange={(e) => setLevel(e.target.value as PriorityLevel | "")}
        >
          <option value="">Choose a level</option>
          {PRIORITY_LEVELS.map((value) => (
            <option value={value} key={value}>
              {value} — {PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Assignment reason
        <input
          aria-label={`Assignment reason for ${request.service}`}
          required
          minLength={3}
          maxLength={500}
          value={reason}
          placeholder="Synthetic information only"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        className="primary"
        disabled={saving || !level || reason.trim().length < 3}
      >
        <Save size={15} />
        {saving ? "Saving…" : "Save"}
      </button>
      {!!current?.history.length && (
        <details className={styles.more}>
          <summary>History ({current.history.length})</summary>
          <ol className={styles.history}>
            {current.history.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {priorityLabel(entry.previousLevel)} →{" "}
                  {priorityLabel(entry.level)}
                </strong>
                <p>{entry.reason}</p>
                <small>
                  {entry.actor.name} · {dateLabel(entry.createdAt)}
                </small>
              </li>
            ))}
          </ol>
        </details>
      )}
    </form>
  );
}

// Demo-only copy of the "Create visit medical tag" form. Nothing entered here
// is sent or stored anywhere.
function CreateMedicalTags({
  patient,
  services,
  onClose,
}: {
  patient: string;
  services: string[];
  onClose: () => void;
}) {
  const [done, setDone] = useState(false);
  return (
    <Modal title={`Create medical tags · ${patient}`} onClose={onClose}>
      <p className="demo-note">
        Feature preview only. Entries are not saved or shared.
      </p>
      {done ? (
        <>
          <p role="status">Preview complete — nothing was saved.</p>
          <button className="primary full" onClick={onClose}>
            Close
          </button>
        </>
      ) : (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            setDone(true);
          }}
        >
          <label>
            Visit service
            <select defaultValue={services[0]}>
              {services.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Medical need title
            <input required minLength={3} maxLength={160} />
          </label>
          <label>
            Tag type
            <select defaultValue="FOLLOW_UP">
              <option value="FOLLOW_UP">Follow-up</option>
              <option value="SERVICE_REQUIREMENT">Service requirement</option>
              <option value="CLINICAL_NOTE">Clinical note</option>
            </select>
          </label>
          <label>
            Tag label
            <input required minLength={3} maxLength={160} />
          </label>
          <label>
            Clinical notes
            <textarea maxLength={4000} />
          </label>
          <label>
            Scheduling follow-up recommendation
            <textarea maxLength={4000} />
          </label>
          <div className="form-grid">
            <label>
              Recommended from
              <input type="date" />
            </label>
            <label>
              Recommended by
              <input type="date" />
            </label>
          </div>
          <label>
            <input type="checkbox" name="requiresReferral" /> Referral required
            (evidence only)
          </label>
          <label>
            <input type="checkbox" name="requiresAuthorization" /> Prior
            authorization required (evidence only)
          </label>
          <label>
            Audit reason
            <input required minLength={3} maxLength={500} />
          </label>
          <button className="primary full">Save draft medical tag</button>
        </form>
      )}
    </Modal>
  );
}

export function Priorities({ state, act }: { state: AppState; act: Action }) {
  const [filter, setFilter] = useState("ALL"),
    [query, setQuery] = useState(""),
    [tagging, setTagging] = useState<string | null>(null);
  const requests = state.priorityRequests.filter(
    (request) =>
      (filter === "ALL" ||
        (request.priorities[0]?.level ?? "UNREVIEWED") === filter) &&
      request.patient.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  // One card per patient, one row per requested specialty.
  const patients = [
    ...requests
      .reduce((map, r) => {
        const key = r.patientId;
        map.set(key, [...(map.get(key) ?? []), r]);
        return map;
      }, new Map<string, Request[]>())
      .values(),
  ];
  const taggingPatient = patients.find((p) => p[0].patientId === tagging);
  return (
    <>
      <section className={`filter-card ${styles.filters}`}>
        <label>
          Priority group
          <select
            aria-label="Priority group"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="ALL">All requests</option>
            <option value="UNREVIEWED">Awaiting staff review</option>
            {PRIORITY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {priorityLabel(level)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Patient name
          <span className={styles.searchBox}>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search patient name"
              placeholder="Search patient name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </span>
        </label>
      </section>
      {!patients.length ? (
        <Empty
          title="No matching requests"
          body="Try another priority group or name. Requests appear when linked to your clinic, preferring it, or eligible for an opening here."
        />
      ) : (
        <div className={styles.patients}>
          {patients.map((rows) => (
            <article
              className={`card ${styles.patient}`}
              key={rows[0].patientId}
              aria-label={`${rows[0].patient.name} waitlist requests`}
            >
              <header className={styles.patientHeader}>
                <h3>{rows[0].patient.name}</h3>
                <button
                  className="secondary"
                  onClick={() => setTagging(rows[0].patientId)}
                >
                  <Plus size={15} />
                  Create medical tags
                </button>
              </header>
              {rows.map((request) => (
                <RequestRow
                  key={`${request.id}-${request.priorities[0]?.version ?? 0}`}
                  request={request}
                  clinicId={state.user!.clinicId!}
                  act={act}
                />
              ))}
            </article>
          ))}
        </div>
      )}
      {taggingPatient && (
        <CreateMedicalTags
          patient={taggingPatient[0].patient.name}
          services={[...new Set(taggingPatient.map((r) => r.service))]}
          onClose={() => setTagging(null)}
        />
      )}
    </>
  );
}
