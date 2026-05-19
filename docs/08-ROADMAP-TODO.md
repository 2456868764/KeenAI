# KeenAI 阶段执行 TODO（跟踪 `08-ROADMAP.md`）

> 每完成一项：**实现 → `pnpm test` / `pnpm lint` → `git commit`**。  
> 状态：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成

---

## 当前迭代 · Iteration 6（Sprint 4 续 · 通知 / 搜索 / 上传）

| ID | 项 | 状态 |
|----|-----|------|
| I6-00 | 同步路线图 Sprint 4 续 | [x] |
| I6-01 | `notifications` 表 + Drizzle migration | [x] |
| I6-02 | 通知 API（列表 / 已读）+ 分配时创建 + WSS | [x] |
| I6-03 | LibSQL FTS5 `FTSStore` + 消息索引 + `GET /search` | [x] |
| I6-04 | 文件上传（本地 presign + PUT） | [x] |
| I6-05 | Dashboard 通知铃铛 + 会话搜索框 | [x] |
| I6-06 | Tiptap 富文本编辑器（mention / 附件待续） | [ ] |

**下一迭代（Sprint 4 收尾 / Sprint 5）**：Tiptap · S3/MinIO 上传 · @mention · Copilot 草稿

---

## 历史迭代

| 迭代 | 主题 | 状态 |
|------|------|------|
| I5 | Inbox 增强（虚拟滚动 / Snooze / 内部 Note） | [x] |
| I4 | Email Channel | [x] |
| I3 | Widget 收尾 | [x] |
| I2 | Widget HMAC + WSS | [x] |
| I1 | Inbox + API 基建 | [x] |

---

## Phase 0 · 工程地基

| P0-11 OTel | [ ] |
| P0-13 commitlint | [ ] |
| P0-14 Fumadocs / CLI | [ ] |
| 其余 P0 | [x] |

---

## Phase 1 · MVP

| Sprint | 状态 |
|--------|------|
| S1–S2 Inbox + Widget | [x] |
| S3 Email（核心） | [x] |
| S3 IMAP / BullMQ / DKIM | [ ] |
| S4 Inbox 增强（核心） | [x] |
| S4 通知 / FTS / 上传（MVP） | [x] |
| S4 Tiptap 完整 | [ ] |
| S5–S6 Copilot / Workflow | [ ] |

---

## Phase 2–4

见 [08-ROADMAP.md](./08-ROADMAP.md).
