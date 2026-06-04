import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { KbSourceType } from "@keenai/storage/schema";

export const KEENI_KB_KB15 = {
  enabled: true,
  target: "kb.search.freshness",
  notes: "KB-15: per-source half-life from config/kb-freshness.yaml.",
} as const;

export type KbFreshnessRule = {
  halfLifeDays: number | null;
};

export type KbFreshnessConfig = {
  sources: Partial<Record<KbSourceType, KbFreshnessRule>>;
  default: KbFreshnessRule;
};

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = join(CONFIG_DIR, "../../config/kb-freshness.yaml");

let cachedConfig: KbFreshnessConfig | null = null;

/** Minimal YAML loader for our flat freshness config (no external yaml dep). */
export function parseKbFreshnessYaml(text: string): KbFreshnessConfig {
  const sources: Partial<Record<KbSourceType, KbFreshnessRule>> = {};
  let defaultRule: KbFreshnessRule = { halfLifeDays: 90 };
  let section: "sources" | "default" | null = null;
  let currentSource: KbSourceType | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line === "sources:") {
      section = "sources";
      currentSource = null;
      continue;
    }
    if (line === "default:") {
      section = "default";
      currentSource = null;
      continue;
    }

    if (line === "sources:") {
      section = "sources";
      currentSource = null;
      continue;
    }

    const sourceKeyMatch = line.match(/^([a-z_]+):\s*$/);
    if (section === "sources" && sourceKeyMatch) {
      currentSource = sourceKeyMatch[1] as KbSourceType;
      continue;
    }

    const halfMatch = line.match(/^halfLifeDays:\s*(null|\d+)\s*$/);
    if (!halfMatch) continue;

    const halfLifeDays = halfMatch[1] === "null" ? null : Number(halfMatch[1]);
    const rule = { halfLifeDays };

    if (section === "default") {
      defaultRule = rule;
    } else if (section === "sources" && currentSource) {
      sources[currentSource] = rule;
    }
  }

  return { sources, default: defaultRule };
}

export function loadKbFreshnessConfig(configPath = DEFAULT_CONFIG_PATH): KbFreshnessConfig {
  if (!cachedConfig) {
    cachedConfig = parseKbFreshnessYaml(readFileSync(configPath, "utf8"));
  }
  return cachedConfig;
}

/** @internal Test-only cache reset. */
export function resetKbFreshnessConfigCacheForTests(): void {
  cachedConfig = null;
}

export function getKbFreshnessHalfLifeDays(
  sourceType: KbSourceType,
  config: KbFreshnessConfig = loadKbFreshnessConfig(),
): number | null {
  const rule = config.sources[sourceType];
  if (rule) return rule.halfLifeDays;
  return config.default.halfLifeDays;
}
