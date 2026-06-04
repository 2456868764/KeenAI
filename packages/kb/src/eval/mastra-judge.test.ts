import { describe, expect, it } from "vitest";
import { scoreKbAnswerQualityWithJudge } from "./mastra-judge.js";

describe("mastra judge hook", () => {
  it("falls back to lexical scorers without judge model", async () => {
    const prev = process.env.KEENAI_EVAL_JUDGE_MODEL;
    const prevKey = process.env.OPENAI_API_KEY;
    process.env.KEENAI_EVAL_JUDGE_MODEL = undefined;
    process.env.OPENAI_API_KEY = undefined;

    const result = await scoreKbAnswerQualityWithJudge({
      query: "billing refund",
      answer: "You can request a billing refund within 30 days.",
      contextChunks: ["Billing refunds are available within 30 days of purchase."],
      expectedAnswer: "Refunds within 30 days.",
    });

    expect(result.source).toBe("lexical");
    expect(result.faithfulness).toBeGreaterThan(0);

    if (prev !== undefined) process.env.KEENAI_EVAL_JUDGE_MODEL = prev;
    if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey;
  });
});
