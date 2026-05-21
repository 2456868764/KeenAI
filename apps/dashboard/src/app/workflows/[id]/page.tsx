"use client";

import { WorkflowEditorShell } from "@/components/workflows/workflow-editor";
import { getAccessToken } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";

export default function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return <WorkflowEditorShell workflowId={id} />;
}
