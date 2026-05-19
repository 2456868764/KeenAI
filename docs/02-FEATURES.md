# KeenAI 功能清单与 Featurebase 对标矩阵

> **Legend**：✅ 已规划必做 · 🔄 简化版 · 🔮 后期版本 · ❌ 不做

---

## 一、Support Platform 模块

### 1.1 Inbox（统一收件箱）

| 功能 | Featurebase | KeenAI 状态 | KeenAI 实现要点 |
|------|:-----------:|:-----------:|------------------|
| 全渠道统一视图 | ✅ | ✅ | Messenger + Email + Slack |
| Team Inboxes | ✅ | ✅ | 按团队分组 |
| 对话分配（手动/自动） | ✅ | ✅ | Assignee/Team 字段 |
| 内部 Notes + @mention | ✅ | ✅ | 富文本 + 通知 |
| 命令面板 `Cmd+K` | ✅ | ✅ | cmdk-go + 前端 cmdk |
| 搜索与过滤 | ✅ | ✅ | Meilisearch 全文 + 多字段过滤 |
| 排序（最新/SLA/优先级） | ✅ | ✅ | DB 索引 |
| Office Hours | ✅ | ✅ | 时区感知 |
| Expected Response Time | ✅ | ✅ | 自动计算 |
| Conversation Data Attributes | ✅ | ✅ | 自定义字段 |
| Snooze（搁置） | ✅ | ✅ | 定时唤醒 |
| Close / Reopen | ✅ | ✅ | 状态机 |
| Recent Page Views | ✅ | 🔄 | JS SDK 上报 |
| AI Replies（按 Cmd+K 起草） | ✅ | ✅ | Copilot 集成 |
| Macros（消息模板） | ✅ | ✅ | 变量替换 |
| SLA 管理 | ✅ | ✅ | 多策略 + 预警 |
| AI Inbox Translation | ✅ | ✅ | LLM 双向翻译 |
| 移动端 App | ✅ | 🔮 | RN 后期 |
| 桌面通知 | ✅ | ✅ | Web Push API |
| 富文本编辑器（Notion 风格） | ✅ | ✅ | Tiptap |
| 文件/图片/视频上传 | ✅ | ✅ | S3 + MinIO |
| 代码块 / 表格 / 嵌入 | ✅ | ✅ | Tiptap 扩展 |
| Impersonation 警告 | ✅ | ✅ | 审计日志 |
| Support Analytics | ✅ | ✅ | 基础数据看板 |
| 收集 Feedback from chat | ✅ | ✅ | 一键创建 Post |

---

### 1.2 Channels（渠道）

#### Messenger Widget

| 功能 | Featurebase | KeenAI 状态 | 实现要点 |
|------|:-----------:|:-----------:|----------|
| 嵌入式 Widget（JS SDK） | ✅ | ✅ | Preact + Vite 单文件 |
| Home Module（首页卡片） | ✅ | ✅ | 可配置 Cards |
| Messages Module | ✅ | ✅ | 历史对话列表 |
| Help Module（嵌入 Help Center） | ✅ | ✅ | iframe + AI Search |
| Changelog Module | ✅ | ✅ | 最新 N 条 |
| Tickets Tab | ✅ | ✅ | 客户自助提交 |
| 多品牌主题 | ✅ | ✅ | Tenant 级配置 |
| 明暗模式 | ✅ | ✅ | 自适应 |
| 多语言（40+） | ✅ | 🔄 | 5-10 种起步 |
| 身份验证 SDK（HMAC） | ✅ | ✅ | userHash 校验 |
| 控制谁可发起对话 | ✅ | ✅ | Visitor/User/None |
| 离线消息 | ✅ | ✅ | Email 留言 |
| iOS / Android 原生 SDK | ✅ | 🔮 | 后期 |

#### Email Support

| 功能 | Featurebase | KeenAI 状态 | 实现要点 |
|------|:-----------:|:-----------:|----------|
| 邮件转发到 Inbox | ✅ | ✅ | IMAP + Postal 双方案 |
| 自定义发件域名 | ✅ | ✅ | DKIM/SPF/DMARC |
| Email Auto-replies | ✅ | ✅ | Workflow Action |
| 多 Brand 邮件 | ✅ | ✅ | 域名→Brand 路由 |
| 邮件签名 | ✅ | ✅ | 模板 |
| 邮件多语言 | ✅ | ✅ | i18n 模板 |
| 附件支持 | ✅ | ✅ | S3 存储 |
| Convert to Ticket | ✅ | ✅ | Workflow |

