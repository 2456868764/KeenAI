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
X-KeenAI-Connection-Secret: <connection inboundWebhookSecret>

<raw MIME body>
```

Also: `/webhooks/email/ses`, `/sendgrid`, `/mailgun`. Production raw MIME and SendGrid
Inbound Parse callbacks require the selected connection's secret header or Basic Auth credentials.
SES validates the signed SNS envelope against the connection's Topic ARN. Mailgun validates the
form `timestamp + token` HMAC before MIME parsing. Provider callbacks do not require a
KeenAI-specific header that the external provider cannot attach.

## Test

```bash
pnpm --filter @keenai/channels-email test
```
