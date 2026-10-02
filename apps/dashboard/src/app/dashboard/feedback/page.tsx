"use client";

import { FeedbackShell } from "@/components/feedback/feedback-shell";
import { Suspense } from "react";

export default function FeedbackPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[hsl(var(--text-muted))]">Loading feedback...</div>
      }
    >
      <FeedbackShell />
    </Suspense>
  );
}
