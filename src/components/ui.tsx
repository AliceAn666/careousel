"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import { CalendarDays, X } from "lucide-react";
export const FeedbackContext = createContext("");
export function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value.toLowerCase()}`}>
      {value.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <CalendarDays size={32} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const feedback = useContext(FeedbackContext);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      aria-label={title}
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X />
        </button>
      </div>
      {feedback && (
        <p className="alert error" role="alert">
          {feedback}
        </p>
      )}
      {children}
    </dialog>
  );
}
type Tag = {
  id: string;
  label: string;
  score: number;
  source: string;
  clinic: { name: string } | null;
};
const level = (score: number) =>
  score >= 7 ? "high" : score >= 4 ? "moderate" : "low";
// Severity chips; the level is spelled out so it never relies on color alone.
export function SeverityTags({
  tags,
  empty = "No symptom tags yet",
}: {
  tags: Tag[];
  empty?: string;
}) {
  if (!tags.length) return <p className="tag-empty">{empty}</p>;
  return (
    <ul className="severity-tags">
      {tags.map((t) => (
        <li
          key={t.id}
          className={`severity-tag ${level(t.score)}`}
          title={
            t.source === "CLINIC"
              ? `Set by ${t.clinic?.name ?? "clinic"}`
              : "From patient questionnaire"
          }
        >
          <span>{t.label}</span>
          <strong>
            {t.score}/10 · {level(t.score)}
          </strong>
        </li>
      ))}
    </ul>
  );
}
