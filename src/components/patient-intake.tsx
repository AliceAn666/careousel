"use client";
import { useState } from "react";
import { ArrowRight, ClipboardList, ShieldAlert } from "lucide-react";
import type { Action } from "@/lib/types";
import {
  DURATIONS,
  SYMPTOM_AREAS,
  WARNING_SIGNS,
  type Duration,
  type SymptomAnswer,
  type SymptomArea,
  type WarningSign,
} from "@/lib/priority";

const blank = (area: SymptomArea): SymptomAnswer => ({
  area,
  pain: 5,
  duration: "week",
  worsening: false,
});

// Optional synthetic self-report; never a booking gate or clinical priority.
export function IntakeQuestionnaire({ act }: { act: Action }) {
  const [symptoms, setSymptoms] = useState<SymptomAnswer[]>([]),
    [signs, setSigns] = useState<WarningSign[]>([]),
    [saving, setSaving] = useState(false);
  const update = (area: SymptomArea, patch: Partial<SymptomAnswer>) =>
    setSymptoms((list) =>
      list.map((s) => (s.area === area ? { ...s, ...patch } : s)),
    );
  return (
    <section className="card intake">
      <div className="intake-heading">
        <span className="clinic-symbol">
          <ClipboardList />
        </span>
        <div>
          <span className="eyebrow">OPTIONAL · PATIENT SELF-REPORT</span>
          <h2>Share health information (optional)</h2>
          <p>
            You can book and join waitlists without answering these questions.
            Share only if you choose; answers never assign urgency or a P1–P4
            group. This is a synthetic demo — do not enter real health
            information.
          </p>
        </div>
      </div>
      <div className="demo-note emergency">
        <ShieldAlert size={18} />
        If you think you have a medical emergency, call your local emergency
        number now. This form does not provide medical advice.
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await act({ type: "intake", symptoms, warningSigns: signs });
          setSaving(false);
        }}
      >
        <fieldset>
          <legend>
            1. Where are you having symptoms? Choose all that apply.
          </legend>
          <div className="choice-grid">
            {SYMPTOM_AREAS.map((a) => {
              const checked = symptoms.some((s) => s.area === a.id);
              return (
                <label key={a.id} className={checked ? "choice on" : "choice"}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setSymptoms((list) =>
                        e.target.checked
                          ? [...list, blank(a.id)]
                          : list.filter((s) => s.area !== a.id),
                      )
                    }
                  />
                  {a.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        {symptoms.length > 0 && (
          <fieldset>
            <legend>2. Tell us more about each symptom.</legend>
            <div className="stack">
              {symptoms.map((s) => {
                const label = SYMPTOM_AREAS.find((a) => a.id === s.area)!.label;
                return (
                  <div className="symptom-detail" key={s.area}>
                    <strong>{label}</strong>
                    <label>
                      How bad is it right now? <b>{s.pain}/10</b>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        value={s.pain}
                        aria-label={`${label} intensity`}
                        onChange={(e) =>
                          update(s.area, { pain: Number(e.target.value) })
                        }
                      />
                      <span className="range-ends">
                        <span>0 · none</span>
                        <span>10 · worst imaginable</span>
                      </span>
                    </label>
                    <label>
                      How long have you had it?
                      <select
                        value={s.duration}
                        aria-label={`${label} duration`}
                        onChange={(e) =>
                          update(s.area, {
                            duration: e.target.value as Duration,
                          })
                        }
                      >
                        {DURATIONS.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={s.worsening}
                        onChange={(e) =>
                          update(s.area, { worsening: e.target.checked })
                        }
                      />
                      It is getting worse
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend>
            {symptoms.length ? 3 : 2}. Do any of these apply to you right now?
          </legend>
          <div className="check-column">
            {WARNING_SIGNS.map((w) => (
              <label key={w.id} className="inline-check">
                <input
                  type="checkbox"
                  checked={signs.includes(w.id)}
                  onChange={(e) =>
                    setSigns((list) =>
                      e.target.checked
                        ? [...list, w.id]
                        : list.filter((x) => x !== w.id),
                    )
                  }
                />
                {w.label}
              </label>
            ))}
          </div>
        </fieldset>
        <button
          className="primary full"
          disabled={saving || symptoms.length === 0}
        >
          {saving ? "Saving…" : "Submit questionnaire"}
          <ArrowRight size={17} />
        </button>
      </form>
    </section>
  );
}
