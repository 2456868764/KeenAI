# KeenAI 阶段执行 TODO（跟踪 `08-ROADMAP.md`）

> 每完成一项：**实现 → `pnpm test` / `pnpm lint` → `git commit`**。  
> 状态：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成

---

## 当前迭代 · Iteration 8（Sprint 5 收尾 + Sprint 6 Workflow MVP）

| ID | 项 | 状态 |
|----|-----|------|
| I8-00 | 热修：上传目录 `findRepoRoot` 路径 | [x] |
| I8-01 | Anthropic + Ollama LLM Provider | [x] |
| I8-02 | `@keenai/workflow` 包：Zod DSL + 同步 Executor | [x] |
| I8-03 | Workflow DB（workflows / workflow_runs）+ REST API | [x] |
| I8-04 | Trigger：`first_message` 自动执行 + 集成测试 | [x] |
| I8-05 | Block：`send_message` / `assign` / `close` | [x] |
| I8-06 | Dashboard Workflow 列表页（React Flow Builder 下一批） | [ ] |
| I8-07 | Trigger：`customer_unresponsive`（定时扫描 stub） | [ ] |
| I8-08 | Inngest 适配层（可选 · 替换同步 Executor） | [ ] |

**下一迭代**：React Flow Builder · Docker lite profile · Alpha 发布

---

## 历史迭代

| 迭代 | 主题 | 状态 |
|------|------|------|
| I7 | Copilot MVP + Tiptap + Macros DB + 图片上传 | [x] |
| I6 | 通知 / FTS / 上传 | [x] |
| I5 | Inbox 增强 | [x] |
| I4 | Email Channel | [x] |
| I3 | Widget 收尾 | [x] |

---

## Phase 1 · MVP

| Sprint | 状态 |
|--------|------|
| S4 Tiptap + mention + slash macros | [x] |
| S5 Copilot 草稿 + 多 Provider | [x] |
| S6 Workflow MVP | [~] |

---

## Phase 0 · 工程地基

| P0-11 OTel | [ ] |
| P0-13 commitlint | [ ] |
| P0-14 Fumadocs / CLI | [ ] |

---

见 [08-ROADMAP.md](./08-ROADMAP.md).
