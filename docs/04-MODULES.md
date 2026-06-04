# KeenAI 核心模块详细设计（TypeScript）

## 模块全景图

```
┌──────────────────────────────────────────────────────────────────┐
│                      Platform Foundation 平台层                    │
│  Auth │ Org/Brand │ User │ RBAC │ Audit │ Search │ Storage │ LLM  │
│  (jose) (Drizzle) (Drizzle)(Casbin)        (FTSStore)(Store)(VSDK)│
└──────────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────────┐
│                    Support Suite 客户支持套件                       │
│  ┌────────┐  ┌─────────┐  ┌────────┐  ┌─────────┐  ┌──────────┐ │
│  │Channels│→ │Conversa-│→ │ Inbox  │  │Workflows│  │  Tickets │ │
│  │        │  │  tions  │  │        │  │(Inngest)│  │          │ │
│  └────────┘  └─────────┘  └────────┘  └─────────┘  └──────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────────┐
│                AI Kernel 三件套（执行 · 记忆 · 知识）               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │  Agent Engine    │  │  Memory System   │  │  KB / RAG      │ │
│  │  (Keeni Agent +  │  │  (per Customer · │  │  (per Brand ·  │ │
│  │   Copilot)       │  │   4-tier · KG)   │  │   Hybrid)      │ │
│  │  @mastra/core    │  │  @mastra/memory  │  │  @mastra/rag   │ │
│  │  + ai SDK        │  │  + @keenai/memory│  │  + @keenai/kb  │ │
│  │  → 09-AGENT      │  │  → 10-MEMORY     │  │  → 11-KB       │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────────┐
│                    Product Suite 产品反馈套件                      │
│  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌─────────────┐       │
│  │ Feedback │  │ Roadmap │  │Changelog │  │ Help Center │       │
│  │  Portal  │  │         │  │          │  │             │       │
│  └──────────┘  └─────────┘  └──────────┘  └─────────────┘       │
└──────────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────────┐
│                     Cross-cutting 横切关注                          │
│   Notify │ Analytics │ Integrations │ Webhook │ Billing            │
└──────────────────────────────────────────────────────────────────┘
```

> 所有模块以 **pnpm workspace package** 形式组织在 `packages/<name>/`，参见 [03-ARCHITECTURE.md § 1.2](03-ARCHITECTURE.md)。

---

## 模块 1：Platform Foundation（平台基础）

### 1.1 Auth（认证）· `@keenai/auth`