#### 其他渠道

| 渠道 | Featurebase | KeenAI 状态 | 优先级 |
|------|:-----------:|:-----------:|--------|
| Slack | 🔜 | ✅ | P1（差异化优势） |
| Discord | ✅ | ✅ | P1 |
| WhatsApp | ✅ | 🔮 | P2 |
| Telegram | ❌ | ✅ | P1（中文市场） |
| 微信 | ❌ | 🔮 | P2（中文市场） |
| Facebook Messenger | ❌ | 🔮 | P3 |
| LINE | ❌ | 🔮 | P3（日本市场） |

---

### 1.3 Conversations（对话）

| 功能 | Featurebase | KeenAI 状态 |
|------|:-----------:|:-----------:|
| Outbound（客服主动发起） | ✅ | ✅ |
| 手动 Assign | ✅ | ✅ |
| 自动 Assign（Workflow） | ✅ | ✅ |
| Loop in teammates | ✅ | ✅ |
| Snooze | ✅ | ✅ |
| Close + 防回复 | ✅ | ✅ |
| 手动 Qualify Leads | ✅ | ✅ |
| 自动 Tag（Workflow） | ✅ | ✅ |
| 手动 Tag | ✅ | ✅ |
| 转译（多语言） | ✅ | ✅ |
| Markdown / 富文本 | ✅ | ✅ |
| Reaction（表情） | ❌ | ✅（差异化） |
| 输入中提示 | ✅ | ✅ |
| 已读回执 | ✅ | ✅ |

---

### 1.4 Tickets（工单）

| 功能 | Featurebase | KeenAI 状态 |
|------|:-----------:|:-----------:|
| Customer Ticket | ✅ | ✅ |
| Back-office Ticket | ✅ | ✅ |
| Tracker Ticket（批量同步） | ✅ | ✅ |
| 自定义 Ticket Type | ✅ | ✅ |
| 自定义 Field | ✅ | ✅ |
| 自定义 Status（4 类） | ✅ | ✅ |
| 状态变更通知 | ✅ | ✅ |
| Ticket Portal（独立页面） | ✅ | ✅ |
| 自定义域名（tickets.x.com） | ✅ | ✅ |
| Messenger Tickets Tab | ✅ | ✅ |
| Auto-convert email to ticket | ✅ | ✅ |
| Workflow 自动创建 | ✅ | ✅ |
| 客户自助提交表单 | ✅ | ✅ |
| API 创建 | ✅ | ✅ |
| 进度条可视化 | ✅ | ✅ |
| Linear/Jira/GitHub 集成 | ✅ | ✅ |

---

### 1.5 Workflows（无代码自动化）

> **完整技术方案**：详见 [13-WORKFLOW.md](13-WORKFLOW.md)（13 Trigger + 21 Block + Builder + Engine + 模板）。

#### Triggers（13 + 3）

| # | Trigger | Featurebase | KeenAI 状态 | 类别 |
|---|---------|:-----------:|:-----------:|------|
| 1 | Customer visits a page | ✅ | ✅ | Outbound |
| 2 | Customer opens new conversation (Messenger) | ✅ | ✅ | New conversation |
| 3 | Customer sends their first message | ✅ | ✅ | New conversation |
| 4 | Customer sends any message | ✅ | ✅ | During conversation |
| 5 | Teammate sends any message | ✅ | ✅ | During conversation |
| 6 | Conversation state change（Closed/Snoozed/Open） | ✅ | ✅ | During conversation |
| 7 | Assigned to team | ✅ | ✅ | During conversation |
| 8 | Assigned to team member | ✅ | ✅ | During conversation |
| 9 | Customer unresponsive（≥30s ≤14d） | ✅ | ✅ | During conversation |
| 10 | Teammate unresponsive（≥30s ≤14d） | ✅ | ✅ | During conversation |
| 11 | Teammate adds a note | ✅ | ✅ | During conversation |
| 12 | Ticket created | ✅ | ✅ | Ticket |
| 13 | Teammate changes ticket state | ✅ | ✅ | Ticket |
| 14 | **Schedule（定时 cron）** | ❌ | ✅ | 🆕 差异化 |
| 15 | **Webhook 入站触发** | ❌ | ✅ | 🆕 差异化 |
| 16 | **Event Match（自定义业务事件）** | ❌ | ✅ | 🆕 差异化 |

