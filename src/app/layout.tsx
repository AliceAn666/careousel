import type { Metadata } from "next";
import "./globals.css";
import { CareouselApp } from "@/components/careousel-app";
export const metadata: Metadata = {
  title: "Careousel — Better care, sooner",
  description:
    "A synthetic cross-clinic appointment and intelligent waitlist demo.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <CareouselApp />
        {children}
      </body>
    </html>
  );
}
