import type { ParsedInboundEmail, ThreadCandidate } from "./types.js";

const SUBJECT_PREFIX_RE = /^(re|fwd|fw):\s*/i;

/** Normalize subject for threading fallback (strip Re:/Fwd:). */
export function normalizeSubject(subject: string): string {
  let s = subject.trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(SUBJECT_PREFIX_RE, "").trim();
  }
  return s || "(no subject)";
}

export type ExistingThread = {
  channelId: string;
  subject?: string | null;
};

/**
 * Resolve email thread channel id using In-Reply-To, References, then subject.
 */
export function resolveThreadChannelId(
  email: Pick<ParsedInboundEmail, "inReplyTo" | "references" | "subject" | "messageId">,
  existing: ExistingThread[] = [],
): ThreadCandidate {
  if (email.inReplyTo) {
    const hit = existing.find((t) => t.channelId === email.inReplyTo);
    if (hit) {
      return {
        channelId: hit.channelId,
        subject: hit.subject ?? normalizeSubject(email.subject),
        matchReason: "in-reply-to",
      };
    }
    return {
      channelId: email.inReplyTo,
      subject: normalizeSubject(email.subject),
      matchReason: "in-reply-to",
    };
  }

  for (const ref of email.references) {
    const hit = existing.find((t) => t.channelId === ref);
    if (hit) {
      return {
        channelId: hit.channelId,
        subject: hit.subject ?? normalizeSubject(email.subject),
        matchReason: "references",
      };
    }
  }
  if (email.references[0]) {
    return {
      channelId: email.references[0],
      subject: normalizeSubject(email.subject),
      matchReason: "references",
    };
  }

  const normalized = normalizeSubject(email.subject);
  const subjectHit = existing.find((t) => normalizeSubject(t.subject ?? "") === normalized);
  if (subjectHit) {
    return {
      channelId: subjectHit.channelId,
      subject: normalized,
      matchReason: "subject",
    };
  }

  return {
    channelId: email.messageId,
    subject: normalized,
    matchReason: "subject",
  };
}
