import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { KeenaiDb } from "@keenai/storage";
import { memoryEntities, memoryEpisodes, memoryFacts, memorySlots } from "@keenai/storage/schema";
import { and, eq, isNull } from "drizzle-orm";

export type ExportMemoryVaultInput = {
  orgId: string;
  brandId: string;
  outDir: string;
};

export type ExportMemoryVaultResult = {
  outDir: string;
  filesWritten: number;
};

function safeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function formatObject(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";
  return JSON.stringify(value);
}

async function writeMarkdownFile(
  outDir: string,
  relativePath: string,
  body: string,
): Promise<void> {
  const filePath = path.join(outDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body, "utf8");
}

/** Export active memory rows as an Obsidian-style Markdown vault. */
export async function exportMemoryVault(
  db: KeenaiDb,
  input: ExportMemoryVaultInput,
): Promise<ExportMemoryVaultResult> {
  const base = and(
    eq(memoryFacts.orgId, input.orgId),
    eq(memoryFacts.brandId, input.brandId),
    isNull(memoryFacts.archivedAt),
  );

  const facts = await db.select().from(memoryFacts).where(base);
  const slots = await db
    .select()
    .from(memorySlots)
    .where(and(eq(memorySlots.orgId, input.orgId), eq(memorySlots.brandId, input.brandId)));
  const episodes = await db
    .select()
    .from(memoryEpisodes)
    .where(and(eq(memoryEpisodes.orgId, input.orgId), eq(memoryEpisodes.brandId, input.brandId)));
  const entities = await db
    .select()
    .from(memoryEntities)
    .where(and(eq(memoryEntities.orgId, input.orgId), eq(memoryEntities.brandId, input.brandId)));

  let filesWritten = 0;
  const factsByScope = new Map<string, typeof facts>();
  for (const fact of facts) {
    const key = `${fact.scope}:${fact.scopeId}`;
    const group = factsByScope.get(key) ?? [];
    group.push(fact);
    factsByScope.set(key, group);
  }

  for (const [key, group] of factsByScope) {
    const colon = key.indexOf(":");
    const scope = colon >= 0 ? key.slice(0, colon) : key;
    const scopeId = colon >= 0 ? key.slice(colon + 1) : "unknown";
    const lines = [
      "---",
      `orgId: ${input.orgId}`,
      `brandId: ${input.brandId}`,
      `scope: ${scope ?? "unknown"}`,
      `scopeId: ${scopeId ?? "unknown"}`,
      "---",
      "",
      `# Facts · ${scope}/${scopeId}`,
      "",
    ];
    for (const fact of group) {
      lines.push(
        `- **${fact.predicate}**: ${formatObject(fact.object)} (confidence ${fact.confidence.toFixed(2)})`,
      );
    }
    await writeMarkdownFile(
      input.outDir,
      `facts/${safeFileSegment(scope ?? "unknown")}_${safeFileSegment(scopeId ?? "unknown")}.md`,
      `${lines.join("\n")}\n`,
    );
    filesWritten += 1;
  }

  const slotsByScope = new Map<string, typeof slots>();
  for (const slot of slots) {
    const key = `${slot.scope}:${slot.scopeId}`;
    const group = slotsByScope.get(key) ?? [];
    group.push(slot);
    slotsByScope.set(key, group);
  }

  for (const [key, group] of slotsByScope) {
    const colon = key.indexOf(":");
    const scope = colon >= 0 ? key.slice(0, colon) : key;
    const scopeId = colon >= 0 ? key.slice(colon + 1) : "unknown";
    const lines = [
      "---",
      `orgId: ${input.orgId}`,
      `brandId: ${input.brandId}`,
      `scope: ${scope ?? "unknown"}`,
      `scopeId: ${scopeId ?? "unknown"}`,
      "---",
      "",
      `# Slots · ${scope}/${scopeId}`,
      "",
    ];
    for (const slot of group) {
      lines.push(`- **${slot.key}**: ${formatObject(slot.value)}`);
    }
    await writeMarkdownFile(
      input.outDir,
      `slots/${safeFileSegment(scope ?? "unknown")}_${safeFileSegment(scopeId ?? "unknown")}.md`,
      `${lines.join("\n")}\n`,
    );
    filesWritten += 1;
  }

  if (episodes.length > 0) {
    const lines = [
      "---",
      `orgId: ${input.orgId}`,
      `brandId: ${input.brandId}`,
      "---",
      "",
      "# Episodes",
      "",
    ];
    for (const episode of episodes) {
      lines.push(`## ${episode.topic ?? episode.id}`);
      lines.push("");
      lines.push(`- scope: ${episode.scope}/${episode.scopeId}`);
      lines.push(`- summary: ${episode.summary}`);
      lines.push("");
    }
    await writeMarkdownFile(input.outDir, "episodes/index.md", `${lines.join("\n")}\n`);
    filesWritten += 1;
  }

  if (entities.length > 0) {
    const lines = [
      "---",
      `orgId: ${input.orgId}`,
      `brandId: ${input.brandId}`,
      "---",
      "",
      "# Entities",
      "",
    ];
    for (const entity of entities) {
      lines.push(`- **${entity.entityType} · ${entity.name}** (mentions ${entity.mentionCount})`);
    }
    await writeMarkdownFile(input.outDir, "entities/index.md", `${lines.join("\n")}\n`);
    filesWritten += 1;
  }

  await writeMarkdownFile(
    input.outDir,
    "README.md",
    [
      "---",
      `orgId: ${input.orgId}`,
      `brandId: ${input.brandId}`,
      "kind: keenai-memory-vault",
      "---",
      "",
      "# KeenAI Memory Vault",
      "",
      `- facts: ${facts.length}`,
      `- slots: ${slots.length}`,
      `- episodes: ${episodes.length}`,
      `- entities: ${entities.length}`,
      "",
    ].join("\n"),
  );
  filesWritten += 1;

  return { outDir: input.outDir, filesWritten };
}
