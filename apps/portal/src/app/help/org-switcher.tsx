"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function OrgSwitcher({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div>
      <label htmlFor="org">Workspace</label>
      <input
        id="org"
        value={orgSlug}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("org", event.target.value.trim() || "demo");
          router.push(`/help?${next.toString()}`);
        }}
      />
    </div>
  );
}
