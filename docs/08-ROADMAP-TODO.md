# KeenAI 阶段执行 TODO（跟踪 `08-ROADMAP.md`）

> **迭代闭环**（Phase 4 起）：`实现 → pnpm lint → pnpm typecheck → pnpm test → git commit → git push`  
> 状态：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成 · `[-]` 取消

---

## 当前迭代 · Iteration 35（Keeni Memory KM-03 · FTS memory search）

| ID | 项 | 状态 |
|----|-----|------|
| I35-01 | `searchMemoryChunks` 改 FTS（替换 SQL LIKE） | [ ] |
| I35-02 | Explorer/API 返回 FTS score + snippet | [ ] |
| I35-03 | tests · roadmap · commit · push | [ ] |

**下一迭代**：KM-04 · chunk vectors + embed

---

## Iteration 34（Keeni Memory KM-02 · FTS memory chunks）✓

| ID | 项 | 状态 |
|----|-----|------|
| I34-01 | `fts_memory_chunks` 虚拟表 + migration | [x] |
| I34-02 | ingest 时 FTS index + ensure schema | [x] |
| I34-03 | tests · roadmap · commit · push | [x] |

---

## Iteration 33（Keeni Memory KM-01 · Hybrid RRF 基础）✓

> **目标**：KeenAI **内置** agentmemory 对应能力（LibSQL + `@keenai/memory-tree`），不依赖外部 daemon。  
> 设计对照：[10-AGENT-MEMORY.md](./10-AGENT-MEMORY.md) · [12-STORAGE-ABSTRACTION.md](./12-STORAGE-ABSTRACTION.md) §5.5

| ID | 项 | 状态 |
|----|-----|------|
| I33-01 | `packages/storage`：`rrfFuse` + `hybridSearch` 纯函数 + 单元测试 | [x] |
| I33-02 | 导出 `@keenai/storage` hybrid API | [x] |
| I33-03 | roadmap · lint/typecheck/test · commit · push | [x] |

---

## Phase 4 · Keeni Memory 原生（KM-01～KM-11）

