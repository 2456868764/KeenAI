# 本地参考仓库说明

> KeenAI 的 Agent、Memory 与 Channel 架构借鉴三个上游开源项目。本仓库 **不 vendoring** 它们的源码，而是在开发者本机克隆为 **只读对照**；实现以 KeenAI 文档和多租户边界为准，源码仅用于核对行为与接口。

---

## 一、目录与 Git 策略

| 本地路径 | 上游仓库 | 语言 | 对应 KeenAI 文档 |
|----------|----------|------|------------------|
| `hermes-agent/` | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | Python | [09-AGENT-ENGINE.md](09-AGENT-ENGINE.md) |
| `agentmemory/` | [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) | TypeScript | [10-AGENT-MEMORY.md](10-AGENT-MEMORY.md)、[11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md) |
| `openclaw/` | [openclaw/openclaw](https://github.com/openclaw/openclaw) | TypeScript | [16-Channel.md](16-Channel.md) |

- 参考仓库目录应写入根目录 [`.gitignore`](../.gitignore)，**不会**被提交到 KeenAI 仓库。
- KeenAI 产品代码在 `apps/`、`packages/` 中用 **Bun + Mastra + Inngest** 重写语义，**不**把 Python Hermes 当作运行时依赖。
- 可选：Phase 1 通过 MCP 挂载 `@agentmemory/mcp` 做对照验证（见 [09-AGENT-ENGINE.md § MCP](09-AGENT-ENGINE.md)、[11-RAG-KNOWLEDGE.md § 二十一](11-RAG-KNOWLEDGE.md)）。

### 克隆到仓库根目录

```bash
cd /path/to/KeenAI

git clone --depth 1 https://github.com/NousResearch/hermes-agent.git hermes-agent
git clone --depth 1 https://github.com/rohitg00/agentmemory.git agentmemory
git clone --depth 1 https://github.com/openclaw/openclaw.git openclaw
```

更新对照版本：

```bash
cd hermes-agent && git pull
cd ../agentmemory && git pull
cd ../openclaw && git pull
```

---

## 二、分工：谁管什么

```
                     ┌─────────────────────────────────────┐
                     │           KeenAI (TS)               │
                     │ Agent · Memory · KB · Channel       │
                     └─────────────────┬───────────────────┘
                                       │ 设计借鉴 / 行为对照
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
       ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
       │   hermes-agent   │ │   agentmemory    │ │     openclaw     │
       │ 执行 · Skill     │ │ 记忆 · 检索      │ │ Gateway · Channel│
       └──────────────────┘ └──────────────────┘ └──────────────────┘
```

| 维度 | hermes-agent | agentmemory | openclaw |
|------|--------------|-------------|----------|
| **核心问题** | Agent 怎么跑、怎么学 Skill | 对话怎么记住、怎么搜、怎么遗忘 | 多渠道怎样接入、路由和发送 |
| **KeenAI 模块** | Agent Engine、Skill、Subagent、Cron | Memory、Hybrid Retriever、Memory Explorer | Channel Gateway、Plugin SDK、Connection Runtime |
| **落地方式** | Mastra Agent + Inngest | `@mastra/memory` + `@keenai/storage` | Hono Gateway + Durable Ingress/Outbox + Channel Plugins |
| **采用边界** | 不以 Python 作为运行时依赖 | 不复制存储引擎 | 不复制单用户设备模型；增加 SaaS 多租户与可靠投递 |

上游已提供 **Hermes ↔ AgentMemory** 集成说明：`agentmemory/integrations/hermes/README.md`。

---

## 三、读源码入口（按实现任务）

### 3.1 hermes-agent → [09-AGENT-ENGINE.md](09-AGENT-ENGINE.md)

| 任务 | 建议阅读 |
|------|----------|
| 对话主循环、Tool Calling | `run_agent.py`、`model_tools.py` |
| Skill 发现 / 使用 / 自改进 | `tools/skills_tool.py`、`skills/`、`optional-skills/` |
| 多渠道 Gateway | `gateway/run.py`、`gateway/session.py`、`gateway/platforms/`（新增渠道见 `gateway/platforms/ADDING_A_PLATFORM.md`） |
| 多模态 Inbound/Outbound | `gateway/platforms/base.py`（`MessageEvent` · cache · `extract_media`）· `gateway/run.py`（enrichment · TTS）· `agent/image_routing.py` |
| 会话持久化、FTS | `hermes_state.py` |
| 轨迹 / 上下文压缩 | `agent/` 下 compression 相关模块 |
| 定时任务 | `cron/scheduler.py`、`cron/jobs.py` |
| 子 Agent / 并行 | `plugins/kanban/`、Agent Network 相关 |
| 开发约定（测试、结构） | `AGENTS.md` |

**09 文档中的 Hermes 概念映射**（实现时查表即可）：

| Hermes | KeenAI |
|--------|--------|
| `trajectory_compressor` | Mastra Memory `processors` + 自定义压缩 |
| `mcp_servers` in config | `@mastra/mcp` + `@modelcontextprotocol/sdk` |
| `cron` scheduler | Inngest scheduled functions |
| Skill 自创建 | 从已解决工单提炼 + Mastra Eval |
| 多平台 Gateway | `packages/channels` + 统一 Conversation 模型 |

### 3.2 agentmemory → [10-AGENT-MEMORY.md](10-AGENT-MEMORY.md) / [11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md)

| 任务 | 建议阅读 |
|------|----------|
| BM25 + Vector + Graph + RRF | `src/state/hybrid-search.ts`、`src/functions/search.ts`、`src/functions/smart-search.ts` |
| 巩固 / 分层记忆 | `src/functions/consolidation-pipeline.ts`、`consolidate.ts`、`compress.ts` |
| Hook 生命周期 | `src/hooks/`（12 个 hook 与 10 文档 § Hook Pipeline 对齐） |
| Memory Slots / Working Memory | `src/functions/slots.ts`、`working-memory.ts` |
| 图检索、时序图 | `src/functions/graph-retrieval.ts`、`temporal-graph.ts` |
| 隐私 / 脱敏 | `src/functions/privacy.ts` |
| 团队 / 命名空间 | `src/functions/team.ts` |
| MCP 工具面 | `src/mcp/tools-registry.ts`、`packages/mcp/` |
| Schema / 存储 | `src/state/schema.ts`、`src/state/vector-index.ts`、`src/state/search-index.ts` |
| Hermes 接线示例 | `integrations/hermes/README.md` |

**10 文档 § 十七「借鉴清单」** 已逐项标明采纳 / 调整，改 Memory 行为时先改设计 doc，再对照上表文件。

### 3.3 openclaw → [16-Channel.md](16-Channel.md)

| 任务 | 建议阅读 |
|------|----------|
| Gateway 进程与连接架构 | [`docs/concepts/architecture.md`](https://github.com/openclaw/openclaw/blob/main/docs/concepts/architecture.md) |
| 确定性渠道路由 | [`docs/channels/channel-routing.md`](https://github.com/openclaw/openclaw/blob/main/docs/channels/channel-routing.md) |
| Channel Plugin SDK | [`docs/plugins/sdk-channel-plugins.md`](https://github.com/openclaw/openclaw/blob/main/docs/plugins/sdk-channel-plugins.md) |
| Plugin 主契约 | [`src/channels/plugins/types.plugin.ts`](https://github.com/openclaw/openclaw/blob/main/src/channels/plugins/types.plugin.ts) |
| 入站与 Session 执行队列 | [`docs/concepts/queue.md`](https://github.com/openclaw/openclaw/blob/main/docs/concepts/queue.md) |
| 消息收发与去重/批处理 | [`docs/concepts/messages.md`](https://github.com/openclaw/openclaw/blob/main/docs/concepts/messages.md) |
| Durable Final 与失败分类 | [`docs/concepts/message-lifecycle-refactor.md`](https://github.com/openclaw/openclaw/blob/main/docs/concepts/message-lifecycle-refactor.md) |
| Slack / Discord 出站适配 | `extensions/slack/src/outbound-adapter.ts`、`extensions/discord/src/outbound-adapter.ts` |
| 飞书出站适配 | `extensions/feishu/src/outbound-adapter.ts` |
| WhatsApp 行为与限制 | [`docs/channels/whatsapp.md`](https://github.com/openclaw/openclaw/blob/main/docs/channels/whatsapp.md) |

KeenAI 采用 Gateway、插件注册、能力声明、连接生命周期和确定性路由思想，但不直接复制以下部分：

- OpenClaw 面向个人/本地 Gateway 的设备配对与信任模型；KeenAI 使用 `org_id + brand_id + connection_id` 多租户边界。
- OpenClaw 的渠道配置形态；KeenAI 把连接元数据、Secret 引用、租约和健康状态持久化。
- 直接发送语义；KeenAI 在插件前增加 Transactional Outbox、发送尝试、回执、死信和审计重放。
- WhatsApp 非官方客户端路径；KeenAI 默认采用 Meta Cloud API，企业微信/微信采用官方开放接口。

---

## 四、与 KeenAI 其它文档的边界

| 来源 | 用途 |
|------|------|
| **本页 + `hermes-agent/` + `agentmemory/` + `openclaw/`** | Agent、Memory 与 Channel 行为和接口对照 |
| [05-FRONTEND.md](05-FRONTEND.md)、根目录 `DESIGN.md` | Dashboard / Widget / Portal 视觉与布局（对标 Featurebase 截图） |
| [13-WORKFLOW.md](13-WORKFLOW.md) | 无代码自动化编排（Inngest）；AI Block 调用 09 的 Agent |
| [14-MULTIMODAL.md](14-MULTIMODAL.md) | 多模态消息 Inbound/Outbound；Channel 归一化对照 Hermes Gateway |
| [15-MEMORY-TREE.md](15-MEMORY-TREE.md) | 摘要树 seal pipeline；对照 [OpenHuman Memory Trees](https://tinyhumans.gitbook.io/openhuman/features/obsidian-wiki/memory-tree) |
| [16-Channel.md](16-Channel.md) | 统一 Gateway、Channel Plugin、Connection Runtime、可靠收发和 Widget 专项设计；对照 OpenClaw |
| [12-STORAGE-ABSTRACTION.md](12-STORAGE-ABSTRACTION.md) | `Store` / `VectorStore` / `FTSStore` 接口（KeenAI 存储不复制 AgentMemory 的 iii 引擎） |

---

## 五、贡献者注意事项

1. **不要** 把 `hermes-agent/`、`agentmemory/`、`openclaw/` 加入 git add；PR 只应包含 `apps/`、`packages/`、`docs/` 等 KeenAI 自有代码。
2. 引用上游行为时，在 PR / Issue 中注明 **文件路径 + 行号**（或 commit SHA），便于评审。
3. 许可证：上游各自仓库许可证与 KeenAI AGPL 独立；仅作阅读参考，不合并其源码进本仓库。
4. 实现优先级以 [08-ROADMAP.md](08-ROADMAP.md) 为准；参考仓库用于 **降低设计歧义**，不阻塞 MVP 按文档先跑通 Mastra 最小路径。

---

## 六、相关链接

| 资源 | URL |
|------|-----|
| Hermes Agent | https://github.com/NousResearch/hermes-agent |
| AgentMemory | https://github.com/rohitg00/agentmemory |
| OpenClaw | https://github.com/openclaw/openclaw |
| Mastra（KeenAI 落地框架） | https://mastra.ai/ |
| AgentMemory × Hermes 集成 | `agentmemory/integrations/hermes/README.md`（克隆后本地阅读） |
