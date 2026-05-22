# 本地参考仓库说明

> KeenAI 的 AI 内核设计借鉴两个上游开源项目。本仓库 **不 vendoring** 它们的源码，而是在开发者本机克隆为 **只读对照**，实现时以 `docs/09`–`11` 为准，翻源码核对行为与边界。

---

## 一、目录与 Git 策略

| 本地路径 | 上游仓库 | 语言 | 对应 KeenAI 文档 |
|----------|----------|------|------------------|
| `hermes-agent/` | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | Python | [09-AGENT-ENGINE.md](09-AGENT-ENGINE.md) |
| `agentmemory/` | [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) | TypeScript | [10-AGENT-MEMORY.md](10-AGENT-MEMORY.md)、[11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md) |

- 两目录已写入根目录 [`.gitignore`](../.gitignore)，**不会**被提交到 KeenAI 仓库。
- KeenAI 产品代码在 `apps/`、`packages/` 中用 **Bun + Mastra + Inngest** 重写语义，**不**把 Python Hermes 当作运行时依赖。
- 可选：Phase 1 通过 MCP 挂载 `@agentmemory/mcp` 做对照验证（见 [09-AGENT-ENGINE.md § MCP](09-AGENT-ENGINE.md)、[11-RAG-KNOWLEDGE.md § 二十一](11-RAG-KNOWLEDGE.md)）。

### 克隆到仓库根目录

```bash
cd /path/to/KeenAI

git clone --depth 1 https://github.com/NousResearch/hermes-agent.git hermes-agent
git clone --depth 1 https://github.com/rohitg00/agentmemory.git agentmemory
```

更新对照版本：

```bash
cd hermes-agent && git pull
cd ../agentmemory && git pull
```

---

## 二、分工：谁管什么

```
                    ┌─────────────────────────────────────┐
                    │           KeenAI (TS)               │
                    │  Mastra Agent · @keenai/memory · kb │
                    └──────────────┬──────────────────────┘
                                   │ 设计借鉴 / 行为对照
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   ┌──────────────────────┐                 ┌──────────────────────┐
   │    hermes-agent      │                 │     agentmemory      │
   │  执行 · 渠道 · Skill  │◄──官方集成────►│  记忆 · 检索 · Hook   │
   └──────────────────────┘                 └──────────────────────┘
```

| 维度 | hermes-agent | agentmemory |
|------|--------------|-------------|
| **核心问题** | Agent 怎么跑、怎么接渠道、怎么学 Skill | 对话怎么记住、怎么搜、怎么遗忘 |
| **KeenAI 模块** | Keeni Agent Engine、Gateway、Skill、Subagent、Cron | Keeni Memory、Hybrid Retriever、Memory Explorer |
| **落地框架** | Mastra Agent + Hono Gateway + Inngest | `@mastra/memory` + `@keenai/storage` |
| **与 Featurebase 对标** | Fibi / Copilot 的「会做事」 | 客户画像、跨会话上下文 |
| **前端 UI** | 无（不看此仓做 Dashboard） | 无（Viewer 仅作交互参考） |

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

---

## 四、与 KeenAI 其它文档的边界

| 来源 | 用途 |
|------|------|
| **本页 + `hermes-agent/` + `agentmemory/`** | AI 内核行为与算法对照 |
| [05-FRONTEND.md](05-FRONTEND.md)、根目录 `DESIGN.md` | Dashboard / Widget / Portal 视觉与布局（对标 Featurebase 截图） |
| [13-WORKFLOW.md](13-WORKFLOW.md) | 无代码自动化编排（Inngest）；AI Block 调用 09 的 Agent |
| [14-MULTIMODAL.md](14-MULTIMODAL.md) | 多模态消息 Inbound/Outbound；Channel 归一化对照 Hermes Gateway |
| [12-STORAGE-ABSTRACTION.md](12-STORAGE-ABSTRACTION.md) | `Store` / `VectorStore` / `FTSStore` 接口（KeenAI 存储不复制 AgentMemory 的 iii 引擎） |

---

## 五、贡献者注意事项

1. **不要** 把 `hermes-agent/`、`agentmemory/` 加入 git add；PR 只应包含 `apps/`、`packages/`、`docs/` 等 KeenAI 自有代码。
2. 引用上游行为时，在 PR / Issue 中注明 **文件路径 + 行号**（或 commit SHA），便于评审。
3. 许可证：上游各自仓库许可证与 KeenAI AGPL 独立；仅作阅读参考，不合并其源码进本仓库。
4. 实现优先级以 [08-ROADMAP.md](08-ROADMAP.md) 为准；参考仓库用于 **降低设计歧义**，不阻塞 MVP 按文档先跑通 Mastra 最小路径。

---

## 六、相关链接

| 资源 | URL |
|------|-----|
| Hermes Agent | https://github.com/NousResearch/hermes-agent |
| AgentMemory | https://github.com/rohitg00/agentmemory |
| Mastra（KeenAI 落地框架） | https://mastra.ai/ |
| AgentMemory × Hermes 集成 | `agentmemory/integrations/hermes/README.md`（克隆后本地阅读） |
