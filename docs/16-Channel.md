# Channel Gateway 统一渠道架构

> 状态：核心可靠消息链路已落地。KeenAI 已实现 Durable Channel Ingress、持久化 Session/Command Queue、Durable Final Delivery、Connection Runtime 租约、Discord Gateway supervisor、恢复扫描和管理端 DLQ 重放。Webhook/Email 生产入站与 Agent/Workflow 出站已接入该链路；WhatsApp/飞书回执可推进内部消息状态。

本文将原 Widget 重构方案扩展为 KeenAI 的统一渠道设计。所有外部消息入口，包括 Widget、Email、Slack、Discord、WhatsApp、微信/企业微信、飞书、钉钉和 Telegram，均通过同一套接入、路由、策略、会话和可靠投递基础设施进入系统；渠道差异只保留在插件适配层。

## 1. 目标与边界

### 1.1 目标

- 用统一消息模型承接 Widget、Email 和即时通信平台，避免每个渠道直接耦合 Conversation、Workflow 或 Agent。
- 同时支持 Webhook、轮询、长连接、IMAP/SMTP、浏览器 WebSocket 等不同传输方式。
- 入站事件可去重、可重放、可追踪；出站消息可重试、可查回执、可进入死信队列。
- 同一个外部联系人和同一个外部会话能够稳定映射到 KeenAI 的 Contact 与 Conversation。
- 所有渠道共享租户隔离、Policy、审批、审计、幂等、限流和可观测性。
- 插件只负责协议适配，不直接决定业务流程，也不直接调用模型。

### 1.2 非目标

- 不复制 OpenClaw 的单用户设备配对模型。KeenAI 是多租户 SaaS，连接、凭据、路由和审计均以 `org_id`、`brand_id` 为边界。
- 不让 Channel Plugin 持有业务真相。Conversation、Message、Workflow Run 和 Agent Run 仍由各自领域模块管理。
- 不用 API 请求线程承担可靠投递。外部发送必须经过可恢复 Outbox 和异步 Sender Worker。

## 2. 整体架构

```text
Widget / Email / Slack / Discord / WhatsApp / WeChat / Feishu / DingTalk / Telegram
                                      │ webhook / socket / poll / IMAP / WS
                                      ▼
Channel Gateway: endpoint dispatch / auth / tenant resolution / raw event persist / ACK
                                      ▼
Connection Runtime: lease / token refresh / socket lifecycle / health / backoff
                                      ▼
Durable Ingress: dedupe / normalize / identity mapping / conversation routing / replay
                                      ▼
Channel Kernel: Contact / Conversation / Message / Policy / Audit / Idempotency
                         ┌────────────┴────────────┐
                         ▼                         ▼
                 Workflow / Agent              Human Inbox
                         └────────────┬────────────┘
                                      ▼
Durable Delivery: recoverable outbox / scheduler / sender / retry / receipt / DLQ
                                      ▼
                              Channel Plugin.send()
```

核心原则：

1. **先持久化，再确认入站**：网关完成签名验证后，先写入原始事件和幂等键，再向提供方返回成功。
2. **先写 Outbox，再异步发送**：业务事务只创建标准消息与 Outbox 任务，Sender Worker 负责外部调用。
3. **确定性路由**：以连接、外部账号、外部会话和线程标识映射内部 Conversation，不依赖模型猜测。
4. **能力协商**：编辑、Reaction、线程、附件、模板和回执等能力由插件声明，核心层不硬编码渠道名称。
5. **至少一次执行、业务幂等**：队列允许重复投递，Ingress、Message 和 Delivery 层分别使用唯一键消除副作用。
6. **区分接受与送达**：`accepted` 只表示提供方接收；`delivered`、`read` 由回执推进，无法确定时使用 `unknown`。

## 3. 模块划分

| 模块 | 职责 | 不负责 |
|---|---|---|
| Channel Gateway | 接收 Webhook/Socket/IMAP/WS 事件，验证来源，解析连接，持久化原始事件并快速 ACK | 会话业务、AI 推理、直接发送回复 |
| Channel Plugin SDK | 定义插件生命周期、标准事件、能力和错误分类 | 持久化、业务路由、重试策略 |
| Channel Plugins | 将各提供方协议转换为标准入站/出站模型 | 绕过 Kernel 直接操作 Workflow/Agent |
| Connection Runtime | 连接租约、长连接、轮询、Token 刷新、健康检查和退避 | 保存业务消息真相 |
| Durable Ingress | 去重、标准化、身份映射、会话路由、重放和隔离失败事件 | 生成最终客服答案 |
| Channel Kernel | 创建 Contact/Conversation/Message，执行租户策略、幂等和审计 | 提供方协议细节 |
| Delivery Runtime | Outbox 调度、发送、重试、限流、回执、死信和人工重放 | 决定回复内容 |
| Workflow / Agent / Inbox | 决策、执行、升级和人工处理 | 直接持有渠道 Token 或调用渠道 SDK |

建议代码边界：

```text
packages/
  channels-core/          # 标准类型、插件契约、能力与错误分类
  channels-runtime/       # Ingress、Session Command、Outbox、Receipt、DLQ
  channels-widget/        # Widget 插件
  channels-email/         # Email 插件
  channels-im/            # Slack/Discord/Telegram/WhatsApp/WeCom/Feishu/DingTalk
apps/api/src/routes/      # Webhook 与连接配置 API
apps/api/src/lib/channel-dispatch.ts # Ingress/Session/Delivery 调度
apps/api/src/lib/channel-recovery-scheduler.ts # 无外部队列时的恢复扫描
apps/api/src/lib/channel-connection-supervisor.ts # 有状态连接租约与生命周期
apps/api/src/lib/discord-gateway.ts # Discord IDENTIFY/RESUME/heartbeat
apps/api/src/routes/channel-dead-letters.ts # DLQ 查询、重放与解决
packages/storage/src/schema/sqlite/channel.ts # 可靠链路事实表
```

