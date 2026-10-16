"use client";
import { useI18n } from "./language-provider";
import { createContext, useContext, useEffect, useRef } from "react";
import { CalendarDays, X } from "lucide-react";
export const FeedbackContext = createContext("");
export function Status({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <span className={`status ${value.toLowerCase()}`}>
      {t(value.replaceAll("_", " ").toLowerCase())}
    </span>
  );
}
export function Empty({ title, body }: { title: string; body: string }) {
  const { t } = useI18n();
  return (
    <div className="empty">
      <CalendarDays size={32} />
      <h3>{t(title)}</h3>
      <p>{t(body)}</p>
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
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const feedback = useContext(FeedbackContext);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      aria-label={t(title)}
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{t(title)}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("Close dialog")}
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
