"use client";
import { useI18n } from "./language-provider";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import type { Action, AppState } from "@/lib/types";
import { money, SERVICES } from "@/lib/config";
import { request } from "@/lib/api";
import { BatchComposer, BatchPlans } from "./batch-notifications";
import { PLANS } from "@/lib/config";
import { Status, Empty, Modal } from "./ui";
export function ClinicSchedule({
  state,
  act,
}: {
  state: AppState;
  act: Action;
}) {
  const { t, dateLabel } = useI18n();
  const [date, setDate] = useState(""),
    [show, setShow] = useState(false);
  const visible = state.slots.filter(
    (s) =>
      !date ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: s.clinic.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(s.start)) === date,
  );
  return (
    <>
      <div className="insight-row">
        <div className="card insight">
          <CalendarDays />
          <div>
            <span>{t("Confirmed appointments")}</span>
            <strong>
              {state.bookings.filter((b) => b.status === "CONFIRMED").length}
            </strong>
          </div>
        </div>
        <div className="card insight">
          <ArrowDownLeft />
          <div>
            <span>{t("Available openings")}</span>
            <strong>
              {state.slots.filter((s) => s.status === "AVAILABLE").length}
            </strong>
          </div>
        </div>
        <div className="card insight">
          <Users />
          <div>
            <span>{t("Eligible matches")}</span>
            <strong>{state.candidates.length}</strong>
          </div>
        </div>
      </div>
      <div className="section-title">
        <div>
          <h2>{t("Appointment schedule")}</h2>
          <p>
            {t(
              " Cancellations automatically surface eligible waitlist candidates. ",
            )}
          </p>
        </div>
        <button className="primary" onClick={() => setShow(true)}>
          <Plus size={17} />
          {t(" New opening ")}
        </button>
      </div>
      <label className="inline-filter">
        {t(" Filter by date ")}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className="text-button" onClick={() => setDate("")}>
          {t(" Clear ")}
        </button>
      </label>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Appointment")}</th>
              <th>{t("Service / provider")}</th>
              <th>{t("Patient")}</th>
              <th>{t("Status")}</th>
              <th>{t("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const b = state.bookings.find(
                (b) => b.slotId === s.id && b.status === "CONFIRMED",
              );
              return (
                <tr key={s.id}>
                  <td>
                    <strong>{dateLabel(s.start)}</strong>
                    <small>
                      {money(s.price)}
                      {t(" estimated")}
                    </small>
                  </td>
                  <td>
                    {t(s.service)}
                    <small>{t(s.provider)}</small>
                  </td>
                  <td>{b?.patient.name ?? "—"}</td>
                  <td>
                    <Status value={s.status} />
                  </td>
                  <td>
                    {b ? (
                      <button
                        className="danger"
                        onClick={() => {
                          if (
                            confirm(
                              t(
                                `Cancel ${b.patient.name}’s appointment and release the slot?`,
                              ),
                            )
                          )
                            void act({ type: "cancel", bookingId: b.id });
                        }}
                      >
                        {t(" Cancel & release ")}
                      </button>
                    ) : (
                      <span className="muted">
                        {s.status === "HELD"
                          ? t("Awaiting patient response")
                          : t(
                              `${state.candidates.filter((c) => c.slotId === s.id).length} eligible matches`,
                            )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <Empty
            title={t("No appointments on this date")}
            body={t("Try another date or create a new opening.")}
          />
        )}
      </div>
      {show && (
        <Modal
          title={t("Create an appointment opening")}
          onClose={() => setShow(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await act({
                  type: "createSlot",
                  service: f.get("service"),
                  provider: f.get("provider"),
                  durationMinutes: Number(f.get("durationMinutes")),
                  plans: f.getAll("plans"),
                  start: new Date(String(f.get("start"))).toISOString(),
                  price: Math.round(Number(f.get("price")) * 100),
                })
              )
                setShow(false);
            }}
          >
            <label>
              {t(" Specialty ")}
              <select name="service">
                {SERVICES.map((s) => (
                  <option key={s} value={s}>
                    {t(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t(" Start date & time (your device timezone) ")}
              <input type="datetime-local" name="start" required />
            </label>
            <label>
              {t(" Estimated cost ($) ")}
              <input
                name="price"
                type="number"
                min="0"
                max="10000"
                defaultValue="120"
                required
              />
            </label>
            <label>
              {t("Provider")}
              <input
                name="provider"
                defaultValue="Dr. Maya Lin"
                minLength={2}
                maxLength={100}
                required
              />
            </label>
            <label>
              {t("Duration (minutes)")}
              <input
                name="durationMinutes"
                type="number"
                min="10"
                max="180"
                defaultValue="30"
                required
              />
            </label>
            <fieldset>
              <legend>{t("Accepted demo plans")}</legend>
              <div className="check-row">
                {PLANS.map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      name="plans"
                      value={p}
                      defaultChecked
                    />
                    {p}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="demo-note">
              {t(
                "Synthetic services only. Real eligibility, provider credentials and insurance must be verified before a real visit.",
              )}
            </p>
            <button className="primary full">{t("Create opening")}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Matches({ state, act }: { state: AppState; act: Action }) {
  const { t, dateLabel } = useI18n();
  const [selected, setSelected] = useState(""),
    [summary, setSummary] = useState<{
      source: string;
      summary: string;
    } | null>(null),
    [loading, setLoading] = useState(false),
    [aiError, setAiError] = useState("");
  const slots = state.slots.filter((s) => s.status === "AVAILABLE");
  const slot =
    slots.find((s) => s.id === selected) ??
    slots.find((s) => s.id === "earlier") ??
    slots[0];
  const candidates = state.candidates.filter((c) => c.slotId === slot?.id);
  return (
    <>
      <div className="info-banner">
        <Sparkles />
        <div>
          <strong>{t("Intelligent matching. Human decisions.")}</strong>
          <p>
            {t(
              " Eligibility is checked automatically. Candidates are ordered by waitlist join time. Clinic staff make every final offer; clinical urgency is never inferred. ",
            )}
          </p>
        </div>
      </div>
      <div className="matches-layout">
        <section className="card openings">
          <h2>{t("Available openings")}</h2>
          <p className="muted">{t("Select a slot to review matches")}</p>
          {slots.map((s) => (
            <button
              key={s.id}
              className={`opening ${slot?.id === s.id ? "selected" : ""}`}
              onClick={() => {
                setSelected(s.id);
                setSummary(null);
                setAiError("");
              }}
            >
              <span className="eyebrow">{t(s.service)}</span>
              <strong>{dateLabel(s.start)}</strong>
              <span>
                {state.candidates.filter((c) => c.slotId === s.id).length}{" "}
                {t(" eligible candidates ")}
              </span>
            </button>
          ))}
          {!slots.length && (
            <p>
              {t("No available openings. Cancel a booking or create a slot.")}
            </p>
          )}
        </section>
        <section>
          {slot && (
            <>
              <div className="section-title">
                <div>
                  <h2>
                    {t(" Suggested patients")}{" "}
                    <span className="result-count">{candidates.length}</span>
                  </h2>
                  <p>
                    {t(slot.service)} · {dateLabel(slot.start)}
                  </p>
                </div>
              </div>
              {!!candidates.length && (
                <BatchComposer
                  key={slot.id}
                  slotId={slot.id}
                  candidates={candidates}
                  act={act}
                />
              )}
              <div className="recommendation">
                <span className="eyebrow">
                  <Sparkles size={14} />
                  {t(" ASSISTED REVIEW ")}
                </span>
                <p>
                  {t(
                    summary?.summary ??
                      "Get a concise explanation of the eligible candidates before making your decision. Matching works even without an external AI service.",
                  )}
                </p>
                <button
                  className="secondary"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    setAiError("");
                    try {
                      setSummary(
                        await request("/api/recommendations", {
                          slotId: slot.id,
                        }),
                      );
                    } catch (e) {
                      setAiError((e as Error).message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {loading ? t("Preparing…") : t("Explain recommendations")}
                  <Sparkles size={15} />
                </button>
                {summary && (
                  <small>
                    {summary.source === "ai"
                      ? t("AI-assisted explanation — verify before approval")
                      : t("Local rules fallback · no external AI required")}
                  </small>
                )}
                {aiError && <p role="alert">{t(aiError)}</p>}
              </div>
              {!candidates.length ? (
                <Empty
                  title={t("No eligible candidates yet")}
                  body={t(
                    "The opening remains available for direct booking. Candidates must match all required preferences.",
                  )}
                />
              ) : (
                <div className="stack">
                  {candidates.map((c, i) => (
                    <article className="card candidate" key={c.id}>
                      <div className="candidate-heading">
                        <span className="avatar mint">
                          {c.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </span>
                        <div>
                          <h3>{c.name}</h3>
                          <p>
                            {t("Waitlist priority #")}
                            {i + 1}
                          </p>
                        </div>
                        <span className="status active">{t("Eligible")}</span>
                      </div>
                      <div className="reason-list">
                        {c.reasons.map((r) => (
                          <span key={t(r)}>
                            <CheckCircle2 size={14} />
                            {t(r)}
                          </span>
                        ))}
                      </div>
                      <button
                        className="primary"
                        onClick={() => {
                          const reason = prompt(
                            t("Reason for approving this eligible patient:"),
                            t(
                              "Reviewed eligibility and scheduling preferences",
                            ),
                          );
                          if (reason)
                            void act({
                              type: "approve",
                              slotId: slot.id,
                              waitlistId: c.waitlistId,
                              reason,
                            });
                        }}
                      >
                        {t(" Approve & send offer ")}
                        <ArrowRight size={16} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <BatchPlans state={state} act={act} />
      <section className="section-title">
        <h2>{t("Recent invitations")}</h2>
      </section>
      <div className="stack">
        {state.offers.map((o) => (
          <div key={o.id} className="card request-card">
            <div>
              <h3>{t(o.slot.service)}</h3>
              <p>
                {dateLabel(o.slot.start)} · {t(o.reason)}
              </p>
            </div>
            <Status value={o.status} />
          </div>
        ))}
      </div>
    </>
  );
}
export function ActivityFeed({ state }: { state: AppState }) {
  const { t, dateLabel } = useI18n();
  return (
    <section className="card">
      <h2>{t("Scheduling audit trail")}</h2>
      <p className="muted">{t("Only activity from your clinic is shown.")}</p>
      {state.activity.length ? (
        state.activity.map((a) => (
          <div className="activity" key={a.id}>
            <span className="activity-dot" />
            <div>
              <strong>{t(a.action)}</strong>
              <p>
                {t(a.actor)} · {dateLabel(a.createdAt)}
              </p>
            </div>
          </div>
        ))
      ) : (
        <Empty
          title={t("Ready for your first action")}
          body={t("Booking changes and approvals will appear here.")}
        />
      )}
    </section>
  );
}