对标 [agentmemory](https://github.com/rohitg00/agentmemory) **能力**，全部落在 KeenAI 自有存储与 Inngest 管线。

| KM | 迭代 | 交付 | 状态 |
|----|------|------|------|
| **KM-01** | I33 | `rrfFuse` + `hybridSearch`（storage 层，FTS/Vector 结果融合） | [x] |
| **KM-02** | I34 | `fts_memory_chunks` 虚拟表 + migration；ingest 时 FTS index | [x] |
| **KM-03** | I35 | `searchMemoryChunks` 改 FTS（替换 SQL LIKE）+ API/集成测试 | [ ] |
| **KM-04** | I36 | `memory_chunk_vectors` 表 + admit 后 embed（`@xenova/transformers` 可选 env） | [ ] |
| **KM-05** | I37 | Memory 混合检索：FTS + Vector RRF；`GET /memory/search` 返回 fused score | [ ] |
| **KM-06** | I38 | `fts_memory_summaries` + 搜索覆盖 seal 摘要与日 digest | [ ] |
| **KM-07** | I39 | `memory_facts` + `memory_slots` schema；seal 后 LLM 抽取 facts（Inngest） | [ ] |
| **KM-08** | I40 | `GET /memory/facts` + `assembleMemoryContext` 注入 L3 slots/facts | [ ] |
| **KM-09** | I41 | ingest privacy filter（PII 脱敏 processor） | [ ] |
| **KM-10** | I42 | `flush_stale` buffer cron + `memory_entities` 实体抽取 stub | [ ] |
| **KM-11** | I43 | consolidation/decay Inngest cron + eviction 分数 | [ ] |
| **KM-12** | I44 | `@keenai/memory` facade：`store` / `recall` / `get` / `forget` 统一 API | [ ] |
| **KM-13** | I45 | `keenai memory export --vault` CLI → Markdown vault | [ ] |

### 依赖关系（简图）

```
KM-01 RRF ──► KM-02 FTS index ──► KM-03 search 升级
                      │
KM-04 vectors ──► KM-05 hybrid recall ──► KM-06 summaries FTS
KM-07 facts/slots ──► KM-08 Agent L3 context
KM-09 privacy ──► KM-10 flush + entities ──► KM-11 consolidation
KM-12 memory package ──► KM-13 export CLI
```

### 与 Memory Tree 已完成项的关系

| 已有（MT-01～09） | Phase 4 增强 |
|-------------------|-------------|
| `memory_chunks` ingest + fast-score | + FTS/Vector 索引 |
| seal → `memory_summaries` / episodes | + 摘要可检索 + fact 抽取 |
| `assembleMemoryContext` scope 路由 | + L3 facts/slots + hybrid recall |
| Explorer `LIKE` 搜索 | → FTS → hybrid RRF |
| ~~MT-10 外部 daemon~~ | **取消**；能力由 KM-* 原生实现 |

---

## Iteration 32（Memory Tree MT-10 — 已移除）

> agentmemory daemon 集成已回滚；KeenAI 仅保留 LibSQL Memory Tree。

| ID | 项 | 状态 |
|----|-----|------|
| I32-01 | AgentMemoryClient + remember/smart-search mapping | [-] |
| I32-02 | seal/digest sync hook + runtime config | [-] |
| I32-03 | GET /memory/agentmemory/health + recall | [-] |
| I32-04 | Dashboard hybrid recall UI | [-] |

---

## Iteration 31（Memory Tree MT-09）

| ID | 项 | 状态 |
|----|-----|------|
| I31-01 | channelScopeKey + channelRouteChunk pipeline | [x] |
| I31-02 | queryChannelMemoryTree + GET /memory/tree?scope=channel | [x] |
| I31-03 | slack/telegram ingest metadata + explorer search | [x] |
| I31-04 | tests · roadmap · commits | [x] |

---

## Iteration 30（Memory Tree MT-08）

| ID | 项 | 状态 |
|----|-----|------|
| I30-01 | queryMemoryExplorerStats + searchMemoryChunks API | [x] |
| I30-02 | GET /memory/stats + GET /memory/search | [x] |
| I30-03 | Dashboard Memory Explorer page | [x] |
| I30-04 | tests · roadmap · commits | [x] |

---

## Iteration 29（Memory Tree MT-07）

| ID | 项 | 状态 |
|----|-----|------|
| I29-01 | memory_hotness schema + refreshCustomerHotness | [x] |
| I29-02 | topicRouteChunk + customer topic buffer/seal | [x] |
| I29-03 | queryCustomerMemoryTree + assemble customer scope | [x] |
| I29-04 | GET /memory/tree?scope=customer + tests · commits | [x] |

---

## Iteration 28（Memory Tree MT-06）

| ID | 项 | 状态 |
|----|-----|------|
| I28-01 | resolveMemoryScope + assembleMemoryContext | [x] |
| I28-02 | Copilot draft memoryContext + memoryScope meta | [x] |
| I28-03 | GET /memory/context + tests | [x] |
| I28-04 | roadmap · commits | [x] |

---

## Iteration 27（Memory Tree MT-05）

| ID | 项 | 状态 |
|----|-----|------|
| I27-01 | queryConversationMemoryTree + queryBrandDailyDigest | [x] |
| I27-02 | GET /memory/tree + GET /memory/digest routes | [x] |
| I27-03 | shared query schemas + integration tests | [x] |
| I27-04 | roadmap · commits | [x] |

---

## Iteration 26（Memory Tree MT-04）

| ID | 项 | 状态 |
|----|-----|------|
| I26-01 | brandDailyScopeKey + stubDailyDigest | [x] |
| I26-02 | digestDailyForBrand + runDigestDaily | [x] |
| I26-03 | Inngest digest_daily cron + event | [x] |
| I26-04 | tests · roadmap · commits | [x] |

---

## Iteration 25（Memory Tree MT-03）

| ID | 项 | 状态 |
|----|-----|------|
| I25-01 | memory_tree_buffers + memory_summaries + memory_episodes schema | [x] |
| I25-02 | appendBuffer + sealBuffer + stub seal | [x] |
| I25-03 | processAdmittedChunk pipeline + dispatch wiring | [x] |
| I25-04 | buffer/seal tests · roadmap · commits | [x] |

---

## Iteration 24（Memory Tree MT-02）

| ID | 项 | 状态 |
|----|-----|------|
| I24-01 | fast_score column + migration | [x] |
| I24-02 | computeFastScore + applyFastScoreToChunk | [x] |
| I24-03 | extract_chunk stub + memory dispatch | [x] |
| I24-04 | integration tests · roadmap · commits | [x] |

---

## Iteration 23（Memory Tree MT-01）

| ID | 项 | 状态 |
|----|-----|------|
| I23-01 | memory_chunks schema + migration | [x] |
| I23-02 | @keenai/memory-tree canonicalize + persist | [x] |
| I23-03 | message ingest hook + integration tests | [x] |

---

## Iteration 22（Telegram/Slack IM 多模态 · MM-15）

| ID | 项 | 状态 |
|----|-----|------|
| I22-01 | @keenai/channels-im inbound/outbound adapters | [x] |
| I22-02 | IM webhooks + ingest + outbound plan API | [x] |
| I22-03 | integration tests · commits | [x] |

---

## Iteration 21（Memory Tree 设计 · 文档）

| ID | 项 | 状态 |
|----|-----|------|
| I21-00 | [15-MEMORY-TREE.md](./15-MEMORY-TREE.md) + 关联 doc/roadmap 更新 | [x] |
| I21-01 | `memory_chunks` schema + canonicalize（MT-01） | [x] |
| I21-02 | fast-score + admitted/dropped（MT-02） | [x] |
| I21-03 | source tree seal → episodes（MT-03） | [x] |

---

## Phase 3 · Multimodal Agent 完整版

| MM ID | 项 | 状态 |
|-------|-----|------|
| MM-10 | STT transcribe pipeline | [x] |
| MM-11 | video thumbnail + 播放 | [x] |
| MM-12 | parseAgentResponse + Keeni outbound 图 | [x] |
| MM-13 | TTS tool + audio 出站 | [x] |
| MM-14 | generate_image tool | [x] |
| MM-15 | Telegram/Slack IM 多模态 | [x] |

## Phase 3 · Memory Tree（[15-MEMORY-TREE.md](./15-MEMORY-TREE.md)）

| MT ID | 项 | 状态 |
|-------|-----|------|
| MT-01 | memory_chunks + canonicalize + deterministic id | [x] |
| MT-02 | fast-score + extract_chunk + admitted/dropped | [x] |
| MT-03 | source tree conv:* buffer + seal → episodes | [x] |
| MT-04 | memory.digest_daily global node | [x] |
| MT-05 | 检索 API drill_down + brand_daily | [x] |
| MT-06 | Agent scope 路由（09 附录 B） | [x] |
| MT-07 | topic tree + hotness | [x] |
| MT-08 | Memory Explorer Dashboard MVP | [x] |
| MT-09 | channel-scoped source tree | [x] |
| MT-10 | ~~agentmemory daemon~~ | [-] 已移除；见 Phase 4 KM-* |

## Phase 4 · Keeni Memory 原生（[10-AGENT-MEMORY.md](./10-AGENT-MEMORY.md)）

| KM ID | 项 | 状态 |
|-------|-----|------|
| KM-01 | hybrid RRF（storage） | [x] |
| KM-02 | fts_memory_chunks + ingest index | [x] |
| KM-03 | FTS memory search | [ ] |
| KM-04 | chunk vectors + embed | [ ] |
| KM-05 | hybrid FTS+Vector recall | [ ] |
| KM-06 | summaries FTS search | [ ] |
| KM-07 | memory_facts + memory_slots | [ ] |
| KM-08 | L3 context API | [ ] |
| KM-09 | privacy filter ingest | [ ] |
| KM-10 | flush_stale + entities | [ ] |
| KM-11 | consolidation + decay | [ ] |
| KM-12 | @keenai/memory facade | [ ] |
| KM-13 | export CLI | [ ] |

---

见 [08-ROADMAP.md](./08-ROADMAP.md) · [15-MEMORY-TREE.md](./15-MEMORY-TREE.md) · [14-MULTIMODAL.md](./14-MULTIMODAL.md) · [ALPHA.md](./ALPHA.md).
