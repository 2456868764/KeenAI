export type RememberRequest = {
  project: string;
  title: string;
  content: string;
  type: "fact" | "conversation";
  concepts?: string[];
  sessionIds?: string[];
};

export type SmartSearchRequest = {
  query: string;
  limit: number;
  project?: string;
};

export type WireMemory = {
  id: string;
  project?: string;
  title?: string;
  content?: string;
  type?: string;
  concepts?: string[];
  sessionIds?: string[];
  updatedAt?: string;
  createdAt?: string;
  score?: number;
};

export type SmartSearchResponse = {
  results: WireMemory[];
};

export type RememberResponse = {
  id: string;
};

export type HealthResponse = {
  memories?: number;
};

export type ProjectsResponse = {
  projects: Array<{ name: string; count?: number; lastUpdated?: string }>;
};

export type AgentMemoryRecallHit = {
  id: string;
  title: string;
  content: string;
  project: string | null;
  score: number | null;
};
