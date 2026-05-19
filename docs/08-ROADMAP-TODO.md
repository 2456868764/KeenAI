# KeenAI 阶段执行 TODO（跟踪 `08-ROADMAP.md`）

> 每完成一项：**实现 → `pnpm test` / `pnpm lint` → `git commit`**。  
> 状态：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成

---

## Phase 0 · 工程地基（M0）

| ID | 项 | 状态 |
|----|-----|------|
| P0-01 | Monorepo + Turbo + Biome + Vitest | [x] |
| P0-02 | Docker Compose profiles | [x] |
| P0-03 | `@keenai/shared` / `storage` / `auth` / `api` | [x] |
| P0-04 | `@keenai/ui` + Storybook | [x] |
| P0-05 | Auth schema + JWT + magic link + seed | [x] |
| P0-06 | **CI**：lint + test + typecheck + `db:migrate` | [x] |
| P0-07 | **OpenAPI**：`GET /api/v1/openapi.json` | [x] |
| P0-08 | **LICENSE** (AGPL-3.0) + **CONTRIBUTING** | [x] |
| P0-09 | pino 结构化日志（API 已接入，补 JSON 模式文档） | [ ] |
| P0-10 | 包结构占位：`apps/dashboard` 已建；`widget` 骨架 | [x] |
| P0-11 | OTel 完整导出（占位 → 后续） | [ ] |
| P0-12 | Bun + Node 双工具链说明（README） | [x] |
| P0-13 | commitlint（可选，P1） | [ ] |
| P0-14 | Fumadocs 文档站 / `bunx keenai` CLI | [ ] |

---

## Phase 1 · MVP

### Sprint 1（W5–W6）Conversation + Inbox

| ID | 项 | 状态 |
|----|-----|------|
| P1-S1-01 | Conversation schema + migration 0002 | [x] |
| P1-S1-02 | Conversations REST + SSE + WS | [x] |
| P1-S1-03 | Dashboard Inbox（Views + List + Thread） | [x] |
| P1-S1-04 | SSE 实时 + 乐观发送 | [x] |
| P1-S1-05 | LibSQL contract test | [x] |
| P1-S1-06 | **Conversation 生命周期 API**（close / status PATCH） | [ ] |
| P1-S1-07 | **Dashboard**：关闭会话 + 键盘 J/K（基础） | [ ] |

### Sprint 2（W7–W8）Messenger Widget

| ID | 项 | 状态 |
|----|-----|------|
| P1-S2-01 | `apps/widget` Vite + Preact 骨架 | [x] |
| P1-S2-02 | `KeenAI.boot()` embed SDK | [x] |
| P1-S2-03 | HMAC 身份验证 | [x] |
| P1-S2-04 | Messages 模块 + WSS 客户端 | [~] |
| P1-S2-05 | 移动端响应式 + 体积预算 | [ ] |

### Sprint 3–6

见 [08-ROADMAP.md](./08-ROADMAP.md) §三（Email / Inbox 增强 / Copilot / Workflow / Alpha 发布）。

---

## Phase 2–4

按 [08-ROADMAP.md](./08-ROADMAP.md) §四–§六 展开；本文件随迭代更新。

---

## 当前迭代顺序（建议）

1. P0-06 → P0-08（基建收尾）  
2. P1-S1-06 → P1-S1-07（Inbox 可运营）  
3. P1-S2-01 → P1-S2-02（Widget 骨架）
