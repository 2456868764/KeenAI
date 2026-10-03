# Channel Gateway 统一渠道架构

> 状态：核心可靠消息链路已落地。KeenAI 已实现 Durable Channel Ingress、持久化 Session/Command Queue、Durable Final Delivery、Connection Runtime 租约，以及 Discord Gateway、Slack Socket Mode、飞书 WebSocket、钉钉 Stream 和多连接 Email IMAP polling supervisor。Webhook/Email 生产入站与 Agent/Workflow 出站已接入该链路；WhatsApp/飞书回执可推进内部消息状态。飞书 WebSocket 已覆盖消息、卡片交互、已读、Reaction 创建/删除和撤回事件，与 HTTP Webhook 复用同一 Durable Ingress 处理。Slack、Discord、飞书商店应用、钉钉应用市场套件、企业微信服务商套件、Gmail、Microsoft 365 和 WhatsApp 已具备 Dashboard 安装入口；微信公众号支持自建认证公众号服务器配置。IM 渠道已支持统一回复上下文和附件投影，管理端可执行连接级 Provider 验证并审计结果。`pnpm channels:acceptance` 提供连接、真实收发和声明能力逐项验证的可重复发布门禁。

本文将原 Widget 重构方案扩展为 KeenAI 的统一渠道设计。所有外部消息入口，包括 Widget、Email、Slack、Discord、WhatsApp、微信公众号、企业微信、飞书、钉钉和 Telegram，均通过同一套接入、路由、策略、会话和可靠投递基础设施进入系统；渠道差异只保留在插件适配层。

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

| 模块                     | 职责                                                                           | 不负责                              |
| ------------------------ | ------------------------------------------------------------------------------ | ----------------------------------- |
| Channel Gateway          | 接收 Webhook/Socket/IMAP/WS 事件，验证来源，解析连接，持久化原始事件并快速 ACK | 会话业务、AI 推理、直接发送回复     |
| Channel Plugin SDK       | 定义插件生命周期、标准事件、能力和错误分类                                     | 持久化、业务路由、重试策略          |
| Channel Plugins          | 将各提供方协议转换为标准入站/出站模型                                          | 绕过 Kernel 直接操作 Workflow/Agent |
| Connection Runtime       | 连接租约、长连接、轮询、Token 刷新、健康检查和退避                             | 保存业务消息真相                    |
| Durable Ingress          | 去重、标准化、身份映射、会话路由、重放和隔离失败事件                           | 生成最终客服答案                    |
| Channel Kernel           | 创建 Contact/Conversation/Message，执行租户策略、幂等和审计                    | 提供方协议细节                      |
| Delivery Runtime         | Outbox 调度、发送、重试、限流、回执、死信和人工重放                            | 决定回复内容                        |
| Workflow / Agent / Inbox | 决策、执行、升级和人工处理                                                     | 直接持有渠道 Token 或调用渠道 SDK   |

建议代码边界：

```text
packages/
  channels-core/          # 标准类型、插件契约、能力与错误分类
  channels-runtime/       # Ingress、Session Command、Outbox、Receipt、DLQ
  channels-widget/        # Widget 插件
  channels-email/         # Email 插件
  channels-im/            # Slack/Discord/Telegram/WhatsApp/WeChat/WeCom/Feishu/DingTalk
apps/api/src/routes/      # Webhook 与连接配置 API
apps/api/src/lib/channel-dispatch.ts # Ingress/Session/Delivery 调度
apps/api/src/lib/channel-recovery-scheduler.ts # 无外部队列时的恢复扫描
apps/api/src/lib/channel-connection-supervisor.ts # 有状态连接租约与生命周期
apps/api/src/lib/discord-gateway.ts # Discord IDENTIFY/RESUME/heartbeat
apps/api/src/lib/slack-socket-mode.ts # Slack Socket Mode envelope/ACK
apps/api/src/lib/feishu-websocket.ts # 飞书官方 WSClient 长连接
apps/api/src/lib/dingtalk-stream.ts # 钉钉官方 DWClient Stream
apps/api/src/lib/email-imap-poll.ts # 连接级 IMAP polling 与租约
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
  readonly outboundLimits: Readonly<{
    maxTextCharacters: number | null;
    maxInteractiveTextCharacters: number | null;
    maxCaptionCharacters: number | null;
    maxAttachmentBytes: number | null;
  }>;
  verifyWebhook?(request, connection): Promise<ChannelVerificationResult>;
  parseWebhook?(request, connection): Promise<ChannelProviderEvent[]>;
  normalizeInbound?(event, connection): Promise<ChannelInboundEnvelope | null>;
  send(envelope, connection): Promise<ChannelSendResult>;
  executeMessageOperation?(
    operation,
    connection,
  ): Promise<ChannelMessageOperationResult>;
  parseDeliveryReceipts?(
    request,
    connection,
  ): Promise<ChannelDeliveryReceipt[]>;
  classifyError(error): ChannelClassifiedError;
}
```

连接校验、Token 交换和长连接生命周期属于 Gateway/Connection Runtime，不塞进插件业务契约。当前 Registry 注册 `widget`、`email` 与八个 IM 插件；统一契约测试覆盖所有 IM 插件的能力声明与出站动作生成。

能力声明包含入站、出站、线程、附件、Reaction、编辑、删除、Typing、已读/送达回执和模板；`outboundLimits` 单独声明正文、交互正文、媒体 caption 和附件上限。数字是 KeenAI 当前发送规划器实际执行的单次 Provider 动作上限；`null` 表示限制由运行时上传配置、Provider 媒体类型或租户套餐共同决定，不能静态承诺。Conversation 详情同时返回 `channelCapabilities` 和 `channelOutboundLimits`，Dashboard、验收工具及其他业务层不得维护第二份渠道能力表。核心层根据能力降级：例如不支持编辑时发送更正消息，不支持线程时使用外部会话主键，超过长度时由公共内容适配器分段。

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

| 场景       | 外部会话键                                        |
| ---------- | ------------------------------------------------- |
| Widget     | `visitor/session + widget conversation id`        |
| Email      | `Message-ID`、`In-Reply-To/References` 和收件地址 |
| Slack      | `team + channel + thread_ts`                      |
| Discord    | `guild + channel/thread id`                       |
| WhatsApp   | `phone_number_id + wa_id`                         |
| 微信公众号 | `app_id + open_id`                                |
| 企业微信   | `corp/app + external_user + chat_id`              |
| 飞书       | `app + chat_id + root_id/thread_id`               |
| 钉钉       | `corp/app + conversation_id + sender_id`          |
| Telegram   | `bot + chat_id + message_thread_id`               |

- Provider ID 必须连同 `connection_id` 使用，不能假定跨连接全局唯一。
- 外部联系人合并必须走显式 Identity Link，不能仅凭昵称自动合并。
- 渠道线程映射独立保存，避免在 Conversation 上堆积每个提供方字段。`channel_conversation_links.external_thread_id` 保存稳定路由键，`metadata.providerTargetId/providerThreadId` 分别保存真实发送目标和线程根；发送、编辑、Reaction 与 Typing 都通过同一个解析器恢复 Provider 目标，不能把组合路由键直接传给 Provider API。
- Slack 频道消息按 `channel + thread_ts/root ts` 隔离，DM/MPIM 的非线程消息按频道连续会话；飞书群聊按 `chat_id + root_id/message_id` 隔离，P2P 按 chat 连续会话；Telegram Forum 按 `chat_id + message_thread_id` 隔离，并在每个出站动作中投影 `message_thread_id`。
- 重新授权连接时保留稳定连接 ID；更换外部应用或租户时创建新连接。

