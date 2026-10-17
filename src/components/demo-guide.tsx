"use client";
import { ShieldCheck, Sparkles } from "lucide-react";
import type { Action } from "@/lib/types";
export function DemoGuide({ staff, act }: { staff: boolean; act: Action }) {
  const steps = [
    [
      "Avery joins the waitlist",
      "Switch to Avery → My appointments → Find an earlier time. Keep the default Dermatology preferences and join.",
    ],
    [
      "Cedar releases an opening",
      "Switch to Cedar Health staff → Schedule. Cancel Jordan Lee’s booked Dermatology appointment about 7 days away.",
    ],
    [
      "Staff reviews and approves",
      "In Waitlist Management, review the selected opening under Matches. Use Review Priority and Back to Matches without losing context. Authorize approved recipients under Notifications, or expand Legacy single-patient invitation for the original demo offer.",
    ],
    [
      "Avery accepts earlier care",
      "Switch to Avery → Notifications. Accept the earlier appointment, then inspect My appointments.",
    ],
    [
      "See the complete result",
      "Cedar’s new booking is confirmed, Harbor’s original is rescheduled, and the old slot is available. Refresh to verify persistence.",
    ],
  ];
  return (
    <>
      <section className="hero compact">
        <div>
          <span className="pill">
            <Sparkles size={14} />A FIVE-MINUTE STORY
          </span>
          <h2>
            Turn a cancellation
            <br />
            into an opportunity.
          </h2>
          <p>Two clinics. One patient. Care that arrives sooner.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-cross">✚</div>
        </div>
      </section>
      <section className="card walkthrough">
        {steps.map(([title, body], i) => (
          <div className="step" key={title}>
            <span>{i + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </div>
        ))}
      </section>
      <div className="info-banner">
        <ShieldCheck />
        <div>
          <strong>Try the alternate paths, too.</strong>
          <p>
            Decline an offer to keep the original booking, let a 10-minute
            invitation expire, or use different browser sessions to demonstrate
            shared data. All identities, plans and estimates are synthetic.
          </p>
        </div>
      </div>
      {staff && (
        <section className="card reset-card">
          <h3>Restore the synthetic demo</h3>
          <p>
            Deletes all synthetic demo actions, registered accounts and
            sessions, and restores future-dated fixtures. This is available only
            in explicit Demo Mode, never normal account sessions.
          </p>
          <button
            className="danger"
            onClick={() => {
              if (
                prompt(
                  "Type RESET to delete all synthetic changes, registered accounts and sessions and restore the baseline.",
                ) === "RESET"
              )
                void act({ type: "reset", confirmation: "RESET" });
            }}
          >
            Reset demo data
          </button>
        </section>
      )}
    </>
  );
}
