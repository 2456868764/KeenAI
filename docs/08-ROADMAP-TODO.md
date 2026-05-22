# KeenAI 阶段执行 TODO（跟踪 `08-ROADMAP.md`）

> 每完成一项：**实现 → `pnpm test` / `pnpm lint` → `git commit`**。  
> 状态：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成

---

## 当前迭代 · Iteration 15（Multimodal MVP）

| ID | 项 | 状态 |
|----|-----|------|
| I15-00 | 多模态技术方案文档 [14-MULTIMODAL.md](./14-MULTIMODAL.md) + 关联 doc/roadmap 更新 | [x] |
| I15-01 | `@keenai/shared` MessagePart / MessageKind Zod（MM-01） | [x] |
| I15-02 | messages + attachments 读写打通；API 返回 attachments（MM-02） | [x] |
| I15-03 | `GET /attachments/:id/content` 鉴权代理（MM-05） | [x] |
| I15-04 | Widget 发图 + Inbox 图片 bubble（MM-03） | [x] |
| I15-05 | Email 附件 ingest（MM-04） | [x] |
| I15-06 | 测试 · roadmap · commits | [x] |

**下一迭代**：Copilot vision（MM-06）· Workflow send_message 附件（MM-07）

---

## 历史迭代

| 迭代 | 主题 | 状态 |
|------|------|------|
| I14 | Portal Auth + Postgres Core + IMAP Docs | [x] |
| I13 | IMAP ingest + Postgres 骨架 + Portal API | [x] |
| I12 | Ticket 详情 + imapflow + PostgresStore ping | [x] |

---

## Phase 2 · Multimodal MVP（Sprint 10b）

| MM ID | 项 | 状态 |
|-------|-----|------|
| MM-01 | shared MessagePart schema | [x] |
| MM-02 | insertMessage + attachments API | [x] |
| MM-03 | Widget + Dashboard 图片 | [x] |
| MM-04 | Email 附件 ingest | [x] |
| MM-05 | attachment content proxy | [x] |
| MM-06 | Copilot native vision | [ ] |
| MM-07 | Workflow send_message attachments | [ ] |

## Phase 3 · Multimodal Agent 完整版

| MM ID | 项 | 状态 |
|-------|-----|------|
| MM-10 | STT transcribe pipeline | [ ] |
| MM-11 | video thumbnail + 播放 | [ ] |
| MM-12 | parseAgentResponse + Keeni outbound 图 | [ ] |
| MM-13 | TTS tool + audio 出站 | [ ] |
| MM-14 | generate_image tool | [ ] |
| MM-15 | Telegram/Slack IM 多模态 | [ ] |

---

## Phase 0 · 工程地基

| P0-11 OTel | [ ] |
| P0-13 commitlint | [x] |
| P0-14 Fumadocs / CLI | [~] |

---

见 [08-ROADMAP.md](./08-ROADMAP.md) · [14-MULTIMODAL.md](./14-MULTIMODAL.md) · [ALPHA.md](./ALPHA.md) · [IMAP.md](./IMAP.md).
