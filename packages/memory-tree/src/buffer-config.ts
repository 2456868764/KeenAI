export type BufferConfig = {
  maxLeaves: number;
  maxTokens: number;
};

export const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  maxLeaves: 8,
  maxTokens: 3000,
};
