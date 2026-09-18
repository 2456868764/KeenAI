"use client";

import { TicketListShell } from "@/components/tickets/ticket-list";
import { getAccessToken } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function TicketsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return <TicketListShell />;
}
