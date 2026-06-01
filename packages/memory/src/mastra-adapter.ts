import { LibSQLStore, LibSQLVector } from "@mastra/libsql";
import { Memory } from "@mastra/memory";

/** Mastra adapter metadata — processors and PG backend land in later sprints. */
export const KEENI_MEMORY_MASTRA_ADAPTER = {
  enabled: true,
  targetPackage: "@mastra/memory",
  notes:
    "Memory runs via Mastra Memory + LibSQL; native @keenai/memory-tree facade remains separate.",
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
  vectorUrl?: string;
  embedder?: string;
};

/** Build a brand-scoped Mastra Memory instance (LibSQL stub backend). */
export function buildKeeniMastraMemory(input: BuildKeeniMastraMemoryInput): Memory {
  const storageUrl = input.storageUrl ?? ":memory:";
  const storageId = `keeni-memory-${input.orgId}-${input.brandId}`;
  const storage = new LibSQLStore({ id: storageId, url: storageUrl });

  if (input.embedder) {
    const vectorUrl = input.vectorUrl ?? storageUrl;
    return new Memory({
      storage,
      vector: new LibSQLVector({ id: `${storageId}-vector`, url: vectorUrl }),
      embedder: input.embedder,
      options: { ...DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS },
    });
  }

  return new Memory({
    storage,
    options: {
      lastMessages: DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS.lastMessages,
      semanticRecall: false,
      workingMemory: DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS.workingMemory,
      generateTitle: DEFAULT_KEENI_MASTRA_MEMORY_OPTIONS.generateTitle,
    },
  });
}

/** Design-doc alias for `buildKeeniMastraMemory`. */
export const buildKeeniMemory = buildKeeniMastraMemory;
