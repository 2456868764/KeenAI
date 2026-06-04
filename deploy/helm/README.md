# KeenAI Helm chart (planned · post-0.1.0)

> **v0.1.0** ships with Docker Compose only. Chart targets **1.0 GA**.  
> Until published, use [DEPLOYMENT.md](../../docs/DEPLOYMENT.md).

## Planned components

| Release | Workloads |
|---------|-----------|
| `keenai-api` | Hono API · migrations init Job |
| `keenai-dashboard` | Next.js Dashboard |
| `keenai-inngest` | Optional Inngest dev relay (or external cloud) |
| `postgresql` | Subchart or external DSN |
| `redis` | Workflow scan / cache |

## Values (draft)

```yaml
api:
  image: ghcr.io/keenai/api:0.1.0
  env:
    DATABASE_URL: ""
    JWT_SECRET: ""
    INNGEST_EVENT_KEY: ""
dashboard:
  image: ghcr.io/keenai/dashboard:0.1.0
  env:
    NEXT_PUBLIC_API_URL: https://api.example.com
```

Track progress in [08-ROADMAP-TODO.md](../../docs/08-ROADMAP-TODO.md) I110.
