export type KeeniMemoryMessage = {
  role: string;
  content: string | unknown;
  metadata?: {
    confidence?: number;
    [key: string]: unknown;
  };
};

export type KeeniMemoryMessageList = KeeniMemoryMessage[];

/** KeenAI memory processor — wired to Agent inputProcessors in a later sprint. */
export interface KeeniMemoryProcessor {
  readonly id: string;
  process(messages: KeeniMemoryMessageList): Promise<KeeniMemoryMessageList>;
}

export type BuildKeeniMemoryProcessorsInput = {
  pii?: boolean;
  trajectory?: { keepLast: number; targetTokens: number } | false;
  confidence?: { minConfidence: number } | false;
};
