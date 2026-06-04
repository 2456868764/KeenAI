export type KbCrystallizeExtractSource = "heuristic" | "llm";

export type ExtractKbCrystallizeFaqInput = {
  question: string;
  answer: string;
  csatScore: number;
};

export type ExtractKbCrystallizeFaqResult = {
  question: string;
  answer: string;
  entities: string[];
  source: KbCrystallizeExtractSource;
};

export type ExtractKbCrystallizeFaqOptions = {
  model?: string | null;
  apiKey?: string | null;
  baseUrl?: string;
  fetchFn?: typeof fetch;
};

type LlmFaqJson = {
  question?: string;
  answer?: string;
  entities?: string[];
};

function heuristicExtract(input: ExtractKbCrystallizeFaqInput): ExtractKbCrystallizeFaqResult {
  const question = input.question.trim().replace(/\s+/g, " ");
  const answer = input.answer.trim().replace(/\s+/g, " ");
  const tokens = `${question} ${answer}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
  const entities = [...new Set(tokens)].slice(0, 8);
  return { question, answer, entities, source: "heuristic" };
}

function parseLlmFaqJson(text: string): LlmFaqJson | null {
  try {
    const parsed = JSON.parse(text) as LlmFaqJson;
    if (typeof parsed.question === "string" && typeof parsed.answer === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

/** I108: optional OpenAI-compatible FAQ extraction when model + API key are configured. */
export async function extractKbCrystallizeFaq(
  input: ExtractKbCrystallizeFaqInput,
  options?: ExtractKbCrystallizeFaqOptions,
): Promise<ExtractKbCrystallizeFaqResult> {
  const model = options?.model ?? process.env.KEENAI_CRYSTALLIZE_MODEL ?? null;
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? null;

  if (!model || !apiKey) {
    return heuristicExtract(input);
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const baseUrl = (options?.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");

  try {
    const res = await fetchFn(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You extract a single FAQ pair from a resolved support conversation. Return JSON: { question, answer, entities[] }. Question must be standalone; answer must be concise and factual; entities are key nouns.",
          },
          {
            role: "user",
            content: `CSAT: ${input.csatScore}/5\nUser: ${input.question}\nAgent: ${input.answer}`,
          },
        ],
      }),
    });

    if (!res.ok) return heuristicExtract(input);

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return heuristicExtract(input);

    const parsed = parseLlmFaqJson(content);
    if (!parsed?.question?.trim() || !parsed?.answer?.trim()) {
      return heuristicExtract(input);
    }

    return {
      question: parsed.question.trim(),
      answer: parsed.answer.trim(),
      entities: Array.isArray(parsed.entities)
        ? parsed.entities.filter((e): e is string => typeof e === "string").slice(0, 12)
        : [],
      source: "llm",
    };
  } catch {
    return heuristicExtract(input);
  }
}
