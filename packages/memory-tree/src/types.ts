export const MEMORY_CHUNK_SOURCES = [
  "conversation_message",
  "email_thread",
  "ticket_comment",
  "internal_note",
] as const;

export type MemoryChunkSource = (typeof MEMORY_CHUNK_SOURCES)[number];

export const MEMORY_CHUNK_LIFECYCLES = [
  "pending_extraction",
  "admitted",
  "buffered",
  "sealed",
  "dropped",
] as const;

export type MemoryChunkLifecycle = (typeof MEMORY_CHUNK_LIFECYCLES)[number];

export type CanonicalAttachment = {
  id: string;
  mime: string | null;
  fileName: string | null;
};

export type CanonicalizeMessageInput = {
  orgId: string;
  brandId: string;
  source: MemoryChunkSource;
  conversationId: string;
  messageId: string;
  senderType: string;
  sentAt: Date;
  plainText: string;
  attachments?: CanonicalAttachment[];
};

export type CanonicalDocument = {
  frontmatter: Record<string, string>;
  body: string;
  bodyMd: string;
};

export type PersistMemoryChunkInput = {
  orgId: string;
  brandId: string;
  source: MemoryChunkSource;
  sourceRef: string;
  bodyMd: string;
  lifecycle?: MemoryChunkLifecycle;
  metadata?: Record<string, unknown>;
};

export type PersistMemoryChunkResult = {
  id: string;
  created: boolean;
  lifecycle: MemoryChunkLifecycle;
  fastScore: number | null;
  chunk: {
    id: string;
    orgId: string;
    brandId: string;
    source: string;
    sourceRef: string;
    bodyMd: string;
    lifecycle: string;
    fastScore: number | null;
  };
};