实际目录可随现有 monorepo 调整，但依赖方向必须保持为“插件依赖 SDK，业务依赖标准模型”，不能反向依赖具体插件。

## 4. Channel Plugin 契约

插件通过统一契约注册，核心代码不使用 `if (channel === 'slack')` 分派业务逻辑。

```ts
export interface ChannelPlugin {
  readonly type: ChannelType;
  readonly capabilities: ReadonlySet<ChannelCapability>;
  verifyWebhook?(request, connection): Promise<ChannelVerificationResult>;
  parseWebhook?(request, connection): Promise<ChannelProviderEvent[]>;
  normalizeInbound?(event, connection): Promise<ChannelInboundEnvelope | null>;
  send(envelope, connection): Promise<ChannelSendResult>;
  parseDeliveryReceipts?(request, connection): Promise<ChannelDeliveryReceipt[]>;
  classifyError(error): ChannelClassifiedError;
}
```

连接校验、Token 交换和长连接生命周期属于 Gateway/Connection Runtime，不塞进插件业务契约。当前 Registry 注册 `widget`、`email` 与七个 IM 插件；统一契约测试覆盖所有 IM 插件的能力声明与出站动作生成。

能力声明至少包含入站、出站、线程、附件、Reaction、编辑、删除、Typing、已读/送达回执、模板、最大文本长度和最大附件大小。核心层根据能力降级：例如不支持编辑时发送更正消息，不支持线程时使用外部会话主键，超过长度时由公共内容适配器分段。

## 5. Connection Runtime

连接分为两类：

- **无状态接入**：HTTP Webhook、Widget HTTP/WS。Gateway 可水平扩展，连接配置从数据库和 Secret Store 读取。
- **有状态接入**：Socket Mode、Gateway WebSocket、长轮询、IMAP IDLE。Runtime Worker 持有租约，确保一个连接同一时刻只有一个活跃消费者。

```text
connection.status: active | disabled | error
runtime_state:     stopped -> connecting -> connected -> reconnecting
                               │                │
                               └---- error <----┘
```

- 数据库租约或 Redis lease 包含 `owner_id`、`lease_expires_at`、`heartbeat_at`。
- 每次 claim 生成 fencing token；过期 owner 即使恢复也不能再 heartbeat、提交 cursor 或释放新 owner 的租约。
- 重连使用指数退避和随机抖动；Token 刷新使用版本号避免多 Worker 覆盖。
- 凭据只保存 Secret 引用；日志、Trace 和错误不得输出 Token、签名密钥或邮件密码。
- 健康状态区分配置错误、鉴权错误、限流、网络错误和提供方故障。

## 6. 入站核心流程

```text
Receive -> Verify -> Persist raw event -> ACK provider
        -> Queue ingress job -> Deduplicate -> Normalize
        -> Resolve identity -> Resolve conversation/thread
        -> Persist message/event -> Trigger automation/agent/inbox
```

1. Gateway 通过路由参数或签名中的应用标识定位 `channel_connection`。
2. 插件验证签名、时间戳和重放窗口，解析一个或多个提供方事件。
3. 每个事件写入 `channel_ingress_events`，唯一键为 `(connection_id, provider_event_id)`。
4. Gateway 成功持久化后立即 ACK；耗时解析、附件下载和业务处理进入队列。
5. Worker 调用插件 `normalize`，产生标准 `InboundEnvelope`。
6. Identity Mapper 以 `(connection_id, external_user_id)` 找到 Contact 映射。
7. Router 以 `(connection_id, external_conversation_id, external_thread_id)` 找到或创建 Conversation。
8. 在同一数据库事务中写 Message、Event 和后续 Workflow/Agent 触发记录。
9. 失败按 `retryable`、`permanent`、`security` 分类；超过阈值进入死信并保留原始事件。

## 7. 会话和身份路由

| 场景 | 外部会话键 |
|---|---|
| Widget | `visitor/session + widget conversation id` |
| Email | `Message-ID`、`In-Reply-To/References` 和收件地址 |
| Slack | `team + channel + thread_ts` |
| Discord | `guild + channel/thread id` |
| WhatsApp | `phone_number_id + wa_id` |
| 微信/企业微信 | `corp/app + external_user/open_id + chat_id` |
| 飞书 | `app + chat_id + root_id/thread_id` |
| 钉钉 | `corp/app + conversation_id + sender_id` |
| Telegram | `bot + chat_id + message_thread_id` |

- Provider ID 必须连同 `connection_id` 使用，不能假定跨连接全局唯一。
- 外部联系人合并必须走显式 Identity Link，不能仅凭昵称自动合并。
- 渠道线程映射独立保存，避免在 Conversation 上堆积每个提供方字段。
- 重新授权连接时保留稳定连接 ID；更换外部应用或租户时创建新连接。

## 8. 出站与 Durable Delivery

业务代码只调用统一发送服务。当前 SQLite/LibSQL 实现先持久化 `delivery_status=pending` 的内部 Message，再幂等创建 `channel_outbox`；恢复扫描持续补齐尚无 Outbox 意图的 pending Message，因此进程崩溃不会让最终回复永久丢失。未来 PG 实现可将 Message 与 Outbox 合并为严格的单数据库事务。Outbox 接管后，Sender Worker 加载插件与连接，执行能力校验、内容适配、限流和发送；Receipt Worker 再根据提供方回执推进状态。

```text
queued -> sending -> accepted -> delivered -> read
              │          │
              ├-> retry   ├-> unknown
              └-> failed  └-> bounced/rejected
                     │
                     └-> dead_letter
```

