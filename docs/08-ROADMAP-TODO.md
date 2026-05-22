# KeenAI 阶段执行 TODO（跟踪 `08-ROADMAP.md`）

> 每完成一项：**实现 → `pnpm test` / `pnpm lint` → `git commit`**。  
> 状态：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成

---

## 当前迭代 · Iteration 20（TTS Tool + Audio Outbound）

| ID | 项 | 状态 |
|----|-----|------|
| I20-01 | synthesizeSpeech + TTS env | [x] |
| I20-02 | POST /tools/text-to-speech + agent outbound | [x] |
| I20-03 | Widget audio player + tests | [x] |
| I20-04 | roadmap · commits | [x] |

**下一迭代**：Phase 3 Memory Tree 完成 · 后续 MT 增强项

---

## Iteration 32（Memory Tree MT-10）

| ID | 项 | 状态 |
|----|-----|------|
| I32-01 | AgentMemoryClient + remember/smart-search mapping | [x] |
| I32-02 | seal/digest sync hook + runtime config | [x] |
| I32-03 | GET /memory/agentmemory/health + recall | [x] |
| I32-04 | tests · roadmap · commits | [x] |

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
| MT-10 | agentmemory backend 兼容层（可选） | [x] |

---

见 [08-ROADMAP.md](./08-ROADMAP.md) · [15-MEMORY-TREE.md](./15-MEMORY-TREE.md) · [14-MULTIMODAL.md](./14-MULTIMODAL.md) · [ALPHA.md](./ALPHA.md).
