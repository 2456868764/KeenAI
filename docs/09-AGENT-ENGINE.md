# KeenAI Agent 执行核心设计（Keeni Agent Engine · TypeScript）

> **设计参考**：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) —— 自学习 Agent 架构、多渠道 Gateway、Skill 系统、Subagent 委派、Trajectory 压缩  
> **本地对照源码**：克隆到仓库根目录 `hermes-agent/`（见 [00-REFERENCE-REPOS.md](00-REFERENCE-REPOS.md)）  
> **落地框架**：[Mastra](https://mastra.ai/) （Agent + Memory + Workflow + Eval + MCP 一体化 TS 框架）+ [Vercel AI SDK v4](https://sdk.vercel.ai/)（统一 LLM Provider / 流式 / tool calling）

---

## 一、设计哲学

KeenAI 的 Agent 执行核心 **Keeni Agent Engine**，借鉴 Hermes Agent 的「会成长的 Agent」（the agent that grows with you）理念，但聚焦在 **客户支持场景**，而不是通用编程 Agent。

### 1.1 核心原则

| 原则 | Hermes 原话 | KeenAI 实现 |
|------|-------------|-------------|
| **自学习闭环** | "creates skills from experience, improves them during use" | 从已解决工单中自动提炼 Skill；Skill 在使用中持续优化（Inngest cron + Mastra Eval） |
| **跨会话记忆** | "searches its own past conversations" | 客服对话级 / 客户级 / 品牌级三级记忆（Mastra Memory + LibSQL/PG） |
| **用户深度建模** | "builds a deepening model of who you are across sessions" | 每个终端用户的画像随交互演进（Mastra `workingMemory`） |
| **多渠道统一** | "Lives where you do — Telegram, Discord, Slack, WhatsApp, Signal" | Messenger + Email + Slack + Discord + Telegram 单一 Gateway |
| **多 LLM 不绑定** | "Use any model you want ... no code changes, no lock-in" | Vercel AI SDK 20+ Provider + `@ai-sdk/openai-compatible` 兜底 |
| **委派与并行** | "Spawn isolated subagents for parallel workstreams" | Mastra Agent Networks（子 Agent + workflow 编排） |
| **轨迹压缩** | "trajectory_compressor.py" | Mastra Memory `processors` + 自定义压缩管线 |
| **定时自动化** | "Built-in cron scheduler" | Inngest scheduled functions（SLA 检查、Memory 巩固） |

### 1.2 与通用 Agent 框架的区别

| 对比项 | LangChain.js Agent | Hermes Agent | **Keeni Agent (Mastra-based)** |
|--------|--------------------|--------------|--------------------------------|
| 定位 | 通用 LLM 编排 | 自学习个人助手 | 客户支持垂直 Agent |
| 上下文 | 单会话 | 跨会话用户建模 | 跨会话 + 跨客户 + 跨品牌 |
| Skill | 无 | 自创建 + 自改进 | 自创建（从工单）+ 客服策划 |
| 渠道 | 需自接 | 内置多平台 | 内置多平台 + 邮件 |
| 长期记忆 | 需自集成 | 内置 | 内置（多租户隔离 · Memory Processors） |
| 部署 | 库 | CLI + 多后端 | Bun 单进程 + Inngest worker |

---

## 二、整体架构

```
                                ┌──────────────────────────────┐
                                │       Gateway Layer          │
                                │ (Messenger/Email/Slack/...)  │
                                └──────────────┬───────────────┘
                                               │
                                ┌──────────────▼───────────────┐
                                │      Agent Orchestrator      │  ← 入口
                                │     (per Conversation)       │
                                │   Mastra Agent + Hono SSE    │
                                └──────────────┬───────────────┘
                                               │
       ┌───────────────────────────────────────┼───────────────────────────────────────┐
       │                                       │                                       │
┌──────▼──────┐  ┌──────────────┐  ┌──────────▼─────────┐  ┌──────────┐  ┌─────────▼─────────┐
│  Personality │  │   Context     │  │   Agent Loop      │  │  Tools   │  │   Subagent        │
│   System     │  │  Assembler    │  │  (Plan→Act→Obs)   │  │  System  │  │   (Agent Network) │
│              │  │ (Mastra       │  │  Vercel AI SDK    │  │          │  │                   │
│ - Brand Voice│  │  Processors)  │  │  streamText loop  │  │ - Local  │  │ - Search Subagent │
│ - Lang/Tone  │  │ - Memory      │  │ - Trajectory      │  │ - HTTP   │  │ - Research        │
│ - System     │  │ - RAG         │  │   Compression     │  │ - MCP    │  │ - Summary         │
│   Prompt     │  │ - User Profile│  │ - Tool Calling    │  │ - Custom │  │                   │
└──────────────┘  │ - History     │  │ - Streaming       │  │          │  │                   │
                  └───────┬───────┘  └─────────┬─────────┘  └─────┬────┘  └───────────────────┘
                          │                    │                  │
                ┌─────────▼────────┐  ┌────────▼────────┐  ┌──────▼─────┐
                │  Memory System   │  │ LLM Provider    │  │  Sandbox   │
                │  (@mastra/memory)│  │  Registry       │  │  Backends  │
                │                  │  │ (Vercel AI SDK  │  │ (Workers/  │
                │  4-tier consol.  │  │  + Failover)    │  │  Docker/   │
                └──────────────────┘  └─────────────────┘  │  iso-vm)   │
                          │                                └────────────┘
                ┌─────────▼────────┐
                │  Knowledge Base  │  ← RAG
                │  (@mastra/rag    │
                │  + Hybrid)       │
                │ BM25 + Vec + KG  │
                └──────────────────┘
                          │
                ┌─────────▼────────┐
                │  Skill System    │
                │  - Auto-discover │
                │  - Self-improve  │
                │  - Versioned     │
                └──────────────────┘

                            ┌──────────────────────┐
                            │   Inngest Scheduler  │  ← 周期任务
                            │  - SLA monitoring    │
                            │  - Memory consol.    │
                            │  - Skill refinement  │
                            │  - Daily reports     │
                            └──────────────────────┘
```

---

## 三、Agent Orchestrator（编排核心）

### 3.1 基于 Mastra Agent

KeenAI 不重复造轮，直接基于 `@mastra/core/agent` 的 `Agent` 类构建。每个 Brand 一个 Agent 实例（或按需创建）：

```ts
// packages/agent/src/orchestrator.ts
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { createTool } from '@mastra/core/tools';

import { buildPersonality } from './personality.js';
import { keenaiTools } from './tools/index.js';
import { mcpToolsForBrand } from '../mcp/host.js';

export type AgentParams = {
  orgId: string;
  brandId: string;
  conversationId: string;
  userId: string;
};

export async function buildKeeniAgent(p: AgentParams) {
  const personality = await buildPersonality(p.brandId);
  const memory = await buildMemory(p);
  const tools  = {
    ...keenaiTools(p),                           // 内置工具
    ...(await mcpToolsForBrand(p.brandId)),      // MCP 外部工具
  };

  return new Agent({
    id:           `keeni-${p.brandId}`,
    name:         personality.name,
    description:  `Customer support agent for ${p.brandId}`,
    instructions: personality.systemPrompt,
    model:        modelForRoute('chat_response'), // 见 §6 Model Routing
    memory,
    tools,
    defaultGenerateOptions: {
      maxSteps:   10,                            // PAOR 最多 10 轮
      temperature: 0.3,
    },
  });
}
```

### 3.2 Agent Run（PAOR 主循环）

**Plan-Act-Observe-Reflect** 循环由 Mastra 的 `agent.stream()` / `agent.generate()` 内部 `streamText` + `maxSteps` 自动驱动；KeenAI 在 **Run Wrapper** 中加 Pre/Post 钩子做记忆巩固与 Skill 改进：

```ts
// packages/agent/src/run.ts
import type { Agent } from '@mastra/core/agent';
import { inngest } from '@keenai/workflow/inngest';
import { tracer } from '@keenai/observability';

export interface AgentRunRequest {
  messages:      Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  trigger:       'user_msg' | 'scheduled' | 'workflow_step';
  stream:        boolean;
  maxIterations: number;                          // 默认 10
  toolBudget:    number;                          // 默认 8
  tokenBudget:   number;                          // 默认 6000
  resourceId:    string;                          // = userId（Memory 维度）
  threadId:      string;                          // = conversationId
}

export async function runKeeniAgent(agent: Agent, req: AgentRunRequest) {
  const span = tracer.startSpan('keeni.agent.run');

  // 1. PLAN + ACT + OBSERVE 由 Mastra 内部完成（streamText loop with maxSteps）
  const stream = await agent.stream(req.messages, {
    resourceId:  req.resourceId,
    threadId:    req.threadId,
    maxSteps:    req.maxIterations,
    // tools 已在 Agent 定义时注入
  });

  // 2. 流式回写（Hono SSE 透传）
  for await (const chunk of stream.fullStream) {
    yield mapToAgentEvent(chunk);                 // 见 §14 Streaming Event 类型
  }

  // 3. REFLECT / POST-RUN：异步触发记忆巩固与 Skill 改进
  await inngest.send({
    name: 'agent/run.completed',
    data: { ...req, finishReason: stream.finishReason, usage: stream.usage },
  });

  span.end();
  return stream;
}
```

### 3.3 工具调用并行化

Vercel AI SDK 默认 `toolCallStreaming: true` + `maxSteps > 1` 自动多轮；当一个 step 内出现 **多个独立工具调用**（典型 `parallel_tool_calls`），SDK 会**并行执行**：

```ts
// 启用并行 tool calling（OpenAI / Anthropic 支持）
import { generateText } from 'ai';

await generateText({
  model: openai('gpt-5'),
  messages,
  tools: { searchKb, getCustomer, listOpenTickets },
  maxSteps: 10,
  experimental_continueSteps: true,
  toolChoice: 'auto',
  // OpenAI: parallel_tool_calls=true 默认；Anthropic: 自动开启
});
```

对于 **跨 Agent 并行**（如同时让 SearchAgent + ResearchAgent + ActionAgent 工作），用 Mastra **Agent Network** + 内部 workflow（见 §9 Subagent System）。

---

## 四、Personality System（人格 / 品牌）

借鉴 Hermes 的 `/personality [name]` 概念，每个 Brand 一份独立人格：

### 4.1 Personality 配置（DB 表 + Zod schema）

```ts
// packages/agent/src/personality.ts
import { z } from 'zod';

export const PersonalitySchema = z.object({
  name:    z.string(),                           // "Keeni"
  avatar:  z.string().url(),
  voice: z.object({
    tone:           z.enum(['friendly_professional', 'casual', 'formal']),
    formality:      z.number().min(0).max(1),     // 0=casual, 1=formal
    emojiUsage:     z.enum(['none', 'minimal', 'rich']),
    responseLength: z.enum(['concise', 'balanced', 'detailed']),
  }),
  language: z.object({
    primary:    z.string(),                       // 'zh-CN'
    fallback:   z.string(),                       // 'en'
    autoDetect: z.boolean().default(true),
  }),
  systemPrompt: z.string(),                      // Mastra Agent.instructions
  guardRails: z.array(z.string()),               // 'never_promise_refund_without_approval', ...
  sensitiveTopics: z.array(z.string()),          // ['legal', 'complaint', 'threat']
  capabilities: z.array(z.string()),             // 'answer_questions', 'create_ticket', ...
});

export type Personality = z.infer<typeof PersonalitySchema>;

export async function buildPersonality(brandId: string): Promise<Personality> {
  const raw = await db.query.personalities.findFirst({ where: eq(personalities.brandId, brandId) });
  return PersonalitySchema.parse(raw);
}
```

### 4.2 数据库示例（Drizzle）

```ts
// packages/db/schema/personalities.ts
import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const personalities = pgTable('personalities', {
  brandId:      text('brand_id').primaryKey(),
  name:         text('name').notNull(),
  avatar:       text('avatar'),
  voice:        jsonb('voice').notNull(),
  language:     jsonb('language').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  guardRails:   jsonb('guard_rails').notNull(),
  sensitiveTopics: jsonb('sensitive_topics').notNull(),
  capabilities: jsonb('capabilities').notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 五、Context Assembler（上下文装配器）

Mastra Memory 自动负责大部分组装，KeenAI 再叠加 RAG 与品牌上下文：

```
┌──────────────────────────────────────────────────┐
│  1. System Prompt（人格 + 守则）                  │   ~500 tok   ← Agent.instructions
├──────────────────────────────────────────────────┤
│  2. Brand Context（品牌信息 / FAQ 摘要）          │   ~300 tok   ← runtime context
├──────────────────────────────────────────────────┤
│  3. User Profile（客户画像 from Memory）          │   ~200 tok   ← Memory.workingMemory
├──────────────────────────────────────────────────┤
│  4. Memory Slots（pinned slots）                  │   ~500 tok   ← Memory.semanticRecall
│     - user_preferences                            │
│     - tool_guidelines                             │
│     - session_patterns                            │
├──────────────────────────────────────────────────┤
│  5. RAG Retrieved Knowledge（Top-K chunks）       │   ~1500 tok  ← @mastra/rag + custom hybrid
├──────────────────────────────────────────────────┤
│  6. Conversation History（压缩后）                │   ~2000 tok  ← Memory + TokenLimiter processor
├──────────────────────────────────────────────────┤
│  7. Current User Message                          │   ~200 tok
├──────────────────────────────────────────────────┤
│  8. Tool Definitions（Function Calling Schema）   │   ~800 tok   ← Vercel AI SDK 自动
└──────────────────────────────────────────────────┘
                                          总预算：~6000 tok
                                          剩余给 LLM 生成：~2000 tok
```

### 5.1 自适应 Token 预算

```ts
// packages/agent/src/context/budget.ts
export interface ContextBudget {
  total:         number;     // 总预算（模型 Context Window 的 60%）
  systemPrompt:  number;     // 500
  brandContext:  number;     // 300
  userProfile:   number;     // 200
  memorySlots:   number;     // 500
  rag:           number;     // 剩余 * 0.4
  history:       number;     // 剩余 * 0.5
  tools:         number;     // 800
}

export function computeBudget(modelContextWindow: number): ContextBudget {
  const total = Math.floor(modelContextWindow * 0.6);
  const fixed = 500 + 300 + 200 + 500 + 800;
  const dyn   = total - fixed;
  return {
    total,
    systemPrompt: 500, brandContext: 300, userProfile: 200, memorySlots: 500,
    rag:     Math.floor(dyn * 0.4),
    history: Math.floor(dyn * 0.5),
    tools:   800,
  };
}
```

### 5.2 Trajectory Compression（轨迹压缩）

借鉴 Hermes 的 `trajectory_compressor.py`，借助 Mastra **Memory Processors** 实现：

```ts
// packages/memory/src/processors/trajectory-compressor.ts
import type { MessageList, MemoryProcessor } from '@mastra/core/memory';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

/**
 * Recent-K + Summary 策略：
 *   - 保留最近 K 轮原文
 *   - 前面对话用 LLM 总结为「关键事件 + 决策 + 用户偏好」
 *   - Tool 调用结果压缩为「调用 X，结果摘要：...」
 */
export class TrajectoryCompressor implements MemoryProcessor {
  constructor(private opts: { keepLast: number; targetTokens: number }) {}

  async process(messages: MessageList): Promise<MessageList> {
    if (estimateTokens(messages) < this.opts.targetTokens) return messages;

    const recent = messages.slice(-this.opts.keepLast);
    const older  = messages.slice(0, -this.opts.keepLast);
    if (older.length === 0) return messages;

    const { text: summary } = await generateText({
      model: openai('gpt-5-mini'),
      messages: [
        { role: 'system', content: COMPRESSOR_PROMPT },
        { role: 'user',   content: serializeMessages(older) },
      ],
    });

    return [
      { role: 'system', content: `[Compressed History]\n${summary}` },
      ...recent,
    ];
  }
}

const COMPRESSOR_PROMPT = `
Summarize the older conversation history below. Preserve:
- User preferences and personal facts
- Key decisions and commitments made
- Tool calls and their outcomes (abbreviated)
- Outstanding questions / pending actions
Discard small talk and intermediate reasoning.
Output: a structured bullet list, max 500 tokens.
`;
```

挂载到 Memory：

```ts
import { Memory } from '@mastra/memory';
import { TokenLimiter, ToolCallFilter } from '@mastra/memory/processors';
import { TrajectoryCompressor } from '@keenai/memory/processors';

new Memory({
  storage: libsql,
  vector:  libsqlVec,
  embedder,
  options: {
    lastMessages: 20,
    semanticRecall: { topK: 3, messageRange: { before: 2, after: 1 } },
    workingMemory:  { enabled: true, template: USER_PROFILE_TEMPLATE },
  },
  processors: [
    new ToolCallFilter({ exclude: ['debug_tool'] }),
    new TrajectoryCompressor({ keepLast: 5, targetTokens: 1500 }),
    new TokenLimiter({ limit: 4000 }),            // 兜底
  ],
});
```

---

## 六、LLM Provider Registry（多 LLM 不绑定）

参考 Hermes「Use any model you want」，KeenAI 在 Vercel AI SDK 之上薄薄包一层 Registry：

### 6.1 Provider 抽象

```ts
// packages/llm/src/provider.ts
import type { LanguageModel, EmbeddingModel } from 'ai';

export interface Capabilities {
  maxContext:      number;
  streaming:       boolean;
  functionCalling: boolean;
  vision:          boolean;
  reasoning:       boolean;
  jsonMode:        boolean;
  supportedModels: string[];
}

export interface LLMProvider {
  readonly name: string;
  capabilities(): Capabilities;
  chat(model: string): LanguageModel;            // AI SDK LanguageModel
  embed(model: string): EmbeddingModel<string>;
  rerank?(query: string, docs: string[]): Promise<{ index: number; score: number }[]>;
  healthCheck(): Promise<boolean>;
  pricing(): { input: number; output: number; embedding?: number };
}
```

### 6.2 Provider Registry + Failover

```ts
// packages/llm/src/registry.ts
import { openai }        from '@ai-sdk/openai';
import { anthropic }     from '@ai-sdk/anthropic';
import { google }        from '@ai-sdk/google';
import { deepseek }      from '@ai-sdk/deepseek';
import { createOllama }  from 'ollama-ai-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

const ollama   = createOllama({ baseURL: process.env.OLLAMA_BASE_URL });
const zhipu    = createOpenAICompatible({ name: 'zhipu',    baseURL: 'https://open.bigmodel.cn/api/paas/v4',     apiKey: process.env.ZHIPU_API_KEY!   });
const moonshot = createOpenAICompatible({ name: 'moonshot', baseURL: 'https://api.moonshot.cn/v1',                apiKey: process.env.MOONSHOT_API_KEY! });
const qwen     = createOpenAICompatible({ name: 'qwen',     baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: process.env.QWEN_API_KEY! });
const router   = createOpenAICompatible({ name: 'openrouter', baseURL: 'https://openrouter.ai/api/v1',           apiKey: process.env.OPENROUTER_API_KEY! });

export const providers = {
  openai, anthropic, google, deepseek, ollama, zhipu, moonshot, qwen, router,
} as const;

export type ProviderId = keyof typeof providers;

/** 模型路由（按场景） */
export type RouteKey =
  | 'chat_response' | 'reasoning_heavy' | 'long_context'
  | 'classification' | 'summarization'   | 'vision'
  | 'translation'    | 'embedding'       | 'rerank';

const ROUTING: Record<RouteKey, { primary: () => LanguageModel; fallback?: Array<() => LanguageModel> }> = {
  chat_response: {
    primary:  () => openai('gpt-5-mini'),
    fallback: [() => anthropic('claude-haiku-5'), () => deepseek('deepseek-chat'), () => ollama('qwen2.5:14b')],
  },
  reasoning_heavy: {
    primary:  () => deepseek('deepseek-reasoner'),
    fallback: [() => openai('o4-mini'), () => anthropic('claude-sonnet-5')],
  },
  long_context: {
    primary:  () => moonshot('moonshot-v1-128k'),
    fallback: [() => google('gemini-2.5-pro'), () => anthropic('claude-sonnet-5')],
  },
  classification: {
    primary:  () => openai('gpt-5-mini'),
  },
  summarization: {
    primary:  () => anthropic('claude-haiku-5'),
  },
  vision: {
    primary:  () => google('gemini-2.5-flash'),
    fallback: [() => openai('gpt-5')],
  },
  translation: {
    primary:  () => openai('gpt-5-mini'),
  },
  embedding: { primary: () => openai.embedding('text-embedding-3-small') as any },
  rerank:    { primary: () => google('gemini-2.5-flash') }, // 或本地 bge-reranker
};

export function modelForRoute(key: RouteKey): LanguageModel {
  return ROUTING[key].primary();
}

/** 带 Failover 的流式生成 */
export async function streamWithFailover(args: Parameters<typeof streamTextRaw>[0] & { route: RouteKey }) {
  const { route, ...rest } = args;
  const candidates = [ROUTING[route].primary, ...(ROUTING[route].fallback ?? [])];
  let lastErr: unknown;
  for (const buildModel of candidates) {
    try {
      return await streamTextRaw({ ...rest, model: buildModel() });
    } catch (err) {
      if (!isRetriable(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
```

### 6.3 内置 Provider 矩阵

| Provider | 包 | 默认场景 |
|----------|----|----------|
| **OpenAI** | `@ai-sdk/openai` | 默认 chat / classification / embedding |
| **Anthropic** | `@ai-sdk/anthropic` | 备用 + 长文本 + 总结 |
| **Google Gemini** | `@ai-sdk/google` | 多模态 / vision / rerank |
| **DeepSeek** | `@ai-sdk/deepseek` | 国产推理 / 复杂逻辑 |
| **智谱 GLM** | `@ai-sdk/openai-compatible` | 国产 |
| **Moonshot** | `@ai-sdk/openai-compatible` | 国产长文本（128k） |
| **MiniMax** | `@ai-sdk/openai-compatible` | 国产 |
| **通义 Qwen** | `@ai-sdk/openai-compatible` | 国产 |
| **Xiaomi MiMo** | `@ai-sdk/openai-compatible` | 国产开源 |
| **OpenRouter** | `@ai-sdk/openai-compatible` | 200+ 聚合 / 灵活兜底 |
| **Ollama** | `ollama-ai-provider` | 本地部署 |
| **vLLM / LM Studio** | `@ai-sdk/openai-compatible` | 自托管 |
| **NovitaAI** | `@ai-sdk/openai-compatible` | 国产备用 |
| **Hugging Face Inference** | `@ai-sdk/openai-compatible` | 自定义 endpoint |

> 国内 / 自部署模型一律通过 `@ai-sdk/openai-compatible` 一行接入，无需重写业务代码。

### 6.4 Failover 触发条件

```ts
function isRetriable(err: unknown): boolean {
  const e = err as { name?: string; statusCode?: number; reason?: string };
  return (
    e.name === 'AI_RateLimitError' ||
    e.name === 'AI_TimeoutError'   ||
    e.statusCode === 429           ||
    (e.statusCode ?? 0) >= 500     ||
    e.reason === 'quota_exhausted'
  );
}
```

---

## 七、Tool System（工具系统）

### 7.1 Tool 分类

| 类别 | 例子 | 触发权限 |
|------|------|----------|
| **Knowledge** | `search_help_center`, `search_feedback` | 总是允许 |
| **Conversation** | `summarize_history`, `translate` | 总是允许 |
| **Ticketing** | `create_ticket`, `link_tracker` | 自动允许 |
| **Customer Action** | `extend_trial`, `apply_discount`, `refund` | 需要 Custom Action 配置 |
| **Workflow Bridge** | `execute_workflow`, `branch_to` | 自动允许 |
| **MCP External** | 任意 MCP Server | 配置允许列表 |
| **System** | `escalate_to_human`, `close_conversation` | 总是允许 |

### 7.2 Tool 定义（Mastra `createTool` + Zod）

```ts
// packages/agent/src/tools/search-kb.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { kbService } from '@keenai/kb';

export const searchKb = createTool({
  id:          'search_kb',
  description: 'Search the knowledge base for relevant articles and snippets.',
  inputSchema: z.object({
    query:    z.string(),
    topK:     z.number().int().min(1).max(20).default(5),
    sources:  z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    hits: z.array(z.object({
      id:    z.string(),
      score: z.number(),
      title: z.string(),
      url:   z.string().nullable(),
      snippet: z.string(),
    })),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { query, topK, sources } = context;
    const orgId   = runtimeContext.get('orgId')   as string;
    const brandId = runtimeContext.get('brandId') as string;
    return kbService.search({ orgId, brandId, query, topK, sources });
  },
});
```

### 7.3 Tool 权限 / 审批

借鉴 Mastra 的 `requireApproval` 与 Durable Agent：

```ts
export const refundCustomer = createTool({
  id:          'refund_customer',
  description: 'Issue a refund to the customer.',
  inputSchema: z.object({ userId: z.string(), amount: z.number(), reason: z.string() }),
  requireApproval: true,                         // 触发人工审批流（Durable）
  execute: async ({ context }) => {
    return billingApi.refund(context);
  },
});
```

### 7.4 MCP 集成（双向）

#### 7.4.1 KeenAI 作为 MCP Host（消费外部 MCP）

```ts
// packages/mcp/src/host.ts
import { MCPClient } from '@mastra/mcp';

export const mcpHost = new MCPClient({
  servers: {
    agentmemory: {
      command: 'npx', args: ['-y', '@agentmemory/mcp'],
      env: { AGENTMEMORY_URL: 'http://localhost:3111' },
    },
    context7: {
      command: 'npx', args: ['-y', '@upstash/context7-mcp'],
    },
    braveSearch: {
      command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: process.env.BRAVE_API_KEY! },
    },
  },
});

export async function mcpToolsForBrand(brandId: string) {
  const allowed = await brandSettings.allowedMcpServers(brandId);
  const all     = await mcpHost.getTools();      // { 'agentmemory.recall': tool, ... }
  return pick(all, allowed);
}
```

#### 7.4.2 KeenAI 作为 MCP Server（暴露能力）

```ts
// packages/mcp/src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new Server({ name: 'keenai', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler({ method: 'tools/list' }, async () => ({
  tools: [
    { name: 'keenai_search_help',         description: '...', inputSchema: { ... } },
    { name: 'keenai_create_ticket',       description: '...', inputSchema: { ... } },
    { name: 'keenai_get_customer',        description: '...', inputSchema: { ... } },
    { name: 'keenai_get_feedback',        description: '...', inputSchema: { ... } },
    { name: 'keenai_send_message',        description: '...', inputSchema: { ... } },
    { name: 'keenai_assign_conversation', description: '...', inputSchema: { ... } },
    { name: 'keenai_get_metrics',         description: '...', inputSchema: { ... } },
  ],
}));

server.setRequestHandler({ method: 'tools/call' }, async ({ params }) => {
  const { name, arguments: args } = params;
  return dispatch(name, args);                   // 路由到内部 service
});

await server.connect(new StdioServerTransport());
```

---

## 八、Skill System（技能系统）

### 8.1 设计灵感
参考 Hermes：「Autonomous skill creation after complex tasks. Skills self-improve during use.」

### 8.2 Skill 定义

```ts
// packages/agent/src/skill/types.ts
import { z } from 'zod';

export const SkillSchema = z.object({
  name:        z.string(),
  description: z.string(),
  trigger: z.object({
    intent:     z.string(),
    confidence: z.number().min(0).max(1),
  }),
  steps: z.array(z.union([
    z.object({ kind: z.literal('tool'),   tool: z.string(), inputs: z.record(z.unknown()) }),
    z.object({ kind: z.literal('branch'), if: z.string(),   then: z.array(z.any()), else: z.array(z.any()) }),
    z.object({ kind: z.literal('escalate'), reason: z.string() }),
  ])),
  metrics: z.object({
    successRate:          z.number(),
    avgResolutionTimeMs:  z.number(),
    customerSatisfaction: z.number(),
  }).partial(),
  version:       z.number().int(),
  lastImproved:  z.string().datetime(),
});
export type Skill = z.infer<typeof SkillSchema>;
```

YAML 表达（管理界面）：

```yaml
name: refund-handler
description: 处理退款请求的标准流程
trigger: { intent: refund_request, confidence: 0.7 }
steps:
  - { kind: tool, tool: verify_user_identity }
  - { kind: tool, tool: check_eligibility }
  - { kind: tool, tool: retrieve_purchase_history }
  - kind: branch
    if: eligibility.ok
    then:
      - { kind: tool, tool: calculate_refund_amount }
      - { kind: tool, tool: execute_refund }
      - { kind: tool, tool: send_confirmation }
    else:
      - { kind: tool, tool: explain_reason }
      - { kind: escalate, reason: not_eligible }
metrics: { successRate: 0.85, avgResolutionTimeMs: 120000, customerSatisfaction: 4.6 }
version: 3
lastImproved: '2026-05-19T03:00:00Z'
```

### 8.3 Skill 生命周期

```
1. DISCOVER（发现）
   ├─ 客服关闭对话后 → Inngest 后台分析高频问题
   ├─ AI 自动检测「重复模式」（LLM cluster + intent）
   └─ 客服手动定义

2. PROPOSE（提议）
   ├─ LLM 生成 Skill 草稿
   ├─ 推送给客服 review
   └─ 客服审核 / 调整

3. EXECUTE（执行）
   ├─ 命中 Trigger → Agent 内部走 Skill 流程（作为 sub-flow）
   ├─ 记录每步耗时 + 结果（Mastra trace）
   └─ 计算成功率

4. IMPROVE（自改进）
   ├─ 每周 Inngest cron 分析执行日志
   ├─ LLM 提议优化版本
   ├─ Mastra Eval 跑 A/B 测试
   └─ 自动升级胜出版本（保留历史版本）

5. RETIRE（退役）
   └─ 长期未触发 → 归档
```

### 8.4 Skill Storage（Drizzle Schema）

```ts
// packages/db/schema/skills.ts
import { pgTable, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const skills = pgTable('skills', {
  id:             text('id').primaryKey(),
  orgId:          text('org_id').notNull(),
  brandId:        text('brand_id'),
  name:           text('name').notNull(),
  description:    text('description'),
  trigger:        jsonb('trigger').notNull(),
  definition:     jsonb('definition').notNull(),
  status:         text('status', { enum: ['active', 'draft', 'retired'] }).notNull(),
  source:         text('source', { enum: ['manual', 'auto_discovered', 'imported'] }).notNull(),
  version:        integer('version').notNull().default(1),
  parentVersion:  integer('parent_version'),
  metrics:        jsonb('metrics'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  promotedAt:     timestamp('promoted_at', { withTimezone: true }),
}, (t) => ({
  orgIdx: index('idx_skills_org').on(t.orgId, t.brandId),
}));

export const skillRuns = pgTable('skill_runs', {
  id:             text('id').primaryKey(),
  skillId:        text('skill_id').notNull(),
  skillVersion:   integer('skill_version').notNull(),
  conversationId: text('conversation_id').notNull(),
  triggerInput:   jsonb('trigger_input'),
  stepsExecuted:  jsonb('steps_executed'),
  finalStatus:    text('final_status', { enum: ['success', 'partial', 'failed', 'escalated'] }).notNull(),
  durationMs:     integer('duration_ms'),
  csat:           integer('csat'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

> 同一份 schema 通过 12 号文档的「Schema Factory」生成 SQLite 等价表。

---

## 九、Subagent System（子 Agent / 委派）

参考 Hermes「Spawn isolated subagents for parallel workstreams」，使用 Mastra **Agent Networks**：

### 9.1 子 Agent 类型

| Subagent | 用途 | 触发场景 |
|----------|------|----------|
| **SearchAgent** | 并行检索多个知识源（Help / KB / Feedback / Web） | 客户问复杂问题 |
| **ResearchAgent** | 深度调研外部信息（Brave Search MCP） | 比价、技术对比 |
| **SummarizerAgent** | 总结长对话 / 长文档 | 工单 Handover |
| **ClassifierAgent** | 分类对话主题（意图、情感、优先级） | Workflow 路由 |
| **SentimentAgent** | 情绪分析 | 高级别报警 |
| **TranslationAgent** | 多语言翻译 | 跨语言客服 |
| **CodeAgent** | 代码相关问答（GitHub MCP） | DevTool 类产品 |

### 9.2 Agent Network 调度示例

```ts
// packages/agent/src/network.ts
import { Agent } from '@mastra/core/agent';
import { searchAgent, researchAgent, summarizerAgent } from './subagents/index.js';
import { upgradePlanWorkflow } from './workflows/upgrade-plan.js';

export const routingAgent = new Agent({
  id:           'routing-agent',
  name:         'Routing Agent',
  instructions: `
    You are a network of specialized customer support sub-agents.
    Dispatch the user request to the appropriate sub-agent or workflow.
    Synthesize their responses into one cohesive answer.
  `,
  model: modelForRoute('reasoning_heavy'),
  agents:    { searchAgent, researchAgent, summarizerAgent },
  workflows: { upgradePlanWorkflow },
  tools:     { /* 通用 tools */ },
  memory:    sharedMemory,
});
```

主 Agent 收到「同时帮我对比竞品 + 升级 Pro 计划」时，Mastra 会自动并行调用 `researchAgent` 与 `upgradePlanWorkflow`，最后由 routing agent 合并回复。

### 9.3 Subagent 隔离

每个 Subagent：
- 独立 `instructions` 与 `tools`（最小化权限）
- 独立 `model`（按场景选小模型）
- 自有 `Memory`（或 read-only 共享 Memory）
- 结果回流主 Agent，不污染主对话历史

---

## 十、Sandbox Backends（工具执行沙箱）

参考 Hermes 多 Backend，KeenAI 提供以下沙箱用于 Custom Action 执行：

| Backend | 实现 | 适用场景 |
|---------|------|----------|
| **HTTP Direct** | `fetch()` + Zod 校验 | 默认（Custom Actions） |
| **Cloudflare Workers** | `@cloudflare/workers-sdk` + bindings | 云版 SaaS · 边缘执行 |
| **isolated-vm** | [`isolated-vm`](https://github.com/laverdet/isolated-vm) | Node 进程内安全沙箱（V8 隔离） |
| **Bun Subprocess** | `Bun.spawn()` + `--no-fetch` | Bun 原生 |
| **Docker** | Docker API | 自托管 + 强隔离 |
| **WASM** | WasmEdge / Wasmtime | 客户代码片段 |

### 10.1 安全约束

```ts
// packages/agent/src/sandbox/policy.ts
import { z } from 'zod';

export const SandboxPolicy = z.object({
  network: z.object({
    egressAllowlist: z.array(z.string()),        // ['api.stripe.com', 'api.example.com']
    noInternalIPs:   z.boolean().default(true),  // 禁止 127.0.0.1, 10.0.0.0/8
  }),
  resources: z.object({
    maxCpuMs:        z.number().default(5000),
    maxMemoryMb:     z.number().default(256),
    maxResponseKb:   z.number().default(20),
  }),
  timeoutMs:    z.number().default(30000),
  rateLimit:    z.string().default('100/minute per org'),
  audit:        z.literal('required'),
});
```

---

## 十一、Cron Scheduler（定时任务 · Inngest）

参考 Hermes「Built-in cron scheduler」，KeenAI 用 **Inngest scheduled functions** 替代 Go 的 cron lib：

### 11.1 KeenAI 系统级 Cron

```ts
// apps/worker/src/cron.ts
import { inngest } from '@keenai/workflow/inngest';
import * as jobs from './jobs/index.js';

export const memoryConsolidate = inngest.createFunction(
  { id: 'memory-consolidate' },
  { cron: '0 * * * *' },                          // 每小时
  jobs.consolidateMemory,
);

export const memoryDecaySweep = inngest.createFunction(
  { id: 'memory-decay-sweep' },
  { cron: '0 3 * * *' },                          // 每天 03:00
  jobs.decayMemory,
);

export const kbReindex = inngest.createFunction(
  { id: 'kb-reindex-changed' },
  { cron: '*/15 * * * *' },                       // 每 15 分钟
  jobs.reindexChangedKb,
);

export const slaCheck = inngest.createFunction(
  { id: 'sla-check-breaches' },
  { cron: '* * * * *' },                          // 每分钟
  jobs.checkSlaBreaches,
);

export const skillRefine = inngest.createFunction(
  { id: 'skill-refine' },
  { cron: '0 4 * * 0' },                          // 每周日 04:00
  jobs.refineSkills,
);
```

| 任务 | 频率 | 用途 |
|------|------|------|
| `memory:consolidate` | 每小时 | Memory 4 层巩固 |
| `memory:decay_sweep` | 每天 03:00 | 衰减扫描 + 驱逐 |
| `memory:graph_rebuild` | 每天 04:00 | 知识图谱重建 |
| `kb:reindex_changed` | 每 15 分钟 | 增量重建索引 |
| `kb:crawl_websites` | 每天 02:00 | 自定义网页爬取 |
| `sla:check_breaches` | 每分钟 | SLA 违约检查 |
| `skill:refine` | 每周日 | Skill 自改进 A/B |
| `analytics:rollup` | 每小时 | 指标聚合 |
| `cleanup:expired_sessions` | 每天 05:00 | 清理过期 Session |
| `email:digest` | 按用户设置 | 邮件摘要 |

### 11.2 用户级 Cron（业务流）

允许 Workflow 创建定时触发（Inngest cron function 动态注册）：

```yaml
# apps/dashboard 配置面板生成
- name: "Daily VIP report"
  schedule: "0 9 * * MON-FRI"
  steps:
    - query: "SELECT * FROM conversations WHERE vip=true AND status='open'"
    - generate_summary_with_ai
    - send_email: ops@company.com
```

---

## 十二、State Management（状态管理）

参考 Hermes `hermes_state.py`，KeenAI Agent State 分三级：

### 12.1 三级状态

```ts
// L1：会话内（短期，Redis）
export interface ConversationState {
  conversationId: string;
  messages:       Message[];
  activeTools:    ToolCall[];
  tokensUsed:     number;
  lastActivity:   Date;
  ttlSeconds:     number;                         // 默认 86400 (24h)
}

// L2：客户级（中期，Store · Drizzle）
export interface UserAgentState {
  userId:       string;
  profile:      UserProfile;                      // 由 Memory 维护
  preferences:  Record<string, unknown>;
  pinnedSlots:  Record<string, string>;
  lastSeenAt:   Date;
}

// L3：品牌级（长期，Store · Drizzle）
export interface BrandAgentState {
  brandId:          string;
  systemPrompt:     string;
  skillsActive:     string[];
  knowledgeStats:   KnowledgeStats;
  aggregateMetrics: Metrics;
}
```

### 12.2 状态同步

- **Conversation State**：消息发送后立即写 Redis + WS/SSE 广播
- **User State**：会话结束后异步同步（Memory.Consolidate，Inngest 触发）
- **Brand State**：周期任务（每天）

---

## 十三、Gateway Layer（多渠道接入）

参考 Hermes「single gateway process for Telegram, Discord, Slack, WhatsApp, Signal, CLI」：

### 13.1 统一 Gateway 架构

```
┌────────────────────────────────────────────────────┐
│                Channel Adapters                    │
├──────────┬──────────┬─────────┬─────────┬─────────┤
│Messenger │ Email    │ Slack   │ Discord │Telegram │
│ (Hono WS)│ (imapflow│  Bot    │  Bot    │  Bot    │
│          │  poller) │ (bolt)  │(discord.│(grammy) │
│          │          │         │   js)   │         │
├──────────┴──────────┴─────────┴─────────┴─────────┤
│         Channel Normalization Layer                │
│  - Unified Message Format（Zod schema）             │
│  - User Identity Resolution                        │
│  - Attachment Normalization                        │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│         Agent Orchestrator                         │
└────────────────────────────────────────────────────┘
```

### 13.2 跨渠道用户合并

```ts
// packages/channels/src/identity.ts
export interface IdentityResolver {
  resolve(channel: string, externalId: string): Promise<User>;
  merge(primary: string, secondary: string): Promise<void>;
}

// 例：用户先用 Email 报问题，后从 Messenger 登录
//   → 通过 email 匹配 → 自动合并 → 主 Agent 看到完整跨渠道历史
```

---

## 十四、Streaming（流式响应）

### 14.1 服务端流式

Vercel AI SDK 的 `stream.fullStream` + Hono SSE / WebSocket：

```ts
// apps/api/src/routes/agent.ts
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runKeeniAgent, buildKeeniAgent } from '@keenai/agent';

export const agentRoutes = new Hono()
  .post('/conversations/:id/messages', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const agent = await buildKeeniAgent({ ...body.params });

    return streamSSE(c, async (sse) => {
      const stream = await runKeeniAgent(agent, body.req);
      for await (const ev of stream) {
        await sse.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
      }
    });
  });
```

```
LLM Streaming  → Mastra Agent → Vercel AI SDK fullStream → Hono SSE → 客户端
              ↓
        ToolCall 出现 → 'tool_call_start' 事件
              ↓
        Tool 执行中 → "正在查询..."
              ↓
        Tool 结果 → 'tool_call_result' 事件 注入回流
              ↓
        最终回复 → 'message_delta' / 'message_complete' token-by-token
```

### 14.2 事件类型（与前端 `@ai-sdk/react` 桥接）

```ts
// packages/shared/src/agent-events.ts
import { z } from 'zod';

export const AgentEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('thinking'),          content: z.string() }),
  z.object({ type: z.literal('tool_call_start'),   tool: z.string(), params: z.record(z.unknown()) }),
  z.object({ type: z.literal('tool_call_result'),  tool: z.string(), result: z.unknown() }),
  z.object({ type: z.literal('message_delta'),     delta: z.string() }),
  z.object({ type: z.literal('message_complete'),  message: MessageSchema }),
  z.object({ type: z.literal('citation'),          source: CitationSchema }),
  z.object({ type: z.literal('handover'),          reason: z.string() }),
  z.object({ type: z.literal('error'),             error: z.object({ name: z.string(), message: z.string() }) }),
]);
export type AgentEvent = z.infer<typeof AgentEvent>;
```

前端：

```tsx
// apps/dashboard/app/conversations/[id]/chat.tsx
'use client';
import { useChat } from '@ai-sdk/react';

export function Chat({ id }: { id: string }) {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: `/api/conversations/${id}/messages`,
    streamProtocol: 'data',
  });
  return ( /* render messages with citations / tool calls */ );
}
```

---

## 十五、可观测性

参考 AgentMemory + Mastra 内置 telemetry：

```
每次 Agent.stream() → Mastra 自动产生 Root Span（@opentelemetry）
  ├─ context.assemble        (Span)
  ├─ memory.retrieve         (Span)
  ├─ kb.search               (Span)
  │     ├─ bm25.search       (Sub-span)
  │     ├─ vector.search     (Sub-span)
  │     └─ rerank            (Sub-span)
  ├─ llm.streamText          (Span，含 Token usage)
  ├─ tool.execute (parallel) (Spans)
  └─ memory.consolidate      (Span, async via Inngest)
```

启用：

```ts
import { Mastra } from '@mastra/core';

export const mastra = new Mastra({
  agents: { keeniAgent },
  telemetry: {
    serviceName: 'keenai',
    enabled:     true,
    sampling:    { type: 'always_on' },
    export: {
      type:     'otlp',
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT!,
    },
  },
});
```

**指标**：
- `keeni_agent_runs_total{org,brand,outcome}`
- `keeni_agent_duration_ms{org,phase}`
- `keeni_llm_tokens_total{provider,model,type}`
- `keeni_llm_cost_usd{provider,org}`
- `keeni_tool_calls_total{tool,outcome}`
- `keeni_resolution_total{org,type}` (confirmed/assumed/escalated)

---

## 十六、配置示例

```ts
// config/agent.config.ts
import { defineConfig } from 'c12';

export default defineConfig({
  agent: {
    defaultPersonality: 'keeni',
    maxIterations:      10,
    defaultTokenBudget: 6000,
    defaultToolBudget:  8,

    llm: {
      routing: {
        chat_response:   'openai:gpt-5-mini',
        reasoning_heavy: 'deepseek:deepseek-reasoner',
        embedding:       'xenova:bge-m3',          // 本地推理
      },
      failover: {
        enabled: true,
        chain:   ['openai', 'anthropic', 'ollama'],
      },
    },

    context: {
      historyCompression: {
        enabled:    true,
        strategy:   'recent_with_summary',
        keepRecent: 5,
      },
      rag: { topK: 10, rerank: true, minScore: 0.6 },
    },

    tools: {
      parallelExecution:   true,
      defaultTimeoutMs:    30000,
      customActionSandbox: 'http_direct',          // http_direct | workers | isolated-vm
    },

    skills: {
      autoDiscover: { enabled: true, minPatternFrequency: 5 },
      autoImprove:  { enabled: true, abTestTraffic: 0.1 },
    },

    subagents: { enabled: true, maxParallel: 3 },

    streaming: { enabled: true, chunkSize: 16 },

    observability: { tracing: true, metrics: true, sampleRate: 1.0 },
  },
});
```

---

## 十七、代码结构（TypeScript Monorepo）

```
packages/agent/
├── package.json                # @keenai/agent
├── src/
│   ├── index.ts                # public exports
│   ├── orchestrator.ts         # buildKeeniAgent（Mastra Agent factory）
│   ├── run.ts                  # runKeeniAgent（PAOR wrapper + Inngest hooks）
│   ├── state.ts                # ConversationState / UserAgentState / BrandAgentState
│   ├── personality/
│   │   ├── schema.ts           # Zod Personality schema
│   │   ├── builder.ts          # buildPersonality(brandId)
│   │   └── voice.ts
│   ├── context/
│   │   ├── budget.ts           # computeBudget()
│   │   ├── assembler.ts        # 额外组装（品牌信息 / Slots）
│   │   └── compressor.ts       # 由 @keenai/memory 提供 processor
│   ├── tools/
│   │   ├── index.ts            # keenaiTools(p)
│   │   ├── search-kb.ts
│   │   ├── search-help-center.ts
│   │   ├── create-ticket.ts
│   │   ├── escalate-to-human.ts
│   │   ├── close-conversation.ts
│   │   ├── translate.ts
│   │   ├── summarize-history.ts
│   │   └── custom-action.ts    # 动态注册用户配置的 HTTP 工具
│   ├── skill/
│   │   ├── schema.ts
│   │   ├── runner.ts           # Skill 执行（Inngest step.run 形式）
│   │   ├── discoverer.ts       # 自动发现
│   │   └── improver.ts         # 自改进 + A/B（Mastra Eval）
│   ├── subagents/
│   │   ├── index.ts
│   │   ├── search.ts
│   │   ├── research.ts
│   │   ├── summarizer.ts
│   │   ├── classifier.ts
│   │   ├── sentiment.ts
│   │   ├── translation.ts
│   │   └── code.ts
│   ├── network.ts              # routingAgent（Mastra Agent Network）
│   ├── sandbox/
│   │   ├── policy.ts           # Zod Policy
│   │   ├── http.ts
│   │   ├── workers.ts          # Cloudflare Workers
│   │   ├── isolated-vm.ts
│   │   ├── docker.ts
│   │   └── wasm.ts
│   ├── streaming/
│   │   ├── events.ts           # AgentEvent (Zod)
│   │   └── sse.ts              # Hono SSE adapter
│   └── observability.ts        # OTel tracer
└── tests/
    ├── orchestrator.test.ts
    ├── tools.contract.test.ts
    └── streaming.test.ts

packages/llm/
├── package.json                # @keenai/llm
└── src/
    ├── provider.ts             # LLMProvider interface
    ├── registry.ts             # Provider registry + routing
    ├── failover.ts             # streamWithFailover()
    ├── pricing.ts              # 计费数据
    └── providers/
        ├── openai.ts
        ├── anthropic.ts
        ├── google.ts
        ├── deepseek.ts
        ├── ollama.ts
        ├── zhipu.ts
        ├── moonshot.ts
        ├── qwen.ts
        ├── openrouter.ts
        └── novita.ts

packages/mcp/
├── package.json                # @keenai/mcp
└── src/
    ├── host.ts                 # MCPClient (Mastra)
    ├── server.ts               # KeenAI 暴露的 MCP Server
    ├── tools/                  # 暴露的 tool 实现
    └── auth.ts
```

---

## 十八、与其他模块关系

```
┌──────────────┐
│   Workflow   │──── trigger ───────▶┌──────────────────┐
│  (Inngest)   │                     │                  │
└──────────────┘                     │                  │
                                     │ Keeni Agent      │
┌──────────────┐                     │   (Mastra)       │
│  Messenger   │──── message ───────▶│                  │
└──────────────┘                     │  Orchestrator    │◀── memory ──┐
                                     │                  │             │
┌──────────────┐                     │                  │             │
│  Email IMAP  │──── message ───────▶│                  │◀── kb ──────┤
└──────────────┘                     └────────┬─────────┘             │
                                              │                       │
                                              ▼                       │
                                     ┌──────────────────┐             │
                                     │  Tool / Action / │             │
                                     │     Skill        │             │
                                     └────────┬─────────┘             │
                                              │                       │
                          ┌───────────────────┴───────┐               │
                          ▼                           ▼               │
                   ┌────────────┐              ┌────────────┐         │
                   │  Custom    │              │   MCP      │         │
                   │  Actions   │              │  Servers   │         │
                   │ (sandbox)  │              │ (host/srv) │         │
                   └────────────┘              └────────────┘         │
                                                                      │
                          ┌──────────────────────────────────────────┘
                          │
                          ▼
                   ┌─────────────────┐
                   │  Keeni Memory   │
                   │  + Knowledge    │
                   │  (@mastra)      │
                   └─────────────────┘
```

详见：
- [10-AGENT-MEMORY.md](10-AGENT-MEMORY.md)
- [11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md)
- [12-STORAGE-ABSTRACTION.md](12-STORAGE-ABSTRACTION.md)
- [14-MULTIMODAL.md](14-MULTIMODAL.md) — Agent/Copilot 多模态输入（vision/STT）与出站（生图/TTS/`parseAgentResponse`）
- [15-MEMORY-TREE.md](15-MEMORY-TREE.md) — Memory Tree scope 检索 · Context Assembler

---

## 附录 A · 多模态 Agent 集成要点

> 完整方案见 [14-MULTIMODAL.md](14-MULTIMODAL.md)。本节仅列 Agent Engine 边界。

### A.1 输入：`buildModelMessages`

| 媒体 | native 路径 | text 路径 |
|------|-------------|-----------|
| 图片 | Vercel AI SDK `image` part（signed URL） | `metadata.visionSummary` 注入 user text |
| 语音 | 可选 audio part（Gemini 等） | `metadata.transcript` → plainText |
| 文档 | Tool `read_document` | `metadata.extractedText` inline |

配置：`LLM_IMAGE_INPUT_MODE=auto|native|text`（对标 Hermes `agent.image_input_mode`）。

### A.2 输出：Tools + Parser

| Tool | 产出 | 出站 |
|------|------|------|
| `generate_image` | attachment → S3 | `OutboundPart` type attachment |
| `text_to_speech` | audio file | `directives.asVoice` → Widget `<audio>` / IM sendVoice |
| Markdown `![alt](url)` | — | `parseAgentResponse` → send_image |

### A.3 Copilot

- Phase 2：`POST /copilot/draft` 读取 thread attachments，vision 模型 native 输入
- SSE 扩展：`attachment.ready`（14 号文档 §7.4）

---

## 附录 B · Memory Tree 检索 scope

> 完整方案见 [15-MEMORY-TREE.md](15-MEMORY-TREE.md)。Context Assembler 在组装 Agent prompt 时按意图选 scope。

```ts
type MemoryTreeQuery =
  | { scope: "conversation"; conversationId: string }
  | { scope: "customer"; userId: string }
  | { scope: "brand_daily"; date: string }
  | { scope: "hybrid" };
```

| Agent 意图 / Tool | 检索 |
|-------------------|------|
| 当前 thread 上下文 | `lastMessages` + source tree L0/L1 |
| 「这个客户之前…」 | topic tree + L3 facts/slots |
| 「今天 support 概况」 | `brand_daily` global seal |
| 产品功能说明 | **KB only**（不走 Memory Tree） |

Hook：`conversation/message.created` → L1 observation + async `memory/canonicalize`（不阻塞回复）。
