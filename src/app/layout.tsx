import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Careousel", description: "Cross-clinic appointment coordination — synthetic demo" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a href="#main" className="sr-only focus:not-sr-only">Skip to content</a><header className="border-b bg-card"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5"><span className="text-xl font-semibold tracking-tight">Careousel</span><span className="rounded-full bg-secondary px-3 py-1 text-sm">Synthetic demo · No real patient data</span></div></header><main id="main" className="mx-auto max-w-6xl px-6 py-12">{children}</main><footer className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">Insurance is simulated. Prices are estimates.</footer></body></html>;
}