## 8. 出站与 Durable Delivery

业务代码只调用统一发送服务。当前 SQLite/LibSQL 实现先持久化 `delivery_status=pending` 的内部 Message，再幂等创建 `channel_outbox`；恢复扫描持续补齐尚无 Outbox 意图的 pending Message，因此进程崩溃不会让最终回复永久丢失。未来 PG 实现可将 Message 与 Outbox 合并为严格的单数据库事务。Outbox 接管后，Sender Worker 加载插件与连接，执行能力校验、内容适配、限流和发送；Receipt Worker 再根据提供方回执推进状态。

单条逻辑消息可能因文本长度、附件或按钮上限被拆成多个 Provider 动作。若前序动作成功而后续动作失败，执行器会记录已成功的 Provider Message ID 与响应，并将结果分类为 `partial_delivery / unknown_after_send` 进入死信，不自动重放整组动作，避免对客户重复发送；运营人员可依据 attempt evidence 决定定向补发。

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

| 表                           | 作用                                                                                   | 关键约束                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `channel_connections`        | 租户下的渠道账号、传输配置、加密凭据、运行状态、fencing token、租约、cursor 和退避时间 | `(org, brand, channel_type, external_account_id)` 唯一                                                |
| `channel_ingress_events`     | 入站原始事件、处理状态、重试和错误                                                     | `(connection_id, provider_event_id)` 唯一                                                             |
| `channel_identities`         | 外部用户到 KeenAI Contact/User 的映射                                                  | `(connection_id, external_user_id)` 唯一                                                              |
| `channel_conversation_links` | 外部会话/线程到内部 Conversation 的映射                                                | 连接 + 外部会话 + 线程唯一                                                                            |
| `channel_message_links`      | 内部消息与提供方资源的双向映射，并记录原始 action、资源类型和动作顺序                  | 连接 + 提供方消息 ID 唯一；`provider_action/provider_resource_type/action_index` 用于组合消息后续操作 |
| `channel_session_commands`   | 按 Conversation 串行的持久化 Agent/Workflow 命令                                       | 幂等键唯一，Conversation + sequence 唯一                                                              |
| `channel_outbox`             | 待发送标准消息、锁、重试和最终结果                                                     | `(connection_id, idempotency_key)` 唯一                                                               |
| `channel_delivery_attempts`  | 每次提供方调用的脱敏结果                                                               | `(outbox_id, attempt_no)` 唯一                                                                        |
| `channel_delivery_receipts`  | 接受、发送、送达、已读和失败回执                                                       | `(connection_id, provider_message_id, status, occurred_at)` 唯一                                      |
| `channel_dead_letters`       | 入站/出站不可恢复任务及审计重放                                                        | 来源方向、表和记录唯一                                                                                |

`Message` 先以 pending 状态持久化，Outbox 通过稳定幂等键创建，恢复扫描补齐两步之间的崩溃窗口；`messages.delivery_status` 只保存便于 UI 查询的状态摘要，完整事实保存在发送尝试和回执表。原始 Payload、死信 Payload 和提供方响应需要脱敏、加密并设置保留期限。完整 Drizzle 模型见 [07-DATA-MODEL.md § 4.4](07-DATA-MODEL.md)。

## 10. 渠道实现策略

| 渠道       | 入站方式                     | 出站方式                  | Runtime                                       | 关键注意事项                                                                                                                           |
| ---------- | ---------------------------- | ------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Widget     | HTTP/WS                      | HTTP/WS                   | 无状态 + 实时连接                             | 匿名身份、Origin 校验、断线续传                                                                                                        |
| Email      | Provider Webhook/IMAP        | Provider API/SMTP         | Webhook 或 IMAP polling                       | Threading、附件、Gmail/Microsoft 365 OAuth、SES/Mailgun 入站原生验签、Raw/SendGrid 连接级认证、SES/SendGrid/Mailgun 投递回执与原生验签 |
| Slack      | Events API/Socket Mode       | Web API + External Upload | **Webhook 与 Socket Runtime 已实现**          | team/channel/thread、app token 租约、OAuth scopes                                                                                      |
| Discord    | Gateway/Webhook              | REST                      | **Gateway Runtime 已实现**                    | IDENTIFY/RESUME、heartbeat、cursor、租约 fencing                                                                                       |
| WhatsApp   | Meta Webhook                 | Cloud API                 | 无状态                                        | Embedded Signup、phone number 隔离、sent/delivered/read/failed 回执                                                                    |
| 微信公众号 | 公众号 XML 回调              | 客服消息 API              | Webhook                                       | 明文签名/AES 安全模式、AppID/OpenID 隔离、48 小时客服窗口                                                                              |
| 企业微信   | 企业微信加密回调             | 企业微信应用消息 API      | Webhook                                       | 签名、AES 加解密、corp/app 隔离                                                                                                        |
| 飞书       | Event Subscription/WebSocket | Open API                  | **WebSocket Runtime 已实现**                  | tenant/app/chat、SDK 重连、message read 回执；商店应用与自建 HTTP 回调均支持 Encrypt Key 验签和解密                                    |
| 钉钉       | Robot Webhook/Stream         | Robot Open API + Session Webhook fallback | **Stream Runtime 已实现**                     | 群聊以 `openConversationId`、单聊以 `senderStaffId` 主动发送；仅在官方标识缺失且回调 Webhook 未过期时回退，durable ingress 后 ACK             |
| Telegram   | Webhook/Long Polling         | Bot API                   | **Webhook 生命周期与 Polling Runtime 已实现** | `setWebhook/deleteWebhook` 自动对账、offset 持久化、bot/chat/topic、文件限制                                                           |

WhatsApp 采用官方 Meta Cloud API；`wechat` 仅表示认证微信公众号，`wecom` 表示企业微信。个人微信没有官方机器人接口，非官方个人账号协议不进入 KeenAI 的生产范围。

### 10.1 已落地能力与剩余完成项

