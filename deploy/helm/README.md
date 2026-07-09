# KeenAI Helm chart

> **v0.2.0** chart defaults point at GHCR image tags `0.2.0`. Override image repositories when publishing under a different GitHub owner.

## Install (local dry-run)

```bash
helm lint deploy/helm/keenai
helm template keenai deploy/helm/keenai
```

## Chart layout

```
deploy/helm/keenai/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── api-deployment.yaml
    ├── api-service.yaml
    ├── dashboard-deployment.yaml
    └── dashboard-service.yaml
```

## Values (defaults)

| Key | Default |
|-----|---------|
| `api.image.repository` | `ghcr.io/keenai/keenai-api` |
| `api.image.tag` | `0.2.0` |
| `dashboard.image.repository` | `ghcr.io/keenai/keenai-dashboard` |
| `dashboard.image.tag` | `0.2.0` |
| `api.env.KEENAI_AUTO_SEED` | `0` |
| `dashboard.env.NEXT_PUBLIC_API_URL` | in-cluster API service |

## Post-v0.2 hardening

- Init Job for `db:migrate`
- Ingress + TLS
- External PostgreSQL / Redis subcharts or `externalDatabase.url`

Track: [docs/08-ROADMAP-TODO.md](../../docs/08-ROADMAP-TODO.md) I114～I117 · [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md)
