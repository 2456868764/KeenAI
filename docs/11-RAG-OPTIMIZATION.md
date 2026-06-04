# KeenAI RAG / KB 优化路线（LLM Wiki v2 对齐）

> **设计基线**：[11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md)（Hybrid 三流 · Contextual · Eval）  
> **参考模式**：[LLM Wiki v2](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2)（知识生命周期 · Graph 遍历 · Crystallization · Schema-as-Product）  
> **执行跟踪**：[08-ROADMAP.md](08-ROADMAP.md) Sprint 15–18 · [08-ROADMAP-TODO.md](08-ROADMAP-TODO.md) KB-07～KB-24  
> **已完成基线**：KB-01～06（`@keenai/kb` skeleton · FTS+Vector RRF · search API · Agent 注入）

---

## 一、优化背景

KB-01～06 交付了 **可检索的最小 KB**（parse/chunk/embed stub · FTS+Vector RRF · API · Agent 注入）。与 [11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md) 完整设计相比，仍缺：

| 缺口 | 影响 |
|------|------|
| Graph 未接入 Hybrid | 结构性问题（计划/功能/集成关系）召回弱 |
| embed/rerank 仍为 stub | 语义质量与 Precision 不足 |
| `confidence` 静态 1.0 | 无法区分源权威度与过期内容 |
| 无 supersession / provenance | KB 只会堆积、不会纠错 |
| 无 Crystallization 闭环 | 已解决对话无法 compounding 回 KB |
| 同步 stub 索引 | 大文档增量更新与 Inngest 编排缺失 |

LLM Wiki v2 的核心增量是 **知识生命周期 + Graph 扩展检索 + 自动化沉淀**。本路线将其映射为 KeenAI B2B 场景的三阶段交付（Phase A/B/C），并延续 KB-* 编号。

### 与 Wiki v2 的取舍

| Wiki v2 | KeenAI 采纳 | 改造 |
|---------|------------|------|
| Hybrid BM25+Vector+Graph | ✅ | Graph 改为 **entity-link 1-hop expansion**，非全库 walk |
| Confidence scoring | ✅ | **Evidence-based**（provenance 链），非裸 float |
| Supersession | ✅ | document/chunk 级显式链 |
| Ebbinghaus forgetting | ⚠️ 部分 | Help Center **不衰减**；past_conversations **半衰 90d** |
| Auto-ingest on every hook | ❌ | LLM 生成内容 **human gate** |
| Crystallization | ✅ | 对接 `conversation/closed` + quality gate |
| Schema as product | ✅ | per-Brand `kb_schema` 配置 |

---

## 二、三阶段总览

```
Phase A · 检索质量（Sprint 15 · ~2 周）
  KB-07 embedder → KB-08 reranker → KB-09 graph expand
  → KB-10 hierarchical hydrate → KB-11 diversify/recency → KB-12 query logs

Phase B · 知识生命周期（Sprint 15 尾 + Sprint 16 · ~2 周）
  KB-13 provenance/confidence → KB-14 supersession → KB-15 freshness weights
  → KB-16 Inngest pipeline → KB-17 hash diff → KB-18 parsers/chunkers

Phase C · Compounding 闭环（Sprint 17–18 · ~3 周）
  KB-19 crystallization → KB-20 contradiction → KB-21 brand schema
  → KB-22 unified orchestrator → KB-23 eval loop → KB-24 MT hotness 联动
```

### 依赖关系

```
KB-01～06（baseline）
    │
    ├─► Phase A ──► KB-07 ──► KB-08
    │                  │
    │                  └─► KB-09 ◄── KG-05（kb_entities，可选与 memory KG 复用 extractor）
    │                        │
    │                        └─► KB-10 → KB-11 → KB-12
    │
    ├─► Phase B ──► KB-13 → KB-14 → KB-15
    │                  │
    │                  └─► KB-16 → KB-17 → KB-18
    │
    └─► Phase C ──► KB-19 → KB-20
                       │
                       ├─► KB-21
                       └─► KB-22 ◄── MT-07 hotness（KB-24）
                            │
                            └─► KB-23（Eval · Sprint 18）
```

---

## 三、Phase A — 检索质量（KB-07～KB-12）

**目标**：Recall@5 ≥ 88% · Precision@5 ≥ 90% · P95 检索 < 200ms  
**对标 Sprint**：[08-ROADMAP.md](08-ROADMAP.md) Sprint 15  
**迭代**：I78～I83

