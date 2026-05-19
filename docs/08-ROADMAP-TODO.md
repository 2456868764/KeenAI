# KeenAI 阶段执行 TODO（跟踪 `08-ROADMAP.md`）

> 每完成一项：**实现 → `pnpm test` / `pnpm lint` → `git commit`**。  
> 状态：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成

---

## 当前迭代 · Iteration 4（Sprint 3 · Email Channel）

| ID | 项 | 状态 |
|----|-----|------|
| I4-00 | 同步路线图 Sprint 3 条目 | [x] |
| I4-01 | `@keenai/channels-email` 包骨架 | [x] |
| I4-02 | MIME 解析（mailparser） | [x] |
| I4-03 | 邮件 Threading 算法 | [x] |
| I4-04 | SMTP 出站 + 基础模板 | [x] |
| I4-05 | Inbound webhook（SES / SendGrid / Mailgun + raw MIME） | [x] |

**下一迭代（Sprint 4 预告）**：Inbox 增强 · Tiptap · 虚拟滚动 · 文件上传

---

## 历史 · Iteration 3（已完成）

| ID | 项 | 状态 |
|----|-----|------|
| I3-00 … I3-04 | Widget 收尾 + JSON 日志 | [x] |

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
| P0-07 | OpenAPI | [x] |
| P0-08 | LICENSE + CONTRIBUTING | [x] |
| P0-09 | pino JSON 日志 | [x] |
| P0-10 | dashboard + widget | [x] |
| P0-11 | OTel 完整导出 | [ ] |
| P0-12 | Bun + Node 说明 | [x] |
| P0-13 | commitlint | [ ] |
| P0-14 | Fumadocs / CLI | [ ] |

---

## Phase 1 · MVP

### Sprint 1–2

| Sprint | 状态 |
|--------|------|
| S1 Conversation + Inbox | [x] |
| S2 Messenger Widget | [x] |

### Sprint 3（W9–W10）Email Channel

| ID | 项 | 状态 |
|----|-----|------|
| P1-S3-01 | `@keenai/channels-email` + MIME + threading | [x] |
| P1-S3-02 | SMTP 出站 + 模板 | [x] |
| P1-S3-03 | Inbound webhooks + ingest API | [x] |
| P1-S3-04 | IMAP Worker（imapflow · Inngest） | [ ] |
| P1-S3-05 | BullMQ `email:send` 队列 | [ ] |
| P1-S3-06 | DKIM 文档与配置 | [ ] |

### Sprint 4–6

见 [08-ROADMAP.md](./08-ROADMAP.md) §三。

---

## Phase 2–4

按 [08-ROADMAP.md](./08-ROADMAP.md) §四–§六 展开。
