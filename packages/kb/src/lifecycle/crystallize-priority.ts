import type { KeenaiDb } from "@keenai/storage";
import { memoryHotness } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";

export const KEENI_KB_KB24 = {
  enabled: true,
  target: "kb.crystallize.priority",
  notes: "KB-24: Memory Tree hotness boosts crystallization queue priority.",
} as const;

export type KbCrystallizeQueueItem = {
  conversationId: string;
  userId: string;
  priority: number;
  hotnessScore: number;
};

export type RankKbCrystallizeCandidatesInput = {
  orgId: string;
  brandId: string;
  conversationIds: Array<{ conversationId: string; userId: string }>;
};

/** KB-24: rank crystallize jobs by customer hotness (higher first). */
export async function rankKbCrystallizeCandidates(
  db: KeenaiDb,
  input: RankKbCrystallizeCandidatesInput,
): Promise<KbCrystallizeQueueItem[]> {
  const hotRows = await db
    .select({
      entityId: memoryHotness.entityId,
      score: memoryHotness.score,
    })
    .from(memoryHotness)
    .where(and(eq(memoryHotness.orgId, input.orgId), eq(memoryHotness.brandId, input.brandId)))
    .orderBy(desc(memoryHotness.score));

  const hotnessByUser = new Map(hotRows.map((row) => [row.entityId, row.score ?? 0]));

  return input.conversationIds
    .map((item) => {
      const hotnessScore = hotnessByUser.get(item.userId) ?? 0;
      return {
        conversationId: item.conversationId,
        userId: item.userId,
        hotnessScore,
        priority: 1 + hotnessScore,
      };
    })
    .sort((a, b) => b.priority - a.priority);
}
