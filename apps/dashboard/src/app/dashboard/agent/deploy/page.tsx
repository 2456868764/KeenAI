"use client";

import { AppHeader } from "@/components/layout/app-header";
import { AgentDeploySettings } from "@/components/settings/agent-deploy-settings";

export default function DeploySettingsPage() {
  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Deploy" />
      <main className="flex-1 overflow-y-auto bg-[hsl(var(--surface-2))]">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <AgentDeploySettings />
        </div>
      </main>
    </div>
  );
}
