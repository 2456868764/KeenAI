"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { verifyPortalMagicLink } from "../../../lib/api";
import { setPortalSession } from "../../../lib/auth-store";

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const orgSlug = searchParams.get("org") ?? "demo";
    if (!token) {
      setError("missing_token");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await verifyPortalMagicLink(orgSlug, token);
        if (cancelled) return;
        setPortalSession({
          accessToken: result.accessToken,
          customerId: result.customerId,
          orgSlug: result.orgSlug,
        });
        router.replace("/");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "verify_failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  if (error) {
    return (
      <main>
        <h1>Sign-in failed</h1>
        <p className="error">{error}</p>
        <p className="muted">
          <a href="/">Back to portal</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Signing you in…</h1>
      <p className="muted">Verifying your magic link.</p>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <main>
          <h1>Signing you in…</h1>
        </main>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