#### Trigger 配置（所有 Trigger 通用）

| 配置项 | Featurebase | KeenAI |
|--------|:-----------:|:------:|
| Channels（web/email/slack/discord/...） | ✅ | ✅ |
| Audience filters（match all/any + 规则数组） | ✅ | ✅ |
| Send frequency（once / on schedule / every time + 每 X 天） | ✅ | ✅ |
| End condition（max sends / ends at） | ✅ | ✅ |
| Send time（any / inside office hours / outside） | ✅ | ✅ |
| `page_view` URL + time-on-page 规则 | ✅ | ✅ |
| Unresponsive inactivity 时长 | ✅ | ✅ |
| Test target（仅自己/团队可见） | ✅ | ✅ |

#### Action Blocks（21 + 4）

| Block | Featurebase | KeenAI 状态 | 备注 |
|-------|:-----------:|:-----------:|------|
| Let Keeni AI answer | ✅ | ✅ | Mount Mastra Agent + outcome routing |
| Send Message | ✅ | ✅ | Tiptap rich + dynamic variables |
| Show expected reply time | ✅ | ✅ | 拉 Office Hours / Avg Reply Time |
| Reply Buttons（+ free text 开关） | ✅ | ✅ | step.waitForEvent |
| Branches（首匹配） | ✅ | ✅ | first-match wins |
| Apply Rules（全匹配并行） | ✅ | ✅ | parallel fan-out |
| Collect Data（表单 → user/conv attribute） | ✅ | ✅ | 不可重复写入已存在 attribute |
| Collect Customer Reply（2s 缓冲） | ✅ | ✅ | step.waitForEvent + 2s 防抖 |
| Disable Customer Reply | ✅ | ✅ | composer 切换禁用 |
| Wait（可中断：customer/teammate reply/close） | ✅ | ✅ | 完整对齐 Featurebase 中断语义 |
| Snooze（reply 中断） | ✅ | ✅ | step.sleepUntil + waitForEvent |
| Close | ✅ | ✅ | – |
| Reopen | ❌ | ✅ | 🆕 差异化 |
| Assign（个人/团队/round-robin/least-busy） | ✅ | ✅ | – |
| Mark as Priority | ✅ | ✅ | – |
| Tag end user | ✅ | ✅ | – |
| Tag conversation | ✅ | ✅ | – |
| Add Note（@mention） | ✅ | ✅ | – |
| Apply SLA | ✅ | ✅ | – |
| CSAT（preventAfter / preventChangeAfter / waitForRating + 三 channel） | ✅ | ✅ | 完整 toggle 矩阵对齐 |
| Set Ticket State | ✅ | ✅ | – |
| Send Ticket Form | ✅ | ✅ | – |
| Convert to Ticket | ✅ | ✅ | – |
| **HTTP Request（HMAC/Bearer/沙箱）** | ❌ | ✅ | 🆕 差异化 |
| **Script Block（`isolated-vm` JS 沙箱）** | ❌ | ✅ | 🆕 Owner 启用 |
| **MCP Call（调外部 MCP server tool）** | ❌ | ✅ | 🆕 差异化 |
| **Webhook Emit（出站）** | ❌ | ✅ | 🆕 差异化 |

#### 行为对齐

| 行为 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| Customer-facing 仅首个匹配 workflow 生效 | ✅ | ✅ |
| Background workflows 全部并行执行 | ✅ | ✅ |
| Workflow 排序拖拽（sortOrder） | ✅ | ✅ |
| Earliest remaining customer 规则 | ✅ | ✅ |
| Auto-close abandoned conversations（1/3/5/7/10/15/30/60 min） | ✅ | ✅ |
| Dynamic Variables（`{First name}` 等） | ✅ | ✅ |
| Conversation Rating 在分支条件中可读 | ✅ | ✅ |

#### Builder

