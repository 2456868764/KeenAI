"use client";

import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { login } from "@/lib/api";
import { setAccessToken } from "@/lib/auth-store";
import { Button } from "@keenai/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@keenai.local");
  const [password, setPassword] = useState("keenai-demo-12");
  const [orgSlug, setOrgSlug] = useState("demo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(var(--surface-0))] p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.35), transparent)",
        }}
      />
      <form
        className="relative w-full max-w-[400px] space-y-5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-8 shadow-xl"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          try {
            const res = await login(email, password, orgSlug);
            setAccessToken(res.accessToken);
            router.replace("/inbox");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed");
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-md bg-[hsl(var(--primary))] text-sm font-bold text-[hsl(var(--primary-foreground))]">
              K
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
              KeenAI
            </h1>
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Sign in to your workspace</p>
        </div>

        <Field
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          required
        />
        <Field
          label="Organization"
          value={orgSlug}
          onChange={(e) => setOrgSlug(e.target.value)}
          autoComplete="organization"
          required
        />

        {error ? <Alert>{error}</Alert> : null}

        <Button type="submit" className="h-10 w-full text-sm font-semibold" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>

        <p className="text-center text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          Demo workspace:{" "}
          <span className="font-mono text-[hsl(var(--foreground)/0.85)]">owner@keenai.local</span>
          {" · "}
          <span className="font-mono text-[hsl(var(--foreground)/0.85)]">keenai-demo-12</span>
          <br />
          Run <span className="font-mono">pnpm seed</span> if login fails.
        </p>
      </form>
    </main>
  );
}
