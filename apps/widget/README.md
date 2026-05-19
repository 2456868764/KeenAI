# @keenai/widget

Preact + Vite embeddable messenger widget (Sprint 2).

## Dev

```bash
pnpm db:migrate && pnpm seed   # prints visitor-demo userHash
pnpm dev:api                   # :8090
pnpm --filter @keenai/widget dev
# http://localhost:5173/?userId=visitor-demo&userHash=<from seed>
```

## HMAC Identity Verification

Your backend signs the visitor id (never expose the secret in the browser):

```ts
import { createHmac } from "node:crypto";
const userHash = createHmac("sha256", process.env.WIDGET_HMAC_SECRET!)
  .update(userId, "utf8")
  .digest("hex");
```

Or use `@keenai/auth`: `createWidgetUserHash(secret, userId)`.

## Embed

```html
<script src="/keenai-widget.js"></script>
<script>
  KeenAI.boot({
    orgSlug: "demo",
    user: { id: "user-123", userHash: "<server-generated>" },
    apiUrl: "https://api.example.com",
  });
</script>
```

## Build

```bash
pnpm --filter @keenai/widget build
# → dist/keenai-widget.js (IIFE)
```

WebSocket: `wss://{api}/api/v1/widget/conversations/{id}/ws?widget_token={jwt}` with exponential backoff reconnect.
