import { describe, expect, it, vi } from "vitest";
import { extractKbCrystallizeFaq } from "./crystallize-extract.js";

describe("extractKbCrystallizeFaq", () => {
  it("uses heuristic when model or api key is missing", async () => {
    const result = await extractKbCrystallizeFaq(
      {
        question: "How do I reset?",
        answer: "Use forgot password.",
        csatScore: 5,
      },
      { model: null, apiKey: null },
    );
    expect(result.source).toBe("heuristic");
    expect(result.question).toBe("How do I reset?");
  });

  it("parses LLM JSON when configured", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                question: "How do I reset my password?",
                answer: "Click forgot password on the login page.",
                entities: ["password", "login"],
              }),
            },
          },
        ],
      }),
    );

    const result = await extractKbCrystallizeFaq(
      {
        question: "reset?",
        answer: "forgot link",
        csatScore: 5,
      },
      { model: "gpt-4o-mini", apiKey: "sk-test", fetchFn },
    );

    expect(result.source).toBe("llm");
    expect(result.question).toContain("password");
    expect(result.entities).toContain("login");
  });

  it("falls back to heuristic on LLM error", async () => {
    const fetchFn = vi.fn(async () => new Response("error", { status: 500 }));
    const result = await extractKbCrystallizeFaq(
      { question: "Q", answer: "A", csatScore: 4 },
      { model: "gpt-4o-mini", apiKey: "sk-test", fetchFn },
    );
    expect(result.source).toBe("heuristic");
  });
});
