import { parseMimeSource, pollImapMailboxes } from "@keenai/channels-email";
import type { AppContext } from "../types.js";
import { ingestInboundEmail } from "./email-ingest.js";
import { resolveOrgBrandBySlug } from "./org-brand.js";

export async function runEmailImapPoll(ctx: AppContext) {
  const { env, store } = ctx;

  const orgSlug = env.EMAIL_IMAP_ORG_SLUG;
  const brandSlug = env.EMAIL_IMAP_BRAND_SLUG;

  if (!orgSlug) {
    return {
      polled: 0,
      ingested: 0,
      skipped: true,
      reason: "imap_org_not_configured",
    };
  }

  const resolved = await resolveOrgBrandBySlug(store.db, orgSlug, brandSlug);
  if ("error" in resolved) {
    return {
      polled: 0,
      ingested: 0,
      skipped: true,
      reason: resolved.error,
    };
  }

  return pollImapMailboxes(
    {
      host: env.EMAIL_IMAP_HOST,
      port: env.EMAIL_IMAP_PORT,
      user: env.EMAIL_IMAP_USER,
      password: env.EMAIL_IMAP_PASS,
      mailbox: env.EMAIL_IMAP_MAILBOX,
      orgId: resolved.org.id,
    },
    undefined,
    {
      onMessage: async (message) => {
        const parsed = await parseMimeSource(message.source);
        await ingestInboundEmail(store.db, {
          orgId: resolved.org.id,
          brandId: resolved.brand.id,
          parsed,
          env,
        });
      },
    },
  );
}
