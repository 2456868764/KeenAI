"use client";

import { MemoryExplorerShell } from "@/components/memory/memory-explorer";
import { getAccessToken } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MemoryPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return <MemoryExplorerShell />;
}
