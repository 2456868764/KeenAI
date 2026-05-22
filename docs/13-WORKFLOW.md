# KeenAI Workflow 技术方案

> 对标 **[Featurebase Workflows](https://help.featurebase.app/collections/5535356-workflows)**，对 13 种 Trigger / 20+ Action Block / 顺序排序 / 客户可见 vs 后台 / 中断式 Wait / Auto-close / CSAT / 模板库 / 测试模式 等全部产品逻辑做了 1:1 技术落地，并叠加 KeenAI 的差异化（Schedule / Webhook / HTTP / Script / 版本管理 / Eval / Shadow Run）。

| 维度 | 选型 |
|------|------|
| **DSL** | Zod-typed JSON（前后端共享，`@keenai/shared`） |
| **执行引擎** | [Inngest](https://www.inngest.com/) function 一对一映射 workflow，原生支持 `step.sleep` / `step.sleepUntil` / `step.waitForEvent` |
| **触发总线** | Inngest 事件 `workflow/*` + 业务事件 `conversation/*` `ticket/*` `widget/*` |
| **持久化** | Drizzle（PG `pgvector` / LibSQL）· 详见 [07-DATA-MODEL.md § 4.6](07-DATA-MODEL.md) |
| **审计员（earliest customer）** | Workflow Run state 内的 `targetCustomerId` |
| **Builder UI** | [`@xyflow/react`](https://reactflow.dev/) + Shadcn `<Sheet />` 配置面板 |
| **AI Block** | Mastra Agent + Vercel AI SDK · 详见 [09-AGENT-ENGINE.md](09-AGENT-ENGINE.md) |
| **Audience 过滤** | 自研最小 Predicate Engine（Zod-typed AST） |
| **测试 / Shadow** | Inngest dev mode + dry-run + 影子执行（不发消息） |
| **Eval** | `@mastra/evals` + 模板回放 |

---

## 一、设计目标

| 目标 | 说明 |
|------|------|
| **全面对标 Featurebase** | 13 Trigger + 20+ Action + 顺序与背景区分 + Wait 中断 + CSAT + 模板，全部 1:1 落地 |
| **零代码可视化** | 拖拽画布、自动布局、表单化 Block 配置；运营 / 客服可独立配置 |
| **版本化 + 回滚** | Draft / Published 分离；任意 Published 版本一键回滚；执行记录与版本绑定 |
| **强一致执行** | Inngest step 级持久化 + 重试 + Crash recovery；Wait 不丢失 |
| **可观测** | OTel span / Inngest dashboard / `workflow_runs` 状态机；可见每一步耗时与错误 |
| **测试模式 / Shadow Run** | 仅自己可见的 staging；shadow run on closed conversations 验证新版本 |
| **差异化扩展** | Schedule / Webhook / HTTP Request / Script（沙箱）Block；MCP 工具桥 |
| **AI 原生** | Let Keeni Answer Block 直接 mount Mastra Agent；Skill System 自学习的 Workflow 提议 |
| **多租户 + 多 Brand** | 所有 Workflow 带 `org_id + brand_id`，audience / scheduling 严格隔离 |

---

## 二、总体架构

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          KeenAI Workflow 子系统                               │
│  apps/dashboard/app/workflows  ──┐                                            │
│     │ React Flow Canvas          │                                            │
│     │ Block 配置 Sheet            │                                            │
│     │ Trigger 设置                │                                            │
│     │ 测试模式                    │                                            │
│     └──────────────┬───────────────┘                                          │
│                    │ POST /workflows  /workflows/:id/publish                   │
│                    ▼                                                          │
│            ┌──────────────────────┐    ┌────────────────────────┐             │
│            │  WorkflowService      │    │  TriggerRegistry        │             │
│            │  (Hono routes)        │◀──▶│  ‐ register Inngest fn  │             │
│            │  ‐ validate Zod       │    │  ‐ on publish/unpublish │             │
│            │  ‐ snapshot version   │    │  ‐ event filter         │             │
│            └─────────┬────────────┘    └────────────┬────────────┘             │
│                      │ workflows / workflow_versions │                          │
│                      ▼                               ▼                          │
│   Drizzle Store ─── workflow_runs ◀── Inngest fn (per workflow)                │
│                                          │                                      │
│   Business events ─────────────────────▶ │ event matcher (channel/audience)    │
│   (conversation/* ticket/* widget/* …)   │                                      │
│                                          ▼                                      │
│                      ┌──────────────────────────────────────────┐               │
│                      │  Workflow Run Loop (Inngest steps)         │               │
│                      │  ┌──────────────────────────────────────┐  │               │
│                      │  │  Block Dispatcher                     │  │               │
│                      │  │   - send_message / let_keeni_answer   │  │               │
│                      │  │   - reply_buttons (step.waitForEvent) │  │               │
│                      │  │   - collect_data (step.waitForEvent)  │  │               │
│                      │  │   - branches / apply_rules            │  │               │
│                      │  │   - wait (step.sleep / waitForEvent)  │  │               │
│                      │  │   - assign / tag / snooze / close     │  │               │
│                      │  │   - csat (custom suspend)             │  │               │
│                      │  │   - ticket ops                        │  │               │
│                      │  │   - http_request / script (sandbox)   │  │               │
│                      │  └──────────────────────────────────────┘  │               │
│                      │  Earliest-Customer Tracker · OTel span      │               │
│                      └──────────────────────────────────────────┘               │
│                                                                                │
│   Auto-close watcher (cron) · Order Resolver · Shadow Runner · Eval Harness     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、Trigger 体系

### 3.1 Trigger 总览（13 + 3 扩展）

> ✅ = 与 Featurebase 1:1 对齐；🆕 = KeenAI 差异化扩展。

| # | Type | 类别 | 触发来源（Inngest 事件） | 备注 |
|---|------|------|---------------------------|------|
| 1 | `page_view` ✅ | Outbound | `widget/page.viewed` | 「客户访问页面」满足 URL / 时间条件 |
| 2 | `new_messenger_conversation` ✅ | New conversation | `messenger/conversation.opened` | 客户点开 Messenger 但还没发消息 |
| 3 | `first_message` ✅ | New conversation | `conversation/message.received` (first) | 客户第一条消息 |
| 4 | `any_message` ✅ | During conversation | `conversation/message.received` | 任何客户消息 |
| 5 | `teammate_message` ✅ | During conversation | `conversation/message.sent` (sender=member) | 客服发出消息 |
| 6 | `conversation_state_changed` ✅ | During conversation | `conversation/state.changed` | Closed / Snoozed / Open |
| 7 | `assigned_to_team` ✅ | During conversation | `conversation/assigned` (target=team) | 分配到团队 |
| 8 | `assigned_to_member` ✅ | During conversation | `conversation/assigned` (target=member) | 分配到个人 |
| 9 | `customer_unresponsive` ✅ | During conversation | 派生事件（见 § 3.4） | 客户 N 时间未回复 |
| 10 | `teammate_unresponsive` ✅ | During conversation | 派生事件 | 客服 N 时间未回复 |
| 11 | `teammate_added_note` ✅ | During conversation | `conversation/note.added` | 客服加了内部 Note |
| 12 | `ticket_created` ✅ | Ticket | `ticket/created` | 工单创建（含 Workflow / API 来源） |
| 13 | `ticket_state_changed` ✅ | Ticket | `ticket/state.changed` | 客服改了工单状态 |
| 14 | `schedule` 🆕 | Scheduled | Inngest cron | 周期定时（cron + audience） |
| 15 | `webhook` 🆕 | External | `webhook/inbound.received` | 入站 Webhook |
| 16 | `event_match` 🆕 | Custom | `app/*` | 业务自定义事件（如 `app/subscription.churned`） |

### 3.2 Trigger 配置（与 Featurebase 同构）

每个 Workflow 的 Trigger Block 都暴露以下配置面：

```ts
// packages/shared/src/workflow/trigger.ts
import { z } from 'zod';

export const Channel = z.enum(['messenger', 'email', 'slack', 'discord', 'telegram', 'whatsapp', 'api', 'web']);

export const Audience = z.object({
  match: z.enum(['all', 'any']).default('all'),
  rules: z.array(z.object({
    field: z.string(),                  // e.g. user.plan, user.timezone, conv.tags, msg.content, company.mrr
    op:    z.enum(['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'contains', 'starts_with', 'ends_with', 'matches', 'exists', 'between']),
    value: z.unknown().optional(),
  })),
});

export const SendFrequency = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('once') }),
  z.object({
    mode: z.literal('schedule'),
    cadence: z.discriminatedUnion('unit', [
      z.object({ unit: z.literal('weekly'),  days:    z.array(z.number().int().min(0).max(6)) }),
      z.object({ unit: z.literal('monthly'), dayOfMonth: z.number().int().min(1).max(31) }),
      z.object({ unit: z.literal('yearly'),  month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
    ]),
  }),
  z.object({
    mode: z.literal('every_time'),
    onceEveryDays: z.number().int().min(0).optional(),
  }),
]);

export const SendTime = z.enum(['any', 'office_hours', 'outside_office_hours']);

export const EndCondition = z.object({
  maxSends:   z.number().int().min(1).optional(),
  endsAt:     z.string().datetime().optional(),
}).optional();

export const TriggerConfig = z.object({
  channels:      z.array(Channel),
  audience:      Audience,
  frequency:     SendFrequency,
  sendTime:      SendTime.default('any'),
  endCondition:  EndCondition,
  // page_view 专属
  pageRules:     z.array(z.object({
                   urlOp: z.enum(['contains', 'eq', 'matches']),
                   url:   z.string(),
                   timeOnPageSec: z.number().int().min(0).optional(),
                 })).optional(),
  // customer_unresponsive / teammate_unresponsive 专属
  inactivityMs:  z.number().int().min(30_000).max(14 * 24 * 3600_000).optional(),
  // schedule 专属
  cron:          z.string().optional(),
});
```

> 「Send once / Send on schedule / Send every time + 每 X 天限频」与 Featurebase 完全一致。「Send during/outside office hours」走 `@keenai/inbox` 的 OfficeHours 服务。

### 3.3 Channel 限制矩阵

某些 Trigger 在某些 Channel 上不可用，由 DSL 校验时强制：

| Trigger | messenger | email | slack | discord | telegram | api |
|---------|:---------:|:-----:|:-----:|:-------:|:--------:|:---:|
| `page_view` | ✅ | – | – | – | – | – |
| `new_messenger_conversation` | ✅ | – | – | – | – | – |
| `first_message` / `any_message` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `teammate_*` | ✅ | ✅ | ✅ | ✅ | ✅ | – |
| `conversation_state_changed` | ✅ | ✅ | ✅ | ✅ | ✅ | – |
| `ticket_*` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `schedule` 🆕 | – | – | – | – | – | – |
| `webhook` 🆕 | – | – | – | – | – | ✅ |

### 3.4 派生事件：Unresponsive 计时器

「客户 N 时间未回复」/「客服 N 时间未回复」是 **派生事件**，由 Inngest 计时器实现：

```ts
// apps/worker/src/jobs/unresponsive-watch.ts
import { inngest } from '@keenai/workflow/inngest';

export const customerUnresponsiveWatch = inngest.createFunction(
  { id: 'customer-unresponsive-watch' },
  { event: 'conversation/message.sent' },          // 客服发完消息后 → 启计时器
  async ({ event, step }) => {
    const { conversationId, senderType } = event.data;
    if (senderType !== 'member') return;            // 仅客服回复后才计时

    // 监听本组织所有「customer_unresponsive」Workflow → 取最短 inactivity
    const minMs = await step.run('load-min', () => triggerRegistry.minInactivityForOrg('customer_unresponsive', event.data.orgId));
    if (!minMs) return;

    const replied = await step.waitForEvent('customer-replied', {
      event: 'conversation/message.received',
      match: 'data.conversationId',
      timeout: `${Math.floor(minMs / 1000)}s`,
    });
    if (replied) return;                            // 客户回复了 → 不触发

    // 客户超时未回 → 发派生事件，触发所有匹配的 Workflow
    await step.sendEvent('trigger', {
      name: 'derived/customer.unresponsive',
      data: { conversationId, orgId: event.data.orgId, inactivityMs: minMs },
    });
  },
);
```

`teammate_unresponsive` 完全对称（监听 `conversation/message.received` 且 `lastSender === 'member'`）。

### 3.5 触发器动态注册

```ts
// packages/workflow/src/registry.ts
import { inngest, type InngestFunction } from '@keenai/workflow/inngest';
import { buildExecutor } from './executor.js';

const registry = new Map<string, InngestFunction>();

export async function registerWorkflow(def: WorkflowDef) {
  unregisterWorkflow(def.id);
  const fn = inngest.createFunction(
    { id: `wf-${def.id}`, name: def.name, concurrency: { limit: 200 } },
    { event: triggerToEventName(def.trigger.type), if: triggerToEventFilter(def) },
    buildExecutor(def),
  );
  registry.set(def.id, fn);
  await inngest.register(fn);
}

export function unregisterWorkflow(id: string) {
  const fn = registry.get(id);
  if (fn) inngest.unregister(fn);
  registry.delete(id);
}
```

事件过滤器（`if`）使用 Inngest 的表达式 DSL（CEL 风格）做粗筛，细 audience 由 Executor 在 step 内复算：

```ts
function triggerToEventFilter(def: WorkflowDef): string {
  const { channels, audience } = def.trigger.config;
  const parts: string[] = [`event.data.orgId == '${def.orgId}'`];
  if (def.brandId) parts.push(`event.data.brandId == '${def.brandId}'`);
  if (channels.length > 0) parts.push(`event.data.channel in ${JSON.stringify(channels)}`);
  return parts.join(' && ');
}
```

---

## 四、Action Block 体系（21 种 + 3 扩展）

### 4.1 Block 总览

| 类别 | Block | 同步/挂起 | KeenAI 备注 |
|------|-------|----------|------|
| AI | `let_keeni_answer` ✅ | 同步（流式） | Mount Mastra Agent，Resolution → 分支 |
| 客户可见消息 | `send_message` ✅ | 同步 | Tiptap rich content + 动态变量；**附件**见 [14-MULTIMODAL.md §7.5](14-MULTIMODAL.md) |
| 客户可见消息 | `show_expected_reply_time` ✅ | 同步 | 拉 Office Hours / Avg Reply Time |
| 客户输入 | `reply_buttons` ✅ | **挂起** | 等待 `widget/button.clicked` |
| 客户输入 | `collect_data` ✅ | **挂起** | 等待 `widget/attribute.submitted`，可选 Free text + 多 attribute |
| 客户输入 | `collect_customer_reply` ✅ | **挂起 + 2s 缓冲** | 等待 `conversation/message.received` |
| 客户输入控制 | `disable_customer_reply` ✅ | 同步 | 切换 widget composer 禁用态 |
| 评分 | `csat` ✅ | **挂起（可选）** | 见 § 4.7 |
| 流程控制 | `branches` ✅ | 同步（首匹配） | first-match wins |
| 流程控制 | `apply_rules` ✅ | 同步（全匹配并行） | all-match parallel |
| 流程控制 | `wait` ✅ | **挂起，可中断** | sleep / waitForEvent，详见 § 4.6 |
| 流程控制 | `goto` 🆕 | 同步 | 跳转到指定 step（DAG，禁止循环 > 100） |
| 流程控制 | `end` ✅ | 终止 | 显式结束当前 path |
| 后台 | `assign` ✅ | 同步 | 个人 / 团队 / round-robin / least-busy |
| 后台 | `mark_priority` ✅ | 同步 | priority enum |
| 后台 | `tag_end_user` ✅ | 同步 | user tags |
| 后台 | `tag_conversation` ✅ | 同步 | conv tags |
| 后台 | `add_note` ✅ | 同步 | 内部 Note，可 @mention |
| 后台 | `apply_sla` ✅ | 同步 | 套用 SLA policy |
| 状态 | `snooze` ✅ | **挂起到时点** | step.sleepUntil；客户/客服回复中断 |
| 状态 | `close` ✅ | 同步 | 关闭对话 |
| 状态 | `reopen` 🆕 | 同步 | 重新打开 |
| Ticket | `set_ticket_state` ✅ | 同步 | 更新工单状态 |
| Ticket | `send_ticket_form` ✅ | **挂起** | 表单提交事件 |
| Ticket | `convert_to_ticket` ✅ | 同步 | 对话 → ticket |
| 集成 | `http_request` 🆕 | 同步 | 在沙箱内调任意 HTTP（HMAC / Bearer） |
| 集成 | `script` 🆕 | 同步 | `isolated-vm` 中跑 JS（CPU / 时间限制） |
| 集成 | `webhook_emit` 🆕 | 同步 | 出站 Webhook |
| 集成 | `mcp_call` 🆕 | 同步 | 调 MCP server tool（详见 09-AGENT-ENGINE.md） |

### 4.2 Block 接口

```ts
// packages/workflow/src/block.ts
import type { StepSpec } from './dsl.js';
import type { InngestStep } from 'inngest';

export interface BlockContext {
  orgId:              string;
  brandId:            string;
  workflowId:         string;
  workflowRunId:      string;
  conversationId?:    string;
  ticketId?:          string;
  targetCustomerId?:  string;           // earliest remaining customer
  triggerData:        Record<string, unknown>;
  vars:               Record<string, unknown>;
  isShadowRun:        boolean;
  resolveVars(template: string): string;     // {first_name} / {{user.plan}}
}

export interface BlockHandler<T extends StepSpec = StepSpec> {
  readonly type: T['type'];
  readonly customerFacing: boolean;          // 决定 Workflow 是否是 customer-facing
  readonly mayInterrupt:    boolean;          // wait / reply_buttons / collect_data / snooze / csat
  validate(spec: T): void;                    // Zod parse + 语义规则
  execute(spec: T, ctx: BlockContext, step: InngestStep): Promise<BlockResult>;
}

export type BlockResult =
  | { kind: 'continue';  next: string | null }
  | { kind: 'goto';      next: string }
  | { kind: 'end' }
  | { kind: 'parallel';  branches: string[] };          // apply_rules
```

### 4.3 Reply Buttons（典型挂起式 Block）

```ts
// packages/workflow/src/blocks/reply-buttons.ts
import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import type { BlockHandler } from '../block.js';

export const ReplyButtonsSpec = z.object({
  type:    z.literal('reply_buttons'),
  id:      z.string(),
  prompt:  z.string(),                                // 文案
  allowFreeText: z.boolean().default(false),
  buttons: z.array(z.object({
    id:    z.string(),
    label: z.string(),
    next:  z.string().nullable(),                     // 指向下一个 step
  })).min(1).max(8),
  timeoutMs: z.number().int().optional(),              // 默认 ∞
});

export const replyButtonsBlock: BlockHandler<z.infer<typeof ReplyButtonsSpec>> = {
  type: 'reply_buttons',
  customerFacing: true,
  mayInterrupt:   true,
  validate(spec) { ReplyButtonsSpec.parse(spec); },
  async execute(spec, ctx, step) {
    if (!ctx.isShadowRun) {
      await step.run('post-buttons', () =>
        conversationService.postSystemMessage(ctx.conversationId!, {
          kind: 'reply_buttons',
          text: ctx.resolveVars(spec.prompt),
          buttons: spec.buttons.map((b) => ({ id: b.id, label: ctx.resolveVars(b.label) })),
          allowFreeText: spec.allowFreeText,
          workflowRunId: ctx.workflowRunId,
          stepId: spec.id,
        }),
      );
    }

    const clicked = await step.waitForEvent('btn-click', {
      event: 'widget/button.clicked',
      match: 'data.workflowRunId',
      timeout: spec.timeoutMs ? `${Math.floor(spec.timeoutMs / 1000)}s` : '30d',
    });

    if (!clicked) return { kind: 'end' };               // 超时
    const branch = spec.buttons.find((b) => b.id === clicked.data.buttonId);
    return branch ? { kind: 'continue', next: branch.next } : { kind: 'end' };
  },
};
```

### 4.4 Branches vs Apply Rules（核心差异）

```ts
// packages/workflow/src/blocks/branches.ts
export const BranchesSpec = z.object({
  type: z.literal('branches'),
  id:   z.string(),
  branches: z.array(z.object({
    label:     z.string().optional(),
    condition: PredicateAst,                          // 见 § 6
    next:      z.string().nullable(),
  })).min(1),
  elseNext: z.string().nullable().optional(),
});

export const branchesBlock: BlockHandler = {
  type: 'branches',
  customerFacing: false,
  mayInterrupt:   false,
  validate(spec) { BranchesSpec.parse(spec); },
  async execute(spec, ctx, step) {
    const facts = await step.run('load-facts', () => factResolver.snapshot(ctx));
    for (const br of spec.branches) {
      if (await evaluate(br.condition, facts)) return { kind: 'continue', next: br.next };
    }
    return { kind: 'continue', next: spec.elseNext ?? null };
  },
};

// packages/workflow/src/blocks/apply-rules.ts
export const ApplyRulesSpec = z.object({
  type: z.literal('apply_rules'),
  id:   z.string(),
  rules: z.array(z.object({
    condition: PredicateAst,
    next:      z.string(),                            // 必须有 next（并行 fan-out）
  })).min(1),
});

export const applyRulesBlock: BlockHandler = {
  type: 'apply_rules',
  customerFacing: false,
  mayInterrupt:   false,
  validate(spec) { ApplyRulesSpec.parse(spec); },
  async execute(spec, ctx, step) {
    const facts = await step.run('load-facts', () => factResolver.snapshot(ctx));
    const matched = [];
    for (const r of spec.rules) {
      if (await evaluate(r.condition, facts)) matched.push(r.next);
    }
    return { kind: 'parallel', branches: matched };   // executor 会并行 step.run 各分支子图
  },
};
```

### 4.5 Let Keeni Answer（AI Block）

```ts
// packages/workflow/src/blocks/let-keeni-answer.ts
import { buildKeeniAgent } from '@keenai/agent';
import { detectResolution } from '@keenai/agent/resolution';

export const LetKeeniAnswerSpec = z.object({
  type:        z.literal('let_keeni_answer'),
  id:          z.string(),
  instructions: z.string().optional(),
  maxSteps:    z.number().int().min(1).max(20).default(8),
  toolFilter:  z.array(z.string()).optional(),          // 限制工具
  outcomeRouting: z.object({
    resolvedNext:    z.string().nullable(),
    unresolvedNext:  z.string().nullable(),
    escalatedNext:   z.string().nullable(),
  }).optional(),
  autoCloseAfterMs: z.number().int().optional(),         // Auto-close abandoned 配置
});

export const letKeeniAnswerBlock: BlockHandler = {
  type: 'let_keeni_answer',
  customerFacing: true,
  mayInterrupt:   false,
  validate(s) { LetKeeniAnswerSpec.parse(s); },
  async execute(spec, ctx, step) {
    const agent = await step.run('build-agent', () => buildKeeniAgent({
      orgId:          ctx.orgId,
      brandId:        ctx.brandId,
      conversationId: ctx.conversationId!,
      userId:         ctx.targetCustomerId!,
      overrideInstructions: spec.instructions,
      toolFilter:     spec.toolFilter,
      maxSteps:       spec.maxSteps,
    }));

    const reply = await step.run('agent-run', () => agent.runOnce({
      threadId:   ctx.conversationId!,
      resourceId: ctx.targetCustomerId!,
      shadow:     ctx.isShadowRun,
    }));

    const resolution = await step.run('resolution', () => detectResolution(reply));
    const routing = spec.outcomeRouting;
    if (!routing) return { kind: 'continue', next: null };

    return { kind: 'continue', next:
      resolution.type === 'confirmed' || resolution.type === 'assumed'
        ? routing.resolvedNext
        : resolution.type === 'escalated'
          ? routing.escalatedNext
          : routing.unresolvedNext,
    };
  },
};
```

### 4.6 Wait（可中断）

完美映射 Featurebase 的 Wait Block 语义：

> **「wait can be interrupted by closing actions or teammate and customer replies, depending on setup. Teammate actions such as tagging will not interrupt the Workflow.」**

```ts
// packages/workflow/src/blocks/wait.ts
export const WaitSpec = z.object({
  type:      z.literal('wait'),
  id:        z.string(),
  durationMs: z.number().int().min(1_000),
  interrupt: z.object({
    onCustomerReply: z.boolean().default(true),
    onTeammateReply: z.boolean().default(true),
    onClose:         z.boolean().default(true),
    onReopen:        z.boolean().default(false),
  }).default({}),
  next: z.string().nullable(),
});

export const waitBlock: BlockHandler = {
  type: 'wait',
  customerFacing: false,
  mayInterrupt:   true,
  validate(s) { WaitSpec.parse(s); },
  async execute(spec, ctx, step) {
    const events: string[] = [];
    if (spec.interrupt.onCustomerReply) events.push('conversation/message.received');
    if (spec.interrupt.onTeammateReply) events.push('conversation/message.sent');
    if (spec.interrupt.onClose)         events.push('conversation/state.changed.closed');
    if (spec.interrupt.onReopen)        events.push('conversation/state.changed.open');

    if (events.length === 0) {
      await step.sleep('wait', `${Math.floor(spec.durationMs / 1000)}s`);
      return { kind: 'continue', next: spec.next };
    }
    const interrupted = await step.waitForAny('wait-or-interrupt', {
      timeout: `${Math.floor(spec.durationMs / 1000)}s`,
      events:  events.map((e) => ({ event: e, match: 'data.conversationId' })),
    });
    if (interrupted) return { kind: 'end' };
    return { kind: 'continue', next: spec.next };
  },
};
```

### 4.7 CSAT（可挂起等待评分）

完全对齐 Featurebase 三个 toggle：

```ts
// packages/workflow/src/blocks/csat.ts
export const CsatSpec = z.object({
  type: z.literal('csat'),
  id:   z.string(),
  prompt: z.string().default('How would you rate this conversation?'),
  emojis: z.array(z.string()).default(['😡', '😕', '😐', '🙂', '😍']),
  allowComment: z.boolean().default(true),
  ratingWindow: z.object({
    preventAfterMs:       z.number().int().optional(),   // 1: 超时后不能再评
    preventChangeAfterMs: z.number().int().optional(),   // 2: 评后 N 时间内可改
  }).default({}),
  waitForRating:        z.boolean().default(false),       // 3: 暂停 workflow 直到客户评分
  allowFreeTextDuringWait: z.boolean().default(true),
  channelsAllowed: z.array(z.enum(['messenger', 'email', 'slack'])).default(['messenger', 'email', 'slack']),
  next: z.string().nullable(),
});

export const csatBlock: BlockHandler = {
  type: 'csat',
  customerFacing: true,
  mayInterrupt:   false,
  validate(s) {
    const spec = CsatSpec.parse(s);
    // 不在白名单 channel → silently skip（与 Featurebase 一致）
  },
  async execute(spec, ctx, step) {
    const channel = ctx.triggerData['channel'] as string;
    if (!spec.channelsAllowed.includes(channel as any)) return { kind: 'continue', next: null };

    await step.run('post-csat', () => csatService.postRequest({
      conversationId: ctx.conversationId!,
      workflowRunId:  ctx.workflowRunId,
      stepId:         spec.id,
      prompt:         ctx.resolveVars(spec.prompt),
      emojis:         spec.emojis,
      allowComment:   spec.allowComment,
      preventAfterMs:       spec.ratingWindow.preventAfterMs,
      preventChangeAfterMs: spec.ratingWindow.preventChangeAfterMs,
    }));

    if (!spec.waitForRating) return { kind: 'continue', next: spec.next };

    const events: string[] = ['csat/rated'];
    if (spec.allowFreeTextDuringWait) events.push('conversation/message.received');
    const ev = await step.waitForAny('rating-or-msg', {
      timeout: spec.ratingWindow.preventAfterMs ? `${Math.floor(spec.ratingWindow.preventAfterMs / 1000)}s` : '7d',
      events:  events.map((e) => ({ event: e, match: 'data.conversationId' })),
    });
    if (!ev) return { kind: 'continue', next: spec.next };

    if (ev.event === 'conversation/message.received') return { kind: 'end' };
    // ctx.vars.conversationRating = ev.data.rating （下游 branches 可用）
    ctx.vars.conversationRating = ev.data.rating;
    return { kind: 'continue', next: spec.next };
  },
};
```

### 4.8 HTTP Request / Script（差异化）

```ts
// packages/workflow/src/blocks/http-request.ts
export const HttpRequestSpec = z.object({
  type: z.literal('http_request'),
  id:   z.string(),
  url:  z.string(),                                       // 支持 {{vars}}
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  headers: z.record(z.string()).optional(),
  body:    z.unknown().optional(),
  auth:    z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('bearer'), secretRef: z.string() }),
    z.object({ kind: z.literal('hmac'),   secretRef: z.string(), header: z.string().default('x-keenai-signature') }),
  ]).default({ kind: 'none' }),
  timeoutMs:  z.number().int().max(30_000).default(10_000),
  saveTo:     z.string().optional(),                      // 把响应存到 ctx.vars.<saveTo>
  next:       z.string().nullable(),
});

// packages/workflow/src/blocks/script.ts
// isolated-vm 沙箱（默认禁用，需 Owner 启用）
export const ScriptSpec = z.object({
  type:   z.literal('script'),
  id:     z.string(),
  code:   z.string().max(10_000),
  timeoutMs:   z.number().int().max(5_000).default(2_000),
  memoryMb:    z.number().int().max(128).default(32),
  next:        z.string().nullable(),
});
```

---

## 五、Workflow DSL 完整规范

```ts
// packages/shared/src/workflow/dsl.ts
import { z } from 'zod';

export const WorkflowMeta = z.object({
  orgId:       z.string(),
  brandId:     z.string(),
  name:        z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  status:      z.enum(['draft', 'published', 'paused', 'archived']),
  sortOrder:   z.number().int(),                          // 同 trigger 内的排序
  version:     z.number().int().min(1),
  testTarget:  z.object({                                  // 测试模式：仅自己 / 团队可见
    emailContains: z.array(z.string()).optional(),
    memberIds:     z.array(z.string()).optional(),
  }).optional(),
});

export const WorkflowDef = WorkflowMeta.extend({
  id:      z.string(),
  trigger: z.object({
    type:   z.enum([
      'page_view', 'new_messenger_conversation', 'first_message', 'any_message',
      'teammate_message', 'conversation_state_changed', 'assigned_to_team', 'assigned_to_member',
      'customer_unresponsive', 'teammate_unresponsive', 'teammate_added_note',
      'ticket_created', 'ticket_state_changed',
      'schedule', 'webhook', 'event_match',
    ]),
    config: TriggerConfig,
  }),
  steps:   z.array(StepSpec),                              // 见 § 4
  startStepId: z.string(),
}).superRefine((def, ctx) => {
  // 语义校验：
  // - 引用的 next 必须存在
  // - 客户可见 / 后台 Workflow 静态分类
  // - CSAT branch 上游必须 waitForRating=true 才能读 conversationRating
  // - earliest remaining customer：apply_rules 内并行分支不能再 mutate 状态
  // - script 仅 Owner 启用
});
export type WorkflowDef = z.infer<typeof WorkflowDef>;

export function isCustomerFacing(def: WorkflowDef): boolean {
  return def.steps.some((s) => blocks.get(s.type)!.customerFacing);
}
```

---

## 六、Predicate 引擎（Audience / Branches / Apply Rules 共用）

```ts
// packages/shared/src/workflow/predicate.ts
import { z } from 'zod';

export type PredicateAst =
  | { op: 'and'; nodes: PredicateAst[] }
  | { op: 'or';  nodes: PredicateAst[] }
  | { op: 'not'; node:  PredicateAst }
  | { op: 'cmp'; field: string;  cmp: CmpOp; value?: unknown }
  | { op: 'in_office_hours'; value: boolean }
  | { op: 'contains_keyword'; field: string; keywords: string[]; mode: 'any' | 'all' }
  | { op: 'csat_rating'; cmp: '<' | '<=' | '>' | '>=' | '==' | '!='; value: 1 | 2 | 3 | 4 | 5 }
  | { op: 'rating_requested_in_conv'; flag: boolean };

export const PredicateAst: z.ZodType<PredicateAst> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('and'), nodes: z.array(PredicateAst) }),
    z.object({ op: z.literal('or'),  nodes: z.array(PredicateAst) }),
    z.object({ op: z.literal('not'), node:  PredicateAst }),
    z.object({ op: z.literal('cmp'), field: z.string(), cmp: CmpOp, value: z.unknown().optional() }),
    z.object({ op: z.literal('in_office_hours'), value: z.boolean() }),
    z.object({ op: z.literal('contains_keyword'), field: z.string(), keywords: z.array(z.string()), mode: z.enum(['any', 'all']) }),
    z.object({ op: z.literal('csat_rating'), cmp: z.enum(['<', '<=', '>', '>=', '==', '!=']), value: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]) }),
    z.object({ op: z.literal('rating_requested_in_conv'), flag: z.boolean() }),
  ]),
);
```

可寻址的 `field` 命名空间（Featurebase 的「Person / Company / Message / Conversation / Availability」对齐）：

```
user.*           (id, email, name, plan, country, locale, timezone, tags, lastActivityAt, createdAt, attributes.*)
company.*        (id, name, plan, mrr, size, industry, tags, attributes.*)
msg.*            (content, langDetected, sentVia)
conv.*           (id, status, channelType, brandId, tags, attributes.*, topic, csatRating, slaStatus)
ticket.*         (id, type, status, priority, customFields.*)
availability.*   (insideOfficeHours, currentTeammates)
page.*           (url, title, timeOnPageSec)              (page_view 触发器专属)
trigger.*        (任何触发事件的 raw payload)
```

事实快照：

```ts
// packages/workflow/src/facts.ts
export async function snapshotFacts(ctx: BlockContext): Promise<Facts> {
  // 在一个 step.run 中拉齐所有 facts，避免 race；按需 lazy 取消费的列
  return {
    user:      await userRepo.find(ctx.targetCustomerId),
    company:   ctx.targetCustomerId ? await companyRepo.forUser(ctx.targetCustomerId) : undefined,
    conv:      ctx.conversationId   ? await convRepo.find(ctx.conversationId)        : undefined,
    msg:       ctx.triggerData.message,
    ticket:    ctx.ticketId         ? await ticketRepo.find(ctx.ticketId)             : undefined,
    availability: {
      insideOfficeHours: await officeHours.isInside(ctx.orgId, ctx.brandId, new Date()),
    },
    page:      ctx.triggerData.page,
    trigger:   ctx.triggerData,
  };
}
```

---

## 七、执行引擎（Inngest）

### 7.1 顶层 Executor

```ts
// packages/workflow/src/executor.ts
import { inngest } from './inngest.js';
import { blocks } from './block-registry.js';
import { resolveOrder } from './order.js';

export function buildExecutor(def: WorkflowDef) {
  return async ({ event, step }: any) => {
    // 1) audience + sendTime 复算（事件 filter 之后的精细过滤）
    const facts = await step.run('facts', () => snapshotFromEvent(event, def));
    if (!matchAudience(def.trigger.config.audience, facts)) return;
    if (!matchSendTime(def.trigger.config.sendTime, def.orgId, def.brandId)) return;

    // 2) 顺序 / 互斥锁（仅 customer-facing）
    if (def.isCustomerFacing) {
      const winner = await step.run('order-lock', () =>
        resolveOrder.tryAcquire({
          orgId:           def.orgId,
          brandId:         def.brandId,
          triggerKind:     def.trigger.type,
          conversationId:  event.data.conversationId,
          workflowId:      def.id,
          sortOrder:       def.sortOrder,
        }),
      );
      if (!winner) return;                                   // 上面有更高优先级的 customer-facing workflow 已抢到
    }

    // 3) 创建 workflow_run 记录
    const runId = await step.run('create-run', () => workflowRuns.create({
      workflowId: def.id, version: def.version, triggerEvent: event,
      inngestRunId: event.runId, inngestEventId: event.id,
    }));

    // 4) 选举 earliest remaining customer
    let target = await step.run('earliest-customer', () => pickEarliestCustomer(event));

    // 5) 进入主循环
    const ctx: BlockContext = { ...buildCtx(def, event, runId, target) };
    let cursor: string | null = def.startStepId;

    while (cursor) {
      const spec = def.steps.find((s) => s.id === cursor)!;
      const handler = blocks.get(spec.type)!;

      const result = await step.run(`block-${spec.id}`, () => handler.execute(spec, ctx, step));

      switch (result.kind) {
        case 'continue': cursor = result.next; break;
        case 'goto':     cursor = result.next; break;
        case 'parallel':
          await Promise.all(result.branches.map((next) =>
            step.run(`fan-${spec.id}-${next}`, () => runSubgraph(def, ctx, next, step)),
          ));
          cursor = null;
          break;
        case 'end':      cursor = null; break;
      }

      // 在每一步后刷新 earliest remaining customer（如果有 customer 离开对话）
      target = await step.run(`refresh-target-${spec.id}`, () => refreshEarliestCustomer(ctx, target));
      ctx.targetCustomerId = target?.id;
    }

    await step.run('finalize', () => workflowRuns.complete(runId, { status: 'completed' }));
  };
}
```

### 7.2 「Customer-facing vs Background」排序与互斥

完整对齐 Featurebase 的 ordering 语义：

```ts
// packages/workflow/src/order.ts
export class WorkflowOrderResolver {
  /** customer-facing：以 (org, brand, triggerKind, conversationId) 为锁键；按 sortOrder 第一个抢到的 win */
  async tryAcquire(opts: AcquireOpts): Promise<boolean> {
    return store.transaction(async (tx) => {
      const lockKey = `${opts.orgId}:${opts.brandId}:${opts.triggerKind}:${opts.conversationId}`;
      const existing = await tx.select().from(workflowLocks).where(eq(workflowLocks.key, lockKey)).limit(1);
      if (existing.length > 0) {
        if (existing[0].sortOrder <= opts.sortOrder) return false;
        // 较高优先级（更小 sortOrder）后到 → 应替换；但 Featurebase 默认禁止替换，KeenAI 也跟随
        return false;
      }
      await tx.insert(workflowLocks).values({
        key: lockKey,
        workflowId: opts.workflowId,
        sortOrder:  opts.sortOrder,
        expiresAt:  new Date(Date.now() + 60 * 60 * 1000),   // 1h TTL，结束时释放
      });
      return true;
    });
  }
}
```

> Background workflow 不参与互斥，所有匹配 fan-out 并行执行。

### 7.3 Earliest Remaining Customer

```ts
// packages/workflow/src/earliest-customer.ts
export async function pickEarliestCustomer(event: any): Promise<{ id: string } | null> {
  const convId = event.data.conversationId;
  if (!convId) return event.data.userId ? { id: event.data.userId } : null;
  const participants = await convRepo.participants(convId);    // 按加入时间升序
  return participants.find((p) => p.type === 'user') ?? null;
}

export async function refreshEarliestCustomer(ctx: BlockContext, current: any) {
  if (!ctx.conversationId) return current;
  const stillIn = current && await convRepo.isParticipant(ctx.conversationId, current.id);
  if (stillIn) return current;
  return pickEarliestCustomer({ data: { conversationId: ctx.conversationId } });
}
```

### 7.4 Auto-close Abandoned Workflow

完整对齐：

> 「Auto-close incomplete Workflows conversations」配置可选 1 / 3 / 5 / 7 / 10 / 15 / 30 / 60 分钟；客户进入「等输入」类 step 后开始计时，未交互即自动 close。

```ts
// apps/worker/src/jobs/wf-auto-close.ts
import { inngest } from '@keenai/workflow/inngest';

export const wfAutoClose = inngest.createFunction(
  { id: 'wf-auto-close' },
  { event: 'workflow/step.awaiting_input' },             // reply_buttons / collect_data / 类 step 进入挂起时由 executor 发
  async ({ event, step }) => {
    const { workflowRunId, conversationId, autoCloseMs } = event.data;
    if (!autoCloseMs) return;
    const interacted = await step.waitForAny('interact', {
      timeout: `${Math.floor(autoCloseMs / 1000)}s`,
      events: [
        { event: 'widget/button.clicked',      match: 'data.workflowRunId' },
        { event: 'widget/attribute.submitted', match: 'data.workflowRunId' },
        { event: 'conversation/message.received', match: 'data.conversationId' },
        { event: 'workflow/run.completed',     match: 'data.workflowRunId' },
      ],
    });
    if (!interacted) {
      // VIP / 有联系方式的 lead 例外（与 Featurebase 一致）
      const exempt = await step.run('check-exempt', () => autoCloseExempt(conversationId));
      if (exempt) return;
      await step.run('close', () => conversationService.close(conversationId, { reason: 'wf_auto_close' }));
      await step.sendEvent('closed', { name: 'conversation/state.changed.closed', data: { conversationId } });
    }
  },
);
```

---

## 八、Builder UI（`apps/dashboard/app/workflows`）

> **视觉与交互规范**（暗色画布、节点内嵌编辑器、紫色连线、左下角缩放工具栏）见 [05-FRONTEND.md § 2.3 / § 4.4](05-FRONTEND.md)，对标 `www.featurebase.app/workflow3.png`。

### 8.1 技术栈

| 用途 | 选型 |
|------|------|
| 画布 | `@xyflow/react` v12（**dagre 自动布局** + 禁止手拖节点，符合 Featurebase 行为） |
| 节点 | Custom Node per Block type（消息/动作/条件三种视觉风格） |
| 配置面板 | shadcn `<Sheet />` + `react-hook-form` + Zod resolver（schema 来自 `StepSpec`） |
| 校验 | 客户端实时 Zod parse + 服务端 superRefine |
| 数据 | TanStack Query + Hono RPC |
| 版本对比 | `react-diff-viewer-continued`（左旧右新 JSON） |
| 测试模式 | 「Set live to me only」→ trigger.config.audience 自动注入当前 user 的 email |
| 富文本 Editor | Tiptap 3（消息 Block 内联） |

### 8.2 API（Hono）

```ts
// apps/api/src/routes/workflows.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { WorkflowDef } from '@keenai/shared/workflow/dsl';

export const workflowsRouter = new Hono()
  .get('/',         listWorkflows)
  .post('/',        zValidator('json', WorkflowDef.omit({ id: true, version: true })), createWorkflow)
  .get('/:id',      getWorkflow)
  .put('/:id',      zValidator('json', WorkflowDef), updateDraft)
  .post('/:id/publish',    publishWorkflow)
  .post('/:id/unpublish',  unpublishWorkflow)
  .post('/:id/duplicate',  duplicateWorkflow)
  .delete('/:id',          deleteWorkflow)
  .get('/:id/versions',    listVersions)
  .post('/:id/rollback/:version', rollbackVersion)
  .get('/:id/runs',        listRuns)
  .get('/:id/runs/:runId', getRun)
  .post('/:id/test',       zValidator('json', TestRunReq), dryRunWorkflow)
  .post('/:id/shadow',     enableShadowRun)
  .get('/templates',       listTemplates);
```

### 8.3 关键交互

- **拖拽**：`+ Add step` 在画布上的固定锚点出现 step 类型选择（与 Featurebase 一致，不可任意拖动节点）
- **Branches/Apply rules**：节点底部 `+ Add branch` 弹出 Predicate 编辑器（Field selector + Op + Value，可嵌套 AND/OR）
- **Reply Buttons**：点 button label 直接编辑；右侧拖出 path
- **测试**：右上角 `Save and close` / `Set live` 双按钮；`Test` 按钮触发 `dry-run` 用伪事件走流程并把 Block 输出渲染在节点上
- **顺序管理**：列表页支持拖拽排序（per trigger type 一个 sortable list）

---

## 九、Dynamic Variables（模板引擎）

完全对齐 Featurebase 的 `{First name}` / `{User name}` / `{Company name}` 等动态变量，KeenAI 用统一的 `mustache`-like 引擎：

```ts
// packages/workflow/src/templating.ts
const TPL = /\{\{?\s*([a-zA-Z0-9_.]+)\s*\}\}?/g;

export function renderTemplate(tpl: string, facts: Facts): string {
  return tpl.replace(TPL, (_, path: string) => {
    const value = getDeep(facts, path);
    return value == null ? '' : String(value);
  });
}

// 兼容 Featurebase 的简短形式：{First name} → user.firstName
const ALIAS: Record<string, string> = {
  'First name':  'user.firstName',
  'Last name':   'user.lastName',
  'User name':   'user.name',
  'User email':  'user.email',
  'Company name': 'company.name',
  'Current page': 'page.url',
  'Brand name':  'brand.name',
};
```

支持的字段命名空间与 § 6 相同，前端 Builder 提供 `@` autocompletion。

---

## 十、数据模型

> 完整 Drizzle schema 在 [07-DATA-MODEL.md § 4.6](07-DATA-MODEL.md)。本节列工作流相关的关键表 + 新增表。

```ts
// packages/storage/src/schema/pg/workflow.ts
import { pgTable, text, jsonb, timestamp, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const workflows = pgTable('workflows', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  brandId:      text('brand_id').notNull(),
  name:         text('name').notNull(),
  description:  text('description'),
  status:       text('status').notNull().default('draft'),
  triggerType:  text('trigger_type').notNull(),
  trigger:      jsonb('trigger').notNull(),
  steps:        jsonb('steps').notNull(),
  startStepId:  text('start_step_id').notNull(),
  isCustomerFacing: boolean('is_customer_facing').notNull(),
  sortOrder:    integer('sort_order').notNull().default(0),
  version:      integer('version').notNull().default(1),
  testTarget:   jsonb('test_target'),
  publishedAt:  timestamp('published_at', { withTimezone: true }),
  ...timestamps(),
}, (t) => ({
  idxTriggerSort: index('idx_wf_trigger_sort').on(t.orgId, t.brandId, t.triggerType, t.status, t.sortOrder),
}));

export const workflowVersions = pgTable('workflow_versions', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  workflowId: text('workflow_id').notNull(),
  version:    integer('version').notNull(),
  snapshot:   jsonb('snapshot').notNull(),                    // 完整 WorkflowDef
  createdBy:  text('created_by'),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({ uq: uniqueIndex('uq_wfver').on(t.workflowId, t.version) }));

export const workflowRuns = pgTable('workflow_runs', {
  id:               text('id').primaryKey().$defaultFn(ulid),
  workflowId:       text('workflow_id').notNull(),
  version:          integer('version').notNull(),
  triggerEvent:     jsonb('trigger_event'),
  conversationId:   text('conversation_id'),
  ticketId:         text('ticket_id'),
  targetCustomerId: text('target_customer_id'),
  status:           text('status').notNull().default('running'),    // running/completed/failed/cancelled/expired
  isShadow:         boolean('is_shadow').default(false),
  inngestRunId:     text('inngest_run_id'),
  inngestEventId:   text('inngest_event_id'),
  startedAt:        timestamp('started_at',   { withTimezone: true }).defaultNow(),
  completedAt:      timestamp('completed_at', { withTimezone: true }),
  error:            text('error'),
  lastActivityAt:   timestamp('last_activity_at', { withTimezone: true }),
}, (t) => ({
  idxConv:     index('idx_wfrun_conv').on(t.conversationId, t.startedAt.desc()),
  idxInngest:  index('idx_wfrun_inngest').on(t.inngestRunId),
  idxStatus:   index('idx_wfrun_status').on(t.status, t.lastActivityAt),
}));

export const workflowRunSteps = pgTable('workflow_run_steps', {
  id:          text('id').primaryKey().$defaultFn(ulid),
  runId:       text('run_id').notNull(),
  stepId:      text('step_id').notNull(),
  type:        text('type').notNull(),
  input:       jsonb('input'),
  output:      jsonb('output'),
  status:      text('status').notNull(),                            // success/failed/awaiting_input/skipped
  startedAt:   timestamp('started_at',  { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error:       text('error'),
}, (t) => ({ idx: index('idx_wfrun_steps').on(t.runId, t.startedAt) }));

export const workflowLocks = pgTable('workflow_locks', {
  key:        text('key').primaryKey(),                              // org:brand:trigger:conv
  workflowId: text('workflow_id').notNull(),
  sortOrder:  integer('sort_order').notNull(),
  expiresAt:  timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({ idxExp: index('idx_wflocks_exp').on(t.expiresAt) }));

export const workflowAutoCloseConfig = pgTable('workflow_auto_close_config', {
  orgId:       text('org_id').notNull(),
  brandId:     text('brand_id').notNull(),
  triggerType: text('trigger_type').notNull(),
  waitMs:      integer('wait_ms').notNull(),                          // 60000 / 180000 / ...
}, (t) => ({ pk: primaryKey({ columns: [t.orgId, t.brandId, t.triggerType] }) }));
```

---

## 十一、与其他模块的集成

| 模块 | 集成点 |
|------|--------|
| **Inbox / Conversation** | Workflow 是 Conversation 主要生命周期驱动；Tag / Assign / Close / Snooze 都走 `conversationService` 同一通道，UI 一致 |
| **Channels** | 通过 ChannelMessage 统一接口发消息；CSAT 在 messenger / email / slack 三个 channel 有不同载体 |
| **Tickets** | `send_ticket_form` / `convert_to_ticket` / `set_ticket_state` 三个 Block 直接复用 `@keenai/ticket` |
| **AI Kernel** | `let_keeni_answer` Block mount Mastra Agent；Workflow 可由 Skill System 自动建议（[09-AGENT-ENGINE.md § 8](09-AGENT-ENGINE.md)） |
| **Memory** | Workflow 可写入 working memory（如 `update_slot` Block，差异化）；Resolution 写入 episodic memory |
| **KB** | `let_keeni_answer` 默认带 Hybrid Retriever；Workflow 可显式插入 `retrieve_kb` Block（差异化） |
| **Notify** | 任何后台 Block 都可发 Email / Slack / In-app 通知 |
| **SLA** | `apply_sla` Block 调用 [04-MODULES § 4.4 SLA 引擎](04-MODULES.md) |
| **Office Hours** | `availability.insideOfficeHours` Predicate + `sendTime` Trigger 配置共享同一服务 |
| **Audit** | 每次 publish / unpublish / rollback / delete 写 `audit_logs` |
| **Webhook** | 入站 webhook 可作为 `webhook` trigger；出站 `webhook_emit` Block 复用 `@keenai/webhook` |

---

## 十二、模板库（覆盖 Featurebase 内置 5 个 + KeenAI 扩展）

`packages/workflow/templates/*.json`，全部为 `WorkflowDef`：

| ID | 名称 | 对标 Featurebase 模板 |
|----|------|---------------------|
| `tpl-route-to-team` | Route customer conversations to the right team | Route customers… |
| `tpl-keeni-answers-first` | Let Keeni AI Agent answer first | Let Fibi AI Agent answer first |
| `tpl-self-serve-faq` | Solve frequent queries with self-serve content | Solve frequent queries… |
| `tpl-csat-after-close` | Ask customers for a conversation rating | Ask customers for a rating |
| `tpl-auto-reassign-unresponsive` | Auto-reassign for unresponsive teammates | Auto-reassign… |
| `tpl-lead-qualify` | Collect contact details from leads | Collect contact details… |
| `tpl-email-only-out-of-hours` | Require email outside office hours | Require leads to give email |
| `tpl-fully-automated` | Button-only fully automated triage | Prevent replies for entirely automated |
| `tpl-csat-low-rating-followup` | CSAT + low rating follow-up + tag review | CSAT examples（两个） |
| `tpl-schedule-weekly-survey` 🆕 | Weekly NPS to active users | – |
| `tpl-webhook-tag-from-crm` 🆕 | CRM Webhook → tag VIP | – |

模板示例（CSAT after close）：

```json
{
  "name": "Ask customers for a conversation rating (CSAT)",
  "trigger": {
    "type": "conversation_state_changed",
    "config": {
      "channels": ["messenger", "email", "slack"],
      "audience": { "match": "all", "rules": [] },
      "frequency": { "mode": "every_time" },
      "sendTime": "any",
      "stateOnly": "closed",
      "actorOnly": "teammate"
    }
  },
  "startStepId": "wait_2m",
  "steps": [
    { "type": "wait", "id": "wait_2m", "durationMs": 120000, "interrupt": { "onCustomerReply": true, "onTeammateReply": true, "onReopen": true }, "next": "csat_request" },
    { "type": "csat", "id": "csat_request", "waitForRating": true, "allowComment": true, "next": "rating_branch" },
    {
      "type": "branches", "id": "rating_branch",
      "branches": [
        { "label": "Low",  "condition": { "op": "csat_rating", "cmp": "<=", "value": 2 }, "next": "follow_up_low" },
        { "label": "High", "condition": { "op": "csat_rating", "cmp": ">=", "value": 4 }, "next": null }
      ],
      "elseNext": null
    },
    { "type": "send_message", "id": "follow_up_low", "content": { "text": "Sorry to hear that. A senior teammate will reach out shortly." }, "next": "assign_lead" },
    { "type": "assign",       "id": "assign_lead",  "config": { "teamId": "team_support_lead" }, "next": null }
  ]
}
```

---

## 十三、测试模式 / Shadow Run / 可观测性 / 安全

### 13.1 测试模式（Featurebase 同款）
- Builder 顶部「Test target」开关 → 自动在 `trigger.config.audience` 注入 `{ field: 'user.email', op: 'contains', value: '<your-domain>' }`
- 内部上线、对真实用户不可见

### 13.2 Shadow Run（KeenAI 差异化）
- 「以新版本 dry-run 在最近 N 条已关闭对话上重放」，不发任何外部消息 / 不写 Memory
- 输出每条对话两版本的 path + 总成本 + AI 用量；对比版本 A/B
- 用于评估升级风险

```ts
// packages/workflow/src/shadow.ts
export async function runShadow(def: WorkflowDef, sampleConvs: Conversation[]) {
  const results = [];
  for (const c of sampleConvs) {
    const fakeEvent = synthesizeTriggerEvent(def, c);
    const trace = await executeDef(def, fakeEvent, { isShadowRun: true });
    results.push({ convId: c.id, ...trace });
  }
  return analyzeShadowResults(results);
}
```

### 13.3 可观测性
- 每个 step.run / step.waitForEvent 自动产 OTel span
- Inngest Dashboard 原生展示 run / step / retry / timing
- `workflow_runs` / `workflow_run_steps` 表写入完整 input/output 日志（脱敏后）
- Dashboard 提供 Workflow 维度看板：触发次数 / 完成率 / 平均时长 / 中断分布 / 漏斗（每个 step 通过率）

### 13.4 安全
- Audience 中 PII 字段（email / phone）匹配走脱敏哈希
- HTTP / Script Block：默认禁用，需 Owner 启用；带域名白名单 + 速率限制 + 沙箱隔离
- 所有 secrets（HMAC / Bearer）通过 `secrets` 表 + KMS 加密引用
- Workflow publish 审计写 `audit_logs`
- 多租户 RLS（应用层 + 可选 PG RLS）：所有查询带 `org_id` 谓词

---

## 十四、Eval Harness

### 14.1 黄金用例
- 为每个模板预置 5-10 个黄金对话（input + expected path + expected tags / status）
- `bunx keenai workflow eval --workflow <id> --suite <suite>` 跑回归
- 与 [11-RAG-KNOWLEDGE.md § 8](11-RAG-KNOWLEDGE.md) 的 `kb_golden_queries` 共用 Mastra Eval pipeline

### 14.2 指标
- 路径覆盖率（每个 path 至少被 1 个 case 命中）
- 决策准确率（branch 选择 vs 期望）
- 平均执行时间 / Token 成本 / Tool 调用次数（用于 cost regression）
- AI Block faithfulness（与 KB 对齐）

---

## 十五、路线图（与 [08-ROADMAP.md](08-ROADMAP.md) 对齐）

| Sprint | 工作流相关交付 |
|--------|--------------|
| **Sprint 6（W15-W16）MVP** | 触发器 `first_message` / `customer_unresponsive` + Block `send_message` / `assign` / `close`；React Flow 单层 builder |
| **Sprint 9-10（W21-W24）Workflow 完整版 + SLA** | 13 个 Trigger 全部 + Block 全集；Inngest waitForEvent / sleepUntil；版本管理；Trace |
| **Sprint 13-14（W29-W32）AI Kernel** | `let_keeni_answer` Block；Resolution 检测；Topic-based branching；Auto-close abandoned |
| **Sprint 15（W33-W34）Custom Actions** | `http_request` / `mcp_call` / `script` Block + 沙箱 |
| **Sprint 17（W37-W38）国产化** | 多渠道 trigger / 多语言 dynamic variables / 国产 LLM 在 Let Keeni Answer 中的 routing |
| **Sprint 18（W39-W40）发布前** | 模板库 11 个；Shadow Run；Eval Harness；Builder UX 收敛 |
| **Phase 4** | 团队级 Workflow Marketplace；OAuth 应用可发布自定义 Block；行业模板包 |

---

## 十六、与 Featurebase 一致性自检表

| Featurebase 特性 | KeenAI 状态 | 实现位置 |
|----|:---:|----|
| 13 种 Trigger | ✅ | § 3 |
| 全部 Action Block | ✅ | § 4 |
| Customer-facing vs Background 分类 + 排序互斥 | ✅ | § 7.2 |
| Wait 可中断（customer / teammate reply / close） | ✅ | § 4.6 |
| Branches 首匹配 vs Apply Rules 全匹配并行 | ✅ | § 4.4 |
| Earliest remaining customer 规则 | ✅ | § 7.3 |
| Auto-close abandoned（1/3/5/7/10/15/30/60 min） | ✅ | § 7.4 |
| CSAT 三个 toggle（preventAfter / preventChangeAfter / waitForRating） | ✅ | § 4.7 |
| CSAT 仅 Web / Email / Slack 渠道 | ✅ | § 4.7 |
| Dynamic Variables `{First name}` 等 | ✅ | § 9 |
| Reply Buttons + Free Text 共存 | ✅ | § 4.3 |
| Collect Data 写入 user / conv 属性 | ✅ | § 4 + § 11 |
| 测试模式（仅自己可见） | ✅ | § 13.1 |
| 模板库 | ✅ | § 12 |
| **差异化** Schedule / Webhook / event_match | 🆕 | § 3 |
| **差异化** HTTP Request / Script / MCP Call | 🆕 | § 4.8 |
| **差异化** 版本管理 / 回滚 / Shadow Run / Eval | 🆕 | § 8 / § 13.2 / § 14 |
| **差异化** Resolution → Outcome Routing | 🆕 | § 4.5 |
| **差异化** Update Memory Slot Block | 🆕 | § 11 |

---

> 设计原则：**「行为对标 Featurebase」 + 「执行栈 Inngest 原生 + Mastra AI 原生 + Zod 端到端类型安全」**。所有 Trigger / Block 在 Builder 中的 UX 与 Featurebase 用户的肌肉记忆一致，迁移成本接近零；底层执行层利用 Inngest 的 step 持久化与 waitForEvent 模型，得到比 Featurebase 更强的可观测性、版本管理与可测试性。
