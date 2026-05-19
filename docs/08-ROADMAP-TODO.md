# KeenAI 阶段执行 TODO（跟踪 `08-ROADMAP.md`）

> 每完成一项：**实现 → `pnpm test` / `pnpm lint` → `git commit`**。  
> 状态：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成

---

## 当前迭代 · Iteration 3（Sprint 2 收尾 + P0 日志）

| ID | 项 | 状态 |
|----|-----|------|
| I3-00 | 同步本文件与路线图已完成项 | [x] |
| I3-01 | **P1-S2-04** Messages 模块（Panel 组件 + 发送态） | [x] |
| I3-02 | **P1-S2-05** Widget 移动端响应式 + Shadow DOM | [x] |
| I3-03 | **P1-S2-05** 构建体积检查脚本 | [x] |
| I3-04 | **P0-09** API `LOG_FORMAT=json` 生产日志 | [x] |

**下一迭代（Sprint 3 预告）**：Email Channel · IMAP Worker · SMTP（见 `08-ROADMAP.md` § Sprint 3）

---

## Phase 0 · 工程地基（M0）

| ID | 项 | 状态 |
|----|-----|------|
| P0-01 | Monorepo + Turbo + Biome + Vitest | [x] |
| P0-02 | Docker Compose profiles | [x] |
| P0-03 | `@keenai/shared` / `storage` / `auth` / `api` | [x] |
| P0-04 | `@keenai/ui` + Storybook | [x] |
| P0-05 | Auth schema + JWT + magic link + seed | [x] |
| P0-06 | CI：lint + test + typecheck + `db:migrate` | [x] |
| P0-07 | OpenAPI：`GET /api/v1/openapi.json` | [x] |
| P0-08 | LICENSE + CONTRIBUTING | [x] |
| P0-09 | pino 结构化日志（JSON 模式） | [x] |
| P0-10 | `apps/dashboard` + `apps/widget` | [x] |
| P0-11 | OTel 完整导出 | [ ] |
| P0-12 | Bun + Node 双工具链说明 | [x] |
| P0-13 | commitlint（可选） | [ ] |
| P0-14 | Fumadocs / `bunx keenai` CLI | [ ] |

---

## Phase 1 · MVP

### Sprint 1（W5–W6）

| ID | 项 | 状态 |
|----|-----|------|
| P1-S1-01 | Conversation schema + migration 0002 | [x] |
| P1-S1-02 | Conversations REST + SSE + WS | [x] |
| P1-S1-03 | Dashboard Inbox | [x] |
| P1-S1-04 | SSE 实时 + 乐观发送 | [x] |
| P1-S1-05 | LibSQL contract test | [x] |
| P1-S1-06 | PATCH 会话生命周期（close/status） | [x] |
| P1-S1-07 | Dashboard 关闭 + J/K | [x] |

### Sprint 2（W7–W8）Messenger Widget

| ID | 项 | 状态 |
|----|-----|------|
| P1-S2-01 | `apps/widget` Vite + Preact 骨架 | [x] |
| P1-S2-02 | `KeenAI.boot()` embed SDK | [x] |
| P1-S2-03 | HMAC 身份验证 | [x] |
| P1-S2-04 | Messages 模块 + WSS | [x] |
| P1-S2-05 | 移动端响应式 + 体积预算 | [x] |

### Sprint 3–6

见 [08-ROADMAP.md](./08-ROADMAP.md) §三。

---

## Phase 2–4

按 [08-ROADMAP.md](./08-ROADMAP.md) §四–§六 展开。
