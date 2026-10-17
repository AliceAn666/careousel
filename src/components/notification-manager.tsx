"use client";
import { useEffect, useRef, useState } from "react";
import type { AppState } from "@/lib/types";
import type { getSequencePreview } from "@/server/services/notification-sequences";
import { request } from "@/lib/api";
import { dateLabel } from "@/lib/config";
import { priorityLabel } from "@/lib/waitlist-priority";
type Preview = Awaited<ReturnType<typeof getSequencePreview>>;
export function NotificationManager({ state }: { state: AppState }) {
  const routeHandled = useRef(false);
  const [selected, setSelected] = useState("earlier");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  const [firstGroup, setFirstGroup] = useState(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sequences, setSequences] = useState(state.sequences);
  const [clock, setClock] = useState(0);
  const slot = state.slots.find((s) => s.id === selected) ?? state.slots[0];
  const sequence = sequences.find((s) => s.slotId === slot?.id);
  useEffect(() => {
    if (routeHandled.current) return;
    routeHandled.current = true;
    const linkedSlot = new URLSearchParams(window.location.search).get("slotId");
    const requested = state.slots.find(
      (s) => s.id === linkedSlot && s.status === "AVAILABLE",
    );
    if (!requested) return;
    void Promise.resolve().then(() => setSelected(requested.id));
    // Preview is read-only. Staff must still explicitly authorize recipients.
    void request(
      `/api/notification-sequences?slotId=${encodeURIComponent(requested.id)}`,
      undefined,
      "GET",
    )
      .then((data: Preview) => setPreview(data))
      .catch((e) =>
        setError(
          e instanceof Error
            ? e.message
            : "Unable to preview priority groups for this opening.",
        ),
      );
  }, [state.slots]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      void request("/api/state", undefined, "GET")
        .then((data) => setSequences(data.sequences))
        .catch(() =>
          setError(
            "Cannot refresh notification history. Retry preview or refresh the page.",
          ),
        );
    }, 10_000);
    return () => clearInterval(timer);
  }, []);
  async function refresh() {
    const data = await request("/api/state", undefined, "GET");
    setSequences(data.sequences);
  }
  async function control(operation: "start" | "pause" | "resume" | "cancel") {
    if (!slot) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await request(
        "/api/notification-sequences",
        operation === "start"
          ? {
              operation,
              slotId: slot.id,
              previewToken: preview?.previewToken,
              approvedWaitlistIds: approved,
              firstGroup,
              reason,
            }
          : { operation, slotId: slot.id },
      );
      setMessage(result.message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card stack" aria-label="Automatic group notifications">
      <h2>Automatic priority-group notifications</h2>
      <p>
        One shared cross-clinic pool. No clinic gets an internal-first window.
        Only staff-approved P1–P4 recipients participate; AI never determines
        urgency.
      </p>
      <label>
        Manage opening
        <select
          value={slot?.id ?? ""}
          onChange={(e) => {
            setSelected(e.target.value);
            setPreview(null);
            setApproved([]);
            setError("");
            setMessage("");
          }}
        >
          {state.slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.service} · {dateLabel(s.start)} · {s.status}
            </option>
          ))}
        </select>
      </label>
      <p>
        Available capacity: {slot?.status === "AVAILABLE" ? "1" : "0"}.
        Single-capacity opening.
      </p>
      {slot &&
        slot.status === "AVAILABLE" &&
        (!sequence ||
          ["PAUSED", "CANCELLED", "COMPLETED"].includes(sequence.state)) && (
          <>
            <p>
              Draft / reauthorization — preview and approve exact recipients
              before authorizing the complete automatic sequence.
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setError("");
                setBusy(true);
                try {
                  const data: Preview = await request(
                    `/api/notification-sequences?slotId=${encodeURIComponent(slot.id)}`,
                    undefined,
                    "GET",
                  );
                  setPreview(data);
                  setApproved([]);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Preview failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Preview groups and exclusions
            </button>
            {preview && (
              <>
                <label>
                  First group
                  <select
                    value={firstGroup}
                    onChange={(e) => {
                      setFirstGroup(Number(e.target.value));
                      setApproved([]);
                    }}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        P{n}
                      </option>
                    ))}
                  </select>
                </label>
                {[1, 2, 3, 4].map((n) => (
                  <fieldset key={n}>
                    <legend>{priorityLabel(`P${n}`)}</legend>
                    {preview.candidates
                      .filter((c) => c.level === `P${n}` && !c.excluded)
                      .map((c) => (
                        <label
                          key={c.waitlistId}
                          className="sequence-recipient"
                        >
                          <input
                            type="checkbox"
                            checked={approved.includes(c.waitlistId)}
                            disabled={n < firstGroup}
                            onChange={(e) =>
                              setApproved((ids) =>
                                e.target.checked
                                  ? [...ids, c.waitlistId]
                                  : ids.filter((id) => id !== c.waitlistId),
                              )
                            }
                          />
                          {c.name} — {c.reasons.join("; ")}
                        </label>
                      ))}
                    {!preview.candidates.some(
                      (c) => c.level === `P${n}` && !c.excluded,
                    ) && (
                      <p>
                        No eligible approved recipients. Group will be skipped
                        without a send timestamp.
                      </p>
                    )}
                  </fieldset>
                ))}
                <details>
                  <summary>Exclusions / awaiting priority review</summary>
                  {preview.candidates
                    .filter((c) => c.excluded)
                    .map((c) => (
                      <p key={c.waitlistId}>
                        {c.name}: {c.excluded}
                      </p>
                    ))}
                </details>
                <label>
                  Authorization reason
                  <input
                    value={reason}
                    minLength={3}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <p>
                  This authorizes the selected recipients now and later groups
                  automatically, at least 180 minutes after each actual send.
                  Invitations compete for one opening and expire after 12 hours
                  or appointment start, whichever is earlier.
                </p>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !approved.length ||
                    reason.trim().length < 3 ||
                    !preview.capacity
                  }
                  onClick={() => void control("start")}
                >
                  Authorize and start automatic sequence
                </button>
              </>
            )}
          </>
        )}
      {sequence && (
        <>
          <p>
            <strong>Sequence: {sequence.state}</strong> · Current / last group:{" "}
            {sequence.groups.filter((g) => g.status === "SENT").at(-1)?.level ??
              "None"}
          </p>
          <p>
            Next scheduled send:{" "}
            {sequence.nextSendAt ? dateLabel(sequence.nextSendAt) : "None"}
            {sequence.nextSendAt && clock > 0
              ? ` · ${Math.max(0, Math.ceil((+new Date(sequence.nextSendAt) - clock) / 60_000))} minutes remaining (server enforces timing)`
              : ""}
          </p>
          {slot && +new Date(slot.start) - clock < 190 * 60_000 && (
            <p role="status">
              Warning: appointment is close; another group may not have a full
              response window.
            </p>
          )}
          <div className="button-row">
            {["ACTIVE", "SCHEDULED"].includes(sequence.state) && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void control("pause")}
              >
                Pause sequence
              </button>
            )}
            {sequence.state === "PAUSED" && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void control("resume")}
              >
                Resume approved sequence
              </button>
            )}
            {sequence.state !== "CANCELLED" && slot?.status === "AVAILABLE" && (
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Cancel remaining sends and invalidate all pending invitations?",
                    )
                  )
                    void control("cancel");
                }}
              >
                Cancel sequence
              </button>
            )}
          </div>
          {sequence.groups.map((g) => (
            <article key={g.id} className="request-card">
              <h3>
                {g.level} · {g.status}
              </h3>
              <p>
                {g.sentAt ? `Actually sent ${dateLabel(g.sentAt)}` : "Not sent"}{" "}
                · {g.note}
              </p>
              <ul>
                {state.offers
                  .filter((o) => o.groupId === g.id)
                  .map((o) => (
                    <li key={o.id}>
                      Request {o.waitlistId}: {o.status} — expires{" "}
                      {dateLabel(o.expiresAt)}
                    </li>
                  ))}
              </ul>
            </article>
          ))}
        </>
      )}
      {state.notifications.map((n) => (
        <p key={n.id} role="status">
          {n.title}: {n.body}
        </p>
      ))}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
