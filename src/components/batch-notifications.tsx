"use client";
import { useI18n } from "./language-provider";
import { useState } from "react";
import type { Action, AppState } from "@/lib/types";
import { Status } from "./ui";

export function BatchComposer({
  slotId,
  candidates,
  act,
}: {
  slotId: string;
  candidates: AppState["candidates"];
  act: Action;
}) {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  return (
    <section className="card batch-composer">
      <h3>{t("Notify in groups")}</h3>
      <p>
        {t(
          "Choose the priority group yourself. Everyone in that group is notified together. If all decline or the response window ends, the general group is notified automatically. The first eligible confirmation wins the slot.",
        )}
      </p>
      <p className="demo-note">
        {t(
          "Priority is a staff decision, not an AI medical judgment. All selected patients must meet the same eligibility rules.",
        )}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const data = new FormData(e.currentTarget);
          const ids = (group: string) =>
            candidates
              .filter((c) => groups[c.waitlistId] === group)
              .map((c) => c.waitlistId);
          try {
            await act({
              type: "startBatch",
              slotId,
              priorityIds: ids("priority"),
              generalIds: ids("general"),
              intervalMinutes: Number(data.get("intervalMinutes")),
              reason: String(data.get("reason")),
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        {candidates.map((c) => (
          <label className="batch-candidate" key={c.waitlistId}>
            <span>{c.name}</span>
            <select
              aria-label={t(`Notification group for ${c.name}`)}
              value={groups[c.waitlistId] ?? "none"}
              onChange={(e) =>
                setGroups({ ...groups, [c.waitlistId]: e.target.value })
              }
            >
              <option value="none">{t("Not included")}</option>
              <option value="priority">{t("Priority group")}</option>
              <option value="general">{t("General group")}</option>
            </select>
          </label>
        ))}
        <label>
          {t("Response window per group (minutes)")}
          <input
            name="intervalMinutes"
            type="number"
            min="1"
            max="60"
            defaultValue="10"
            required
          />
        </label>
        <label>
          {t("Staff approval reason")}
          <textarea name="reason" minLength={3} maxLength={500} required />
        </label>
        <p className="muted">
          {t(
            "The window is shortened if the appointment starts sooner. Later groups are rechecked before sending. Cancel the plan to stop pending invitations.",
          )}
        </p>
        <button
          className="primary"
          disabled={
            saving ||
            !candidates.some((c) =>
              ["priority", "general"].includes(groups[c.waitlistId]),
            )
          }
        >
          {saving ? t("Saving…") : t("Approve & start groups")}
        </button>
      </form>
    </section>
  );
}

export function BatchPlans({ state, act }: { state: AppState; act: Action }) {
  const { t, dateLabel } = useI18n();
  return (
    <section className="stack batch-plans">
      <h2>{t("Group notification plans")}</h2>
      {!state.batches.length && <p>{t("No group notification plans yet.")}</p>}
      {state.batches.map((b) => (
        <article className="card" key={b.id}>
          <h3>
            {t(
              state.slots.find((s) => s.id === b.slotId)?.service ??
                "Appointment",
            )}
          </h3>
          <Status value={b.status} />
          <p>
            {b.priorityIds.length}
            {t(" priority · ")}
            {b.generalIds.length}
            {t(" general · ")}
            {b.intervalMinutes}
            {t(" minutes per group")}
          </p>
          <p>
            {b.round === 1
              ? t("Priority group notified")
              : b.round === 2
                ? t("General group notified")
                : t("Waiting to send")}
          </p>
          {b.status === "ACTIVE" && (
            <>
              {b.nextAt && (
                <p>
                  {t("Response deadline: ")}
                  {dateLabel(b.nextAt)}
                </p>
              )}
              <button
                className="danger"
                onClick={() => {
                  if (
                    confirm(
                      t(
                        "Cancel this notification plan and revoke pending invitations?",
                      ),
                    )
                  )
                    void act({ type: "cancelBatch", batchId: b.id });
                }}
              >
                {t("Cancel notification plan")}
              </button>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
