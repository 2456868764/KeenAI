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

**下一迭代**：Memory Tree MT-03（source tree buffer + seal → episodes）

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
| I21-03 | source tree seal → episodes（MT-03） | [ ] |

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
| MT-03 | source tree conv:* buffer + seal → episodes | [ ] |
| MT-04 | memory.digest_daily global node | [ ] |
| MT-05 | 检索 API drill_down + brand_daily | [ ] |
| MT-06 | Agent scope 路由（09 附录 B） | [ ] |
| MT-07 | topic tree + hotness | [ ] |
| MT-08 | Memory Explorer Dashboard MVP | [ ] |
| MT-09 | channel-scoped source tree | [ ] |
| MT-10 | agentmemory backend 兼容层（可选） | [ ] |

---

见 [08-ROADMAP.md](./08-ROADMAP.md) · [15-MEMORY-TREE.md](./15-MEMORY-TREE.md) · [14-MULTIMODAL.md](./14-MULTIMODAL.md) · [ALPHA.md](./ALPHA.md).
