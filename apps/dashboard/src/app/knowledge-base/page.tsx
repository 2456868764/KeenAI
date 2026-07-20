"use client";

import { KnowledgeBaseShell } from "@/components/knowledge-base/knowledge-base-shell";
import { getAccessToken } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function KnowledgeBasePage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return <KnowledgeBaseShell />;
}
