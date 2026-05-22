# IMAP email ingest (production)

KeenAI polls IMAP mailboxes via [imapflow](https://imapflow.com/), parses MIME with mailparser, and ingests messages into email conversations using the same pipeline as inbound webhooks.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `EMAIL_IMAP_HOST` | yes | IMAP server hostname |
| `EMAIL_IMAP_USER` | yes | Mailbox username |
| `EMAIL_IMAP_PASS` | yes | Mailbox password or app password |
| `EMAIL_IMAP_PORT` | no | Default `993` (TLS) |
| `EMAIL_IMAP_MAILBOX` | no | Default `INBOX` |
| `EMAIL_IMAP_ORG_SLUG` | yes | Target workspace slug (e.g. `demo`) |
| `EMAIL_IMAP_BRAND_SLUG` | no | Default `default` |

## Scheduling

| Mode | Config | Behavior |
|------|--------|----------|
| **Sync** | `EMAIL_IMAP_POLL_INTERVAL_MINUTES=5` | API process polls on interval |
| **Inngest** | `INNGEST_EVENT_KEY=...` | Cron via `INNGEST_IMAP_POLL_CRON` (default `*/5 * * * *`) |
| **Manual** | intervals `0`, no Inngest | `POST /api/v1/email/jobs/imap-poll` (agent auth) |

When Inngest is enabled, sync interval is ignored (same as workflow scan).

## Behavior

1. Connect to IMAP and search `UNSEEN` messages.
2. Fetch raw MIME for each unseen message.
3. Parse and ingest via `ingestInboundEmail` (threading by In-Reply-To / subject).
4. Mark messages `\Seen` only after successful ingest (failures stay unseen for retry).

## Production checklist

- Use an app-specific password (Gmail, Microsoft 365) or dedicated support mailbox.
- Set `EMAIL_IMAP_ORG_SLUG` to the workspace that owns the mailbox.
- Prefer **Inngest** or an external cron hitting the manual job endpoint for multi-instance API deployments (avoid duplicate sync polls on every replica).
- Ensure outbound SMTP is configured for agent replies (`SMTP_*` in `.env`).
- Restrict firewall egress to your provider's IMAP host/port.

## Example (Docker lite + sync poll)

```env
EMAIL_IMAP_HOST=imap.example.com
EMAIL_IMAP_USER=support@example.com
EMAIL_IMAP_PASS=...
EMAIL_IMAP_ORG_SLUG=demo
EMAIL_IMAP_POLL_INTERVAL_MINUTES=5
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `imap_not_configured` | `EMAIL_IMAP_HOST` / `EMAIL_IMAP_USER` missing |
| `imap_org_not_configured` | Set `EMAIL_IMAP_ORG_SLUG` |
| `org_not_found` / `brand_not_found` | Run `pnpm seed` or verify slugs |
| Messages not marked read | Ingest failed — check API logs for parse errors |
| Duplicate conversations | Threading headers missing — verify `Message-ID` / `In-Reply-To` from sender |

See also [ALPHA.md](./ALPHA.md) and inbound webhooks at `POST /api/v1/webhooks/email/inbound`.
