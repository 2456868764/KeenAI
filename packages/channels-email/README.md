# @keenai/channels-email

Email channel utilities for KeenAI (Sprint 3).

## Features

- **MIME parsing** — `parseMimeSource` via [mailparser](https://nodemailer.com/express/mail-parser/)
- **Threading** — `resolveThreadChannelId` (In-Reply-To → References → normalized Subject)
- **Outbound** — `sendOutboundEmail` / `sendAgentReply` via nodemailer
- **Inbound webhooks** — adapters for raw MIME, SES (SNS JSON), SendGrid, Mailgun

## API webhooks

```http
POST /api/v1/webhooks/email/inbound?org=demo&brand=default
Content-Type: message/rfc822
X-KeenAI-Webhook-Secret: <optional WEBHOOK_EMAIL_SECRET>

<raw MIME body>
```

Also: `/webhooks/email/ses`, `/sendgrid`, `/mailgun`.

## Test

```bash
pnpm --filter @keenai/channels-email test
```
