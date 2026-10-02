"use client";

import { AgentRunTraceShell } from "@/components/agent-runs/agent-run-trace-shell";
import { getAccessToken } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";

export default function AgentRunsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[hsl(var(--text-muted))]">Loading agent runs...</div>
      }
    >
      <AgentRunTraceShell />
    </Suspense>
  );
}