**子模块**：
- Local Auth（邮箱密码 + Magic Link）
- OAuth（Google / GitHub / Microsoft · [`arctic`](https://arctic.js.org/) / `passport`）
- SAML 2.0（企业版 · `@node-saml/node-saml`）
- OIDC
- 2FA / MFA（TOTP · `speakeasy`）
- Session 管理（Cookie + Redis）
- API Key 管理
- Widget 用户身份验证（HMAC）

**统一接口**：

```ts
// packages/auth/src/provider.ts
import { z } from 'zod';

export const Credentials = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('password'),    email: z.string().email(), password: z.string() }),
  z.object({ kind: z.literal('magic-link'),  token: z.string() }),
  z.object({ kind: z.literal('oauth'),       provider: z.string(), code: z.string() }),
  z.object({ kind: z.literal('saml'),        samlResponse: z.string() }),
  z.object({ kind: z.literal('api-key'),     key: z.string() }),
  z.object({ kind: z.literal('hmac-widget'), userId: z.string(), userHash: z.string() }),
]);

export interface AuthProvider {
  readonly name: string;
  authenticate(creds: z.infer<typeof Credentials>): Promise<Session>;
  refresh(refreshToken: string): Promise<Session>;
  revoke(sessionId: string): Promise<void>;
}

export interface Session {
  userId:        string;
  orgId:         string;
  brandIds:      string[];
  accessToken:   string;        // JWT (jose)
  refreshToken:  string;
  expiresAt:     Date;
  scopes:        string[];
}
```

### 1.2 Organization / Brand · `@keenai/org`

**实体关系**：

```
Organization (Workspace)
  └─ Brand (Multi-brand)
       ├─ Domain (Custom domain)
       ├─ Theme (色彩/Logo/字体)
       ├─ Email Settings
       └─ Locale (默认语言)
```

**多 Brand 支持**：
- 每个 Brand 独立 Help Center URL
- 独立 Messenger 主题
- 独立 Email 发件域名
- 共享 Inbox（Tag 区分）

### 1.3 RBAC（权限）· `@keenai/auth`

**模型**：

```
Permission := Resource + Action
  e.g. "conversation:read", "ticket:write", "billing:admin"

Role := Set of Permissions
  - Owner
  - Admin
  - Agent
  - Lite Agent
  - Custom Role

Member := User + Role + Team
```

实现：[Casbin.js](https://github.com/casbin/node-casbin) + Drizzle 持久化策略。

**字段级权限**（敏感字段）—— Zod schema 投影：

```ts
// packages/shared/src/schemas/user.ts
const UserPublic   = User.pick({ id: true, displayName: true, avatarUrl: true });
const UserAgent    = UserPublic.extend({ email: User.shape.email });
const UserAdmin    = User.omit({ ssn: true });          // SSN 仅 Owner 可见
const UserOwner    = User;
```

### 1.4 Search（搜索）· `@keenai/storage`（FTSStore）

> 搜索能力由 **存储抽象层** 的 `FTSStore` 接口统一提供（详见 [12-STORAGE-ABSTRACTION.md](12-STORAGE-ABSTRACTION.md)）。

```ts
// packages/storage/src/core/fts.ts
export interface FTSStore {
  readonly dialect: Dialect;
  createIndex(spec: FTSIndexSpec): Promise<void>;
  upsert(index: string, docs: FTSDoc[]): Promise<void>;
  search(req: FTSRequest): Promise<FTSResponse>;
  delete(index: string, ids: string[]): Promise<void>;
}
```

**实现**：
- `LibSQLFTSStore`（默认 · FTS5 嵌入）
- `PgFTSStore`（PG · `tsvector + GIN`）
- `MeilisearchFTSStore`（外置 · 生产）
- `ElasticsearchFTSStore`（超大规模）

**索引设计**：
- `fts_conversations`：消息内容 + 用户信息
- `fts_tickets`：标题 + 描述 + 自定义字段
- `fts_articles`：Help Center 文章
- `fts_feedback_posts`：反馈贴

### 1.5 Storage（对象存储）· `@keenai/storage`（ObjectStore）

```ts
// packages/storage/src/core/object.ts
export interface ObjectStore {
  put(key: string, body: Buffer | ReadableStream, opts?: PutOptions): Promise<{ url: string; etag: string }>;
  get(key: string): Promise<ReadableStream>;
  delete(key: string): Promise<void>;
  presignedUrl(key: string, ttlSec: number, op: 'GET' | 'PUT'): Promise<string>;
}
```

**实现**：
- `S3ObjectStore`（AWS S3 / R2 / OSS / B2 · `@aws-sdk/client-s3`）
- `MinioObjectStore`（自托管 · `minio`）
- `LocalObjectStore`（开发用 · `node:fs`）

### 1.6 LLM（大语言模型）· `@keenai/llm`

> 完整设计见 [09-AGENT-ENGINE.md § 6 LLM Provider Registry](09-AGENT-ENGINE.md)。

**统一抽象（Vercel AI SDK 包装层）**：

```ts
// packages/llm/src/provider.ts
import type { LanguageModel, EmbeddingModel } from 'ai';

export interface LLMProvider {
  readonly name: string;
  capabilities(): Capabilities;
  chat(model: string): LanguageModel;
  embed(model: string): EmbeddingModel<string>;
  rerank?(query: string, docs: string[]): Promise<{ index: number; score: number }[]>;
  pricing(): { input: number; output: number; embedding?: number };
  healthCheck(): Promise<boolean>;
}
```

业务调用统一通过 Vercel AI SDK 的 `streamText` / `generateText` / `generateObject` / `embed`，仅在选模型时通过 `modelForRoute('chat_response')` 走 Registry。

**Provider Registry 特性**：
- 全局注册 + 租户级覆盖（runtime context）
- 自动 Failover（主用 OpenAI 故障 → 备用 Anthropic → 本地 Ollama）
- 用量统计 + 成本核算（OpenTelemetry span attributes）

**支持模型**：

| Provider | 包 | 用途 | 优先级 |
|----------|----|------|--------|
| **OpenAI**（GPT-5, GPT-5-mini, embedding-3） | `@ai-sdk/openai` | 默认 chat / embedding | P0 |
| **Anthropic**（Claude Sonnet 5 / Haiku 5） | `@ai-sdk/anthropic` | 备用 + 长文本 | P0 |
| **Ollama**（本地） | `ollama-ai-provider` | 自托管 | P0 |
| **DeepSeek**（V3, Reasoner） | `@ai-sdk/deepseek` | 国产 + 推理 | P0 |
| **智谱 GLM-4** | `@ai-sdk/openai-compatible` | 国产 | P1 |
| **Gemini 2.5** | `@ai-sdk/google` | 多模态 | P1 |
| **Moonshot Kimi** | `@ai-sdk/openai-compatible` | 国产长文本（128k） | P1 |
| **通义 Qwen** | `@ai-sdk/openai-compatible` | 国产 | P2 |
| **本地推理**（bge-m3 / bge-reranker） | `@xenova/transformers` | embedding / rerank | P0 |

---

## 模块 2：Channels（渠道）· `@keenai/channels`

### 2.1 抽象

```ts
// packages/channels/src/types.ts
import { z } from 'zod';

export const ChannelMessage = z.object({
  conversationId: z.string(),
  userId:         z.string(),
  content:        z.union([
    z.object({ kind: z.literal('text'),    text: z.string() }),
    z.object({ kind: z.literal('rich'),    tiptapJson: z.unknown() }),
    z.object({ kind: z.literal('buttons'), text: z.string(), buttons: z.array(z.object({ label: z.string(), value: z.string() })) }),
    z.object({ kind: z.literal('card'),    title: z.string(), description: z.string(), imageUrl: z.string().url().optional() }),
  ]),
  attachments: z.array(z.object({
    url: z.string().url(), mime: z.string(), filename: z.string(), bytes: z.number(),
  })).default([]),
});

export interface Channel {
  readonly name: string;
  send(msg: z.infer<typeof ChannelMessage>): Promise<void>;
  /** 订阅入站消息 → 路由到 Inngest 事件 `conversation/message.received` */
  subscribe(): Promise<() => void>;
  healthCheck(): Promise<boolean>;
}
```

### 2.2 Messenger Widget · `apps/widget`

**架构**：

```
                 customer-site.com
                  ↓ <script>
        widget.js (Preact + Shadow DOM, < 5KB gzip)
                  ↓ WSS
        keenai.com/widget/{site_id}
                  ↓
        WidgetGateway (Hono on Bun)
                  ↓
        ConversationService
```

**功能模块**：
- Home（Cards：Help / Changelog / Contact）
- Messages（对话历史 · `useChat` from `@ai-sdk/react` 流式 UI）
- Help（嵌入 Help Center + AI Search）
- Changelog（最新 N 条）
- Tickets（提交 + 查看）

**JS SDK API**：

```ts
// apps/widget/src/sdk.ts
declare global {
  interface Window {
    KeenAI: {
      boot(opts: BootOpts): void;
      show(): void;
      hide(): void;
      update(attrs: Record<string, unknown>): void;
      trackEvent(name: string, props?: Record<string, unknown>): void;
      shutdown(): void;
    };
  }
}

interface BootOpts {
  appId:    string;
  user?:    { id: string; email?: string; name?: string };
  userHash?: string;          // HMAC-SHA256, 服务端生成
  locale?:  string;
  position?: 'bottom-right' | 'bottom-left';
}
```

### 2.3 Email · `@keenai/channels/email`

**Inbound 流程**：

```
IMAP Poll (Inngest cron 每 30s) / SES/SendGrid/Mailgun Webhook
    ↓
Email Ingestor (`apps/api/src/lib/email-ingest.ts` · IMAP via Inngest cron in API)
    ├─ MIME 解析（mailparser）
    ├─ 提取 From/To/Subject/Body
    ├─ Threading（Message-ID/References）
    ├─ Brand 路由（按收件域名）
    ├─ 附件上传 S3（@aws-sdk/client-s3）
    ├─ User 查找/创建（Drizzle）
    ├─ Conversation 查找/创建
    └─ Inngest 事件 conversation/message.received
```

```ts
// apps/api/src/lib/email-imap-poll.ts (planned) · packages/workflow Inngest cron
import { inngest } from '@keenai/workflow/inngest';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export const emailImapPoll = inngest.createFunction(
  { id: 'email-imap-poll' },
  { cron: '*/30 * * * * *' },          // 每 30 秒
  async ({ step }) => {
    const accounts = await step.run('load-accounts', () => emailAccounts.listEnabled());
    await Promise.all(accounts.map(async (acc) => {
      const client = new ImapFlow({ host: acc.host, port: 993, secure: true, auth: { user: acc.user, pass: acc.password } });
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        for await (const msg of client.fetch('1:*', { source: true, uid: true })) {
          if (await alreadyProcessed(msg.uid, acc.id)) continue;
          const parsed = await simpleParser(msg.source!);
          await step.sendEvent('email-received', { name: 'email/inbound', data: { acc, parsed } });
        }
      } finally { lock.release(); await client.logout(); }
    }));
  },
);
```

**Outbound 流程**：

```
BullMQ Queue: 'email:send'
    ├─ 模板渲染（React Email + MJML）
    ├─ 变量替换（Zod 校验上下文）
    ├─ Track Pixel（打开率）
    ├─ Link Rewrite（点击率）
    ├─ DKIM 签名（nodemailer 内建）
    └─ SMTP 发送（重试 3 次）
```

**邮件 Threading 算法**：
1. 优先匹配 `In-Reply-To` Header
2. 备用匹配 `References` Header
3. 兜底匹配 Subject 标准化（去 `Re:`、`Fwd:`）

### 2.4 Slack / Discord / Telegram

**统一适配层**：
- Bot Token 管理（加密存于 Drizzle）
- 频道 → Conversation 映射
- 消息双向同步
- 反向 @mention（KeenAI Note → Slack）

实现：
- Slack：[`@slack/bolt`](https://slack.dev/bolt-js/)
- Discord：`discord.js`
- Telegram：[`grammy`](https://grammy.dev/)
- WhatsApp Cloud API：直接 HTTP + Hono webhook

---

## 模块 3：Conversation（对话）· `@keenai/conversation`

### 3.1 状态机

```
                    ┌───────────┐
                    │   Open    │
                    └─────┬─────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
  ┌──────────┐      ┌──────────┐      ┌──────────┐
  │ Snoozed  │      │ Pending  │      │  Closed  │
  │(暂停)    │      │(等回复)   │      │          │
  └────┬─────┘      └────┬─────┘      └────┬─────┘
       │                 │                 │
       └─────────────────┴─────────────────┘
              (重新打开 / Inngest 定时唤醒)
```

### 3.2 实体（Zod + Drizzle）

```ts
// packages/shared/src/schemas/conversation.ts
import { z } from 'zod';

export const ConversationStatus = z.enum(['open', 'snoozed', 'pending', 'closed']);
export const Priority           = z.enum(['low', 'normal', 'high', 'urgent']);

export const Conversation = z.object({
  id:            z.string(),
  orgId:         z.string(),
  brandId:       z.string(),
  channelType:   z.enum(['messenger', 'email', 'slack', 'discord', 'telegram', 'whatsapp', 'api']),
  userId:        z.string(),
  status:        ConversationStatus,
  priority:      Priority.default('normal'),
  assigneeId:    z.string().nullable().default(null),
  teamId:        z.string().nullable().default(null),
  tags:          z.array(z.string()).default([]),
  attributes:    z.record(z.unknown()).default({}),    // CvDA 自定义属性
  lastMessageAt: z.string().datetime(),
  unreadCount:   z.number().int().min(0).default(0),
  slaStatus:     z.enum(['on_track', 'at_risk', 'breached']).default('on_track'),
  createdAt:     z.string().datetime(),
});
export type Conversation = z.infer<typeof Conversation>;

export const SenderType = z.enum(['user', 'agent', 'ai', 'bot', 'system']);

export const Message = z.object({
  id:             z.string(),
  conversationId: z.string(),
  senderType:     SenderType,
  senderId:       z.string().nullable(),
  content:        z.unknown(),                          // Tiptap JSON 或 MessagePart[]
  plainText:      z.string().optional(),                // FTS / 通知 fallback
  messageKind:    z.enum(['text','photo','voice','video','document','mixed']).optional(),
  attachments:    z.array(z.object({
    id: z.string(),
    url: z.string(),
    mime: z.string(),
    filename: z.string(),
    bytes: z.number(),
    thumbnailUrl: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),         // transcript · visionSummary
  })).default([]),
  reactions:      z.array(z.object({ userId: z.string(), emoji: z.string() })).default([]),
  inReplyTo:      z.string().nullable().optional(),
  sentVia:        z.string(),                           // messenger/email/api
  createdAt:      z.string().datetime(),
  editedAt:       z.string().datetime().nullable().optional(),
  deletedAt:      z.string().datetime().nullable().optional(),
});
export type Message = z.infer<typeof Message>;
```

> **多模态 Canonical 模型**（`MessagePart` · Inbound/Outbound · Media Pipeline · ChannelRenderer）：见 [14-MULTIMODAL.md](14-MULTIMODAL.md)。

Drizzle schema：见 [07-DATA-MODEL.md](07-DATA-MODEL.md)。

### 3.3 关键服务（`@keenai/conversation/services`）

| Service | 功能 |
|---------|------|
| `assignmentService` | 手动 / 自动分配（轮询 / 技能 / 负载） |
| `mentionService` | @mention 队友（解析 + 通知） |
| `tagService` | 手动 / Workflow 自动打标 |
| `snoozeService` | Inngest `step.sleepUntil` 定时唤醒 |
| `mergeService` | 对话合并（保留消息时间序） |
| `transferService` | 转给其他团队 |
| `translationService` | Vercel AI SDK + Gemini Flash 双向翻译 |

---

## 模块 4：Inbox（统一收件箱）· `@keenai/inbox`

### 4.1 视图（Views）

| 视图 | 过滤条件 |
|------|----------|
| Mine | `assigneeId = me` |
| Unassigned | `assigneeId IS NULL` |
| Team A | `teamId = A` |
| Mentions | `mentions @> [me]` |
| Snoozed | `status = 'snoozed'` |
| Closed | `status = 'closed'` |
| SLA Breach | `slaStatus = 'breached'` |
| Custom Views | 用户自定义条件（存 `inbox_views.filter`） |

### 4.2 命令面板（Cmd+K）

**功能**：
- 搜索对话/工单/用户（FTSStore）
- 跳转视图
- 执行动作（Assign / Tag / Close / Snooze）
- AI 回复起草（调用 Copilot Agent）
- Convert to Ticket
- Send Macro

**实现**：
- 前端：[`cmdk`](https://cmdk.paco.me/) 库 + Shadcn `<Command />`
- 后端：`/api/cmdk/search`（Hono）+ `/api/cmdk/actions`
- 快捷键定义集中管理（`@keenai/shared/hotkeys.ts`）

### 4.3 富文本编辑器

**基于 Tiptap 3**：
- 段落 / 标题 / 列表 / 引用 / 代码
- 图片 / 视频 / 文件上传（拖拽 · presigned URL 直传 S3）
- @mention 队友（弹出选择器）
- 表情 Emoji Picker
- 代码块（`@tiptap/extension-code-block-lowlight`）
- 链接预览
- Slash 命令 `/`（插入 Macro / AI 起草）
- Markdown 快捷输入

### 4.4 SLA 引擎

```ts
// packages/inbox/src/sla/types.ts
import { z } from 'zod';

export const SLAPolicy = z.object({
  id:                z.string(),
  name:              z.string(),
  firstResponseSec:  z.number().int(),
  resolutionSec:     z.number().int(),
  operationalHours:  z.boolean().default(false),       // 仅办公时间计算
  conditions:        z.array(z.object({ field: z.string(), op: z.string(), value: z.unknown() })),
});

export const SLATracker = z.object({
  conversationId: z.string(),
  policyId:       z.string(),
  startedAt:      z.string().datetime(),
  firstReplyDue:  z.string().datetime(),
  resolutionDue:  z.string().datetime(),
  breachedAt:     z.string().datetime().nullable(),
});
```

**Inngest 执行**：每条对话启动一个 SLA Inngest function；到期前 50% / 80% / 100% 触发预警；客服回复 → 发 `conversation/replied` 事件取消等待。

```ts
// packages/workflow SLA timers (Inngest) · API `apps/api/src/lib/workflow-*.ts`
export const slaWatch = inngest.createFunction(
  { id: 'sla-watch' },
  { event: 'conversation/sla.started' },
  async ({ event, step }) => {
    const { conversationId, policy, dueAt } = event.data;
    const result = await step.waitForEvent('reply', {
      event: 'conversation/replied',
      match: 'data.conversationId',
      timeout: new Date(dueAt).toISOString(),
    });
    if (!result) {
      await step.run('mark-breach', () => slaService.markBreach(conversationId, policy));
      await step.sendEvent('alert', { name: 'sla/breached', data: { conversationId } });
    }
  },
);
```

---

## 模块 5：Tickets（工单）· `@keenai/ticket`

### 5.1 类型设计

```ts
// packages/ticket/src/types.ts
import { z } from 'zod';

export const TicketKind = z.enum(['customer', 'back_office', 'tracker']);
export const Priority   = z.enum(['low', 'normal', 'high', 'urgent']);

export const FieldDef = z.object({
  id:       z.string(),
  name:     z.string(),
  type:     z.enum(['text', 'number', 'date', 'select', 'multi-select', 'user', 'url']),
  required: z.boolean().default(false),
  options:  z.array(z.string()).optional(),         // 仅 select / multi-select
});

export const StatusDef = z.object({
  id:       z.string(),
  name:     z.string(),
  category: z.enum(['under_review', 'active', 'waiting', 'done']),
  color:    z.string(),
});

export const TicketType = z.object({
  id:                z.string(),
  name:              z.string(),
  kind:              TicketKind,
  icon:              z.string(),
  fields:            z.array(FieldDef),
  statusCategories:  z.array(StatusDef),
  defaultAssignee:   z.string().nullable(),
  workflowHooks:     z.array(z.string()),           // workflow ids
});

export const TicketLink = z.object({
  ticketId: z.string(),
  linkType: z.enum(['blocks', 'blocked_by', 'tracks', 'tracked_by', 'duplicates', 'relates']),
});

export const Ticket = z.object({
  id:                  z.string(),
  typeId:              z.string(),
  title:               z.string(),
  description:         z.unknown(),                  // Tiptap JSON
  status:              z.string(),                   // StatusDef.id
  priority:            Priority,
  assigneeId:          z.string().nullable(),
  reporter:            z.string(),                   // 内部 user_id
  customerId:          z.string().nullable(),        // 外部客户
  linkedConversations: z.array(z.string()),
  linkedTickets:       z.array(TicketLink),
  customFields:        z.record(z.unknown()),
  createdAt:           z.string().datetime(),
  dueDate:             z.string().datetime().nullable(),
});
```

### 5.2 状态机（4 类别）

```
Under Review → Active → Waiting on Customer → Done
                ↑__________|
```

- 自定义 Status 继承类别行为
- 每个 TicketType 可配置启用哪些 Status
- 状态变更触发：通知客户 + Inngest 事件 `ticket/status.changed`

### 5.3 Tracker 联动

```
Tracker T1 (Status: In Progress)
  ├─ Linked: Customer Ticket C1, C2, C3, C4
  │
  └─ Update T1 → Done
        ↓ 触发 Inngest fan-out
      自动更新 C1, C2, C3, C4 → Done
        ↓
      发送邮件通知 4 个客户（BullMQ）
```

### 5.4 Ticket Portal · `apps/portal`

**独立公开页面**：
- 路径：`tickets.yourcompany.com`
- Next.js 15 App Router + RSC
- 登录后查看自己所有工单
- 进度可视化（4 步进度条）
- 添加评论 / 上传附件
- 关闭工单确认

---

## 模块 6：Workflows（自动化引擎）· `@keenai/workflow`

> **⭐ 完整设计**：本模块的**完整技术方案**已拆分为独立文档：
> - 🛠️ [13-WORKFLOW.md](13-WORKFLOW.md) — Workflow 引擎完整设计（13 Trigger / 21+ Action / DSL / 引擎 / Builder / 模板）
>
> 本节为概览，详细 DSL、执行细节、Block 接口、Builder UI、模板库、Eval 等请参见 13。

### 6.1 总览

| 维度 | 选型 / 说明 |
|------|------------|
| DSL | Zod-typed JSON（前后端共享，`@keenai/shared/workflow/dsl`） |
| 执行引擎 | [Inngest](https://www.inngest.com/) function 一对一映射 workflow（详见 [06-TECH-STACK.md § 3.2.6](06-TECH-STACK.md)） |
| Trigger | 13 种对标 Featurebase + 3 种差异化（schedule / webhook / event_match） |
| Action Block | 21 种对标 Featurebase + 4 种差异化（http_request / script / mcp_call / webhook_emit） |
| Customer-facing vs Background | 静态分类 + 互斥锁（按 sortOrder 抢锁），完整对齐 Featurebase 行为 |
| Wait / 中断 | `step.sleep` / `step.waitForEvent` 原生支持，客户/客服 reply / close 可中断 |
| CSAT | 仅 Web / Email / Slack；waitForRating + 三种 toggle 完整支持 |
| Auto-close abandoned | 独立 Inngest fn 监听 `workflow/step.awaiting_input` 计时关闭 |
| Builder UI | `@xyflow/react` 自动布局画布 + shadcn `<Sheet />` 表单 + Tiptap 富文本 |
| 版本管理 | `workflows.version` + `workflow_versions` 全量快照 + 一键回滚 |
| 测试模式 / Shadow Run | 仅自己可见 + 历史已关闭对话回放新版本 |
| Eval | Mastra Eval + 模板黄金用例集 + CI nightly |

### 6.2 与其他模块的串联

- **AI Block `let_keeni_answer`** → Mount Mastra Agent（[09](09-AGENT-ENGINE.md)）+ Hybrid Retrieval（[11](11-RAG-KNOWLEDGE.md)）+ Memory（[10](10-AGENT-MEMORY.md) · [15](15-MEMORY-TREE.md) scope 检索）
- **Custom Actions** → 在 `http_request` / `mcp_call` Block 中复用（参见 [09 § 7 Tool System](09-AGENT-ENGINE.md)）
- **Inbox / Conversation / Ticket** → Block 直接走对应 service 接口（assign / tag / close / convert_to_ticket 等）
- **SLA Engine** → `apply_sla` Block 调用 [§ 4.4 SLA 引擎](#44-sla-引擎)
- **Office Hours** → audience.sendTime + branch `availability.insideOfficeHours` 共享同一服务
- **Notify** → 后台 Block 经统一 Notification 通道发送 Email / In-app / Slack

完整 Trigger 矩阵、Block 接口、DSL Zod schema、执行引擎流程图、Builder UI 截图、模板库、Eval Harness 请直接参见 [13-WORKFLOW.md](13-WORKFLOW.md)。

---

## 模块 7：Keeni AI Agent · `@keenai/agent`

> **⭐ 设计深度参考**：本模块的**完整设计**已拆分为独立文档：
> - 🤖 [09-AGENT-ENGINE.md](09-AGENT-ENGINE.md) — Agent 执行核心（参考 [hermes-agent](https://github.com/NousResearch/hermes-agent) + [Mastra](https://mastra.ai/)）
> - 🧠 [10-AGENT-MEMORY.md](10-AGENT-MEMORY.md) — 4 层记忆系统（参考 [agentmemory](https://github.com/rohitg00/agentmemory)）  
> - 🌳 [15-MEMORY-TREE.md](15-MEMORY-TREE.md) — 摘要树 seal pipeline（参考 [OpenHuman Memory Trees](https://tinyhumans.gitbook.io/openhuman/features/obsidian-wiki/memory-tree)）
> - 📚 [11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md) — Hybrid RAG 知识库
>
> 本节为概览，三件套是 AI Kernel 的「执行 / 记忆 / 知识」三足。

### 7.1 核心架构

```
                ┌──────────────────────────────────┐
                │   Keeni Agent Orchestrator       │
                │   (per Conversation · per Brand) │
                │   @mastra/core Agent             │
                └──────────────┬───────────────────┘
                               │
       ┌───────────────────────┼────────────────────────┐
       ▼                       ▼                        ▼
┌─────────────┐       ┌─────────────────┐      ┌─────────────────┐
│ Personality │       │ Agent Loop      │      │ Context Assembler│
│ + Brand     │       │ Plan-Act-       │      │ (Token Budget +  │
│   Voice     │       │ Observe-Reflect │      │  Trajectory      │
└─────────────┘       │ (Vercel AI SDK  │      │  Compression)    │
                      │  streamText +   │      └────────┬────────┘
                      │  maxSteps)      │               │
                      │                 │               │
                      │ + Subagent      │      ┌────────┴────────┐
                      │ + Skill System  │      ▼                 ▼
                      │ + Tool / MCP    │  ┌────────┐      ┌─────────┐
                      │ + Multi-LLM     │  │ Memory │      │   KB    │
                      │   Failover      │  │ Slots  │      │ Hybrid  │
                      └─────────────────┘  │ Episode│      │Retrieval│
                                           │ Profile│      │ + Rerank│
                                           └────────┘      └─────────┘
                                           （详见 10）    （详见 11）
```

### 7.2 知识来源 → 详见 [11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md)

**自动**：Help Center · 已解决对话 · Feedback · Roadmap · Changelog

**自定义**：File Upload · 网页爬取（crawlee）· Q&A · Notion · Confluence · GitHub · Slack · Google Drive

### 7.3 检索 → 详见 [11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md)

三流融合：BM25（`FTSStore`）+ Vector（`VectorStore` · `@xenova/transformers` bge-m3 嵌入）+ Graph，RRF Fusion + Rerank（bge-reranker-v2-m3）。可选 Anthropic Contextual Retrieval 提升召回 35%+。

### 7.4 Prompt 模板（参考 09）

```
[System]
You are {agent_name}, a customer support assistant for {company}.
Brand voice: {brand_voice}
Language: {detected_language}

Rules:
1. Always cite sources from knowledge base using [^N]
2. If unsure, escalate to human via escalate_to_human tool
3. Never reveal you are an AI unless asked
4. Use {tools} when needed

[Customer Profile from Memory]      ← 详见 10
{customer_persona + slots}

[Past Memories (Episodic)]          ← 详见 10
{recent_episodes_top_3}

[Knowledge Base Context]            ← 详见 11
{retrieved_chunks_with_citations}

[Conversation History (Compressed)]
{compressed_history + recent_n}

[Tools Available]
{custom_actions + mcp_tools}

[User Message]
{user_message}
```

### 7.5 Custom Actions（Function Calling · Vercel AI SDK `tool()`）

**Action 定义（用户配置）**：

```ts
// packages/agent/src/tools/custom-action.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { signHmac } from '@keenai/auth';

export interface CustomActionSpec {
  name:        string;
  description: string;
  inputSchema: z.ZodTypeAny;       // 客户配置：JSON Schema → z.toType
  endpoint:    string;             // e.g. https://api.your.com/trial/extend/{{user_id}}
  method:      'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  auth:        { kind: 'hmac'; secretRef: string } | { kind: 'bearer'; tokenRef: string };
  sandbox:     'http_direct' | 'workers' | 'isolated_vm';
}

export function buildCustomAction(spec: CustomActionSpec) {
  return createTool({
    id:          spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    execute: async ({ context }) => {
      const url = renderUrl(spec.endpoint, context);                     // {{user_id}} 替换
      const body = spec.method === 'GET' ? undefined : JSON.stringify(context);
      const signed = await signRequest(spec.auth, { url, method: spec.method, body });
      const res = await fetchViaSandbox(spec.sandbox, { ...signed });
      const text = await res.text();
      if (text.length > 20_000) throw new Error('Custom action response exceeds 20KB');
      return filterByDataAccess(JSON.parse(text), spec);
    },
  });
}
```

**执行流程**（详见 [09-AGENT-ENGINE.md § 7 Tool System](09-AGENT-ENGINE.md)）：
1. LLM 决定调用 `extend_trial({ user_id: 'u1', days: 7 })`
2. Tool Executor 渲染 URL（变量替换）+ Zod 校验参数 + 权限检查
3. 添加 HMAC 签名（防伪造）
4. Sandbox 执行（HTTP Direct / Workers / `isolated-vm`）
5. 响应大小检查 < 20KB
6. 按 Data Access 配置过滤敏感字段
7. 结果回填 LLM → 生成自然语言回复

### 7.6 Resolution 检测

```ts
// packages/agent/src/resolution.ts
import { generateObject } from 'ai';
import { z } from 'zod';

export const Resolution = z.object({
  type:       z.enum(['confirmed', 'assumed', 'unresolved']),
  confidence: z.number(),
  evidence:   z.string(),
});

export async function detectResolution(conv: Conversation, recentMessages: Message[]) {
  const { object } = await generateObject({
    model:  modelForRoute('classification'),
    schema: Resolution,
    prompt: resolutionPrompt(conv, recentMessages),
  });
  return object;
}

// Confirmed:  客户回复正面（"thanks", "great", "perfect"）
// Assumed:    X 分钟无后续 → Inngest 计时器触发
// Unresolved: 客户追问 / 要求真人
```

### 7.7 自学习闭环（参考 Hermes Skill System）

> 详见 [09-AGENT-ENGINE.md § 8 Skill System](09-AGENT-ENGINE.md)

```
Discover     Inngest 周任务分析已解决对话 → 识别高频模式 → 自动提议 Skill
   ↓
Propose      LLM 生成 Skill 草稿（generateObject）→ 客服 review
   ↓
Execute      命中 Trigger → 走 Skill 流程（含工具编排）
   ↓
Improve      @mastra/evals A/B 测试新版本 → 自动升级胜出版本
   ↓
Retire       长期未触发 → 归档
```

### 7.8 记忆驱动（参考 AgentMemory）

> 详见 [10-AGENT-MEMORY.md](10-AGENT-MEMORY.md)

```
Inngest 事件 conversation/message.received → Pipeline:
  去重 → 隐私脱敏 → L1 写入（mastra_messages） → 异步压缩+嵌入 → 索引

Inngest 事件 conversation/closed → 巩固:
  L1 → L2 (Episodic 摘要)
  L1+L2 → L3 (Semantic Facts + 更新 workingMemory)
  L1-L3 → L4 (Procedural Pattern → 可升级为 Skill)
```

---

## 模块 8：Copilot（客服辅助）· `@keenai/copilot`

### 8.1 触发方式
- 客服按 `Cmd+K` → 输入问题 / 选择 "Draft Reply"
- Tiptap 编辑器内 `/` 命令 → "AI Draft"
- 右侧 Copilot 面板（默认收起 · Shadcn `<Sheet />`）

### 8.2 能力
- 基于对话上下文 + 知识库生成回复（3 个候选 · `generateText` × 3 with different temperatures）
- 改写：缩短 / 加长 / 更友好 / 更专业
- 翻译：自动检测客户语言并翻译
- 摘要：总结长对话
- 提取动作项：Bug / Feature / Refund（`generateObject` 结构化输出）
- 查询历史：「这位客户上次问了什么」

### 8.3 安全
- Copilot 只生成草稿，必须客服审核才发送
- 引用知识库来源（可点击预览 · `<CitationPopover />`）
- Token 用量 / 成本计入工作区配额（OTel attributes）

### 8.4 与 Agent Kernel 共享
Copilot 复用 [Agent Engine](09-AGENT-ENGINE.md)（一个 stateless subagent · Mastra Agent Network）+ [Memory](10-AGENT-MEMORY.md)（注入客户画像）+ [KB](11-RAG-KNOWLEDGE.md)（混合检索），仅在编排上不同：

- 不调用「破坏性」工具（不能直接修改用户数据 · `requireApproval: true`）
- 不写入客户级 Memory（仅读 · `memory.search` 不 `addMessage`）
- 输出标记为 `draft`，等待客服 `accept / edit / discard`
- 客服 `accept` → 才进入正常对话流 + 写回 Memory

---

## 模块 9：Feedback Portal · `@keenai/feedback`

### 9.1 实体（Zod）

```ts
// packages/feedback/src/types.ts
import { z } from 'zod';

export const Board = z.object({
  id:         z.string(),
  slug:       z.string(),                            // /b/feature-requests
  name:       z.string(),
  public:     z.boolean(),
  categories: z.array(z.string()),
  statuses:   z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })),
});

export const Post = z.object({
  id:             z.string(),
  boardId:        z.string(),
  title:          z.string(),
  content:        z.unknown(),                       // Tiptap JSON
  authorId:       z.string(),
  status:         z.string(),                        // Open / Planned / In Progress / Done
  upvoteCount:    z.number().int().min(0),
  commentCount:   z.number().int().min(0),
  subscribers:    z.array(z.string()),
  tags:           z.array(z.string()),
  linkedTickets:  z.array(z.string()),
  embedding:      z.array(z.number()).optional(),    // 用于自动去重
  createdAt:      z.string().datetime(),
});

export const Vote = z.object({
  postId: z.string(),
  userId: z.string(),
  weight: z.number().default(1),                     // 可加权（按 MRR）
});
```

### 9.2 AI 智能特性

**自动去重**：

```ts
// packages/feedback/src/dedup.ts
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { vectorStore } from '@keenai/storage';

export async function findSimilarPosts(boardId: string, content: string, threshold = 0.85) {
  const { embedding } = await embed({ model: openai.embedding('text-embedding-3-small'), value: content });
  const hits = await vectorStore.search({
    collection:      'feedback_posts',
    queryVector:     embedding,
    partitionFilter: { board_id: boardId },
    topK:            5,
  });
  return hits.hits.filter((h) => h.score >= threshold);
}
```

- 新 Post 创建时 → Embed → 检索相似 Post（>0.85 相似度）
- 推荐合并到已有 Post
- AI 自动标签建议（`generateObject` 输出 `tags: string[]`）

**优先级洞察**：
- 按 MRR 加权排序
- 按客户分群过滤
- 自动汇总「Top 5 高价值未排期」（Inngest 周任务 + Mastra Agent 综合）

### 9.3 Status 自动通知

```
Post Status 变更
  ↓
Inngest 事件 feedback/post.status.changed
  ↓ fan-out
通知 Subscribers（Email + In-app）
关联 Conversation 发系统消息
关联 Ticket 同步状态
```

---

## 模块 10：Roadmap · `@keenai/roadmap`

### 10.1 视图
- **Kanban**：按状态列分组（dnd-kit）
- **Timeline**：按 ETA 排序
- **List**：紧凑列表（TanStack Table）

### 10.2 数据来源
- Feedback Posts（手动拖入）
- Linear / Jira 同步（双向 · Webhook + REST）
- 手动创建

### 10.3 公开页面 · `apps/portal/app/roadmap`
- 路径：`roadmap.yourcompany.com`
- 用户可订阅 Item
- 状态变更邮件通知（BullMQ）

---

## 模块 11：Changelog · `@keenai/changelog`

### 11.1 编辑器
- Tiptap 富文本
- AI 起草：基于 Linear/Jira 已完成 Issue（`generateObject` 输出 markdown + tags）
- 关联 Feedback Post（自动通知投票者）
- 图片 / 视频 / GIF / Markdown 导入

### 11.2 发布渠道
- 公开页面（`changelog.yourcompany.com`）—— Next.js 15 ISR
- In-app Widget（Messenger Changelog Module + 弹窗）
- Email（按受众分群 · React Email + MJML）
- RSS Feed（`feed` npm）
- Webhook
- Slack / Discord 频道

### 11.3 受众分群

```yaml
audience:
  - segment: "Pro Plan"
    condition: "user.plan == 'pro'"
  - segment: "EU users"
    condition: "user.country in ['DE','FR','IT','ES','NL']"
```

### 11.4 分析
- 浏览数 / Unique Viewer
- 邮件打开率 / 点击率（Track Pixel + Link Rewrite）
- 评论 / Reaction 统计

---

## 模块 12：Help Center · `@keenai/helpcenter`

### 12.1 结构

```
Help Center (Brand 维度)
  └─ Collection
       └─ Article
            └─ Tag
```

### 12.2 编辑器
- Tiptap 富文本 + 自定义组件
  - 信息框（Info / Warning / Tip）
  - 步骤列表
  - 视频嵌入（YouTube / Loom）
  - 代码块（lowlight）
  - 表格
  - 折叠面板

### 12.3 AI Search
- 搜索框输入 → 调 KB Hybrid Retriever → `streamText` 生成答案
- 引用 Top 3 文章（`<CitationPopover />`）
- "Did this answer help?" 反馈（写 `kb_query_logs.user_feedback`）

### 12.4 SEO
- Sitemap 自动生成（`next-sitemap`）
- Schema.org Markup
- OG 图自动生成（`@vercel/og`）
- 自定义 Meta
- 多语言 hreflang

### 12.5 导入
- Intercom Articles API
- Zendesk Help Center API
- Notion 页面（@notionhq/client）
- Markdown 批量

---

## 模块 13：Notify（通知）· `@keenai/notify`

### 13.1 通道
- Email（nodemailer / Resend / SendGrid）
- In-app（WebSocket / Bun.serve）
- Web Push（`web-push` npm）
- Mobile Push（FCM / APNs · `firebase-admin` / `node-apn`）
- Slack / Discord（Webhook）
- 钉钉 / 飞书 / 企业微信（国内）

### 13.2 模板系统
- **React Email** + MJML 模板（响应式邮件）
- Zod 校验变量上下文
- 多语言模板（next-intl messages）
- 暗黑模式邮件
- 失败重试 + 死信队列（BullMQ `failedReason` + DLQ）

### 13.3 用户偏好
- 通知类型粒度（按事件）
- 频率限制（Digest 模式 · Inngest cron）
- Do Not Disturb 时段
- 退订链接

---

## 模块 14：Analytics（分析）· `@keenai/analytics`

### 14.1 看板
- **Support Dashboard**：响应时间、解决率、CSAT、客服效率
- **AI Dashboard**：AI Resolution Rate、Token 用量、成本
- **Feedback Dashboard**：Top Posts、状态分布、用户活跃
- **Help Center Dashboard**：浏览量、跳出率、搜索词
- **Changelog Dashboard**：阅读数、点击率

### 14.2 数据管道

```
业务事件 → Inngest 事件总线 → analytics worker → Store（PG/LibSQL）→ API → ECharts 看板
                                                        ↓
                                               物化视图 / 预聚合表
                                               （PG: materialized view · LibSQL: triggered cron）
```

> 单租户规模：Store 内分析表 + 预聚合即可。云版后期可拆 ClickHouse 独立集群。

### 14.3 自定义报表
- 拖拽式报表构建器（后期 · React Flow）
- 导出 CSV / Excel（`exceljs`）
- 邮件订阅周报（Inngest cron + React Email）

---

## 模块 15：Integrations（集成）· `@keenai/integrations`

### 15.1 内置集成

| 工具 | 包 | 用途 |
|------|----|------|
| Slack | `@slack/bolt` | 双向同步对话、Workflow 触发 |
| Discord | `discord.js` | 同上 |
| Linear | `@linear/sdk` | Ticket / Roadmap 同步 |
| Jira | `jira.js` | 同上 |
| GitHub Issues | `@octokit/rest` | 同上 |
| HubSpot | `@hubspot/api-client` | 客户数据同步 |
| Notion | `@notionhq/client` | Help Center / 训练数据 |
| Zapier | Hono webhook | 出站 Webhook + Trigger |
| n8n | Hono webhook | 同上 |

### 15.2 OAuth Apps（开发者）
- 第三方应用接入 KeenAI API
- 用户授权流（OAuth 2.0 · [`arctic`](https://arctic.js.org/)）
- Scope 粒度权限
- 应用市场（后期）

---

## 模块 16：Webhook · `@keenai/webhook`

### 16.1 出站
- 事件类型订阅
- 失败重试（指数退避，最多 5 次 · BullMQ retry）
- 签名校验（HMAC · `crypto.subtle`）
- 投递日志（Drizzle `webhook_deliveries`）

### 16.2 入站
- 自定义 Endpoint（Hono dynamic route）
- 用于 Workflow Trigger（→ Inngest 事件）
- Signature 校验

---

## 模块依赖矩阵

```
                 Inbox Conv Ticket WF AI Feedback HC Channel Notify
Inbox             -    R    R     R  R    -      -    -      W
Conversation      -    -    -     W  W    W      -    R      W
Ticket            -    R    -     W  R    R      -    -      W
Workflow          R    W    W     -  W    W      -    -      W
AI (Keeni)        -    W    W     R  -    R      R    -      W
Feedback          -    R    R     W  -    -      -    -      W
HelpCenter        -    -    -     -  R    -      -    -      -
Channel           -    W    -     R  -    -      -    -      -
Notify            R    R    R     -  R    R      R    R      -

R = Read, W = Write/Trigger, - = 无依赖
```

---

## 关键时序图：客户提问 → AI 回复 → 工单创建

```
Customer  Widget   WS Gateway     Conv Svc        Inngest   Agent     LLM    Store
   │        │          │              │             │         │        │       │
   │──msg──▶│          │              │             │         │        │       │
   │        │──WSS────▶│              │             │         │        │       │
   │        │          │──route──────▶│             │         │        │       │
   │        │          │              │──save────────────────────────────────▶│
   │        │          │              │──event─────▶│         │        │       │
   │        │          │              │ (message.   │         │        │       │
   │        │          │              │  received)  │         │        │       │
   │        │          │              │             │──fn────▶│        │       │
   │        │          │              │             │  invoke │        │       │
   │        │          │              │             │         │──memory ─────▶│
   │        │          │              │             │         │  +KB    │       │
   │        │          │              │             │         │◀──ctx──────────│
   │        │          │              │             │         │──stream▶│       │
   │        │          │              │             │         │◀─tokens │       │
   │        │          │              │             │         │──tool───────▶│
   │        │          │              │             │         │  (create │      │
   │        │          │              │             │         │   ticket)│      │
   │        │          │              │◀──SSE/WS─delta─────────│        │       │
   │        │          │◀─pub────────│              │         │        │       │
   │        │◀─WS──────│              │             │         │        │       │
   │◀─reply─│          │              │             │         │        │       │
```
