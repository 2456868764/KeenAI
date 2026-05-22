# KeenAI 多模态消息技术方案

> 文本 · 图片 · 语音 · 视频 · 文件 —— **全渠道统一 Canonical 模型**，Inbound 归一化 + 异步 Enrichment，Outbound 解析 + Channel Renderer。  
> 设计借鉴 [hermes-agent](https://github.com/NousResearch/hermes-agent) Gateway 的 `MessageEvent` / `extract_media` 模式，落地为 **Bun + S3 + Inngest + Vercel AI SDK** 栈。

| 维度 | 选型 |
|------|------|
| **Canonical 模型** | `MessagePart[]` + `attachments` 表（`@keenai/shared` Zod） |
| **媒体存储** | S3 / MinIO / 本地 `data/uploads`（Lite）· `storageKey` + 可选 `thumbnailKey` |
| **Inbound 适配** | `@keenai/channels-*` Normalizer（Widget / Email / IM） |
| **异步 Pipeline** | Inngest：`media.transcribe` · `media.thumbnail` · `media.vision_summary` |
| **Agent 消费** | Native multimodal（vision 模型）或 Text enrichment（非 vision / 降本） |
| **Outbound 解析** | `parseAgentResponse`（`MEDIA:` · Markdown 图 · structured parts） |
| **出站渲染** | `ChannelRenderer`（Widget WS · Email MIME · IM native API） |
| **参考对照** | 本地 `hermes-agent/gateway/platforms/base.py` · `gateway/run.py` |

---

## 一、设计目标

| 目标 | 说明 |
|------|------|
| **渠道无关** | Widget / Email / Slack / Telegram 入库后结构一致，Inbox 一套 UI |
| **Agent 可消费** | Copilot / Keeni 能「看见」图片、「听见」语音（STT）、引用 PDF |
| **出站可渲染** | AI / 客服 / Workflow 可发图、文件、语音；各渠道按能力降级 |
| **可搜索** | `plainText` 始终有 fallback（占位符 / 转写 / vision 摘要）供 FTS |
| **租户隔离** | `orgId` + signed URL；附件大小 / MIME 白名单 |
| **渐进交付** | MVP 图片 → 语音 STT → 视频播放 → Agent 生图/TTS 出站 |

### 与 Hermes 的差异

| | Hermes | KeenAI |
|---|--------|--------|
| 媒体缓存 | 本地 `~/.hermes/cache/*` | S3 + `attachments.storageKey` |
| 预处理时机 | Gateway 进程内同步 | 先入库，Inngest 异步 enrich |
| 多租户 | 单 Gateway | org / brand 隔离 + presign |
| Agent 框架 | 自研 run loop | Mastra + Vercel AI SDK |

---

## 二、Canonical 消息模型

### 2.1 MessagePart（前后端共享）

```ts
// packages/shared/src/schemas/message-parts.ts（规划）

export const MessagePartKind = z.enum([
  "text",
  "image",
  "audio",
  "video",
  "file",
]);

export const MessagePartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string(), format: z.enum(["plain", "tiptap", "html"]).optional() }),
  z.object({ type: z.literal("image"), attachmentId: z.string(), alt: z.string().optional(), width: z.number().optional(), height: z.number().optional() }),
  z.object({ type: z.literal("audio"), attachmentId: z.string(), durationMs: z.number().optional() }),
  z.object({ type: z.literal("video"), attachmentId: z.string(), posterAttachmentId: z.string().optional(), durationMs: z.number().optional() }),
  z.object({ type: z.literal("file"), attachmentId: z.string(), fileName: z.string() }),
]);

export const MessageKindSchema = z.enum([
  "text",
  "photo",
  "voice",
  "video",
  "document",
  "mixed",
  "sticker", // IM 渠道；UI 可当 image 渲染
]);
```

### 2.2 InboundMessage（Adapter → Conversation Service）

```ts
export type InboundMessage = {
  parts: z.infer<typeof MessagePartSchema>[];
  plainText: string;              // FTS / 通知 / 无 vision 模型 fallback
  messageKind: z.infer<typeof MessageKindSchema>;
  metadata?: {
    platformMessageId?: string;
    replyToMessageId?: string;
    replyToPlainText?: string;
  };
};
```

**plainText 生成规则**（对标 Hermes `_build_media_placeholder`）：

| 类型 | 默认 plainText |
|------|----------------|
| 纯图片 | `[Image: {fileName}]` 或 enrich 后 `[Image: {visionSummary}]` |
| 语音 | `[Voice message]` → STT 后 `[Voice: "{transcript}"]` |
| 视频 | `[Video: {fileName}]` |
| 文件 | `[File: {fileName}]` |
| 混合 | 各 part 占位 + 用户 caption |

### 2.3 OutboundPart（Agent / Workflow → Channel Renderer）

```ts
export type OutboundPart =
  | { type: "text"; text: string; format?: "plain" | "tiptap" | "html" }
  | { type: "attachment"; attachmentId: string }
  | { type: "generated"; toolRunId: string; kind: "image" | "audio" | "video" | "file" };

export type OutboundDirectives = {
  asVoice?: boolean;      // 音频以「语音气泡」发送（Hermes [[audio_as_voice]]）
  asDocument?: boolean;   // 图片以文件发送，避免 IM 压缩（Hermes [[as_document]]）
};
```

---

## 三、架构分层

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Channels (Widget · Email · Slack · Telegram · API)                      │
│    InboundNormalizer ──download/upload──▶ attachments + messages         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Conversation Service (@keenai/conversation · apps/api)                  │
│    insertMessage(parts) · serializeMessage(+attachments) · WS/SSE push   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ conversation/message.created
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Media Pipeline (Inngest)                                                │
│    transcribe · thumbnail · vision_summary · extract_text (PDF)          │
│    → 更新 messages.metadata + plainText                                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Agent / Copilot (@keenai/agent · @keenai/llm)                          │
│    buildModelMessages(): native vision | text enrichment                 │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ OutboundPart[] 或 Markdown
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Outbound Parser + ChannelRenderer                                       │
│    parseAgentResponse · sendMessage(parts) · Email MIME · IM native      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 包职责（规划）

| 包 | 职责 |
|----|------|
| `@keenai/shared` | `MessagePart` / `InboundMessage` / `OutboundPart` Zod |
| `@keenai/channels-core` | Normalizer 接口 · `parseAgentResponse` · MIME 策略 |
| `@keenai/channels-email` | MIME 附件 ingest · HTML+CID 出站 |
| `@keenai/channels-widget` | presign 上传 · bubble 协议 |
| `@keenai/conversation` | 消息 CRUD · attachment 关联 · plainText 合成 |
| `@keenai/media` | 缩略图 · STT · vision summary · 病毒扫描（可选） |
| `@keenai/agent` | `buildModelMessages` · tool：`generate_image` · `text_to_speech` |

---

## 四、Inbound（多模态输入）

### 4.1 统一流程

```
Platform payload
  → 校验 MIME / 大小
  → 上传 Blob → storageKey（S3 或本地 uploads）
  → INSERT attachments
  → 构建 InboundMessage { parts, plainText, messageKind }
  → insertMessage + link attachments.messageId
  → publish conversation/message.created
  → Inngest media.* jobs（异步）
```

### 4.2 分渠道要点

| Channel | Inbound | 备注 |
|---------|---------|------|
| **Widget** | 客户端 presign → PUT → `POST .../messages` 带 `attachmentIds[]` | 已有 presign MVP；需关联 message |
| **Email** | mailparser `attachments[]` → 逐个 upload | `email-ingest.ts` 待扩展 |
| **Dashboard** | Tiptap 粘贴/拖拽 → presign | Inbox composer |
| **Telegram**（P3） | Bot API getFile → upload | 对标 Hermes telegram.py |
| **Slack**（P2） | files.shared / block attachments | |
| **WhatsApp**（P3） | Cloud API media_id 下载 | |

### 4.3 特殊合并逻辑（借鉴 Hermes）

- **多图 album**：同一 `media_group_id` / 短时间窗口 merge 为一条 `messageKind: mixed`
- **document 实为图片**：MIME `image/*` 或扩展名 → `messageKind: photo`
- **Reply 上下文**：`metadata.replyToPlainText` 注入 Agent（Hermes `reply_to_text`）

### 4.4 限制与安全

| 项 | 默认 |
|----|------|
| 单文件大小 | 20 MB（与 Hermes document 上限一致；可 org 配置） |
| 允许 MIME | `image/*` · `audio/*` · `video/*` · `application/pdf` · `text/*` · 常见 office |
| 拒绝 | 可执行文件 · 未授权 MIME |
| URL 下载 | SSRF 校验（Hermes `is_safe_url`） |
| 访问 | signed URL / auth proxy `GET /api/v1/attachments/:id/content` |

---

## 五、Media Pipeline（Inngest）

触发：`keenai/conversation.message.created`（payload 含 `messageId` · `attachmentIds`）

| Function | 输入 | 输出 |
|----------|------|------|
| `media.thumbnail` | image/video | `attachments.thumbnailKey` |
| `media.transcribe` | audio/* | `metadata.transcript` + 更新 `plainText` |
| `media.vision_summary` | image/*（非 native 路径或 async 补全） | `metadata.visionSummary` |
| `media.extract_text` | pdf / text doc | `metadata.extractedText`（供 Agent / RAG） |

完成后：`publish conversation/message.updated` → Inbox / Widget 刷新 enrichment 状态。

**与 Workflow 关系**：Pipeline 完成后再触发 `dispatchFirstMessage` / Agent（或通过 `step.waitForEvent` 等待 `media.enriched`）。

---

## 六、Agent 消费（多模态输入 → LLM）

对标 Hermes `_prepare_inbound_message_text` + `agent/image_routing.py`：

### 6.1 图片双路由

| 模式 | 条件 | 行为 |
|------|------|------|
| **native** | 主模型 `supportsVision` + 配置 `imageInputMode: auto\|native` | Vercel AI SDK `image` part（signed URL 或 base64） |
| **text** | 非 vision 模型 / 显式 `text` / 独立 vision 后端 | 使用 `metadata.visionSummary` 或同步调用 vision 模型 |
| **auto** | 默认 | 按模型能力 + `LLM_VISION_MODE` 环境变量 |

### 6.2 语音

- Pipeline STT 完成后，`plainText` 含转写；Agent history 以文本呈现
- 可选：保留 `audio` part 供支持 audio input 的模型（Gemini 等）

### 6.3 文档

- 小文本：inline `metadata.extractedText`
- PDF / Office：`file` part + Tool `read_document`（后期）

### 6.4 Copilot 最小路径（Phase 2）

```ts
// 伪代码
const parts = await loadMessageParts(messageId);
const modelMessages = buildModelMessages(parts, { provider, model, attachments });
return streamText({ model, messages: modelMessages });
```

---

## 七、Outbound（多模态输出）

Agent / Copilot / Workflow **优先产出 structured `OutboundPart[]`**；兼容 Hermes 风格 Markdown 解析。

### 7.1 解析来源（优先级）

1. **Structured**：Tool 返回 `{ attachmentId }` → 直接 `OutboundPart`
2. **`MEDIA:{storageKey}` 标签**：Tool（TTS · 生图）嵌入；strip 后不入用户可见文本
3. **Markdown 图片**：`![alt](https://...)` → 下载或引用已有 attachment
4. **裸 URL / 路径**：`extractLocalFiles` 等价逻辑（Agent sandbox 产出）

### 7.2 发送顺序（对标 Hermes）

| 顺序 | 内容 |
|------|------|
| 1 | TTS 音频（若 `directives.asVoice` 或 voice channel 模式） |
| 2 | 文本正文 |
| 3 | 图片 batch |
| 4 | 视频 / 其他文件 |

### 7.3 ChannelRenderer 接口

```ts
interface ChannelRenderer {
  sendParts(ctx: RenderContext, parts: OutboundPart[], directives?: OutboundDirectives): Promise<string[] /* messageIds */>;
}
```

| Channel | 图片 | 语音 | 视频 | 文件 |
|---------|------|------|------|------|
| Widget / Inbox | `<img>` bubble + signed URL | `<audio>` player | `<video>` player | 下载链接 |
| Email | CID inline 或 linked | 附件 | 附件 | 附件 |
| Telegram | `sendPhoto` / `sendDocument` | `sendVoice` | `sendVideo` | `sendDocument` |

### 7.4 流式出站

Copilot SSE  today 仅文本。扩展协议：

```json
{ "type": "text-delta", "delta": "..." }
{ "type": "attachment.ready", "attachmentId": "...", "mime": "image/png" }
{ "type": "done" }
```

Streaming 结束后补发附件（Hermes `_deliver_media_from_response` 同理）。

### 7.5 Workflow `send_message` Block 扩展

```json
{
  "type": "send_message",
  "content": { "text": "Here's your invoice.", "attachmentIds": ["att_xxx"] }
}
```

---

## 八、数据模型

详见 [07-DATA-MODEL.md § 4.3](07-DATA-MODEL.md)。在现有 `attachments` 表上扩展 **metadata**（JSON）：

```ts
// attachments.metadata（规划字段）
{
  transcript?: string;       // STT
  visionSummary?: string;      // 图片摘要
  extractedText?: string;      // PDF/txt 提取
  width?: number;
  height?: number;
  durationMs?: number;
  source?: "upload" | "email" | "agent_tool" | "im_download";
  platformRef?: string;        // 原始 platform file_id
}
```

`messages.metadata` 扩展：

```ts
{
  messageKind?: "text" | "photo" | "voice" | "video" | "document" | "mixed";
  enrichmentStatus?: "pending" | "ready" | "failed";
  imageInputMode?: "native" | "text";  // 该条消息 Agent 实际使用的路由
}
```

`messages.content` 存储 `MessagePart[]` 的 JSON（或 Tiptap doc 与 parts 并存：富文本仍以 Tiptap 为主，媒体走 parts + attachments）。

---

## 九、API 变更（规划）

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/v1/uploads/presign` | 已有；扩展 `purpose: message_attachment` |
| `PUT` | `/api/v1/uploads/:id` | 已有 |
| `GET` | `/api/v1/attachments/:id` | 元数据 |
| `GET` | `/api/v1/attachments/:id/content` | 鉴权流式下载 |
| `POST` | `/api/v1/conversations/:id/messages` | 扩展 body：`attachmentIds[]` · `parts[]` |
| `GET` | `.../messages` | 响应含 `attachments[]` |

