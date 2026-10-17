"use client";
import { useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import type { Action, AppState } from "@/lib/types";
import {
  PRIORITY_LEVELS,
  PRIORITY_LABELS,
  priorityLabel,
  type PriorityLevel,
} from "@/lib/waitlist-priority";
import { dateLabel } from "@/lib/config";
import { Empty } from "./ui";
import styles from "./request-priority.module.css";

type Request = AppState["priorityRequests"][number];
function RequestPriority({
  request,
  clinicId,
  act,
}: {
  request: Request;
  clinicId: string;
  act: Action;
}) {
  const current = request.priorities[0];
  const [level, setLevel] = useState<PriorityLevel | "">(""),
    [reason, setReason] = useState(""),
    [saving, setSaving] = useState(false);
  return (
    <article
      className={`card ${styles.request}`}
      aria-label={`${request.patient.name} ${request.service} request`}
    >
      <div>
        <span className="eyebrow">INDIVIDUAL WAITLIST REQUEST</span>
        <h3>
          {request.patient.name} · {request.service}
        </h3>
        <p className="muted">
          Request {request.id} ·{" "}
          {request.bookingId
            ? "Original appointment protected"
            : "No linked appointment"}
        </p>
        <p className={styles.badge}>{priorityLabel(current?.level)}</p>
        {current?.assignedBy && (
          <p className="muted">
            Approved by {current.assignedBy.name} ·{" "}
            {dateLabel(current.assignedAt!)}
          </p>
        )}
      </div>
      <form
        className={styles.form}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!level || saving) return;
          setSaving(true);
          try {
            if (
              await act({
                type: "setWaitlistPriority",
                waitlistId: request.id,
                clinicId,
                level,
                reason: reason.trim(),
                expectedVersion: current?.version ?? 0,
              })
            ) {
              setReason("");
              setLevel("");
            }
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          Request priority
          <select
            aria-label="Request priority"
            required
            value={level}
            onChange={(e) => setLevel(e.target.value as PriorityLevel | "")}
          >
            <option value="">Choose a reviewed level</option>
            {PRIORITY_LEVELS.map((value) => (
              <option value={value} key={value}>
                {value} — {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignment reason (synthetic information only)
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          className="primary"
          disabled={saving || !level || reason.trim().length < 3}
        >
          <Save size={16} />
          {saving ? "Saving…" : "Approve request priority"}
        </button>
      </form>
      {!!current?.history.length && (
        <details>
          <summary>Priority history ({current.history.length})</summary>
          <ol className={styles.history}>
            {current.history.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {priorityLabel(entry.previousLevel)} →{" "}
                  {priorityLabel(entry.level)}
                </strong>
                <p>{entry.reason}</p>
                <small>
                  {entry.actor.name} · {dateLabel(entry.createdAt)} · revision{" "}
                  {entry.version}
                </small>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
export function Priorities({ state, act }: { state: AppState; act: Action }) {
  const [filter, setFilter] = useState("ALL");
  const requests = state.priorityRequests.filter(
    (request) =>
      filter === "ALL" ||
      (request.priorities[0]?.level ?? "UNREVIEWED") === filter,
  );
  return (
    <>
      <div className="info-banner">
        <ShieldCheck />
        <div>
          <strong>Staff-reviewed request priorities</strong>
          <p>
            P1 Time-Sensitive · P2 High Priority · P3 Routine · P4 Flexible.
            Each level belongs to one request at your clinic. Patients and AI
            cannot assign clinical urgency. Unreviewed requests have no approved
            group.
          </p>
          <p>
            These are synthetic demonstration assignments. Saving a priority
            sends no invitation and changes no appointment. Eligibility and
            current FIFO matching remain unchanged.
          </p>
        </div>
      </div>
      <label className={styles.filter}>
        Show priority group
        <select
          aria-label="Show priority group"
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
      {!requests.length ? (
        <Empty
          title="No requests in this group"
          body="Requests appear when linked to your clinic, explicitly preferring it, or eligible for an opening here. Unreviewed requests need an authorized staff decision."
        />
      ) : (
        <div className="stack">
          {requests.map((request) => (
            <RequestPriority
              key={`${request.id}-${request.priorities[0]?.version ?? 0}`}
              request={request}
              clinicId={state.user!.clinicId!}
              act={act}
            />
          ))}
        </div>
      )}
    </>
  );
}
