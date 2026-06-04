"use client";

import { CustomActionsShell } from "@/components/custom-actions/custom-actions-shell";
import { getAccessToken } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CustomActionsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return <CustomActionsShell />;
}
