"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./onboarding.module.css";
const patientSteps = [
  {
    route: "/search",
    title: "Find care that fits",
    body: "Choose a service, location and available date. Matching results are ordered earliest first. Open a labeled appointment card to review details and book. Maximum cost is the full listed visit price.",
  },
  {
    route: "/search",
    title: "Understand your demo benefits",
    body: "Choose a fictional insurer and PPO or HMO scenario. Compare in-network examples, service exclusions and estimated out-of-pocket costs. These are not verified benefits or guaranteed coverage. Your saved patient plan does not change.",
  },
  {
    route: "/appointments",
    title: "Keep your original appointment",
    body: "Appointments and waitlists live together here. Choose Join a waitlist, then explicitly select Existing appointment to replace. Your original stays confirmed until you accept a valid earlier offer. An unlinked request does not replace it. Health information shows your approved clinician-authored follow-up tags; viewing tags is optional and never gates booking.",
  },
  {
    route: "/notifications",
    title: "Review an earlier opportunity",
    body: "Clinic staff review matches before sending an invitation. Check its deadline and decide whether to accept or decline. A failed or expired acceptance preserves your original booking; a successful replacement is atomic.",
  },
];
const clinicSteps = [
  {
    route: "/clinic/schedule",
    title: "Manage your clinic schedule",
    body: "Review bookings and release a cancelled appointment. Ordinary home navigation, refresh and persona switching preserve everyone's demo data.",
  },
  {
    route: "/clinic/waitlists",
    title: "Review before sending",
    body: "Review eligibility, human-approved P1–P4 groups and recipients, then authorize the automatic sequence once. Matching and booking decisions stay with staff; this guide never creates offers or changes appointments.",
  },
  {
    route: "/clinic/priorities",
    title: "Review request priorities",
    body: "Review P1–P4 levels for individual waitlist requests at your clinic. Authorized staff approve each assignment; patients and AI cannot set priority. Historical questionnaire scores are not clinical urgency. Candidate order remains FIFO. Approved medical evidence supports your review without setting priority. Explicitly authorized clinicians can create, edit and review visit tags under Medical tags; clinical credential verification is simulated.",
  },
];
export function GuidedTour({
  userId,
  staff,
  navigate,
  onClose,
}: {
  userId: string;
  staff: boolean;
  navigate: (route: string) => void;
  onClose: () => void;
}) {
  const steps = staff ? clinicSteps : patientSteps;
  const storageKey = `careousel:guide:v1:${userId}`;
  const [index, setIndex] = useState(() => {
    try {
      const n = Number(localStorage.getItem(storageKey));
      return Number.isInteger(n) && n >= 0 && n < steps.length ? n : 0;
    } catch {
      return 0;
    }
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const navigation = useRef(navigate);
  useEffect(() => {
    navigation.current = navigate;
  }, [navigate]);
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
        else document.querySelector<HTMLButtonElement>(".tour-launch")?.focus();
      });
    };
  }, []);
  const step = steps[index];
  useEffect(() => {
    navigation.current(step.route);
    try {
      localStorage.setItem(storageKey, String(index));
    } catch {
      /* Optional browser-local progress. */
    }
  }, [index, step.route, storageKey]);
  const finish = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      className={styles.tour}
      aria-label="Careousel quick tour"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <section className={styles.bubble}>
        <span className="eyebrow">
          {staff ? "CLINIC" : "PATIENT"} GUIDE · {index + 1}/{steps.length}
        </span>
        <h2 tabIndex={-1}>{step.title}</h2>
        <p aria-live="polite">{step.body}</p>
        <ol className={styles.progress} aria-label="Guide progress">
          {steps.map((s, i) => (
            <li key={s.title} aria-current={i === index ? "step" : undefined}>
              {i + 1}
            </li>
          ))}
        </ol>
        <p className={styles.note}>
          Synthetic demo only. Close the guide to try this screen; reopen to
          continue. This guide never books, cancels or resets data.
        </p>
        <div className={styles.buttons}>
          <button className="text-button" onClick={onClose}>
            Close guide
          </button>
          <button
            className="secondary"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
          >
            Back
          </button>
          <button
            className="primary"
            onClick={() =>
              index === steps.length - 1 ? finish() : setIndex((i) => i + 1)
            }
          >
            {index === steps.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
        <small>
          Escape closes this guide. Progress is saved in this browser for this
          demo persona.
        </small>
      </section>
    </dialog>
  );
}
