import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "fumadocs-ui/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "KeenAI Docs",
  description: "KeenAI documentation — getting started, API, and deployment guides.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