WebSocket / SSE `message.created` payload 同步带 `attachments`。

---

## 十、前端（Dashboard · Widget）

详见 [05-FRONTEND.md § 十五](05-FRONTEND.md)。

| 区域 | 能力 |
|------|------|
| Inbox 线程 | 按 `parts` 渲染 text / image / audio / video / file bubble |
| Composer | 拖拽上传 · 粘贴图片 · 录音（P3） |
| Copilot | 接受 outbound 图片插入 composer |
| Widget | 轻量图片上传 + 缩略图；控制 bundle 体积 |
| 无障碍 | 图片 alt · 语音 transcript 可折叠展示 |

---

## 十一、实施阶段

### Phase 2 · M4-M5 — Multimodal MVP

| ID | 交付 | 依赖 |
|----|------|------|
| MM-01 | `@keenai/shared` MessagePart schema | — |
| MM-02 | `insertMessage` + attachments 关联 + API 返回 attachments | MM-01 |
| MM-03 | Widget 发图 + Inbox 展示 inbound 图片 | MM-02 · presign |
| MM-04 | Email 附件 ingest | MM-02 · mailparser |
| MM-05 | `GET /attachments/:id/content` 鉴权代理 | MM-02 |
| MM-06 | Copilot native vision（单图） | MM-02 · MM-05 |
| MM-07 | Workflow `send_message` + attachmentIds | MM-02 |

