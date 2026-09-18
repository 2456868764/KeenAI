"use client";

import { AppHeader } from "@/components/layout/app-header";
import { AgentOtherSettingsForm } from "@/components/settings/agent-other-settings";

export default function AgentOtherSettingsPage() {
  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Other" />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[900px] px-6 py-8">
          <AgentOtherSettingsForm />
        </div>
      </main>
    </div>
  );
}
