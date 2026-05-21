# KeenAI Alpha

> **v0.1-alpha** — 自托管客服 MVP，可试用、可反馈，API 与数据模型仍可能变更。

## 包含功能

| 模块 | 能力 |
|------|------|
| **Auth** | 邮箱登录 · Magic Link · JWT · RBAC（Owner / Admin / Agent / Lite） |
| **Inbox** | 会话列表 · 详情 · 回复 · 内部备注 · SSE / WebSocket |
| **Messenger Widget** | Preact 嵌入组件 · HMAC 身份验证 · 实时消息 |
| **Email Channel** | IMAP 拉取 · SMTP 发送 · Webhook 入站 |
| **Copilot** | AI 草稿（OpenAI / Anthropic / DeepSeek / Kimi / Gemini / Ollama / Stub） |
| **Macros** | Slash 命令 · Tiptap 富文本 · @mention · 图片上传 |
| **Workflows** | `first_message` / `customer_unresponsive` 触发 · send/assign/close · React Flow Builder |
| **Notifications** | 应用内通知 · WebSocket 推送 |
| **Search** | FTS5 全文检索 |

## 快速开始

### 本地开发

```bash
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm seed          # owner@keenai.local / keenai-demo-12
pnpm dev           # API :8090 · Dashboard :3000
pnpm test
pnpm smoke
```

### Docker Lite（单容器 API + Dashboard）

```bash
docker compose --profile lite up --build -d
# Dashboard → http://localhost:3000
# API       → http://localhost:8090
# 演示账号   → owner@keenai.local / keenai-demo-12（首次自动 seed）
```

可选 Inngest Dev Server（需 `.env` 中设置 `INNGEST_EVENT_KEY`）：

```bash
docker compose --profile lite --profile inngest up --build -d
# Inngest UI → http://localhost:8288
```

### Workflow 定时扫描

| 模式 | 配置 | 行为 |
|------|------|------|
| **Sync（默认）** | `WORKFLOW_SCAN_INTERVAL_MINUTES=5` | API 进程内定时扫描 |
| **Inngest** | `INNGEST_EVENT_KEY=...` | Inngest cron `*/5 * * * *`（可用 `INNGEST_SCAN_CRON` 覆盖） |
| **手动** | `WORKFLOW_SCAN_INTERVAL_MINUTES=0` | `POST /api/v1/workflows/jobs/scan-unresponsive` |

## 已知限制

- 仅 LibSQL / SQLite 方言（PostgreSQL 矩阵待续）
- Workflow 为 MVP 子集（3 Trigger · 3 Block），无 `wait` / 分支 / HTTP
- Copilot 无流式输出到 UI
- Widget 无 Home 页与 CSAT
- 无 Tickets / Feedback Portal / Help Center
- OTel / Sentry 为占位
- `bun build --compile` 单二进制待续

## 反馈

欢迎 [GitHub Issues](https://github.com/ai77/keenai/issues) 与 [Discussions](https://github.com/ai77/keenai/discussions)。

详见 [08-ROADMAP.md](./08-ROADMAP.md) · [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md)。
