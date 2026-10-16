"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { translate, type Locale } from "@/lib/i18n";
const LanguageContext = createContext<Locale>("en");
function subscribe(callback: () => void) {
  window.addEventListener("careousel-language", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("careousel-language", callback);
    window.removeEventListener("storage", callback);
  };
}
function snapshot(): Locale {
  try {
    const saved = localStorage.getItem("careousel-language");
    if (saved === "en" || saved === "zh") return saved;
  } catch {}
  return navigator.language.startsWith("zh") ? "zh" : "en";
}
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(
    subscribe,
    snapshot,
    () => "en" as Locale,
  );
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);
  return (
    <LanguageContext.Provider value={locale}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useI18n() {
  const locale = useContext(LanguageContext);
  return {
    locale,
    t: (text: string) => translate(text, locale),
    dateLabel: (value: string | Date) =>
      new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(value)),
  };
}
export function LanguageSwitch() {
  const { locale } = useI18n();
  return (
    <div className="language-switch" role="group" aria-label="Language / 语言">
      {(
        [
          ["en", "English"],
          ["zh", "中文"],
        ] as const
      ).map(([value, label]) => (
        <button
          type="button"
          key={value}
          lang={value}
          aria-pressed={locale === value}
          onClick={() => {
            try {
              localStorage.setItem("careousel-language", value);
            } catch {}
            window.dispatchEvent(new Event("careousel-language"));
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
