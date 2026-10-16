"use client";
import { useEffect, useRef, useState } from "react";

type Step = { route: string; target: string; title: string; body: string };
const patient: Step[] = [
  {
    route: "/search",
    target: '[data-tour="filters"]',
    title: "Find care that fits",
    body: "Choose a specialty, location and fictional insurance provider. The maximum cost applies to the full listed visit price.",
  },
  {
    route: "/search",
    target: '[data-tour="benefits"]',
    title: "Understand your demo benefits",
    body: "Choose PPO or HMO and compare plan-specific network, service and patient-cost scenarios below. These are fictional examples, not verified coverage. Open View & book to review an appointment.",
  },
  {
    route: "/appointments",
    target: '[data-tour="nav-/appointments"]',
    title: "Keep your original appointment",
    body: "Use Find an earlier time on a confirmed appointment to join a linked waitlist. Your booking stays safe until you accept an earlier offer.",
  },
  {
    route: "/waitlists",
    target: '[data-tour="nav-/waitlists"]',
    title: "Manage your preferences",
    body: "Join or edit a waitlist here. Choose dates, hours, clinics and budget. This tour never creates or changes a booking.",
  },
  {
    route: "/notifications",
    target: '[data-tour="nav-/notifications"]',
    title: "Accept an earlier opportunity",
    body: "A clinic-approved offer appears here. Review its deadline, accept or decline. Acceptance replaces the linked original appointment atomically.",
  },
];
const clinic: Step[] = [
  {
    route: "/clinic/schedule",
    target: '[data-tour="nav-/clinic/schedule"]',
    title: "Manage your clinic schedule",
    body: "Review bookings and release a cancelled appointment. Cancellation makes the slot available and refreshes eligible candidates.",
  },
  {
    route: "/clinic/waitlists",
    target: '[data-tour="nav-/clinic/waitlists"]',
    title: "Review before sending",
    body: "Choose an opening, review eligibility and explain recommendations. Approve a candidate with a reason to send an exclusive, time-limited offer.",
  },
  {
    route: "/clinic/activity",
    target: '[data-tour="nav-/clinic/activity"]',
    title: "Follow the result",
    body: "Your clinic activity records scheduling changes. Staff see their own clinic's records. Use Demo guide for the full synthetic walkthrough and guarded reset.",
  },
];
export function GuidedTour({
  staff,
  navigate,
  onClose,
}: {
  staff: boolean;
  navigate: (route: string) => void;
  onClose: () => void;
}) {
  const steps = staff ? clinic : patient;
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState({ top: 90, left: 20, width: 0, height: 0 });
  const dialog = useRef<HTMLDialogElement>(null);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>(".tour-launch")?.focus(),
      );
    };
  }, []);
  const step = steps[index];
  useEffect(() => {
    navigateRef.current(step.route);
    let frame = 0;
    let tries = 0;
    let positioned = false;
    const update = () => {
      const target = document.querySelector(step.target);
      if (!target) {
        if (++tries < 120) frame = requestAnimationFrame(update);
        return;
      }
      if (!positioned) {
        target.scrollIntoView({ block: "center", inline: "nearest" });
        positioned = true;
      }
      const r = target.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);
  const width =
    typeof window === "undefined" ? 360 : Math.min(360, window.innerWidth - 32);
  const top =
    typeof window === "undefined"
      ? 100
      : Math.max(
          16,
          Math.min(
            box.top + box.height + 12,
            window.innerHeight - (window.innerWidth < 600 ? 430 : 310),
          ),
        );
  const left =
    typeof window === "undefined"
      ? 16
      : Math.max(16, Math.min(box.left, window.innerWidth - width - 16));
  return (
    <dialog
      ref={dialog}
      className="guided-tour"
      aria-label="Careousel quick tour"
      onCancel={onClose}
    >
      {box.width > 0 && (
        <div
          className="tour-highlight"
          aria-hidden="true"
          style={{
            top: box.top - 4,
            left: box.left - 4,
            width: box.width + 8,
            height: box.height + 8,
          }}
        />
      )}
      <section
        className="tour-bubble"
        style={{ top, left, width, maxHeight: `calc(100dvh - ${top + 16}px)` }}
        aria-live="polite"
      >
        <span className="eyebrow">
          {staff ? "CLINIC" : "PATIENT"} QUICK TOUR · {index + 1}/{steps.length}
        </span>
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="button-row">
          <button className="text-button" onClick={onClose}>
            Skip tour
          </button>
          <button
            className="secondary"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            Back
          </button>
          <button
            className="primary"
            onClick={() =>
              index === steps.length - 1 ? onClose() : setIndex(index + 1)
            }
          >
            {index === steps.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
        <small>Use Next to visit each feature. Escape closes the tour.</small>
      </section>
    </dialog>
  );
}
