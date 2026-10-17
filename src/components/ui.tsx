"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import { CalendarDays, X } from "lucide-react";
import { priorityLabel } from "@/lib/waitlist-priority";
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
// Historical symptom labels are patient information, not priority levels.
export function SymptomLabels({
  tags,
}: {
  tags: { id: string; label: string }[];
}) {
  if (!tags.length)
    return (
      <p className="tag-empty">
        Your answers were saved. Staff review each waitlist request separately.
      </p>
    );
  return (
    <ul className="severity-tags">
      {tags.map((tag) => (
        <li className="severity-tag" key={tag.id}>
          {tag.label}
        </li>
      ))}
    </ul>
  );
}

// P1 (red) to P4 (green); awaiting review is yellow. The label is always
// spelled out so priority never relies on color alone.
export function PriorityBadge({ level }: { level?: string | null }) {
  const tone =
    level && /^P[1-4]$/.test(level) ? level.toLowerCase() : "pending";
  return (
    <span className={`priority-badge priority-${tone}`}>
      {priorityLabel(level)}
    </span>
  );
}