| 能力                     | 当前落地状态                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 统一文本收发             | Widget、Email、Telegram、Slack、Discord、WhatsApp、微信公众号、企业微信、飞书、钉钉均已接入插件和 Durable Delivery                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 长文本投递               | IM 出站规划器按各 Provider 的正文、交互正文和媒体 caption 上限进行 Unicode 安全分块，不再静默截断正文；按钮只附着在最后一个文本块，无法完整放入 caption 的正文改为独立文本消息                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 富媒体出站               | Telegram、WhatsApp 使用 URL 媒体；Slack 使用 `files.getUploadURLExternal -> upload -> files.completeUploadExternal`；Discord 使用 multipart；飞书、微信公众号和企业微信先上传素材再发送；钉钉通过 Robot Open API 的 Markdown 消息发送媒体链接，缺少主动发送标识时才回退 Session Webhook。每次 Outbox 尝试都会使用 `CHANNEL_WEBHOOK_BASE_URL`（回退 `APP_URL`）重新签发一小时有效、绑定 org 与 attachment ID 的 HMAC Provider 下载 URL，公开入口只在验签后读取对应租户文件。Agent 外部媒体 URL 在下载前执行协议、凭据、主机与 DNS 私网检查，下载使用 30 秒超时并逐块执行 `UPLOAD_MAX_BYTES`，缺失 `Content-Length` 时也不会无界载入内存                                                                                                                                                                                                                                                                                                                                                          |
| 富媒体入站               | Telegram、Slack、Discord、WhatsApp、微信公众号、飞书、钉钉、企业微信均规范化为 `MessagePart + Attachment`；Telegram 与 WhatsApp sticker 保留 `messageKind=sticker` 并以对应图片/动画媒体入库，location/contact 转为可检索文本。受保护资源使用连接凭据下载，Slack 仅给出 File ID 时会先调用 `files.info` 解析受保护下载地址；下载超时 30 秒，响应流逐块执行 `UPLOAD_MAX_BYTES`（默认 20MB）限制，即使 Provider 未提供 `Content-Length` 也不会无限载入内存。IM 允许图片、音频、视频、文本、PDF、Word、Excel、PowerPoint、RTF 和 JSON；邮件超限附件会被省略并在正文留下明确占位。IMAP 先读取 size/envelope，超过 `EMAIL_IMAP_MAX_MESSAGE_BYTES` 的邮件不下载完整 MIME，而以保留发件人、主题和 Message-ID 的占位邮件入站并标记已读，避免内存失控与无限重试                                                                                                                                                                                                          |
| 原生回复/线程            | Telegram `reply_parameters/message_thread_id`、Slack `thread_ts`、Discord `message_reference`、飞书 `root_id/parent_id + reply API`、WhatsApp `context.message_id` 已由统一回复与线程模型投影；入站引用同时关联内部 `in_reply_to`。Email 自动回复优先使用显式回复目标，否则选择当前连接和会话最近的入站 Provider Message-ID，并发送去重后的根 `References + In-Reply-To`；客户回复任意已记录的入站或出站 SMTP Message-ID 时，先经连接级 `channel_message_links` 恢复原会话，再回退 RFC References/主题匹配，不会因多邮箱连接同主题而串线；并发首次入站通过 `(connection_id, external_thread_id)` 唯一映射收敛到同一 Conversation，冲突方会回收尚未写消息的重复会话                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 回执                     | WhatsApp sent/delivered/read/failed、飞书 message-read、SES/SendGrid/Mailgun accepted/delivered/read/failed，以及 Widget 客户端 delivered/read ACK 已归一化并推进内部投递状态；重复事件由回执唯一键去重，乱序回执不能降低消息状态                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 能力声明                 | Registry 按真实发送和回执路径声明能力，并发布与发送规划器一致的 `outboundLimits`：Telegram 4096、Slack 4000/交互 3000、Discord 2000、飞书和钉钉 4000、WhatsApp 4096/交互与 caption 1024、微信公众号 2048/交互 1024、企业微信 2048/交互 128；Widget 和 Email 不伪造 Provider 动态附件上限。Widget 对 Agent Markdown 使用禁用原始 HTML/图片并校验链接协议的安全 renderer，Email 自动生成 Markdown HTML 与纯文本 MIME fallback，Slack/Discord 使用 Provider 原生 Markdown；Widget、Email、飞书和 WhatsApp 的已读能力均有对应回执路径。Dashboard、验收工具和业务层只依据 Registry 契约开放对应功能                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 连接验证                 | Dashboard 可测试 Telegram、Slack、Discord、飞书、钉钉、WhatsApp、微信公众号、企业微信、Email SMTP/IMAP 与 Widget。手工配置先保存为 `pending` 且不会被 Webhook、Runtime 或 Outbox 选中；Dashboard 保存后立即执行统一测试，成功转为 `active` 并写 `lastConnectedAt`，失败转为 `error`。OAuth/Embedded Signup 只有在 Provider 交换成功后才直接激活；全部状态变化写审计日志                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 长连接 Runtime           | Discord Gateway、Slack Socket Mode、飞书 WebSocket、钉钉 Stream 与 Telegram Long Polling 均由连接租约监管；远端消息只在 durable ingress 成功后 ACK/推进 offset。飞书 WebSocket 注册消息、卡片交互、已读、Reaction 创建/删除和撤回事件；流式回执在 Ingress Worker 内直接归一化为 Delivery Receipt，不会因缺少正文而进入死信。Slack/Discord 控制面与交互 ACK、Telegram Long Polling/Callback ACK 均组合 Runtime 停止信号和硬超时，Provider 卡死不会永久占用租约。Email 按连接读取加密 IMAP 凭据并使用同一租约模型轮询，进程启动即执行首轮扫描，同一实例不会重叠轮询                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Telegram 传输生命周期    | Webhook 连接测试使用 `CHANNEL_WEBHOOK_BASE_URL`、组织/品牌 slug 与连接 ID 生成唯一 HTTPS 回调，并调用 `setWebhook` 后读取 `getWebhookInfo` 核验；Polling Runtime 启动及 Disconnect 前调用 `deleteWebhook`，避免 Bot API 的 webhook/`getUpdates` 冲突。Webhook 与 Polling 共用同一 `allowed_updates` 契约，覆盖普通/频道消息、编辑、Reaction、按钮以及 Telegram Business 消息、编辑和批量删除；Business 删除批次拆成独立 durable mutation，回复和消息操作携带原始 `business_connection_id`。Webhook secret 按 Telegram 允许字符和长度校验                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Provider Token Broker    | 飞书 tenant token、钉钉 access token、微信公众号 stable access token 和企业微信 access token 统一按连接凭据指纹缓存，提前 60 秒刷新，并发刷新合并为一个 Provider 请求。飞书商店应用使用 app ticket 换取 tenant token；钉钉应用市场套件使用 suite ticket + Corp ID 换取 corp access token；企业微信服务商套件使用 suite ticket + permanent code 换取 corp token。这些短期 token 均不落库，人工配置的短期 token 仍可作为显式覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 交互消息与模板           | Workflow reply buttons 已投影到 Telegram inline keyboard、Slack Block Kit、Discord components、飞书卡片、钉钉 actionCard、WhatsApp interactive reply/list、微信公众号 `msgmenu` 和企业微信 template card。8 个工作流分支不会因 Provider 单区块上限被截断：Slack/飞书拆分 action 区块，钉钉按 5 个、企业微信按 6 个拆卡，WhatsApp 超过 3 个时改用 List。支持的按钮回调经 Durable Ingress/Session Queue 恢复对应工作流；微信公众号 `msgmenu` 的 `bizmsgmenuid` 会作为工作流按钮 ID 持久化，Telegram 在持久化后调用 `answerCallbackQuery`，Discord HTTP Interaction 和 Gateway Interaction 均先持久化再返回/发送 `DEFERRED_UPDATE_MESSAGE (type=6)`，钉钉链接按钮使用签名确认页。WhatsApp 声明独立 `templates` 能力；Inbox 按当前 Conversation 的精确连接读取已批准模板，操作员可填写 Meta components 参数并经标准 Message → Durable Outbox 路径发送。Workflow 的 `send_message` 也可保存同一 `whatsappTemplate` 指令，执行器在 WhatsApp 会话中写入标准 Message 后复用相同 Outbox；非 WhatsApp 会话明确失败，不使用旁路 Provider 调用 |
| 微信公众号               | Dashboard 支持自建认证公众号配置，GET 服务器校验同时支持明文 `signature` 和安全模式 `msg_signature`；POST XML 在校验时间窗、SHA-1 和 AppID 绑定后解密并写 Durable Ingress。文本、图片、语音、视频、位置、链接和菜单事件被标准化；出站使用客服消息 API，媒体先上传临时素材。个人微信不在该插件范围                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| WhatsApp 模板管理        | Dashboard 按连接直接读取 WABA 模板状态，可创建、编辑、删除任意 Meta components 结构并展示 approval/rejection 状态；写操作均校验组织权限并写审计日志，本地不复制 Provider 模板状态                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Slack 安装授权           | Dashboard 可发起 Slack OAuth v2 安装；一次性、10 分钟有效的状态保存在 `channel_oauth_states`，回调按 Team ID 保存加密凭据并检查发起成员权限。开启 Token Rotation 时，出站和连接测试会用跨 worker 租约刷新 Bot Token；Socket Mode app-level token 仍需单独配置。真实 Slack Workspace 授权尚未验收                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Discord 安装授权         | Dashboard 可发起 Advanced Bot Authorization；一次性 state 绑定组织、品牌和操作者。授权码交换取得 guild 提示后，服务端再使用 Bot Token 查询 Guild API 验证机器人确实已经加入，随后按 Guild ID 保存加密凭据并启动 Gateway Runtime。回调不可重放；真实 Discord Server 授权尚未验收                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Email OAuth              | Dashboard 可为 Gmail / Microsoft 365 发起 OAuth 授权；一次性 state 绑定邮箱、品牌与操作者，回调保存加密 token。SMTP/IMAP 连接与连接测试使用 access token，过期前在跨 worker 租约下刷新。密码模式仍可用；真实邮箱端到端验收尚未完成                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| WhatsApp Embedded Signup | Dashboard 通过 Meta JS SDK 获取一次性 code 和 WABA/号码 ID；服务端校验 app ID 与号码归属，按需注册号码、订阅 webhook，然后加密保存连接。state 绑定组织、品牌、操作者且只能消费一次。中央 Webhook 无需租户查询参数即可按 `phone_number_id` 跨组织选择唯一连接；一个批次可拆分到多个号码，全部连接解析和验签通过后才写 Durable Ingress。真实 Meta 账号安装尚未验收                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 飞书商店应用             | Dashboard 使用一次性 OAuth state 绑定组织、品牌和操作者；中央回调校验签名时间窗、解密事件、验证 token，并将 `app_ticket` 加密存入 Provider App State。连接只保存 `appType + appId + tenantKey`，发送时以 ticket 换取并合并缓存短期 app/tenant token，短期 token 和 app secret 不落连接表。`app_open/app_status_change/app_uninstalled` 同步连接状态，中央消息回调按 `tenant_key` 选择唯一租户连接。自建应用 WebSocket/显式组织 Webhook 仍可用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 钉钉应用市场套件         | Dashboard 要求 Corp ID 后发起 App-Only 管理员授权；一次性 state 同时绑定组织、品牌、操作者和 Corp ID。suite 回调校验 5 分钟时间窗、SHA-1 签名和 AES-256-CBC 密文，并将 `suite_ticket` 加密存入 Provider App State。连接只保存 `appType + suiteKey + corpId`，运行时才换取并缓存 corp access token。每个 suite 在集群中只持有一个租约化 Stream，消息再按 `chatbotCorpId` 选择唯一租户连接；缺失或歧义时拒绝 ACK。`suite_relieve` 禁用连接并写 Provider 卸载审计；自建应用仍可手工配置                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 企业微信服务商套件       | Dashboard 使用一次性 state 发起第三方应用安装；服务商回调校验时间窗和 SHA-1 签名并执行 AES-256-CBC 解密，将 `suite_ticket` 加密存入 Provider App State。授权码只消费一次，连接保存加密的 `permanentCode` 及稳定的 `suiteId/corpId/agentId`，运行时才换取并缓存 suite/corp token。中央消息按 `CorpId` 选择唯一连接，`cancel_auth` 禁用连接并写 Provider 卸载审计。企业自建应用回调仍可用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 消息操作                 | 编辑、撤回和 Reaction 使用与发送相同的 Durable Outbox、租约、重试、死信和幂等链路；Provider 成功后才更新本地 Message/Reaction。单条内部消息拆成多段文本或正文加附件时，每个外部资源保存 action、资源类型和顺序；Reaction 选择主消息，编辑选择可编辑正文/媒体 caption，删除覆盖全部外部资源。批量操作逐项持久化进度，重试从未完成项继续，全部成功后才提交本地删除。Typing 是短暂信号，直接调用插件且不持久化。Widget 通过相同 Dashboard API 和 Durable Outbox 执行编辑、删除与 Reaction，完成本地变更后以 `message.updated` 广播到浏览器实时总线；Widget typing 直接广播短暂事件，整个过程不旁路到外部网络。Dashboard 从插件 Registry 获取能力，只显示渠道实际支持的操作                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 入站消息生命周期         | Slack、Discord、Telegram、WhatsApp 与飞书的 Provider 编辑、删除和 Reaction 事件先进入 Durable Ingress，再由 Session Queue 串行更新原消息或 Reaction；它们不会创建新的用户消息，也不会再次触发 Agent/Workflow。编辑会先清理原消息派生的 Memory Chunk、Summary、Episode、FTS/Vector 索引和受影响 Slot，再用更正后的正文重新摄取；删除只执行清理，Copilot 上下文也过滤已删除消息，避免召回过期或已撤回内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 外部请求边界             | 所有 IM Provider JSON/Form 请求使用 30 秒超时，媒体下载、上传和 multipart 投递使用 60 秒超时，连接测试及 OAuth/Token 控制面请求使用 10 秒超时；Email SMTP 使用 30 秒连接/问候与 60 秒 socket 超时。入站和出站媒体下载均流式执行大小上限，不依赖 `Content-Length`。发送阶段超时按 `unknown_after_send` 处理，避免长期占用 Outbox 租约，也避免在 Provider 可能已接受请求时盲目重发；发送前附件下载和 SMTP 明确连接失败保持可重试，SMTP 认证/信封/消息构造失败直接进入终态                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 连接解绑                 | Dashboard 统一 Disconnect 接口先执行 Provider 生命周期动作，再停止 Runtime 并禁用本地连接：Slack 调用 `apps.uninstall`，Discord Bot 离开目标 Guild，Google Email 撤销 OAuth grant，WhatsApp deregister 目标号码。Provider 已移除按幂等成功处理；远端失败不伪装成本地成功并写失败审计。Microsoft 不提供只撤销本应用单个 refresh token 的接口，因此 Microsoft Email 明确删除本地 token；飞书、钉钉应用市场应用和企业微信服务商套件本地禁用后等待 Provider 管理端卸载回调进行最终对账                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 10.2 消息操作能力矩阵