### Phase 3 · M7-M8 — Agent 完整多模态

| ID | 交付 |
|----|------|
| MM-10 | Inngest `media.transcribe` + Inbox 显示 transcript |
| MM-11 | Inngest `media.thumbnail` + video 播放 |
| MM-12 | `parseAgentResponse` + Keeni outbound 图片 |
| MM-13 | Tool `text_to_speech` + Widget audio 播放 |
| MM-14 | Tool `generate_image` + outbound |
| MM-15 | Telegram / Slack IM adapter 多模态 |

### Phase 4+ — 增强

- 视频理解（关键帧 + vision）
- 病毒扫描 · DLP
- 客户端图片压缩 · HEIC 转码
- Mobile 原生录音

---

## 十二、验收标准

| 场景 | 验收 |
|------|------|
| 客户 Widget 发图 | Inbox 可见缩略图；FTS 可搜 `[Image:` 或摘要 |
| 客服回复带图 | Widget 收到图片 bubble |
| Email 带 PDF 附件 | 附件可下载；plainText 含 `[File:` |
| Copilot + 对话含图 | 草稿能描述图片内容（vision） |
| Keeni 生图回复 | 客户收到图片消息（非裸 URL 文本） |
| 语音消息 | STT 转写出现在 thread；Agent 能基于转写回复 |

---

## 十三、参考

| 资源 | 用途 |
|------|------|
| [00-REFERENCE-REPOS.md § hermes-agent](00-REFERENCE-REPOS.md) | 本地克隆与阅读入口 |
| `hermes-agent/gateway/platforms/base.py` | `MessageType` · `MessageEvent` · `extract_media` · `extract_images` |
| `hermes-agent/gateway/run.py` | `_prepare_inbound_message_text` · `_deliver_media_from_response` · TTS |
| `hermes-agent/agent/image_routing.py` | native vs text 图片路由 |
| [09-AGENT-ENGINE.md](09-AGENT-ENGINE.md) | Agent Tool · Copilot |
| [07-DATA-MODEL.md](07-DATA-MODEL.md) | messages · attachments |
| [08-ROADMAP.md](08-ROADMAP.md) | 排期 |

---

*文档版本：2026-05 · 状态：设计定稿 · 实现见 [08-ROADMAP-TODO.md](08-ROADMAP-TODO.md) Iteration 15+*