| 功能 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| 可视化画布（zoom/pan, 不可拖动节点） | ✅ | ✅ |
| `+ Add step` 步骤插入 | ✅ | ✅ |
| Branch / Reply Button 编辑器 | ✅ | ✅ |
| 模板库（11 个，含 Featurebase 全部 + 2 差异化模板） | ✅ | ✅ |
| 测试模式（按 email 限定到自己） | ✅ | ✅ |
| 多版本管理 + 一键回滚 | ❌ | ✅ |
| **Shadow Run（在历史对话上重放新版本）** | ❌ | ✅ |
| 执行日志 / Trace（Inngest dashboard 嵌入） | 🔄 | ✅ |
| 失败重试（step 级，可配） | 🔄 | ✅ |
| **Eval Harness（黄金用例 + Mastra Eval）** | ❌ | ✅ |

---

### 1.6 AI（Keeni AI Agent + Copilot）

#### Keeni AI Agent（面向客户）

| 功能 | Featurebase Fibi | KeenAI Keeni |
|------|:----------------:|:------------:|
| 自动回答问题 | ✅ | ✅ |
| 基于 Help Center | ✅ | ✅ |
| 基于历史对话 | ✅ | ✅ |
| 基于 Feedback/Roadmap/Changelog | ✅ | ✅ |
| 自动提交 Feedback Post | ✅ | ✅ |
| 智能去重（匹配已有 Post） | ✅ | ✅ |
| 自动订阅用户 | ✅ | ✅ |
| Custom Actions（外部 API） | ✅ | ✅ |
| API Request 配置（4 步） | ✅ | ✅ |
| 内置变量（email/userId/userType） | ✅ | ✅ |
| HMAC 身份验证 | ✅ | ✅ |
| Custom Training Sources | ✅ | ✅ |
| - Files（PDF/Word） | ✅ | ✅ |
| - Websites（Crawl） | ✅ | ✅ |
| - Q&A Snippets | ✅ | ✅ |
| - Notion/Confluence | ✅ | 🔄 |
| Brand Voice 自定义 | ✅ | ✅ |
| 多语言（40+） | ✅ | 🔄（10+） |
| Simple Deploy（Messenger） | ✅ | ✅ |
| Advanced Deploy（Workflow） | ✅ | ✅ |
| Email 渠道部署 | ✅ | ✅ |
| 邮件 AI 披露 | ✅ | ✅ |
| Resolution 统计 | ✅ | ✅ |
| 自动 CSAT | ✅ | ✅ |
| Auto-close 配置 | ✅ | ✅ |
| Topic 分类 | ✅ | ✅ |
| **本地 Ollama 支持** | ❌ | ✅（差异化） |
| **多 LLM Provider 切换** | ❌ | ✅（差异化） |
| **Token 用量监控** | 🔄 | ✅ |
| **Action Marketplace** | ❌ | 🔮（差异化） |

#### Copilot（面向客服）

| 功能 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| Inbox 内 AI 助手 | ✅ | ✅ |
| 基于知识库生成回复 | ✅ | ✅ |
| 内部问答（onboarding） | ✅ | ✅ |
| 改写/翻译/缩短 | ✅ | ✅ |
| 引用来源 | ✅ | ✅ |
| 历史对话上下文 | ✅ | ✅ |
| Macros 集成 | ✅ | ✅ |
| 多语言 | ✅ | ✅ |

---

## 二、Product Suite 模块

### 2.1 Feedback Portal

| 功能 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| 公开/私密 Board | ✅ | ✅ |
| 用户投票 | ✅ | ✅ |
| 评论与讨论 | ✅ | ✅ |
| 分类（Category） | ✅ | ✅ |
| 状态（Open/Planned/...） | ✅ | ✅ |
| 自定义状态 | ✅ | ✅ |
| In-app Widget 收集 | ✅ | ✅ |
| Bug 报告专用表单 | ✅ | ✅ |
| 自动去重（AI） | ✅ | ✅ |
| 按收入排序 | ✅ | ✅ |
| 用户分群过滤 | ✅ | ✅ |
| AI 优先级洞察 | ✅ | ✅ |
| 自动通知订阅者 | ✅ | ✅ |
| Public Roadmap | ✅ | ✅ |
| 自定义域名 | ✅ | ✅ |
| 自定义品牌 | ✅ | ✅ |
| 嵌入式 Widget | ✅ | ✅ |
| Slack/Discord 同步 | ✅ | ✅ |
| Linear/Jira 双向同步 | ✅ | ✅ |
| HubSpot 集成 | ✅ | ✅ |

