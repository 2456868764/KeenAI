# DKIM / SPF / DMARC for KeenAI Email

KeenAI sends agent replies via SMTP (`nodemailer`) and ingests via IMAP or inbound webhooks.
Deliverability requires DNS authentication on your **sending domain**.

## Quick checklist

1. **SPF** — authorize your SMTP relay in a TXT record on the root domain.
2. **DKIM** — sign outbound mail with a selector TXT record (`selector._domainkey.example.com`).
3. **DMARC** — publish policy at `_dmarc.example.com` after SPF + DKIM pass in staging.

## Environment

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=keenai@example.com
SMTP_PASS=...
SMTP_FROM="KeenAI Support <support@example.com>"
```

Optional DKIM signing (nodemailer):

```bash
DKIM_DOMAIN=example.com
DKIM_SELECTOR=keenai
DKIM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

When all three DKIM vars are set, KeenAI passes them to the SMTP transport.

## DNS verification

```bash
pnpm check:dkim -- --domain example.com --selector keenai
```

The script queries public DNS for SPF (root TXT), DKIM (`selector._domainkey`), and DMARC (`_dmarc`).

## Provider notes

| Provider | SPF/DKIM setup |
|----------|----------------|
| SendGrid | Domain authentication wizard exports CNAME + DKIM |
| Amazon SES | Easy DKIM in SES console |
| Google Workspace | Admin → Apps → Gmail → Authenticate email |
| Postmark | DKIM + Return-Path in server settings |

## Troubleshooting

- **Mail lands in spam** — verify SPF includes your SMTP host; align `SMTP_FROM` domain with DKIM domain.
- **DKIM fail** — ensure private key matches published public key; no extra whitespace in PEM.
- **Threading broken** — outbound uses `In-Reply-To` / `References` from the email thread `channelId`.

See also [DEPLOYMENT.md](./DEPLOYMENT.md) and [ALPHA.md](./ALPHA.md).
