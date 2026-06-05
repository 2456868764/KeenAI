# @keenai/portal

Customer-facing ticket portal (Next.js).

```bash
pnpm --filter @keenai/portal dev   # http://localhost:3002
```

## Auth

Production flow uses magic link JWT:

1. Enter email → `POST /api/v1/portal/:orgSlug/magic-link`
2. Click link → `/auth/verify?token=…&org=…` → stores Bearer token
3. Ticket list uses `Authorization: Bearer …`

Set `PORTAL_APP_URL=http://localhost:3002` on the API. Without SMTP, the API logs the magic link URL in dev.

## Dev fallback

With `PORTAL_PUBLIC_READ=true` on the API, use **Dev: view without login** to list tickets by email query (no JWT).

## Help Center SEO

Public help articles at `/help` and `/help/{id}` (ISR). Configure:

- `NEXT_PUBLIC_PORTAL_ORG_SLUG` — workspace slug for sitemap/OG (default `demo`)
- `NEXT_PUBLIC_PORTAL_URL` — canonical site URL for sitemap and JSON-LD

Sitemap: `/sitemap.xml` · OG images: `next/og` on article routes.