- 仅重试网络错误、超时、429 和提供方 5xx；认证失败、目标不存在和内容非法属于永久失败。
- 优先使用提供方幂等键；不支持时使用发送锁和 `(connection_id, idempotency_key)` 唯一约束。
- 请求超时且无法确认提供方是否接收时标记 `unknown`，不能立即假定失败并无限重发。
- 重试遵守 `Retry-After`，并按连接和渠道分别限流。
- 死信支持后台查看、修复连接后重放和完整审计。
- 管理端通过组织隔离的 DLQ API 查询、重放或解决失败任务；重放保留历史 attempt，并提升该任务后续可用的最大尝试次数。

## 9. 核心数据模型

| 表 | 作用 | 关键约束 |
|---|---|---|
| `channel_connections` | 租户下的渠道账号、传输配置、加密凭据、运行状态、fencing token、租约、cursor 和退避时间 | `(org, brand, channel_type, external_account_id)` 唯一 |
| `channel_ingress_events` | 入站原始事件、处理状态、重试和错误 | `(connection_id, provider_event_id)` 唯一 |
| `channel_identities` | 外部用户到 KeenAI Contact/User 的映射 | `(connection_id, external_user_id)` 唯一 |
| `channel_conversation_links` | 外部会话/线程到内部 Conversation 的映射 | 连接 + 外部会话 + 线程唯一 |
| `channel_message_links` | 内部消息与提供方消息 ID 的双向映射 | 连接 + 提供方消息 ID 唯一 |
| `channel_session_commands` | 按 Conversation 串行的持久化 Agent/Workflow 命令 | 幂等键唯一，Conversation + sequence 唯一 |
| `channel_outbox` | 待发送标准消息、锁、重试和最终结果 | `(connection_id, idempotency_key)` 唯一 |
| `channel_delivery_attempts` | 每次提供方调用的脱敏结果 | `(outbox_id, attempt_no)` 唯一 |
| `channel_delivery_receipts` | 接受、发送、送达、已读和失败回执 | `(connection_id, provider_message_id, status)` 唯一 |
| `channel_dead_letters` | 入站/出站不可恢复任务及审计重放 | 来源方向、表和记录唯一 |

`Message` 先以 pending 状态持久化，Outbox 通过稳定幂等键创建，恢复扫描补齐两步之间的崩溃窗口；`messages.delivery_status` 只保存便于 UI 查询的状态摘要，完整事实保存在发送尝试和回执表。原始 Payload、死信 Payload 和提供方响应需要脱敏、加密并设置保留期限。完整 Drizzle 模型见 [07-DATA-MODEL.md § 4.4](07-DATA-MODEL.md)。

## 10. 渠道实现策略

| 渠道 | 入站方式 | 出站方式 | Runtime | 关键注意事项 |
|---|---|---|---|---|
| Widget | HTTP/WS | HTTP/WS | 无状态 + 实时连接 | 匿名身份、Origin 校验、断线续传 |
| Email | Provider Webhook/IMAP | Provider API/SMTP | Webhook 或 IMAP IDLE | Threading、退信、附件、抑制列表 |
| Slack | Events API/Socket Mode | Web API | 可选 Socket Runtime | team/channel/thread、OAuth scopes |
| Discord | Gateway/Webhook | REST | **Gateway Runtime 已实现** | IDENTIFY/RESUME、heartbeat、cursor、租约 fencing |
| WhatsApp | Meta Webhook | Cloud API | 无状态 | phone number 隔离、sent/delivered/read/failed 回执 |
| 微信/企业微信 | 回调/WebSocket（按产品） | 官方 API | 视接入模式 | 签名、加解密、corp/app 隔离 |
| 飞书 | Event Subscription | Open API | 当前 Webhook | tenant/app/chat、Token 刷新、message read 回执 |
| 钉钉 | Stream/Webhook | Open API | Stream Runtime | corp/app/conversation、签名与限流 |
| Telegram | Webhook/Long Polling | Bot API | 可选 Poll Runtime | bot/chat/topic、文件限制 |

WhatsApp 采用官方 Meta Cloud API；微信优先企业微信或官方开放平台。非官方个人账号协议只能作为明确标记风险的实验插件，不能进入默认生产路径。

## 11. 安全、可观测性与迁移

### 11.1 安全与可观测性

- Secret 使用加密存储或外部 Secret Manager，数据库仅保存引用和非敏感元数据。
- Webhook 验证签名、时间窗口、Body 大小和 Content-Type；附件执行 MIME、大小和恶意内容检查。
- 查询必须包含 `org_id`；连接授权、发送、重放、禁用和凭据更新写入审计日志。
- Trace 串联 `provider_event_id -> ingress_event_id -> message_id -> workflow_run/agent_run -> outbox_id -> provider_message_id -> receipt_id`。
- 指标至少包含入站延迟、去重率、规范化失败、连接重连、Outbox 积压、发送成功率、回执延迟、重试和死信。

### 11.2 测试

- SDK contract test：所有插件通过同一组规范化、能力、错误分类和幂等测试。
- Provider fixture test：用脱敏事件样本验证签名和解析。
- End-to-end：入站到 Conversation，再由 Workflow/Agent/Human 生成 Outbox 并送达模拟提供方。
- Failure injection：重复事件、乱序回执、429、超时、Token 过期、连接迁移和 Worker 崩溃。
- Tenant isolation：跨组织连接、身份、会话和死信不可互查或重放。

### 11.3 分阶段迁移

