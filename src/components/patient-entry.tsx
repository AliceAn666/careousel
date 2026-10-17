"use client";
import { useState } from "react";
import type { AppState } from "@/lib/types";
import { MedicalRecords } from "./medical-records";
import { MedicalTags } from "./medical-tags";
import { SymptomLabels } from "./ui";
export function PatientEntry({
  navigate,
}: {
  navigate: (route: string) => void;
}) {
  return (
    <section className="stack" aria-label="Patient entry">
      <div className="patient-entry-grid">
        <article className="card">
          <h2>Book an Appointment</h2>
          <p>
            Search for vaccinations, blood tests, routine examinations and other
            eligible care. No symptom questionnaire is required. Each opening
            still has its own eligibility requirements.
          </p>
          <button className="primary" onClick={() => navigate("/search")}>
            Book an Appointment
          </button>
        </article>
        <article className="card">
          <h2>Find an Earlier Appointment</h2>
          <p>
            Already have an appointment? Register what you need and join a
            waitlist while keeping your original booking.
          </p>
          <button className="primary" onClick={() => navigate("/earlier")}>
            Find an Earlier Appointment
          </button>
        </article>
        <article className="card">
          <h2>Manage My Appointments and Waitlists</h2>
          <p>
            Review appointments, saved requests and clinic-reviewed priorities.
            Stored health information remains read-only.
          </p>
          <button className="primary" onClick={() => navigate("/needs")}>
            Manage My Appointments and Waitlists
          </button>
        </article>
      </div>
      <p className="demo-note emergency">
        If you think you have a medical emergency, call your local emergency
        number now. Careousel is not an emergency service and does not diagnose
        or automatically triage symptoms.
      </p>
    </section>
  );
}
export function OptionalHealthInformation({ state }: { state: AppState }) {
  const [recordVersion, setRecordVersion] = useState(0);
  return (
    <section className="stack" aria-label="Optional patient health information">
      <p>
        You can leave this page at any time and continue booking or joining
        waitlists. Only clinic staff can approve P1–P4 for a request at their
        clinic.
      </p>
      {state.user?.intakeCompleted ? (
        <section className="card">
          <h2>Your saved self-report</h2>
          <p>
            Your previously submitted information is retained. These labels are
            patient-reported information, not clinician-authored medical tags or
            an urgency assessment. This release does not overwrite your saved
            answers.
          </p>
          <SymptomLabels tags={state.myTags} />
        </section>
      ) : (
        <section className="card">
          <h2>No saved self-report</h2>
          <p>
            No questionnaire is required or available here. Clinician-authored
            tags are shown separately below.
          </p>
        </section>
      )}
      <MedicalTags key={`${state.user?.id}:${recordVersion}`} patient />
      <MedicalRecords
        key={`records:${state.user?.id}`}
        patient
        onChanged={() => setRecordVersion((v) => v + 1)}
      />
    </section>
  );
}
