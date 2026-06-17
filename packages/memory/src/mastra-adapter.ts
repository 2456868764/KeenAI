import { Memory } from "@mastra/memory";
import { buildKeeniMastraStorage } from "./storage.js";

/** Mastra adapter metadata — production LibSQL storage via `buildKeeniMastraStorage`. */
export const KEENI_MEMORY_MASTRA_ADAPTER = {
  enabled: true,
  targetPackage: "@mastra/memory",
  notes:
    "Memory runs via Mastra Memory + shared LibSQL (DATABASE_URL); @keenai/memory-tree handles L2–L4 facts.",
} as const;

export type MemorySubject = "customer" | "conversation" | "brand";
export type MemoryLayer = "observation" | "episodic" | "semantic" | "procedural";

export type MemoryScope = {
  orgId: string;
  brandId: string;
  layer: MemoryLayer;
  subject: MemorySubject;
  subjectId: string;
};

export type MastraResourceScope = Omit<MemoryScope, "layer">;

/** Mastra-compatible resource id: `${orgId}:${brandId}:${subject}:${subjectId}`. */
export function toResourceId(scope: MastraResourceScope): string {
  return `${scope.orgId}:${scope.brandId}:${scope.subject}:${scope.subjectId}`;
}

/** Design-doc alias for `toResourceId`. */
export const buildMastraResourceId = toResourceId;

export const KEENI_USER_PROFILE_TEMPLATE = `
# Customer Profile

## Persona
- Name:
- Tier:
- Role / Industry:
- Locale / Timezone:

## Preferences
- Communication: <email|in-app|phone>
- Cadence: <annual|monthly>
- Style: <concise|detailed>

## Pinned Facts
- ...

## Recurring Issues
- ...

## Last Resolution
- ...

## Pending Promises
- [ ] ...

## Objections History
- price (×N)
- ...

## Relationships
- ...
`.trim();

export const DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS = {
  lastMessages: 20,
  semanticRecall: {
    topK: 3,
    messageRange: { before: 2, after: 1 },
    scope: "resource" as const,
  },
  workingMemory: {
    enabled: true,
    template: KEENI_USER_PROFILE_TEMPLATE,
  },
  generateTitle: true,
} as const;

export type BuildKeeniMastraMemoryInput = {
  orgId: string;
  brandId: string;
  storageUrl?: string;
  databaseUrl?: string;
  vectorUrl?: string;
  embedder?: string;
  /** L1 observational capture (default on). */
  observationalMemory?: boolean;
};

/** Build a brand-scoped Mastra Memory instance backed by production LibSQL storage. */
export function buildKeeniMastraMemory(input: BuildKeeniMastraMemoryInput): Memory {
  const { storage, vector } = buildKeeniMastraStorage({
    orgId: input.orgId,
    brandId: input.brandId,
    storageUrl: input.storageUrl ?? input.vectorUrl,
    databaseUrl: input.databaseUrl,
    withVector: Boolean(input.embedder),
  });

  const baseOptions = {
    lastMessages: DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS.lastMessages,
    workingMemory: DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS.workingMemory,
    generateTitle: DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS.generateTitle,
    observationalMemory: input.observationalMemory ?? true,
  };

  if (input.embedder && vector) {
    return new Memory({
      storage,
      vector,
      embedder: input.embedder,
      options: {
        ...baseOptions,
        semanticRecall: DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS.semanticRecall,
      },
    });
  }

  return new Memory({
    storage,
    options: {
      ...baseOptions,
      semanticRecall: false,
    },
  });
}

/** Design-doc alias for `buildKeeniMastraMemory`. */
export const buildKeeniMemory = buildKeeniMastraMemory;
