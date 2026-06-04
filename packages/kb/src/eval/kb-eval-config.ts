import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const KEENI_KB_SPRINT18 = {
  enabled: true,
  target: "kb.eval.suite",
  notes: "Sprint 18: golden retrieval eval + lexical answer scorers (Mastra hook later).",
} as const;

export type KbEvalThresholds = {
  recallAt5Min: number;
  mrrMin: number;
  hitRateMin: number;
  faithfulnessMin: number;
  contextualRecallMin: number;
};

export type KbEvalConfig = {
  thresholds: KbEvalThresholds;
  nightlyMaxCases: number;
  smokeMaxCases: number;
};

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = join(CONFIG_DIR, "../../config/kb-eval.yaml");

let cached: KbEvalConfig | null = null;

function parseNumber(line: string): number | null {
  const m = line.match(/:\s*([0-9.]+)/);
  return m?.[1] ? Number(m[1]) : null;
}

/** Minimal YAML loader for kb-eval.yaml thresholds block. */
export function parseKbEvalYaml(text: string): KbEvalConfig {
  const thresholds: Partial<KbEvalThresholds> = {};
  let nightlyMaxCases = 50;
  let smokeMaxCases = 10;
  let inThresholds = false;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line === "thresholds:") {
      inThresholds = true;
      continue;
    }
    if (line.startsWith("schedule:") || line.startsWith("metrics:")) {
      inThresholds = false;
    }

    if (inThresholds) {
      const value = parseNumber(line);
      if (value === null) continue;
      if (line.startsWith("recall_at_5_min:")) thresholds.recallAt5Min = value;
      if (line.startsWith("mrr_min:")) thresholds.mrrMin = value;
      if (line.startsWith("hit_rate_min:")) thresholds.hitRateMin = value;
      if (line.startsWith("faithfulness_min:")) thresholds.faithfulnessMin = value;
      if (line.startsWith("contextual_recall_min:")) thresholds.contextualRecallMin = value;
      continue;
    }

    if (line.startsWith("nightly_max_cases:")) {
      const value = parseNumber(line);
      if (value !== null) nightlyMaxCases = Math.floor(value);
    }
    if (line.startsWith("smoke_max_cases:")) {
      const value = parseNumber(line);
      if (value !== null) smokeMaxCases = Math.floor(value);
    }
  }

  return {
    thresholds: {
      recallAt5Min: thresholds.recallAt5Min ?? 0.88,
      mrrMin: thresholds.mrrMin ?? 0.75,
      hitRateMin: thresholds.hitRateMin ?? 0.85,
      faithfulnessMin: thresholds.faithfulnessMin ?? 0.85,
      contextualRecallMin: thresholds.contextualRecallMin ?? 0.75,
    },
    nightlyMaxCases,
    smokeMaxCases,
  };
}

export function loadKbEvalConfig(path = DEFAULT_CONFIG_PATH): KbEvalConfig {
  if (cached && path === DEFAULT_CONFIG_PATH) return cached;
  const config = parseKbEvalYaml(readFileSync(path, "utf8"));
  if (path === DEFAULT_CONFIG_PATH) cached = config;
  return config;
}

export function checkKbEvalThresholds(
  report: {
    recallAt5: number;
    mrr: number;
    hitRate: number;
    avgFaithfulness: number | null;
    avgContextualRecall: number | null;
  },
  config: KbEvalConfig = loadKbEvalConfig(),
): { passed: boolean; failures: string[] } {
  const t = config.thresholds;
  const failures: string[] = [];
  if (report.recallAt5 < t.recallAt5Min) {
    failures.push(`recall_at_5 ${report.recallAt5.toFixed(3)} < ${t.recallAt5Min}`);
  }
  if (report.mrr < t.mrrMin) failures.push(`mrr ${report.mrr.toFixed(3)} < ${t.mrrMin}`);
  if (report.hitRate < t.hitRateMin) {
    failures.push(`hit_rate ${report.hitRate.toFixed(3)} < ${t.hitRateMin}`);
  }
  if (report.avgFaithfulness !== null && report.avgFaithfulness < t.faithfulnessMin) {
    failures.push(`faithfulness ${report.avgFaithfulness.toFixed(3)} < ${t.faithfulnessMin}`);
  }
  if (report.avgContextualRecall !== null && report.avgContextualRecall < t.contextualRecallMin) {
    failures.push(
      `contextual_recall ${report.avgContextualRecall.toFixed(3)} < ${t.contextualRecallMin}`,
    );
  }
  return { passed: failures.length === 0, failures };
}