### 2.2 Roadmap

| 功能 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| 看板视图（Kanban） | ✅ | ✅ |
| 时间轴视图 | ✅ | ✅ |
| 自定义列 | ✅ | ✅ |
| 拖拽排序 | ✅ | ✅ |
| ETA 日期 | ✅ | ✅ |
| 公开/私密切换 | ✅ | ✅ |
| 嵌入到 Messenger | ✅ | ✅ |
| 状态变更通知 | ✅ | ✅ |

### 2.3 Changelog

| 功能 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| 公开页面 | ✅ | ✅ |
| 自定义域名 | ✅ | ✅ |
| In-app Widget（弹窗） | ✅ | ✅ |
| 邮件通知 | ✅ | ✅ |
| 富文本编辑器 | ✅ | ✅ |
| 图片/视频/GIF | ✅ | ✅ |
| 自定义分类标签 | ✅ | ✅ |
| 受众分群发布 | ✅ | ✅ |
| 多语言 | ✅ | ✅ |
| AI 起草（基于 Jira/Linear） | ✅ | ✅ |
| 关联 Feedback Post | ✅ | ✅ |
| 评论与 Reaction | ✅ | ✅ |
| 浏览/点击分析 | ✅ | ✅ |
| 邮件打开率追踪 | ✅ | ✅ |
| RSS Feed | ❌ | ✅（差异化） |
| OG 图自动生成 | ❌ | ✅（差异化） |
| Markdown 导入/导出 | ❌ | ✅（差异化） |

### 2.4 Help Center

| 功能 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| 公开页面 + 自定义域名 | ✅ | ✅ |
| Notion 风格编辑器 | ✅ | ✅ |
| Collections / Articles 层级 | ✅ | ✅ |
| AI Search Answers | ✅ | ✅ |
| 多品牌 | ✅ | ✅ |
| 多语言 | ✅ | ✅ |
| 导入（Intercom/Zendesk） | ✅ | ✅ |
| SEO 优化 | ✅ | ✅ |
| Sitemap 自动生成 | ✅ | ✅ |
| 文章评分（有/无帮助） | ✅ | ✅ |
| 浏览分析 | ✅ | ✅ |
| 关联 Feedback / Changelog | ✅ | ✅ |
| Markdown 导入/导出 | ❌ | ✅ |

### 2.5 Surveys（调研）

| 功能 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| CSAT | ✅ | ✅ |
| NPS | ✅ | ✅ |
| 自定义问卷 | ✅ | 🔮 |
| 受众分群 | ✅ | 🔮 |
| 触发条件（事件） | ✅ | 🔮 |
| 报表 | ✅ | 🔮 |

---

## 三、平台基础设施

### 3.1 用户与组织

| 功能 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| Organization（Workspace） | ✅ | ✅ |
| Multi-brand 子品牌 | ✅ | ✅ |
| Teams | ✅ | ✅ |
| Members 邀请 | ✅ | ✅ |
| 角色权限（RBAC） | ✅ | ✅ |
| 自定义角色 | ✅ | ✅ |
| Lite Seats（只读/客户视角） | ✅ | ✅ |
| User Tags | ✅ | ✅ |
| User Segments | ✅ | ✅ |
| Company（B2B 实体） | ✅ | ✅ |
| 自定义 User Attributes | ✅ | ✅ |
| 身份合并（去重） | ✅ | ✅ |

### 3.2 集成

| 集成 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| Slack | ✅ | ✅ |
| Discord | ✅ | ✅ |
| Linear | ✅ | ✅ |
| Jira | ✅ | ✅ |
| GitHub Issues | ✅ | ✅ |
| ClickUp | ✅ | ✅ |
| HubSpot | ✅ | ✅ |
| Salesforce | ❌ | 🔮 |
| Intercom 迁移 | ✅ | ✅ |
| Zendesk 迁移 | ✅ | ✅ |
| Canny 迁移 | ✅ | ✅ |
| Notion | ✅ | ✅ |
| Confluence | ✅ | 🔮 |
| Zapier / Make | ❌ | ✅（差异化） |
| n8n 模板 | ❌ | ✅（差异化） |
| Webhooks 入站/出站 | ✅ | ✅ |