| ID | 交付 | 包/路径 | 验收标准 |
|----|------|---------|----------|
| **KB-07** | `@xenova/transformers` bge-m3 真实 embedder | `packages/kb/src/ingest/embedder.ts` · `packages/kb/src/embed-query.ts` | 替换 `embedKbChunkStub`；query/document 同一模型；Vitest 向量维度 1024 |
| **KB-08** | bge-reranker-v2-m3 reranker | `packages/kb/src/retriever/rerank.ts` | search pipeline：RRF top-40 → rerank → top-15；可配置 `rerank: false` |
| **KB-09** | KG entity-link expansion（第三检索流） | `packages/kb/src/retriever/graph-expand.ts` | query → entity match → 1-hop `documented_in`/`depends_on` → chunk_ids；RRF 权重 bm25:0.35 vector:0.45 graph:0.20 |
| **KB-10** | Hierarchical chunk hydrate | `packages/kb/src/retriever/hydrate.ts` | leaf chunk 命中时附加 parent section `contextPrefix` + section 摘要 |
| **KB-11** | Diversity + Recency 后置 | `packages/kb/src/retriever/fuse.ts` | `diversify(maxPerSource=2, maxPerSection=1)` + `applyRecency(halfLifeDays=90)` |
| **KB-12** | `kb_query_logs` + 反馈 API | `packages/db/schema/kb.ts` · `apps/api/src/routes/kb.ts` | 每次 search 写 log；`POST /kb/search/:id/feedback` helpful/not_helpful |

### KB-09 检索时序（目标态）

```
Query
  ├─ Parallel: BM25(30) · Vector(30) · EntityLink→GraphExpand(+15)
  ├─ RRF Fuse (weighted)
  ├─ Rerank top-40 → top-15
  ├─ Hierarchical hydrate
  ├─ Recency × confidence (Phase B 后接入 KB-15)
  └─ Diversify → top-K
```

---

## 四、Phase B — 知识生命周期（KB-13～KB-18）

**目标**：Stale answer rate < 5% · 增量索引保留 chunk 引用稳定 · Inngest 编排 ingestion  
**对标 Sprint**：[08-ROADMAP.md](08-ROADMAP.md) Sprint 15 尾项 + Sprint 16 并行 KB 轨  
**迭代**：I84～I90

| ID | 交付 | 包/路径 | 验收标准 |
|----|------|---------|----------|
| **KB-13** | Evidence-based confidence + provenance | migration · `kb_chunks.provenance` jsonb | confidence 由 `sourceAuthority × recency × feedback` 计算；非默认 1.0 |
| **KB-14** | Supersession chain | `kb_documents.supersedesId` · chunk `status` | active/superseded/archived；检索默认仅 active；Admin 可查历史链 |
| **KB-15** | Freshness rules → retrievalWeight | `config/kb-freshness.yaml` · retriever | help_center 不衰减 · web_crawl 30d · past_conversations 90d 半衰 |
| **KB-16** | Inngest 8 阶段 ingestion | `apps/worker/src/jobs/kb-ingest.ts` | fetch→parse→clean→chunk→enrich→embed→index→notify；brand 级 concurrency |
| **KB-17** | content_hash diff 增量索引 | `packages/kb/src/ingest/diff-index.ts` | 新增/修改/软删；**保留未变 chunk_id** 以稳定 citation |
| **KB-18** | Parsers + 高级 Chunkers | `packages/kb/src/ingest/parser/*` · `chunker/*` | unpdf/mammoth/cheerio+marked；semantic/hierarchical；Contextual Retrieval 可选（Haiku + prompt caching） |

### KB-13 provenance 结构（示例）

```ts
provenance: {
  sourceIds: string[];
  sourceTypes: string[];       // help_center | past_conversations | ...
  confirmedAt: string[];       // ISO timestamps
  conversationId?: string;
  agentId?: string;
  feedbackScore?: number;      // 来自 kb_query_logs 聚合
}
```

### KB-14 与 Wiki v2 supersession 对齐

- 新文档/ chunk **显式 supersede** 旧版，旧版 `status=superseded` **保留可读**
- 不做 blind decay（避免重复踩旧 bug 类知识被 fade 掉）
- 与 [08-ROADMAP.md](08-ROADMAP.md) §九 KB 快照联动：supersede 前可自动 snapshot

---

## 五、Phase C — Compounding 闭环（KB-19～KB-24）

**目标**：Recall@5 ≥ 92% · Crystallization 接受率 ≥ 60% · Eval 闭环自动化  
**对标 Sprint**：[08-ROADMAP.md](08-ROADMAP.md) Sprint 17–18  
**迭代**：I91～I96

