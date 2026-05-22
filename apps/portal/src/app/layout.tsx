import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KeenAI Portal",
  description: "Customer ticket portal for KeenAI workspaces.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
