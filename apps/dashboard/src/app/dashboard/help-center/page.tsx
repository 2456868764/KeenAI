"use client";

import { HelpCenterShell } from "@/components/help-center/help-center-shell";
import { getAccessToken } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HelpCenterPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return <HelpCenterShell />;
}