| ID | 交付 | 包/路径 | 验收标准 |
|----|------|---------|----------|
| **KB-19** | Crystallization pipeline | `apps/worker/src/jobs/kb-crystallize.ts` | `conversation/closed` + CSAT≥4 → generateObject FAQ → quality gate → index 或 candidate 池 |
| **KB-20** | Contradiction reconcile | `packages/kb/src/lifecycle/reconcile.ts` | 写入时与 kb_entities/FAQ 比对；冲突 → supersession **proposal**（非自动覆盖） |
| **KB-21** | Brand KB Schema | `kb_brand_schemas` 或 `kb_sources.config` | entity_types · ingest_rules · quality_gates · retrieval defaults |
| **KB-22** | Unified Context Orchestrator | `packages/agent/src/context/assembler.ts` | KB + Memory + Memory Tree dedupe；query intent 路由权重 |
| **KB-23** | Eval 闭环 + lifecycle metrics | `packages/kb/src/eval/` | failed query → golden 候选；Recall@5/Precision@5/graph contribution rate 趋势 |
| **KB-24** | Memory Tree hotness → crystallize 优先级 | `packages/memory-tree/` · worker | MT-07 hot topic 优先进入 KB-19 队列 |

### KB-19 Crystallization 三阶段

```
conversation/closed
    ↓ Extract（question, answer, entities, qualityScore）
    ↓ Reconcile（KB-20 contradiction check）
    ↓ Crystallize
         quality ≥ 0.8 → auto-index（source=past_conversations）
         0.6–0.8     → kb_candidates 人工审核
         < 0.6       → 仅 Memory facts，不写 KB
    ↓ Reinforce（KB-12 helpful 反馈 → confidence +）
```

### KB-22 Query routing（示例）

| 意图 | KB 权重 | Memory 权重 | Graph |
|------|--------|--------------|-------|
| factual（产品/政策） | 高 | 低 | entity lookup |
| personal（我的订单/偏好） | 低 | 高 | — |
| troubleshooting | 高 | 中 | error → solution |
| procedural | 中 | 中 | depends_on walk |

---

## 六、辅助项 · KG-05（KB 侧图谱）

Memory 侧 KG-01～04 已完成（`memory_relations`）。KB-09 需要 **KB 文档级实体**：

| ID | 交付 | 依赖 | 验收 |
|----|------|------|------|
| **KG-05** | `kb_entities` / `kb_relations` schema + ingest extractor | KB-03 · KB-16 enrich 步 | entity 抽取写入 KG；graph-expand 可读 |

> 可与 memory extractor 共享 `generateObject` schema，但 **存储命名空间按 brand 隔离**。

---

## 七、指标与验收

| 指标 | KB-01～06 基线 | Phase A | Phase B | Phase C |
|------|---------------|---------|---------|---------|
| Recall@5 | ~80%（设计值） | ≥ 88% | ≥ 90% | ≥ 92% |
| Precision@5 | — | ≥ 90% | ≥ 92% | ≥ 95% |
| Graph contribution | 0% | ≥ 15% queries | ≥ 20% | ≥ 25% |
| Stale answer rate | 未测 | — | < 5% | < 2% |
| P95 retrieval | — | < 200ms | < 200ms | < 200ms |
| Crystallization accept | — | — | — | ≥ 60% auto |

Phase 3 GA 验收（[08-ROADMAP.md](08-ROADMAP.md)）仍保留：Mastra Eval faithfulness ≥ 0.85 · contextual recall ≥ 0.75。

---

## 八、Sprint 映射表

| Sprint | ROADMAP 章节 | 优化 Phase | KB ID | 迭代 |
|--------|-------------|-----------|-------|------|
| **15** W33–W34 | KB / RAG 三流融合 | **Phase A** 全量 + Phase B 启动 | KB-07～12 · KB-13～15 | I78～I83 · I84 起 |
| **16** W35–W36 | Custom Actions + MCP（主轨） | **Phase B** 收尾 | KB-16～18 · KG-05 | I87～I90 |
| **17** W37–W38 | Roadmap + Changelog + 国产化 | **Phase C** 启动 | KB-19～21 | I91～I93 |
| **18** W39–W40 | 评测 + 发布准备 | **Phase C** 收尾 + Eval | KB-22～24 · KB-23 与 Sprint 18 Eval 合并 | I94～I96 |

---

## 九、相关文档

| 文档 | 关系 |
|------|------|
| [11-RAG-KNOWLEDGE.md](11-RAG-KNOWLEDGE.md) | 完整 RAG 设计（本文件为 **增量优化** 执行路线） |
| [10-AGENT-MEMORY.md](10-AGENT-MEMORY.md) | Memory decay / consolidation；与 KB freshness 分工 |
| [15-MEMORY-TREE.md](15-MEMORY-TREE.md) | KB-24 hotness · KB-22 tree scope |
| [12-STORAGE-ABSTRACTION.md](12-STORAGE-ABSTRACTION.md) | VectorStore / FTSStore / hybridSearch |
| [08-ROADMAP-TODO.md](08-ROADMAP-TODO.md) | 逐项迭代状态 KB-07～24 |

---

*文档版本：2026-06 · 状态：执行路线定稿 · 实现跟踪见 08-ROADMAP-TODO.md*
