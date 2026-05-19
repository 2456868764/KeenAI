# @keenai/widget

Preact + Vite embeddable messenger widget (Sprint 2).

## Dev

```bash
pnpm --filter @keenai/widget dev
```

## Build

```bash
pnpm --filter @keenai/widget build
# → dist/keenai-widget.js (IIFE)
```

## Embed (skeleton)

```html
<script src="https://cdn.example.com/keenai-widget.js"></script>
<script>
  KeenAI.boot({ orgSlug: "your-org" });
</script>
```