### 3.3 开发者

| 功能 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| REST API | ✅ | ✅ |
| **GraphQL API** | ❌ | ✅（差异化） |
| **gRPC API** | ❌ | ✅（内部） |
| Webhooks | ✅ | ✅ |
| OAuth Apps | ❌ | ✅（差异化） |
| API Keys 管理 | ✅ | ✅ |
| SDK：JS / Go / Python | 🔄 | ✅ |
| Identity Verification (HMAC) | ✅ | ✅ |
| Rate Limiting | ✅ | ✅ |
| OpenAPI Spec | ✅ | ✅ |

### 3.4 安全 & 合规

| 功能 | Featurebase | KeenAI |
|------|:-----------:|:------:|
| GDPR 合规 | ✅ | ✅ |
| SOC 2 Type II | ✅ | 🔮（云版） |
| CCPA | ✅ | ✅ |
| SSO（SAML） | Enterprise | ✅ |
| SSO（OIDC） | ❌ | ✅（差异化） |
| 2FA / MFA | ✅ | ✅ |
| Audit Log | ✅ | ✅ |
| 数据导出 | ✅ | ✅ |
| 数据删除 | ✅ | ✅ |
| IP 白名单 | Enterprise | ✅ |
| Session 管理 | ✅ | ✅ |
| 密钥/Secret 管理 | ✅ | ✅ |

### 3.5 可观测性

| 功能 | KeenAI |
|------|:------:|
| Metrics（Prometheus） | ✅ |
| Tracing（OpenTelemetry） | ✅ |
| Logs（Loki） | ✅ |
| Health Check | ✅ |
| Error Tracking（Sentry 兼容） | ✅ |
| Status Page（内置） | 🔮 |

---

## 四、KeenAI 差异化亮点（vs Featurebase）

1. **完全开源 + AGPL**：源码可审计、可二次开发
2. **本地 LLM 支持**：通过 Ollama 实现完全离线 AI（Qwen2.5/Llama3.3/DeepSeek）
3. **多 LLM Provider**：OpenAI / Anthropic / Gemini / Ollama / DeepSeek / 智谱 GLM
4. **中文优先**：界面、文档、AI Prompt 中文优化
5. **GraphQL API**：除 REST 外提供更灵活查询
6. **HTTP / Script Workflow Block**：在 Workflow 内直接调任意 API/写脚本
7. **Schedule / Webhook 触发**：补足 Featurebase 缺失的触发类型
8. **Reaction / RSS**：在对话/Changelog 提供更丰富互动
9. **Zapier / n8n 集成**：开放生态
10. **国产渠道**：Telegram / 微信 / 钉钉 / 飞书
11. **国产 AI 模型**：DeepSeek / 智谱 / Moonshot / 通义
12. **可插拔架构**：Channel、Storage、AI、Search 全部插件化

---

## 五、MVP 范围划分

### MVP（Phase 1，3 个月）
最小可用版，仅包含核心闭环：

- ✅ Organization / Teams / Members / RBAC
- ✅ Messenger Widget（仅 Home + Messages）
- ✅ Email 接入（IMAP）
- ✅ Inbox（基础：列表、详情、回复、Assign）
- ✅ Conversations 基础生命周期
- ✅ Cmd+K 命令面板
- ✅ 基础 AI Reply（Copilot）
- ✅ 基础 Workflow（首响、分配、关闭 3 个 Block）
- ✅ Docker Compose 部署
- ✅ REST API + OpenAPI
- ✅ 中英双语 Dashboard

### Phase 2（M4-M6）
- Tickets（3 种类型）
- Workflows Builder 完整版
- Feedback Portal MVP
- Help Center MVP
- Slack 集成

### Phase 3（M7-M9）
- Keeni AI Agent 完整版（含 Custom Actions）
- Roadmap
- Changelog
- Discord / Telegram
- 多品牌

### Phase 4（M10-M12）
- 移动端 App（RN）
- SSO / Audit Log
- Surveys
- 高级分析
- 插件市场 Beta
