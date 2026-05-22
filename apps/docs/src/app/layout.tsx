import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KeenAI Docs",
  description: "KeenAI documentation — getting started, API, and deployment guides.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
