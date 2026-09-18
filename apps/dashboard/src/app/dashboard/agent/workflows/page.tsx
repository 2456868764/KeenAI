"use client";

import { WorkflowListShell } from "@/components/workflows/workflow-list";
import { getAccessToken } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function WorkflowsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return <WorkflowListShell />;
}
