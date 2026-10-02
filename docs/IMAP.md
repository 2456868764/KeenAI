# IMAP email ingest

KeenAI polls any number of IMAP mailboxes through connection-scoped Email integrations. Credentials are encrypted in `channel_connections`; mailbox messages enter the same Durable Channel Ingress, conversation threading, Agent/Workflow and Outbox path as provider webhooks.

## Connection configuration

Create an Email integration in `Dashboard > Settings > Integrations` and choose **IMAP polling**. For Gmail or Microsoft 365, enter the mailbox address and use **Connect OAuth**. Conventional mail servers can still use passwords.

| Field | Required | Description |
|---|---:|---|
| SMTP host/port/user/from | yes | Durable outbound replies |
| SMTP password | password mode | Replaced by OAuth access token for Gmail/Microsoft 365 |
| IMAP host/user | polling mode | Inbound mailbox identity |
| IMAP password | password mode | Replaced by OAuth access token for Gmail/Microsoft 365 |
| IMAP port | no | Defaults to `993` with TLS |
| IMAP mailbox | no | Defaults to `INBOX` |
| SES SNS topic ARN | SES receipts | Exact allowed Topic ARN; prevents cross-topic spoofing |
| SendGrid webhook verification key | SendGrid receipts | ECDSA public verification key from Event Webhook settings |
| Mailgun webhook signing key | Mailgun receipts | HMAC signing key from Mailgun webhook settings |

Each workspace and brand can own multiple Email connections by using distinct external account IDs. The connection test verifies both SMTP and IMAP before activation.

OAuth installation uses a one-time, 10-minute state tied to the workspace, brand and mailbox. Set `EMAIL_OAUTH_REDIRECT_URI` to the API callback `/api/v1/dashboard/channel-connections/email/oauth/callback` and register the exact URL with both providers. Configure `EMAIL_GOOGLE_CLIENT_ID` / `EMAIL_GOOGLE_CLIENT_SECRET` and/or `EMAIL_MICROSOFT_CLIENT_ID` / `EMAIL_MICROSOFT_CLIENT_SECRET`. Access and refresh tokens are encrypted in the connection record. The SMTP sender and IMAP poller refresh expiring tokens under a connection lease; a manually entered password removes prior OAuth tokens.

## Scheduling

| Mode | Config | Behavior |
|---|---|---|
| Sync | `EMAIL_IMAP_POLL_INTERVAL_MINUTES=5` | Default API scheduler polls active Email connections |
| Message limit | `EMAIL_IMAP_MAX_MESSAGE_BYTES=31457280` | Preflight RFC822 size before downloading a message |
| Inngest | `INNGEST_EVENT_KEY=...` | Cron uses `INNGEST_IMAP_POLL_CRON` (default `*/5 * * * *`) |
| Manual | interval `0`, no Inngest | `POST /api/v1/dashboard/email/jobs/imap-poll` polls only the authenticated organization |

Every poll claims the connection runtime lease. Multiple API replicas or overlapping cron calls therefore cannot process the same mailbox concurrently.

## Processing guarantees

1. Claim the active Email connection with a fencing token.
2. Decrypt that connection's IMAP credentials and search for `UNSEEN` messages. Fetch size and envelope metadata first; messages above `EMAIL_IMAP_MAX_MESSAGE_BYTES` are represented by a traceable placeholder without downloading the full MIME body.
3. Parse MIME and persist `channel_ingress_events` with the configured connection ID.
4. Dispatch the normalized message into threading and conversation processing.
5. Mark the remote message `\Seen` only after durable ingress succeeds.
6. On failure, leave it unseen, record runtime error/backoff, and retry later.

Provider redelivery is safe because `(connection_id, Message-ID)` is unique at ingress.

## Production checklist

- Use an app-specific password or the Gmail/Microsoft 365 OAuth connection. Verify the provider has IMAP and SMTP access enabled for the mailbox.
- Keep one connection per mailbox; do not share credentials across organizations.
- Verify SMTP and IMAP from the Dashboard after saving.
- Restrict outbound network access to the configured SMTP/IMAP hosts.
- Monitor `runtimeState`, `lastError`, retry attempts and Channel DLQ.
- Configure provider bounce/complaint webhooks before treating delivery acceptance as final delivery.

## Delivery receipts

Configure the provider callback to one of these connection-scoped endpoints:

```text
POST /api/v1/webhooks/email/receipts/ses?org=<org>&brand=<brand>&connection=<id>
POST /api/v1/webhooks/email/receipts/sendgrid?org=<org>&brand=<brand>&connection=<id>
POST /api/v1/webhooks/email/receipts/mailgun?org=<org>&brand=<brand>&connection=<id>
```

The API verifies the provider signature before parsing or persisting an event. SES validates the SNS Topic ARN, trusted AWS certificate URL and RSA signature; valid subscription confirmations are confirmed automatically. SendGrid validates its ECDSA signature against the untouched request bytes. Mailgun validates `HMAC-SHA256(timestamp + token)`. Provider callbacks do not depend on a KeenAI-only request header that the external provider cannot supply.

Events are normalized to `accepted`, `delivered`, `read`, or `failed`, written to `channel_delivery_receipts`, deduplicated, and correlated to the outbound message through RFC `Message-ID`. SES notifications should include original headers so the SMTP-generated ID is available. Temporary Mailgun failures and deferred SendGrid events do not mark a message failed while the provider is still retrying.

## Provider inbound webhooks

Raw MIME and SendGrid Inbound Parse callbacks select an active Email connection using the
`connection` query parameter. Configure either `inboundWebhookSecret` and send it as
`X-KeenAI-Connection-Secret`, or configure `inboundWebhookUsername` plus
`inboundWebhookPassword` and use HTTP Basic Auth. SES inbound notifications validate the native
SNS signature and the connection's `sesTopicArn`. Mailgun Routes validate
`HMAC-SHA256(timestamp + token)` using `mailgunWebhookSigningKey`. Authentication is completed
before MIME parsing or Durable Ingress persistence; production requests without an unambiguous
active connection are rejected.

## Troubleshooting

| Symptom | Check |
|---|---|
| `imap_connection_not_configured` | No active Email connection uses `polling` transport |
| `email_imapHost_required` | Save IMAP fields on the Email connection |
| Runtime remains `error` | Run **Test connection**, then inspect `lastError` |
| Messages remain unread | Durable ingest failed; inspect API logs and Channel DLQ |
| Duplicate conversations | Verify `Message-ID`, `In-Reply-To`, and `References` headers |

See [16-Channel.md](16-Channel.md) for the unified channel architecture.