| 渠道       | Reaction | Typing | 编辑 | 撤回/删除 | 说明                                                                                               |
| ---------- | -------: | -----: | ---: | --------: | -------------------------------------------------------------------------------------------------- |
| Widget     |        ✓ |      ✓ |    ✓ |         ✓ | 编辑、删除与 Reaction 通过 Durable Outbox 提交本地变更并广播 `message.updated`；Typing 通过 conversation bus/WS 发送五秒有效的临时事件 |
| Email      |        — |      — |    — |         — | 邮件发出后不可原地编辑或撤回                                                                       |
| Telegram   |        ✓ |      ✓ |    ✓ |         ✓ | 使用 `setMessageReaction`、`sendChatAction`、`editMessageText/editMessageCaption`、`deleteMessage` |
| Slack      |        ✓ |      — |    ✓ |         ✓ | 使用 `reactions.*`、`chat.update/delete` 与 `files.delete`；Slack Web API 无对应客服 Typing 写接口 |
| Discord    |        ✓ |      ✓ |    ✓ |         ✓ | 使用 Message REST API；操作目标必须是 Bot 有权访问的消息                                           |
| 飞书       |        ✓ |      — |    ✓ |         ✓ | Reaction 移除会先按 emoji 查询机器人自己的 `reaction_id`，不存在时按幂等成功处理                   |
| 钉钉       |        — |      — |    — |         ✓ | Robot Open API 与 Session Webhook 返回的 `processQueryKey` 通过官方群聊/单聊机器人撤回 API 执行；缺少真实 key 时不开放伪撤回 |
| WhatsApp   |        ✓ |      ✓ |    — |         — | Cloud API 支持 Reaction；空 emoji 用于移除。Typing 使用最近入站 `message_id` 同时标记已读并显示输入状态 |
| 微信公众号 |        — |      — |    — |         — | 客服消息 API 不提供统一的原地编辑、撤回或 Reaction 能力                                            |
| 企业微信   |        — |      — |    — |         ✓ | 使用应用消息 recall；受企业微信允许撤回范围限制                                                    |

