import type { KbChunkDraft } from "./chunk-document.js";
import type { ParsedKbDocument } from "./parse-document.js";

export const KEENI_KB_KB18_CONTEXTUAL = {
  enabled: true,
  target: "kb.ingest.contextual_retrieval",
  notes: "KB-18: optional contextual retrieval prefix with injectable LLM/provider generator.",
} as const;

export const KB_CONTEXTUAL_RETRIEVAL_PROMPT = `Here is a document:
<document>
{{document}}
</document>

Here is the chunk we want to situate within the document:
<chunk>
{{chunk}}
</chunk>

Please give a short succinct context to situate this chunk within the overall document for improving search retrieval.
Answer only with the succinct context.`;

export type KbContextualGeneratorInput = {
  title: string;
  fullDocument: string;
  chunk: string;
  chunkIndex: number;
  sectionId: string | null;
  existingContextPrefix: string | null;
  prompt: string;
};

export type KbContextualGenerator = (
  input: KbContextualGeneratorInput,
) => Promise<string | null | undefined>;

export type AddKbContextualRetrievalOptions = {
  generateContext: KbContextualGenerator;
  maxContextChars?: number;
};

function compactContext(value: string | null | undefined, maxChars: number): string | null {
  const context = value?.replace(/\s+/g, " ").trim();
  if (!context) return null;
  if (context.length <= maxChars) return context;
  return context.slice(0, maxChars).trim();
}

function contextualPrompt(fullDocument: string, chunk: string): string {
  return KB_CONTEXTUAL_RETRIEVAL_PROMPT.replace("{{document}}", fullDocument).replace(
    "{{chunk}}",
    chunk,
  );
}

/** Optional Anthropic-style contextual retrieval enrichment, provider-agnostic for tests/runtime. */
export async function addKbContextualRetrieval(
  parsed: ParsedKbDocument,
  drafts: KbChunkDraft[],
  options: AddKbContextualRetrievalOptions,
): Promise<KbChunkDraft[]> {
  const maxContextChars = options.maxContextChars ?? 240;

  return Promise.all(
    drafts.map(async (draft) => {
      const context = compactContext(
        await options.generateContext({
          title: parsed.title,
          fullDocument: parsed.plainText,
          chunk: draft.content,
          chunkIndex: draft.chunkIndex,
          sectionId: draft.sectionId,
          existingContextPrefix: draft.contextPrefix,
          prompt: contextualPrompt(parsed.plainText, draft.content),
        }),
        maxContextChars,
      );

      if (!context) return draft;

      return {
        ...draft,
        content: `${context}\n\n${draft.content}`,
        contextPrefix: [draft.contextPrefix, context].filter(Boolean).join("\n\n"),
      };
    }),
  );
}