1. 提取标准消息、插件契约和能力模型；先为现有 Widget、Email 增加适配器。
2. 上线连接、Ingress Event、映射表和 Outbox；保留现有 API 外观。
3. 将 Widget、Email 收发改走统一 Kernel 与 Delivery，不改变用户界面行为。
4. 接入 Slack、Discord、Telegram、飞书和钉钉，按连接灰度启用。
5. 接入 WhatsApp Cloud API、企业微信，并完善模板、回执和合规策略。
6. 移除旧的渠道直连发送路径，所有发送统一经过 Outbox。

迁移期间新旧路径通过连接级 feature flag 互斥，禁止双写后直接双发；回滚必须保留稳定的外部映射和幂等键。

## 12. 参考实现与采用边界

本方案参考 [OpenClaw Gateway 架构](https://github.com/openclaw/openclaw/blob/main/docs/concepts/architecture.md)、[渠道路由](https://github.com/openclaw/openclaw/blob/main/docs/channels/channel-routing.md)、[Channel Plugin SDK](https://github.com/openclaw/openclaw/blob/main/docs/plugins/sdk-channel-plugins.md) 和 [ChannelPlugin 类型](https://github.com/openclaw/openclaw/blob/main/src/channels/plugins/types.plugin.ts)。采用其 Gateway、插件化渠道、连接生命周期和确定性路由思想，同时针对 KeenAI 增加多租户隔离、可恢复 Outbox、持久化入站、投递回执和企业审计。

不直接复制 OpenClaw 的个人设备会话、单 Gateway 信任边界和本地优先配置方式。具体参考路径及版本管理见 [00-REFERENCE-REPOS.md](./00-REFERENCE-REPOS.md)。

### 12.1 OpenClaw 的三层消息队列

OpenClaw 的“消息队列”不是一个统一外部 Broker，而是三个边界不同的机制：

| 层 | 持久性 | 目的 | 关键行为 |
|---|---|---|---|
| Durable Channel Ingress（已迁移渠道） | SQLite 持久化 | 防止传输事件在 ACK、重启和重放窗口中丢失 | 原始事件先 append；Webhook ACK/轮询游标在 append 后推进；按 Conversation lane 串行 drain；完成后保留 tombstone 去重 |
| Session / Command Queue | 进程内 | 防止同一 Session 的 Agent Run 冲突并限制全局并发 | 先进入 `session:<key>` lane，再进入全局 `main` lane；支持 `steer/followup/collect/interrupt` |
| Durable Final Delivery | SQLite 持久化 | 在最终可见回复调用平台前保存发送意图并支持恢复 | 保存 channel/target/account/retry/recovery state；对 `unknown_after_send` 只有在适配器可对账时才安全重放 |

默认 Session Queue 使用 `steer`，内置 500ms debounce、`cap=20`、`drop=summarize`。它是调度队列，不是消息事实库；队列本身不应被当作重启恢复来源。普通 Gateway `chat.send` 会先写 Agent 数据库，渠道消息则由 Durable Ingress 保留到 Agent Turn 接管。

Durable Ingress 和 Durable Final 的覆盖范围取决于具体插件及发送路径。尚未迁移的渠道仍可能依赖通用的进程内重投去重缓存或插件自有机制，因此“插件已注册”不等于“端到端持久化已完成”。

### 12.2 OpenClaw 入站模型（采用 Durable Ingress 的渠道）

```text
Provider event
  → Channel transport/webhook
  → append raw envelope to durable ingress
  → ACK provider / advance remote cursor
  → account monitor drains queue
  → dedupe tombstone + per-conversation serialized lane
  → plugin authorization / normalize / deterministic route
  → session queue
  → agent run
```

Durable Ingress 主键为 `(queue_name, event_id)`。完成记录不立即删除，而是转为有保留期限和容量上限的 tombstone。处理语义为 **at least once**：如果业务副作用完成后、Ingress 标记完成前进程崩溃，事件可能重放；非幂等副作用必须使用稳定 `eventId + effectName` 的 effect-once 记录。

不同传输必须在各自可恢复边界确认：

- Ack-gated Webhook：持久化成功后才返回成功。
- Poll/Stream：持久化成功后才推进远端 cursor 或发送 transport ACK。
- Non-replay Socket：本地队列只能覆盖已接收后的进程崩溃，无法要求平台补发断线期间消息。

### 12.3 OpenClaw Agent 执行模型

```text
session:<sessionKey> FIFO lane（同一 Session 串行）
  → global main lane（agents.defaults.maxConcurrent）
  → model/tool loop
```

- `steer`：活动 Run 可接收时把新消息注入当前 Turn，否则退化为后续 Turn。
- `followup`：当前 Run 完成后逐条执行。
- `collect`：静默窗口内合并兼容消息；不同渠道/线程仍分别 drain。
- `interrupt`：中止当前 Run，再执行最新消息。

这一层解决并发和上下文冲突，不承诺外部消息可靠性。KeenAI 可复用相同的 Session 串行与全局并发思想，但任务状态必须落入 Workflow/Agent Run 存储，不能只依赖进程内 Promise 队列。

### 12.4 OpenClaw 出站模型

```text
Agent ReplyPayload
  → hooks / render / chunk / channel projection
  → durable final send intent
  → adapter platform call
  → platform result / receipt
  → acknowledge, retry, reconcile unknown, or dead-letter
```

核心不变量是：当系统决定一个最终可见回复必须发送时，在平台调用前先持久化发送意图。传输错误分类为 transient、rate-limit、auth、permission、not-found、invalid-payload、conflict、cancelled 和 unknown；只对可恢复错误重试。

进程在平台调用后、提交成功回执前崩溃时，状态是 `unknown_after_send`。适配器若不能通过提供方消息 ID 或查询接口证明“已发送/未发送”，系统不能盲目重放，否则会产生重复消息。Streaming preview、直接发送工具和仍未迁移到 durable final 的插件路径不应被误认为具有相同保证。

### 12.5 KeenAI 的采用方式（已落地）

KeenAI 保留上述三层分工，但按企业多租户和多实例部署调整：

- Durable Ingress 使用 `channel_ingress_events`，按 `(connection_id, provider_event_id)` 去重；任务通过 claim token、lease、退避和 DLQ 支持崩溃恢复。Webhook 在写入后 ACK，IMAP 在写入后才推进处理边界。
- Session/Command Queue 不是进程内 Promise 队列，而是 `channel_session_commands` 持久化队列。它按 `conversation_id + sequence` 串行、用 `idempotency_key` 去重，并以 claim token 和 lease 防止多实例重复执行。
- Durable Delivery 使用 `channel_outbox + channel_delivery_attempts + channel_delivery_receipts`；pending Message 通过幂等 Outbox 和 recovery scan 可恢复接管，并保留提供方消息 ID。
- `unknown_after_send` 默认停止自动重放；只有插件声明并通过 `reconcileUnknownSend` contract test 后才允许自动对账重试。
- Email 和七种 IM Webhook 入站走 Durable Ingress/Session Command；Widget 入站 API 先直接写入规范 Message 事实，因此不再复制一份 Ingress 事件。
- Widget、Email 和 IM 的 Agent/Workflow 可见回复全部通过同一 Outbox 发送，旧 Email 直接 SMTP 发送已从业务路径移除。

| 层 | 持久化事实 | 运行入口 | 当前保证 |
|---|---|---|---|
| Durable Channel Ingress | `channel_ingress_events` | `admitIngressEvent` / `processChannelIngress` | 持久化后 ACK、去重、lease claim、退避、DLQ |
| Session / Command Queue | `channel_session_commands` | `enqueueSessionCommand` / `processChannelSession` | 每会话 FIFO、幂等、lease fencing、退避、DLQ |
| Durable Final Delivery | `channel_outbox` 及 attempt/receipt 表 | `enqueueMessageForChannelDelivery` / `processChannelOutbox` | 发送前持久化、可重试错误退避、回执推进、未知结果不盲目重发 |

代码位置：`packages/channels-runtime/src/{ingress,session-queue,delivery,dead-letter,connection-runtime}.ts`、`apps/api/src/lib/{channel-dispatch,channel-recovery-scheduler,channel-connection-supervisor,discord-gateway}.ts`、`apps/api/src/routes/{im-webhooks,email-webhooks,channel-connections,channel-dead-letters}.ts`。

---

## 13. Widget 专项设计（原 Widget 重构方案）

本文定义 KeenAI Messenger Widget 的下一阶段重构方案。目标是从当前“单一聊天面板”升级为对齐参考图的多模块用户入口：Home、Messages、Help、Changelog、AI Chat、Ticket。

### 13.1 目标体验

参考图展示的 Widget 由一个固定右下角 launcher 和一个多页面面板组成：

- Home：欢迎区、团队/品牌视觉、Ask a question、Submit ticket、Help 搜索与推荐文章。
- Messages：历史会话列表；无会话时显示空状态和 `Ask a question` CTA。
- Chat：AI Agent 对话页，支持 KB 搜索状态、富文本回答、引用、emoji、附件、快捷问题类型。
- Help：帮助中心集合和文章列表，顶部紫色搜索区。
- Changelog：最新更新卡片列表，支持图文更新展示。
- Bottom nav：`Home / Messages / Help / Changelog` 固定底部导航。

### 13.2 当前状态

当前 `apps/widget` 已有基础通信能力：

- `POST /api/v1/widget/session`：HMAC visitor session。
- `GET /api/v1/widget/config`：返回 brand/widget 配置，并在缺省时初始化独立 widget 配置表。
- `GET /api/v1/widget/conversations`：返回当前 visitor 在当前 brand 下的 messenger 会话列表。
- `POST /api/v1/widget/conversations`：创建或复用当前 open conversation。
- `GET /api/v1/widget/conversations/:id/messages`：读取消息历史。
- `POST /api/v1/widget/conversations/:id/messages`：发送访客消息。
- `POST /api/v1/widget/uploads/presign` + `PUT /api/v1/widget/uploads/:uploadId`：附件上传。
- `WS /api/v1/widget/conversations/:id/ws`：会话实时更新。

主要缺口：

- UI 仍是手写 DOM 单页聊天面板，缺少多模块导航和首页。
- Help / Changelog 目前可复用 public API，但缺少 widget auth 下的一站式聚合。
- AI answer SSE 已存在 public KB answer 路由，但 Widget 需要自己的状态流与 conversation 绑定。
- Ticket 提交入口尚未作为 Widget 一等功能暴露。

已完成：

- Widget 配置使用独立表：`widget_settings`、`widget_menu_items`、`widget_quick_actions`、`widget_featured_content`。
- LibSQL migration 已添加：`0041_widget_settings.sql`。
- SQLite / Postgres schema 已导出对应 widget 表。
- `GET /api/v1/widget/config` 已接入默认配置初始化。
- `GET /api/v1/widget/home` 已接入 quick actions、推荐文章、最新 changelog 聚合。
- `GET /api/v1/widget/conversations` 已接入 visitor 会话列表。
- `GET /api/v1/widget/help/*` 和 `GET /api/v1/widget/changelog/*` 已接入 widget auth 下的列表/详情读取。
- `POST /api/v1/widget/tickets` 已接入 widget ticket 创建，并关联新建 conversation。
- Widget 统一通过 conversation message 接口发送问题；Basic Agent 是否执行由服务端 Workflow Dispatch 决定。

### 13.3 前端重构

保留 `Preact + Vite + Shadow DOM + IIFE` 的嵌入模型，内部改为组件化 App。

建议目录：

```text
apps/widget/src/
  app/
    WidgetApp.tsx
    state.ts
    routes.ts
  views/
    HomeView.tsx
    MessagesView.tsx
    ChatView.tsx
    HelpView.tsx
    ChangelogView.tsx
  components/
    WidgetShell.tsx
    Launcher.tsx
    BottomNav.tsx
    Header.tsx
    Composer.tsx
    EmojiPicker.tsx
    AttachmentButton.tsx
    MessageBubble.tsx
    RichAnswer.tsx
    EmptyState.tsx
  api/
    widget-client.ts
    realtime.ts
  styles/
    widget-styles.ts
```

核心状态：

```ts
type WidgetView = "home" | "messages" | "chat" | "help" | "changelog";

type WidgetState = {
  open: boolean;
  view: WidgetView;
  session: WidgetSession | null;
  config: WidgetConfig | null;
  activeConversationId: string | null;
  conversations: WidgetConversationSummary[];
  messagesByConversation: Record<string, WidgetMessage[]>;
  answerStatus: "idle" | "searching" | "streaming" | "done" | "error";
};
```

UI 约束：

- 面板宽度对齐参考图：桌面约 `390-420px`，移动端全屏底部 sheet。
- 大圆角白色容器，默认紫色 brand accent。
- Bottom nav 始终固定在面板底部。
- Chat detail 有独立 header：返回箭头、Agent logo、标题、副标题。
- Composer 固定底部，包含 emoji 与 attachment 图标。
- 消息内容支持 markdown-like rich text、列表、inline code、source badge。

### 13.4 后端接口方案

新增 Widget 聚合 API，避免前端直接拼 public portal API。

#### 13.4.1 配置

```http
GET /api/v1/widget/config
Authorization: Bearer <widget-token>
```

返回：

```ts
type WidgetConfig = {
  org: { id: string; slug: string; name: string };
  brand: {
    id: string;
    slug: string;
    name: string;
    logoUrl?: string | null;
    primaryColor: string;
  };
  agent: {
    name: string;
    subtitle: string;
    greetingTitle: string;
    greetingBody: string;
    avatarUrl?: string | null;
  };
  modules: {
    home: boolean;
    messages: boolean;
    help: boolean;
    changelog: boolean;
    tickets: boolean;
  };
  menuItems: Array<{
    id: string;
    label: string;
    description?: string | null;
    icon?: string | null;
    type: "module" | "external";
    href?: string | null;
    module?: "home" | "messages" | "help" | "changelog" | "tickets" | null;
    location: "bottom_nav" | "home_card" | "portal_menu";
    sortOrder: number;
  }>;
  quickActions: Array<{
    id: string;
    label: string;
    type: "start_chat" | "submit_ticket" | "open_help" | "open_url";
    payload: Record<string, unknown>;
    sortOrder: number;
  }>;
  poweredBy: boolean;
};
```

落库建议：第一版直接使用独立表，不写入 `brands.settings` 或 `brands.attributes`。Widget 配置会被 Dashboard、公开 Portal、Widget 运行时同时读取，独立表能避免 brand 通用配置继续膨胀，也便于做启停、排序、审计和局部更新。

#### 13.4.2 Home 聚合

```http
GET /api/v1/widget/home
Authorization: Bearer <widget-token>
```

返回：

- 推荐 help articles。
- latest changelog entries。
- 可用 ticket forms。
- quick actions。

#### 13.4.3 会话列表

```http
GET /api/v1/widget/conversations
Authorization: Bearer <widget-token>
```

返回当前 visitor 在当前 brand 下的 messenger conversations。

需要扩展 `apps/api/src/lib/widget.ts`：

- `listWidgetConversations(db, orgId, brandId, userId, limit)`
- 序列化 `lastMessagePreview`、`lastMessageAt`、`status`、`unreadCount`

#### 13.4.4 AI Answer

```http
POST /api/v1/widget/conversations/:id/messages
Authorization: Bearer <widget-token>
Content-Type: application/json

{
  "plainText": "如何和 discord 集成"
}
```

消息落库后产生 `any_message` Workflow 触发。Workflow Dispatch 读取 Brand 的 Deploy 设置：

- Basic Agent 开启：运行系统内置 Basic Agent，同时跳过包含 `let_keeni_answer` 的用户 Workflow。
- Basic Agent 关闭：不运行系统 Basic Agent，用户配置的 Agent Workflow 正常执行。
- 不包含 `let_keeni_answer` 的 Automation Workflow 在两种模式下都正常执行。

Widget 不读取 Deploy 设置，也不选择 AI 接口。Agent 回复通过 conversation realtime 事件和消息历史返回，保证 Dashboard Inbox 与 Widget 使用同一份消息记录。

#### 13.4.5 Help

```http
GET /api/v1/widget/help/collections
GET /api/v1/widget/help/articles?collection=<id>&q=<query>
GET /api/v1/widget/help/articles/:id
```

复用：

- `listPublicKbCollections`
- `listPublicKbArticles`
- `getPublicKbArticle`

区别：widget auth 下不依赖 `PORTAL_PUBLIC_READ`，但必须校验 `orgId / brandId`。

#### 13.4.6 Changelog

```http
GET /api/v1/widget/changelog/entries
GET /api/v1/widget/changelog/entries/:slug
```

复用：

- `listPublicChangelogEntries`
- `getChangelogEntryBySlug`

#### 13.4.7 Ticket

```http
POST /api/v1/widget/tickets
Authorization: Bearer <widget-token>

{
  "type": "bug",
  "title": "Bug report",
  "description": "...",
  "attachmentIds": []
}
```

实现策略：

- 简化版：直接创建 ticket，并关联/创建 messenger conversation。
- 工作流版：复用 `workflow-ticket-form`，让 dashboard 配置动态 ticket form。

第一阶段建议先做简化版，确保参考图里的 `Submit ticket / Bug Report` 可用。

### 13.5 Widget 数据模型

Widget 配置使用独立表，按 brand 维度隔离。`brands` 继续只承载通用品牌信息；Widget 的运行时配置、菜单、快捷操作、首页推荐都进入 widget 专属表。

#### 13.5.1 `widget_settings`

一条 brand 一条配置。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | ULID |
| `org_id` | text | FK -> `organizations.id` |
| `brand_id` | text | FK -> `brands.id`，唯一 |
| `primary_color` | text | Widget 主色，例如 `#7c5cff` |
| `launcher_icon_url` | text null | 右下角 launcher 图标 |
| `agent_name` | text | 例如 `Fibi AI Agent` / `Keeni AI Agent` |
| `agent_subtitle` | text | 例如 `The team can also help` |
| `agent_avatar_url` | text null | Agent 头像 |
| `greeting_title` | text | 首页欢迎标题 |
| `greeting_body` | text | 首页欢迎正文 |
| `home_enabled` | boolean | 是否显示 Home |
| `messages_enabled` | boolean | 是否显示 Messages |
| `help_enabled` | boolean | 是否显示 Help |
| `changelog_enabled` | boolean | 是否显示 Changelog |
| `tickets_enabled` | boolean | 是否显示 Ticket |
| `powered_by_enabled` | boolean | 是否显示 Powered by |
| `created_at` / `updated_at` | timestamp | 标准时间戳 |

索引：

- `uq_widget_settings_brand`：`brand_id` 唯一。
- `idx_widget_settings_org`：按 `org_id` 查询。

#### 13.5.2 `widget_menu_items`

用于底部导航、Portal menu 和 Home 卡片入口。模块项和外链项统一建模。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | ULID |
| `org_id` | text | FK -> `organizations.id` |
| `brand_id` | text | FK -> `brands.id` |
| `settings_id` | text | FK -> `widget_settings.id` |
| `label` | text | 展示名称 |
| `description` | text null | 副标题或说明 |
| `icon` | text null | icon key，例如 `home` / `message` / `link` |
| `item_type` | text | `module` / `external` |
| `module_key` | text null | `home` / `messages` / `help` / `changelog` / `tickets` |
| `href` | text null | 外链 URL |
| `location` | text | `bottom_nav` / `home_card` / `portal_menu` |
| `enabled` | boolean | 是否启用 |
| `sort_order` | integer | 排序 |
| `created_at` / `updated_at` | timestamp | 标准时间戳 |

索引：

- `idx_widget_menu_items_brand_location`：`brand_id, location, sort_order`。
- `idx_widget_menu_items_settings`：`settings_id`。

约束：

- `item_type = module` 时必须有 `module_key`。
- `item_type = external` 时必须有 `href`。

#### 13.5.3 `widget_quick_actions`

用于首页 `Ask a question`、`Submit ticket`、`Bug Report`，也可用于 Chat 页快捷 chip。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | ULID |
| `org_id` | text | FK -> `organizations.id` |
| `brand_id` | text | FK -> `brands.id` |
| `settings_id` | text | FK -> `widget_settings.id` |
| `label` | text | 展示文案 |
| `action_type` | text | `start_chat` / `submit_ticket` / `open_help` / `open_url` |
| `payload` | json | ticket type、prefill prompt、URL 等 |
| `enabled` | boolean | 是否启用 |
| `sort_order` | integer | 排序 |
| `created_at` / `updated_at` | timestamp | 标准时间戳 |

索引：

- `idx_widget_quick_actions_brand`：`brand_id, sort_order`。
- `idx_widget_quick_actions_settings`：`settings_id`。

#### 13.5.4 `widget_featured_content`

用于 Home 页推荐文章、推荐更新和默认 Help 搜索建议。它只存引用，不复制文章正文。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | ULID |
| `org_id` | text | FK -> `organizations.id` |
| `brand_id` | text | FK -> `brands.id` |
| `settings_id` | text | FK -> `widget_settings.id` |
| `content_type` | text | `kb_article` / `changelog_entry` / `external` |
| `content_id` | text null | KB article id 或 changelog id |
| `title_override` | text null | 可选覆盖标题 |
| `image_url` | text null | Home card 图片 |
| `href` | text null | 外链 |
| `enabled` | boolean | 是否启用 |
| `sort_order` | integer | 排序 |
| `created_at` / `updated_at` | timestamp | 标准时间戳 |

索引：

- `idx_widget_featured_content_brand`：`brand_id, content_type, sort_order`。

#### 13.5.5 TypeScript 运行时类型

```ts
type WidgetModuleKey = "home" | "messages" | "help" | "changelog" | "tickets";

type WidgetSettingsRecord = {
  id: string;
  orgId: string;
  brandId: string;
  primaryColor: string;
  launcherIconUrl: string | null;
  agentName: string;
  agentSubtitle: string;
  agentAvatarUrl: string | null;
  greetingTitle: string;
  greetingBody: string;
  homeEnabled: boolean;
  messagesEnabled: boolean;
  helpEnabled: boolean;
  changelogEnabled: boolean;
  ticketsEnabled: boolean;
  poweredByEnabled: boolean;
};

type WidgetMenuItemRecord = {
  id: string;
  orgId: string;
  brandId: string;
  settingsId: string;
  label: string;
  description: string | null;
  icon: string | null;
  itemType: "module" | "external";
  moduleKey: WidgetModuleKey | null;
  href: string | null;
  location: "bottom_nav" | "home_card" | "portal_menu";
  enabled: boolean;
  sortOrder: number;
};
```

#### 13.5.6 初始 seed

创建 brand 时同步初始化：

- `widget_settings`
  - `primary_color` 取 `brands.theme.colors.primary`，没有则 `#7c5cff`。
  - `agent_name = "Keeni AI Agent"`。
  - `agent_subtitle = "The team can also help"`。
  - 四个主模块默认启用：Home、Messages、Help、Changelog。
- `widget_menu_items`
  - `Home`
  - `Messages`
  - `Help`
  - `Changelog`
- `widget_quick_actions`
  - `Ask a question`
  - `Submit ticket`
  - `Bug report`

### 13.6 实施阶段

#### Phase 1：前端壳层

状态：已完成。

- 改造 `apps/widget/src/boot.tsx` 为 Preact mount。（已完成）
- 新增 `WidgetApp`、`WidgetShell`、`BottomNav`、`Launcher`。（已完成）
- 静态实现 Home / Messages / Help / Changelog / Chat 视图。（已完成）
- 保留现有 session 与 send message 能力。（已完成）

验收：

- `pnpm --filter @keenai/widget typecheck`
- `pnpm --filter @keenai/widget build`
- launcher 可开关，底部导航可切换。

#### Phase 2：消息与实时

状态：已完成。后端 `GET /widget/conversations` 已完成；现有消息、附件和 WebSocket 能力已嵌入 Preact Chat 视图；Messages 空状态、历史会话列表和 Dashboard 可见性的集成验证已完成。

- 将现有 `MessagesPanel` 能力迁移到 Preact。（已完成）
- 支持历史消息、发送、附件、WebSocket realtime。（已完成）
- 添加 empty messages state 和 `Ask a question` CTA。（已完成）

验收：

- 现有 widget tests 迁移/通过。
- 发送消息后 Dashboard Inbox 可见。

#### Phase 3：配置与聚合 API

状态：已完成。独立表、migration、schema export、`GET /widget/config`、`GET /widget/home` 已完成；Widget 已读取 config/home 并应用 brand primary color/module visibility；Settings 配置通过 `GET/PATCH /widget/settings/:brandId` 写入 widget 独立表。

- 新增 `GET /widget/config`。（已完成）
- 新增 `GET /widget/home`。（已完成）
- 侧栏 Settings > Branding 的 widget/portal menu 配置与返回结构对齐。

验收：

- 改 brand color 后 widget primary color 生效。
- module disabled 后底部导航隐藏对应项。

#### Phase 4：Help / Changelog

状态：已完成。Widget auth 下的 Help/Changelog endpoints 已完成；前端 Help/Changelog tab 已读取真实列表；Help 搜索、无结果状态、文章详情和更新详情交互已完成。

- 新增 widget help/changelog endpoints。（已完成）
- 前端 Help 支持 collections、articles、search。（已完成）
- Changelog 支持 list/detail。（已完成）

验收：

- 无数据、有数据、搜索无结果状态完整。

#### Phase 5：AI Chat

状态：已完成。Widget 统一写入 conversation message；服务端 Workflow Dispatch 根据 Deploy 设置启动系统 Basic Agent 或用户 Agent Workflow，fallback 到人工团队通过 `POST /widget/conversations/:id/handoff` 完成。

- Widget 统一调用 conversation message 接口。（已完成）
- Deploy 模式判断位于服务端 Workflow Dispatch。（已完成）
- AI 回答写回 conversation。（已完成）
- 支持 fallback 到人工团队。（已完成）

验收：

- Widget 不请求或缓存 Deploy 模式。
- Basic Agent 开启后，普通消息产生一个可审计的 `basic_agent` Agent Run。
- 刷新后历史中有用户问题与 AI 回答。

#### Phase 6：Ticket

状态：已完成。`POST /widget/tickets` 已完成；Home quick action 已支持 `Submit ticket / Bug Report` 打开 ticket 表单并提交；附件上传/关联已完成；动态 workflow ticket form 已在消息流中渲染并提交到 workflow resume endpoint。

- 新增 `POST /widget/tickets`。（已完成）
- Home quick action 支持 `Submit ticket / Bug Report`。（已完成）
- Ticket 表单支持附件上传并关联到初始 conversation message。（已完成）
- Workflow `send_ticket_form` 消息支持动态字段渲染与提交。（已完成）
- 可选：将 ticket 转为 conversation 事件。

验收：

- 用户可从 widget 提交 bug report。
- Dashboard tickets 列表可见。

### 13.7 测试策略

前端：

- `WidgetApp` view state tests。
- `Composer` send/upload tests。
- `BottomNav` module visibility tests。
- `ChatView` SSE reducer tests。

后端：

- `widget.config.integration.test.ts`
- `widget.conversations.integration.test.ts`
- `widget.help.integration.test.ts`
- `widget.changelog.integration.test.ts`
- `widget.answer.integration.test.ts`
- `widget.ticket.integration.test.ts`

端到端：

- seed visitor -> boot widget -> send message -> receive WS event。
- search Help -> open article。
- ask AI -> stream answer -> citations render。
- submit ticket -> dashboard ticket exists。

### 13.8 兼容与迁移

- `KeenAI.boot(options)` 对外签名保持兼容。
- 老的 `MessagesPanel` 可先保留一版，等 Preact Chat 完成后删除。
- `window.KeenAI.boot` 返回的 `open / close / destroy` 保持不变。
- Shadow DOM CSS 必须继续隔离宿主页样式。
- Widget bundle 应继续输出 `dist/keenai-widget.js` IIFE。

### 13.9 优先级结论

推荐先做：

1. Preact Widget shell + 静态多模块 UI。
2. 迁移现有消息能力，确保不破坏当前可用聊天链路。
3. 补 `widget/config` 和 `widget/conversations`。
4. 接 Help / Changelog。
5. 最后接 AI Answer SSE 和 Ticket。

这个顺序能最大化保留现有可用能力，同时逐步逼近参考图里的完整交互。
