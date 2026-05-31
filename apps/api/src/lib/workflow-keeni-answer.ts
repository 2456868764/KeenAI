import { detectResolution } from "@keenai/agent/resolution";
import { createLlmRegistry } from "@keenai/llm";
import type { ApiEnv } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import {
  type LetKeeniAnswerInput,
  type LetKeeniAnswerResult,
  resolveLetKeeniAnswerNext,
} from "@keenai/workflow";
import { buildMessageContent, insertMessage } from "./conversations.js";
import { buildCopilotDraftRequest } from "./copilot-context.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

function createAppLlmRegistry(env: ApiEnv) {
  return createLlmRegistry({
    provider: env.LLM_PROVIDER,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,
    deepseekApiKey: env.DEEPSEEK_API_KEY,
    deepseekModel: env.DEEPSEEK_MODEL,
    kimiApiKey: env.KIMI_API_KEY,
    kimiModel: env.KIMI_MODEL,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    ollamaModel: env.OLLAMA_MODEL,
  });
}

export async function runLetKeeniAnswerBlock(
  db: Db,
  env: ApiEnv,
  input: LetKeeniAnswerInput,
): Promise<LetKeeniAnswerResult> {
  const { block, context } = input;
  const { request } = await buildCopilotDraftRequest(db, env, {
    conversationId: context.conversationId,
    orgId: context.orgId,
    brandId: context.brandId,
    userId: context.targetCustomerId,
    subject: context.subject,
    instruction: block.instructions,
  });

  if (block.toolFilter?.length) {
    request.tools = request.tools?.filter((tool) => block.toolFilter?.includes(tool.name));
  }

  const provider = createAppLlmRegistry(env).resolveDraftProvider();
  let replyText = "";
  for await (const chunk of provider.streamDraft(request)) {
    if (chunk.type === "text-delta") replyText += chunk.text;
  }

  const customerMessage = request.messages
    .filter((message) => message.role === "user")
    .at(-1)?.plainText;
  const resolution = detectResolution({
    replyText,
    customerMessage,
    hadError: false,
  });

  if (!context.isShadowRun) {
    await insertMessage(db, {
      orgId: context.orgId,
      conversationId: context.conversationId,
      senderType: "agent",
      plainText: replyText,
      content: buildMessageContent(replyText),
      isInternal: false,
      sentVia: "workflow",
      isAgentReply: true,
    });
  }

  return {
    replyText,
    resolution,
    nextBlockId: resolveLetKeeniAnswerNext(resolution.type, block.outcomeRouting),
  };
}
