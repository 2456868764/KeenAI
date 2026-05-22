"use client";

import { InboxShell } from "@/components/inbox/inbox-shell";
import { getAccessToken } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";

export default function InboxPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading inbox…</div>}>
      <InboxShell />
    </Suspense>
  );
}
