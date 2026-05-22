"use client";

import { TicketDetailShell } from "@/components/tickets/ticket-detail";
import { getAccessToken } from "@/lib/auth-store";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  return <TicketDetailShell ticketId={id} />;
}