消息变更 API 不直接修改本地状态。`PATCH/DELETE message` 和 Reaction API 先写 `channel_outbox`，Sender 完成 Provider 调用后在同一完成事务中设置 `edited_at`、`deleted_at` 或更新 `message_reactions`。失败任务沿用普通发送的重试和 DLQ，且不会覆盖原消息的投递状态。重复的 `Idempotency-Key` 返回同一操作结果，不产生第二次外部副作用。组合删除在 Outbox payload 中保存有序 operations、`completedOperationCount` 和脱敏响应，租约仍有效时每完成一个 Provider 操作就推进进度；重试不会再次执行已记录完成的前缀。Slack 外部上传文件使用 `files.delete`，普通消息使用 `chat.delete`。编辑操作不能像新消息一样拆成多条，因此 Telegram、Slack、Discord 和飞书在超过各自单消息限制时返回明确的 `422 *_edit_*_too_long`，不会静默截断内容；Telegram 媒体消息根据原始 action 使用 `editMessageCaption`。

WhatsApp Typing Indicator 按 Meta 官方 Cloud API 请求格式调用 `/{phone-number-id}/messages`，请求包含 `status=read`、最近一条入站 `message_id` 和 `typing_indicator.type=text`。没有可关联的入站消息时不发送猜测请求，而是返回 `provider_message_not_found`。参考 [Meta 官方 WhatsApp Cloud API Postman 文档](https://www.postman.com/meta/whatsapp-business-platform/request/lhf0duq/send-typing-indicator-and-read-receipt)。

钉钉入站会保存 `robotCode`、`conversationType`、`senderStaffId`、`sessionWebhook` 和 `sessionWebhookExpiredTime`。群聊出站默认调用 `/v1.0/robot/groupMessages/send` 并使用 `openConversationId`，单聊默认调用 `/v1.0/robot/oToMessages/batchSend` 并使用真实 `senderStaffId`；因此延迟回复、历史会话回复和主动发送不再依赖短期 Session Webhook。只有当主动发送所需标识不完整且 Session Webhook 尚未过期时才使用回调 Webhook。文本、Markdown 和 ActionCard 分别映射到 `sampleText`、`sampleMarkdown` 和 `sampleActionCard`，单聊返回 filtered/invalid/flow-controlled 收件人时整次发送判为失败。

两条发送路径返回的真实 `processQueryKey` 都被保存为 Provider Message ID。撤回时根据入站会话的 `conversationType` 区分单聊与群聊，通过 Token Broker 获取连接级 access token，再调用 `/v1.0/robot/otoMessages/batchRecall` 或 `/v1.0/robot/groupMessages/recall`。旧消息若只有 KeenAI 本地生成的 `dingtalk:ack:*` 确认 ID，不会被当成可撤回消息。能力依据可参考[钉钉官方开放平台能力说明](https://open.dingtalk.com/)和[钉钉官方 DWS CLI 的机器人发送与撤回契约](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/main/skills/mono/references/products/chat.md)。

Slack OAuth 部署需设置 `SLACK_CLIENT_ID`、`SLACK_CLIENT_SECRET`、`SLACK_SIGNING_SECRET`、`SLACK_OAUTH_REDIRECT_URI`；最后一项必须与 Slack App 配置的 Redirect URL 一致，并指向 `/api/v1/dashboard/channel-connections/slack/oauth/callback`。安装范围包含消息、历史、文件、`reactions:read` 和 `reactions:write`，与 Plugin 声明的发送、附件、线程以及双向 Reaction 能力一致。Events API 与 Block Actions 使用无租户查询参数的中央地址 `/api/v1/webhooks/im/slack`，服务端先用签名保护的 `team_id` 选择唯一连接，再校验原始请求签名并写 Durable Ingress；显式 `org/brand/connection` 参数只保留为受约束的兼容入口。授权范围和 Token Rotation 行为以 [Slack OAuth 文档](https://docs.slack.dev/authentication/installing-with-oauth/)及 [Token Rotation 文档](https://docs.slack.dev/authentication/using-token-rotation)为准。

Provider 原生 webhook 不要求 KeenAI 私有请求头，因为 Slack、Discord、Meta、Telegram、微信、企业微信、飞书、钉钉和邮件供应商无法在平台回调中统一附加自定义 Header。每个入口必须使用 Provider 官方签名、Token、AES 加密或连接级认证，并在验签后绑定唯一租户与连接；`WEBHOOK_IM_SECRET`/`WEBHOOK_EMAIL_SECRET` 不参与原生 Provider 回调认证，避免部署级变量误拦截真实消息。

Discord OAuth 部署需设置 `DISCORD_CLIENT_ID`、`DISCORD_CLIENT_SECRET`、`DISCORD_BOT_TOKEN`、`DISCORD_OAUTH_REDIRECT_URI` 和 `DISCORD_PUBLIC_KEY`。邀请默认申请 View Channel、Send Messages、Embed Links、Attach Files、Read Message History、Add Reactions 和 Send Messages in Threads，对应权限位 `274878024768`；可通过 `DISCORD_BOT_PERMISSIONS` 显式覆盖。Redirect URL 必须指向 `/api/v1/dashboard/channel-connections/discord/oauth/callback`。Interaction Endpoint 使用无租户查询参数的中央地址 `/api/v1/webhooks/im/discord`：PING 在 Ed25519 验签后返回 `type=1`，组件事件按 `guild_id` 选择唯一连接，持久化后返回 `type=6`。安装使用 Guild integration，回调中的 guild 信息只作为提示，服务端必须用 Bot Token 二次验证。

Email OAuth 部署需设置 `EMAIL_OAUTH_REDIRECT_URI` 和对应供应商的 Client ID/Secret；细节见 [IMAP.md](IMAP.md)。

Email Provider 回执地址为 `/api/v1/webhooks/email/receipts/{ses|sendgrid|mailgun}?org=<org-slug>&brand=<brand-slug>&connection=<connection-id>`。SES 连接必须配置允许的 `sesTopicArn`，服务端验证 SNS Topic、AWS 签名证书 URL 和 RSA 签名，并在签名通过后自动确认订阅；SendGrid 必须配置 Event Webhook verification key，并使用原始请求字节校验 ECDSA 签名；Mailgun 必须配置 Webhook signing key，并校验 `HMAC-SHA256(timestamp + token)`。RFC `Message-ID` 用于关联 `channel_message_links`，因此 SES 事件发布应启用原始邮件 headers。

Email 入站回调在 MIME 解析和 Durable Ingress 前完成连接级认证：SES 入站复用 SNS 签名、可信证书 URL 与 `sesTopicArn` 绑定；Mailgun Routes 校验表单中的 `timestamp + token` HMAC；Raw MIME 和 SendGrid Inbound Parse 使用连接级 `X-KeenAI-Connection-Secret` 或 HTTP Basic Auth。生产请求必须解析到唯一活动 Email 连接。

WhatsApp Embedded Signup 部署需设置 `META_APP_ID`、`META_APP_SECRET`、`META_EMBEDDED_SIGNUP_CONFIG_ID` 和 `WHATSAPP_VERIFY_TOKEN`，并将 Meta App Webhook 指向中央地址 `/api/v1/webhooks/im/whatsapp`。Meta 应用审核、权限与 HTTPS 域名配置仍需在供应商后台完成；可参考 [Meta 官方示例](https://github.com/fbsamples/business-messaging-sample-tech-provider-app)和 [Meta 官方 WhatsApp Postman 集合](https://www.postman.com/meta/whatsapp-business-platform/overview)。旧的 `org`/`brand` 查询参数仍可用作显式租户约束，但不再是中央回调必需项。

飞书商店应用部署需设置 `FEISHU_ISV_APP_ID`、`FEISHU_ISV_APP_SECRET`、`FEISHU_ISV_VERIFICATION_TOKEN`、`FEISHU_ISV_ENCRYPT_KEY` 和 `FEISHU_ISV_OAUTH_REDIRECT_URI`。Redirect URL 必须指向 `/api/v1/dashboard/channel-connections/feishu/oauth/callback`，事件订阅地址使用无租户查询参数的中央地址 `/api/v1/webhooks/im/feishu`。回调接收的 `app_ticket` 有效窗口内必须持续更新；过期或缺失时发送和新租户安装均失败关闭，不回退到未验证凭据。

钉钉应用市场套件部署需设置 `DINGTALK_ISV_SUITE_KEY`、`DINGTALK_ISV_SUITE_SECRET`、`DINGTALK_ISV_CALLBACK_TOKEN`、`DINGTALK_ISV_ENCODING_AES_KEY` 和 `DINGTALK_ISV_OAUTH_REDIRECT_URI`。Redirect URL 必须指向 `/api/v1/dashboard/channel-connections/dingtalk/oauth/callback`，套件回调指向 `/api/v1/webhooks/im/dingtalk/suite`。安装遵循钉钉 App-Only 管理员授权，服务端向 `/v1.0/oauth2/corpAccessToken` 提交 `suiteKey/suiteSecret/suiteTicket/authCorpId`；短期 token 仅保存在进程内存。回调加密兼容钉钉官方 [Callback Crypto](https://github.com/open-dingtalk/DingTalk-Callback-Crypto) 实现，授权流程参考 [App-Only Token](https://open-dingtalk.github.io/developerpedia/docs/learn/develop/isvapp/get_app_only_token_browser)。

企业微信服务商套件部署需设置 `WECOM_SUITE_ID`、`WECOM_SUITE_SECRET`、`WECOM_SUITE_TOKEN`、`WECOM_SUITE_ENCODING_AES_KEY` 和 `WECOM_SUITE_OAUTH_REDIRECT_URI`。Redirect URL 必须指向 `/api/v1/dashboard/channel-connections/wecom/oauth/callback`，服务商数据回调指向 `/api/v1/webhooks/im/wecom/suite`。`suite_ticket` 和 `permanent_code` 分别使用 Provider App State 与连接密文保存，`suite_access_token/corp_access_token` 仅在运行时内存缓存。

微信公众号在 Dashboard 中配置 `appId`、`appSecret`、`callbackToken`，安全模式另配 43 字符 `encodingAesKey`；服务器地址使用 `/api/v1/webhooks/im/wechat?org=<org-slug>&brand=<brand-slug>&connection=<connection-id>`。Token Broker 使用官方 `stable_token` 接口，短期 token 只保存在内存。客服消息仍受公众号认证状态、接口权限和用户互动窗口限制。

仍需完成后才能宣称既定渠道范围达到生产完整：各 Provider 长期凭据生命周期验证、交互事件及 Email 回执的真实 Provider 验收，以及使用真实 Provider Sandbox 凭据执行发布门禁。微信公众号、飞书、钉钉、企业微信、Discord、WhatsApp、Slack 与 Email 的代码闭环仍需真实账号/租户/Server/号码/邮箱验收。个人微信不采用非官方协议；“所有功能”以本文能力契约和各 Provider 官方开放能力为边界，不包含供应商未开放或高风险的非官方协议。

## 11. 安全、可观测性与迁移

### 11.1 安全与可观测性

- Secret 使用加密存储或外部 Secret Manager，数据库仅保存引用和非敏感元数据。
- Webhook 验证签名、时间窗口、Body 大小和 Content-Type；IM 回调请求体上限 2MB，Email MIME/Form/回执上限 30MB，超限在解析前返回 `413 payload_too_large`；所有最终文件落盘均再次执行 `UPLOAD_MAX_BYTES`，附件执行 MIME、大小和恶意内容检查。
- 生产 HTTP 回调 fail-closed：Telegram 必须配置 Bot API secret token，Slack 必须配置 signing secret，Discord 必须配置 Ed25519 public key，WhatsApp 必须配置 App Secret，飞书自建 Webhook 必须配置 verification token，钉钉自建 Webhook 必须配置 signing secret；缺少凭据不会退化为无验签接收。长连接模式使用各 Provider SDK/握手凭据认证。
- 查询必须包含 `org_id`；连接授权、发送、重放、禁用和凭据更新写入审计日志。
- Trace 串联 `provider_event_id -> ingress_event_id -> message_id -> workflow_run/agent_run -> outbox_id -> provider_message_id -> receipt_id`。
- 指标至少包含入站延迟、去重率、规范化失败、连接重连、Outbox 积压、发送成功率、回执延迟、重试和死信。

### 11.2 测试

- SDK contract test：所有插件通过同一组规范化、能力、错误分类和幂等测试。
- Provider fixture test：用脱敏事件样本验证签名和解析。
- End-to-end：入站到 Conversation，再由 Workflow/Agent/Human 生成 Outbox 并送达模拟提供方。
- Failure injection：重复事件、乱序回执、429、超时、Token 过期、连接迁移和 Worker 崩溃。
- Tenant isolation：跨组织连接、身份、会话和死信不可互查或重放。

### 11.3 真实 Provider 发布门禁

单元测试、Provider fixture 和模拟端到端不能证明真实 Workspace、Server、租户、号码或邮箱仍然可用。发布前使用独立命令通过 Dashboard API 验证真实连接，不读取数据库，也不绕过 Ingress、Session Queue 或 Durable Delivery：

```bash
# 只验证全部十种正式渠道已存在活动连接，并由 Provider 实际确认凭据。
KEENAI_API_URL=https://api.example.com \
KEENAI_ACCESS_TOKEN=... \
KEENAI_ACCEPTANCE_BRAND_ID=... \
pnpm channels:acceptance

# 发布级真实收发：先从每个外部渠道向指定会话发送唯一 inboundToken；
# 收到 KeenAI 回复后，再从真实客户端回复 outboundAckToken。
KEENAI_ACCEPTANCE_MODE=roundtrip \
KEENAI_ACCEPTANCE_PROBES_JSON='{
  "slack":{"conversationId":"...","inboundToken":"probe-slack-20260923","outboundAckToken":"ack-slack-20260923"},
  "email":{"conversationId":"...","inboundToken":"probe-email-20260923","outboundAckToken":"ack-email-20260923"}
}' \
KEENAI_ACCEPTANCE_CHANNELS=slack,email \
pnpm channels:acceptance

# 完整 Provider 能力验收。该模式会上传附件，并按渠道声明执行
# Typing、编辑、Reaction 添加/移除和删除；只能使用专用测试会话。
KEENAI_ACCEPTANCE_MODE=full \
KEENAI_ACCEPTANCE_PROBES_JSON='{
  "slack":{
    "conversationId":"...",
    "inboundToken":"probe-slack-full-20260923",
    "outboundAckToken":"ack-slack-full-20260923",
    "inboundAttachmentFileName":"channel-probe.txt",
    "attachmentPath":"/absolute/path/channel-probe.txt",
    "attachmentContentType":"text/plain",
    "reactionEmoji":"white_check_mark",
    "interactivePromptToken":"Choose acceptance action",
    "interactiveButtonId":"accept",
    "interactiveCompletionToken":"Acceptance branch completed"
  },
  "whatsapp":{
    "conversationId":"...",
    "inboundToken":"probe-whatsapp-full-20260923",
    "outboundAckToken":"ack-whatsapp-full-20260923",
    "inboundAttachmentFileName":"channel-probe.txt",
    "attachmentPath":"/absolute/path/channel-probe.txt",
    "attachmentContentType":"text/plain",
    "interactivePromptToken":"Choose acceptance action",
    "interactiveButtonId":"accept",
    "interactiveCompletionToken":"Acceptance branch completed",
    "templateName":"support_follow_up",
    "templateLanguageCode":"en_US",
    "templateComponents":[{"type":"body","parameters":[]}]
  }
}' \
KEENAI_ACCEPTANCE_CHANNELS=slack,whatsapp \
pnpm channels:acceptance
```

可使用 `KEENAI_ACCEPTANCE_EMAIL`、`KEENAI_ACCEPTANCE_PASSWORD`、`KEENAI_ACCEPTANCE_ORG_SLUG` 登录，或直接提供短期 `KEENAI_ACCESS_TOKEN`。默认检查 `widget,email,slack,discord,telegram,whatsapp,wechat,wecom,feishu,dingtalk`；可通过 `KEENAI_ACCEPTANCE_CHANNELS` 限定发布范围。`roundtrip` 模式对每个渠道强制执行以下步骤：

1. 所有活动连接调用 `POST /channel-connections/:id/test`。Widget 必须返回 `local`，外部渠道必须返回 `provider`；`configuration_only` 默认失败，不能冒充真实连通。
2. 读取指定 Conversation，确认其 `channelType` 与渠道一致。
3. 在最近消息中等待由真实渠道产生的 User 消息及唯一 `inboundToken`，证明外部事件经过 Durable Ingress 和会话路由。
4. 通过 Dashboard Conversation API 创建 Agent 回复，证明业务层生成标准消息和 Outbox 任务。
5. 轮询该消息直到 `sent`、`delivered` 或 `read`；超时、持续 `pending`、鉴权失败或连接缺失均使命令非零退出。
6. 操作员在真实外部客户端确认收到消息后回复唯一 `outboundAckToken`；验收器只接受出站请求之后新产生的 User 消息。没有该回传时，即使 Provider API 返回成功也不算双向 roundtrip 通过。

`full` 模式包含上述全部步骤，并读取 Conversation 返回的插件能力声明：声明 `attachments` 时，初始真实外部消息必须带有 `inboundAttachmentFileName` 指定的附件，同时 Probe 必须提供 `attachmentPath` 与 `attachmentContentType` 验证出站附件；声明 `threads` 时回复真实入站消息；声明 `typing`、`message_edit`、`reactions` 或 `message_delete` 时逐项调用 Dashboard API，并等待 Durable Outbox 在 Provider 成功后更新本地事实。声明 `delivery_receipts` 的渠道必须推进到 `delivered/read`，声明 `read_receipts` 的渠道必须推进到 `read`。声明 `interactive` 时，测试会等待包含 `interactivePromptToken` 和 `interactiveButtonId` 的真实 Workflow reply-buttons 消息，再等待外部用户点击后产生的 `interactiveCompletionToken` 分支消息；运行命令期间必须在真实客户端完成点击。声明 `templates` 时，测试使用 Probe 中的模板名称、语言和可选 components 实际投递批准模板。未声明能力会以 `skipped: true, reason: not_declared` 写入报告，不会冒充已测试。此模式最后可能删除刚创建的验收消息，必须使用专用测试会话和无业务价值的附件。

可配置 `KEENAI_ACCEPTANCE_TIMEOUT_MS`、`KEENAI_ACCEPTANCE_POLL_INTERVAL_MS`、`KEENAI_ACCEPTANCE_INBOUND_MAX_AGE_MINUTES` 和 `KEENAI_ACCEPTANCE_REPORT`。报告不输出访问令牌和 Provider Secret。只有 Provider 本身确实不支持在线身份验证且发布方明确接受风险时，才可用 `KEENAI_ACCEPTANCE_ALLOW_CONFIGURATION_ONLY` 指定渠道；正式全渠道发布不应设置该例外。

### 11.4 分阶段迁移

1. 提取标准消息、插件契约和能力模型；先为现有 Widget、Email 增加适配器。
2. 上线连接、Ingress Event、映射表和 Outbox；保留现有 API 外观。
3. 将 Widget、Email 收发改走统一 Kernel 与 Delivery，不改变用户界面行为。
4. 接入 Slack、Discord、Telegram、飞书和钉钉，按连接灰度启用。
5. 接入 WhatsApp Cloud API、微信公众号、企业微信，并完善模板、回执和合规策略。
6. 移除旧的渠道直连发送路径，所有发送统一经过 Outbox。

迁移期间新旧路径通过连接级 feature flag 互斥，禁止双写后直接双发；回滚必须保留稳定的外部映射和幂等键。

## 12. 参考实现与采用边界

本方案参考 [OpenClaw Gateway 架构](https://github.com/openclaw/openclaw/blob/main/docs/concepts/architecture.md)、[渠道路由](https://github.com/openclaw/openclaw/blob/main/docs/channels/channel-routing.md)、[Channel Plugin SDK](https://github.com/openclaw/openclaw/blob/main/docs/plugins/sdk-channel-plugins.md) 和 [ChannelPlugin 类型](https://github.com/openclaw/openclaw/blob/main/src/channels/plugins/types.plugin.ts)。采用其 Gateway、插件化渠道、连接生命周期和确定性路由思想，同时针对 KeenAI 增加多租户隔离、可恢复 Outbox、持久化入站、投递回执和企业审计。

不直接复制 OpenClaw 的个人设备会话、单 Gateway 信任边界和本地优先配置方式。具体参考路径及版本管理见 [00-REFERENCE-REPOS.md](./00-REFERENCE-REPOS.md)。

### 12.1 OpenClaw 的三层消息队列

OpenClaw 的“消息队列”不是一个统一外部 Broker，而是三个边界不同的机制：

| 层                                    | 持久性        | 目的                                             | 关键行为                                                                                                            |
| ------------------------------------- | ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Durable Channel Ingress（已迁移渠道） | SQLite 持久化 | 防止传输事件在 ACK、重启和重放窗口中丢失         | 原始事件先 append；Webhook ACK/轮询游标在 append 后推进；按 Conversation lane 串行 drain；完成后保留 tombstone 去重 |
| Session / Command Queue               | 进程内        | 防止同一 Session 的 Agent Run 冲突并限制全局并发 | 先进入 `session:<key>` lane，再进入全局 `main` lane；支持 `steer/followup/collect/interrupt`                        |
| Durable Final Delivery                | SQLite 持久化 | 在最终可见回复调用平台前保存发送意图并支持恢复   | 保存 channel/target/account/retry/recovery state；对 `unknown_after_send` 只有在适配器可对账时才安全重放            |

默认 Session Queue 使用 `steer`，内置 500ms debounce、`cap=20`、`drop=summarize`。它是调度队列，不是消息事实库；队列本身不应被当作重启恢复来源。普通 Gateway `chat.send` 会先写 Agent 数据库，渠道消息则由 Durable Ingress 保留到 Agent Turn 接管。

在参考实现中，Durable Ingress 和 Durable Final 的覆盖范围取决于具体插件及发送路径，因此“插件已注册”不等于“端到端持久化已完成”。KeenAI 已将本文定义的 Email、全部八种 IM 插件以及 Widget 的会话消息接口接入 Durable Ingress、持久化 Session Queue 和 Durable Final Delivery。Widget 创建会话、工单和人工接管等业务命令仍按各自事务写事实表，不伪装为外部消息事件。

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
- Email、八种 IM Webhook 与 Widget 会话消息入站均走 Durable Ingress/Session Command。Widget SDK 为每次发送生成稳定 `clientMessageId`，服务端按 `(connection_id, client_message_id)` 去重并将 Provider Event、Session Command 和规范 Message 关联起来；同一请求重试返回原消息，不重复触发 Workflow、Memory 或自动回复。
- Widget、Email 和 IM 的 Agent/Workflow 可见回复全部通过同一 Outbox 发送；工单状态通知也会创建或复用绑定活动 Email Connection 的稳定会话，保留 HTML 模板并进入相同的 Message → Durable Outbox → Email Plugin 链路。旧 BullMQ Email 队列和业务层直接 SMTP 发送均已移除。

| 层                      | 持久化事实                             | 运行入口                                                    | 当前保证                                                   |
| ----------------------- | -------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Durable Channel Ingress | `channel_ingress_events`               | `admitIngressEvent` / `processChannelIngress`               | 持久化后 ACK、去重、lease claim、退避、DLQ                 |
| Session / Command Queue | `channel_session_commands`             | `enqueueSessionCommand` / `processChannelSession`           | 每会话 FIFO、幂等、lease fencing、退避、DLQ                |
| Durable Final Delivery  | `channel_outbox` 及 attempt/receipt 表 | `enqueueMessageForChannelDelivery` / `processChannelOutbox` | 发送前持久化、可重试错误退避、回执推进、未知结果不盲目重发 |

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

当前闭环：

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

| 字段                        | 类型      | 说明                                    |
| --------------------------- | --------- | --------------------------------------- |
| `id`                        | text      | ULID                                    |
| `org_id`                    | text      | FK -> `organizations.id`                |
| `brand_id`                  | text      | FK -> `brands.id`，唯一                 |
| `primary_color`             | text      | Widget 主色，例如 `#7c5cff`             |
| `launcher_icon_url`         | text null | 右下角 launcher 图标                    |
| `agent_name`                | text      | 例如 `Fibi AI Agent` / `Keeni AI Agent` |
| `agent_subtitle`            | text      | 例如 `The team can also help`           |
| `agent_avatar_url`          | text null | Agent 头像                              |
| `greeting_title`            | text      | 首页欢迎标题                            |
| `greeting_body`             | text      | 首页欢迎正文                            |
| `home_enabled`              | boolean   | 是否显示 Home                           |
| `messages_enabled`          | boolean   | 是否显示 Messages                       |
| `help_enabled`              | boolean   | 是否显示 Help                           |
| `changelog_enabled`         | boolean   | 是否显示 Changelog                      |
| `tickets_enabled`           | boolean   | 是否显示 Ticket                         |
| `powered_by_enabled`        | boolean   | 是否显示 Powered by                     |
| `created_at` / `updated_at` | timestamp | 标准时间戳                              |

索引：

- `uq_widget_settings_brand`：`brand_id` 唯一。
- `idx_widget_settings_org`：按 `org_id` 查询。

#### 13.5.2 `widget_menu_items`

用于底部导航、Portal menu 和 Home 卡片入口。模块项和外链项统一建模。

| 字段                        | 类型      | 说明                                                   |
| --------------------------- | --------- | ------------------------------------------------------ |
| `id`                        | text      | ULID                                                   |
| `org_id`                    | text      | FK -> `organizations.id`                               |
| `brand_id`                  | text      | FK -> `brands.id`                                      |
| `settings_id`               | text      | FK -> `widget_settings.id`                             |
| `label`                     | text      | 展示名称                                               |
| `description`               | text null | 副标题或说明                                           |
| `icon`                      | text null | icon key，例如 `home` / `message` / `link`             |
| `item_type`                 | text      | `module` / `external`                                  |
| `module_key`                | text null | `home` / `messages` / `help` / `changelog` / `tickets` |
| `href`                      | text null | 外链 URL                                               |
| `location`                  | text      | `bottom_nav` / `home_card` / `portal_menu`             |
| `enabled`                   | boolean   | 是否启用                                               |
| `sort_order`                | integer   | 排序                                                   |
| `created_at` / `updated_at` | timestamp | 标准时间戳                                             |

索引：

- `idx_widget_menu_items_brand_location`：`brand_id, location, sort_order`。
- `idx_widget_menu_items_settings`：`settings_id`。

约束：

- `item_type = module` 时必须有 `module_key`。
- `item_type = external` 时必须有 `href`。

#### 13.5.3 `widget_quick_actions`

用于首页 `Ask a question`、`Submit ticket`、`Bug Report`，也可用于 Chat 页快捷 chip。

| 字段                        | 类型      | 说明                                                      |
| --------------------------- | --------- | --------------------------------------------------------- |
| `id`                        | text      | ULID                                                      |
| `org_id`                    | text      | FK -> `organizations.id`                                  |
| `brand_id`                  | text      | FK -> `brands.id`                                         |
| `settings_id`               | text      | FK -> `widget_settings.id`                                |
| `label`                     | text      | 展示文案                                                  |
| `action_type`               | text      | `start_chat` / `submit_ticket` / `open_help` / `open_url` |
| `payload`                   | json      | ticket type、prefill prompt、URL 等                       |
| `enabled`                   | boolean   | 是否启用                                                  |
| `sort_order`                | integer   | 排序                                                      |
| `created_at` / `updated_at` | timestamp | 标准时间戳                                                |

索引：

- `idx_widget_quick_actions_brand`：`brand_id, sort_order`。
- `idx_widget_quick_actions_settings`：`settings_id`。

#### 13.5.4 `widget_featured_content`

用于 Home 页推荐文章、推荐更新和默认 Help 搜索建议。它只存引用，不复制文章正文。

| 字段                        | 类型      | 说明                                          |
| --------------------------- | --------- | --------------------------------------------- |
| `id`                        | text      | ULID                                          |
| `org_id`                    | text      | FK -> `organizations.id`                      |
| `brand_id`                  | text      | FK -> `brands.id`                             |
| `settings_id`               | text      | FK -> `widget_settings.id`                    |
| `content_type`              | text      | `kb_article` / `changelog_entry` / `external` |
| `content_id`                | text null | KB article id 或 changelog id                 |
| `title_override`            | text null | 可选覆盖标题                                  |
| `image_url`                 | text null | Home card 图片                                |
| `href`                      | text null | 外链                                          |
| `enabled`                   | boolean   | 是否启用                                      |
| `sort_order`                | integer   | 排序                                          |
| `created_at` / `updated_at` | timestamp | 标准时间戳                                    |

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
