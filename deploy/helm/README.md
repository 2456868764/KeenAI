# KeenAI Helm chart

> **v0.1.0** ships Docker Compose. Chart skeleton **I114**; image tags track **0.2.0** next.

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
| `api.image.tag` | `0.1.0` |
| `api.env.KEENAI_AUTO_SEED` | `0` |
| `dashboard.env.NEXT_PUBLIC_API_URL` | in-cluster API service |

## Planned for v0.2.0 (I116)

- Init Job for `db:migrate`
- Ingress + TLS
- External PostgreSQL / Redis subcharts or `externalDatabase.url`
- GHCR image publish workflow (`0.2.0` tags)

Track: [docs/08-ROADMAP-TODO.md](../../docs/08-ROADMAP-TODO.md) I114～I117 · [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md)
