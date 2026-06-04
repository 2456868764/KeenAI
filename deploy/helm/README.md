# KeenAI Helm chart (planned · I110)

> GA track: chart skeleton for Kubernetes `standard` / `full` profiles.  
> Until published, use [DEPLOYMENT.md](../../docs/DEPLOYMENT.md) Docker Compose.

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
  image: ghcr.io/keenai/api:1.0.0
  env:
    DATABASE_URL: ""
    JWT_SECRET: ""
    INNGEST_EVENT_KEY: ""
dashboard:
  image: ghcr.io/keenai/dashboard:1.0.0
  env:
    NEXT_PUBLIC_API_URL: https://api.example.com
```

Track progress in [08-ROADMAP-TODO.md](../../docs/08-ROADMAP-TODO.md) I110.
