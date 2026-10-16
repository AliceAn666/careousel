"use client";
import { useState } from "react";
import { Plus, Save, Trash2, UserRound } from "lucide-react";
import type { Action, AppState } from "@/lib/types";
import { MAX_SCORE, MIN_SCORE, severityLabel } from "@/lib/priority";
import { Empty } from "./ui";

type PriorityPatient = AppState["priorityPatients"][number];
type PatientTag = PriorityPatient["tags"][number];

const scores = Array.from(
  { length: MAX_SCORE - MIN_SCORE + 1 },
  (_, i) => MIN_SCORE + i,
);

function ScoreSelect({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {scores.map((n) => (
        <option key={n} value={n}>
          {n} · {severityLabel(n)}
        </option>
      ))}
    </select>
  );
}

function TagRow({
  patientId,
  tag,
  editable,
  act,
}: {
  patientId: string;
  tag: PatientTag;
  editable: boolean;
  act: Action;
}) {
  const [label, setLabel] = useState(tag.label),
    [score, setScore] = useState(tag.score);
  const changed = label.trim() !== tag.label || score !== tag.score;
  if (!editable)
    return (
      <li className="tag-row readonly">
        <span>{tag.label}</span>
        <span>
          {tag.score}/10 · {severityLabel(tag.score)}
        </span>
        <small>
          {tag.source === "CLINIC"
            ? `Set by ${tag.clinic?.name ?? "another clinic"}`
            : "From patient questionnaire"}
        </small>
      </li>
    );
  return (
    <li className="tag-row">
      <input
        aria-label="Symptom tag"
        value={label}
        maxLength={40}
        onChange={(e) => setLabel(e.target.value)}
      />
      <ScoreSelect
        label={`Severity score for ${tag.label}`}
        value={score}
        onChange={setScore}
      />
      <button
        className="secondary"
        disabled={!changed || !label.trim()}
        onClick={() =>
          void act({
            type: "setTag",
            patientId,
            tagId: tag.id,
            label: label.trim(),
            score,
          })
        }
      >
        <Save size={15} />
        Save
      </button>
      <button
        className="text-button"
        aria-label={`Remove ${tag.label}`}
        onClick={() => {
          if (confirm(`Remove the “${tag.label}” tag?`))
            void act({ type: "deleteTag", tagId: tag.id });
        }}
      >
        <Trash2 size={15} />
        Remove
      </button>
    </li>
  );
}

function NewTag({ patientId, act }: { patientId: string; act: Action }) {
  const [label, setLabel] = useState(""),
    [score, setScore] = useState(5);
  return (
    <form
      className="tag-row new"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await act({ type: "setTag", patientId, label: label.trim(), score })
        ) {
          setLabel("");
          setScore(5);
        }
      }}
    >
      <input
        aria-label="New symptom tag"
        placeholder="e.g. Chest pain"
        value={label}
        maxLength={40}
        required
        onChange={(e) => setLabel(e.target.value)}
      />
      <ScoreSelect
        label="Severity score for new tag"
        value={score}
        onChange={setScore}
      />
      <button className="primary" disabled={!label.trim()}>
        <Plus size={15} />
        Add tag
      </button>
    </form>
  );
}

export function Priorities({ state, act }: { state: AppState; act: Action }) {
  const clinicId = state.user?.clinicId;
  return (
    <>
      <div className="info-banner">
        <UserRound />
        <div>
          <strong>Follow-up patient priorities.</strong>
          <p>
            Give each returning patient one or more symptom tags, each with its
            own severity score (1–10). Scores appear next to the patient in
            Waitlist matches as a hint; they never change eligibility or order.
          </p>
        </div>
      </div>
      {!state.priorityPatients.length ? (
        <Empty
          title="No returning patients yet"
          body="Patients with a booking at your clinic appear here."
        />
      ) : (
        <div className="stack">
          {state.priorityPatients.map((p) => (
            <article className="card priority-card" key={p.id}>
              <div className="candidate-heading">
                <span className="avatar mint">
                  {p.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </span>
                <div>
                  <h3>{p.name}</h3>
                  <p>Follow-up patient · {p.tags.length} tags</p>
                </div>
              </div>
              <ul className="tag-rows">
                {p.tags.map((t) => (
                  <TagRow
                    key={`${t.id}-${t.label}-${t.score}`}
                    patientId={p.id}
                    tag={t}
                    editable={t.source === "CLINIC" && t.clinicId === clinicId}
                    act={act}
                  />
                ))}
              </ul>
              <NewTag patientId={p.id} act={act} />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
