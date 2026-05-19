# KeenAI 产品需求文档（PRD）

## 1. 产品概述

### 1.1 产品定位
**KeenAI** 是一款 **开源、AI 原生、可自托管** 的客户支持与产品反馈一体化平台，旨在为中小 SaaS 团队、独立开发者、企业内部 IT 提供 Featurebase / Intercom / Zendesk / Canny 的开源替代方案。

### 1.2 一句话价值主张
> 用一个开源平台解决「客户在哪里联系你 → AI 怎么回答 → 反馈如何收集 → 路线图怎么展示 → 更新如何通知」的完整闭环。

### 1.3 与 Featurebase 的差异化
| 维度 | Featurebase | KeenAI |
|------|-------------|--------|
| 部署 | SaaS 闭源 | 开源 + SaaS 双模 |
| 计费 | $29-$99/seat + $0.29/resolution | 自托管免费，云端按用量 |
| AI 模型 | 黑盒 | 可选 OpenAI/Anthropic/Ollama/本地 |
| 数据归属 | 厂商 | 用户完全自主 |
| 扩展 | 封闭 | 插件市场 + 开放 SDK |
| 国际化 | 英文优先 | 中英双语优先，多语扩展 |

---

## 2. 目标用户

### 2.1 主要用户画像

#### Persona 1：SaaS 创业团队 CTO/CEO
- **痛点**：用 Intercom 月付 $500+，但功能用不全；想要数据自主
- **需求**：低成本自托管、AI 自动回复、反馈收集
- **场景**：5-50 人团队，月活客户 1k-100k

#### Persona 2：独立开发者 / Indie Hacker
- **痛点**：单人维护多产品，无人力做客服
- **需求**：AI Agent 7×24 自动回复，反馈表单 + Roadmap 公示
- **场景**：单人多产品，月活 < 10k

#### Persona 3：企业内部 IT / DevTool 团队
- **痛点**：合规要求数据不出企业内网；需对接内部 LDAP/SSO
- **需求**：私有化部署、SSO、审计日志、与内部系统集成
- **场景**：100-10000 员工，内部服务台

#### Persona 4：产品经理 / 客户成功经理
- **角色**：日常使用者
- **需求**：看 Inbox、回工单、整理反馈、发布 Changelog
- **场景**：每天 2-8 小时在 KeenAI 内

### 2.2 终端用户（客户的客户）
- 通过 Messenger Widget 提问的客户
- 通过 Feedback Portal 提需求的用户
- 通过 Email 发支持邮件的用户
- 浏览 Help Center / Roadmap / Changelog 的访客

---

## 3. 核心场景

### 场景 A：客户咨询自动化
1. 客户在产品内点开 Messenger
2. 输入「怎么导出数据？」
3. Keeni AI 检索 Help Center 后秒回答案，附原文链接
4. 客户满意 → 自动关闭，不打扰客服
5. 客户追问 → 升级人工 + 推荐相关文档

### 场景 B：Bug 反馈闭环
1. 客户在 Messenger 报告 Bug
2. Keeni AI 识别为 Bug Report，自动创建 Customer Ticket
3. 同时检测到已有 Tracker Ticket → 自动 Link
4. 工程师修复后将 Tracker 状态置为 Done
5. 所有关联客户自动收到邮件通知

### 场景 C：功能请求收集
1. 客户在 Messenger 提「希望加 Dark Mode」
2. Keeni AI 自动在 Feedback Portal 匹配到已有 Post
3. 客户被自动订阅，可看到投票数
4. PM 排期后，Post 状态变 Planned → In Progress → Shipped
5. Shipped 时自动邮件 + Changelog 通知所有订阅者

### 场景 D：邮件转工单
1. 客户发邮件到 support@yourcompany.com
2. KeenAI 通过 IMAP 接收并转为 Conversation
3. Workflow 触发 Keeni AI 首响
4. 复杂问题 Workflow 自动转 Customer Ticket → Assign 给计费组
5. 状态变更全程邮件通知

### 场景 E：Changelog 通知
1. PM 在编辑器写完功能更新（关联 Feedback Post）
2. 选择目标受众（如「Pro 用户 + EU 地区」）
3. 点击 Publish
4. KeenAI 同时：
   - 发布到公开 Changelog 页面
   - 推送应用内 Widget 弹窗
   - 邮件通知订阅用户
   - 自动通知关联 Feedback Post 的所有投票者

### 场景 F：客服效率提升
1. 客服打开未处理对话
2. 按 `Cmd+K` → 输入「refund」
3. Copilot 基于历史对话和 Help Center 生成 3 个回复建议
4. 客服选一个、微调、按 `Cmd+Enter` 发送
5. 全程 < 10 秒

---

## 4. 产品目标（OKR）

### 4.1 第一年目标（Year 1）

**O1：产品成熟度**
- KR1：实现 Featurebase 80% 的核心功能
- KR2：完成 Docker / K8s 一键部署
- KR3：支持中、英、日、西、法 5 种语言

**O2：社区与生态**
- KR1：GitHub Stars ≥ 5000
- KR2：贡献者 ≥ 50 人
- KR3：第三方插件 ≥ 10 个

**O3：性能与可靠性**
- KR1：API P95 延迟 < 200ms
- KR2：WebSocket 消息延迟 < 150ms
- KR3：单实例支持 10k 并发连接

**O4：AI 效果**
- KR1：Keeni AI 自动解决率 ≥ 50%
- KR2：Copilot 采纳率 ≥ 60%
- KR3：支持本地 Ollama 部署（无需外网）

### 4.2 商业目标
- 自托管：完全免费（AGPL）
- 云托管 SaaS：$0 / $19 / $49 / $99 per seat 阶梯定价
- 企业版：私有化 + SSO + Audit + SLA 支持

---

## 5. 非目标（Out of Scope）

明确不做的事，避免 Scope Creep：

- ❌ **CRM 系统**：不替代 HubSpot/Salesforce，仅做轻量客户视图
- ❌ **电话呼叫中心**：不做 PBX 集成
- ❌ **营销自动化**：不做 Email Campaign / SMS 群发
- ❌ **完整项目管理**：不替代 Jira/Linear，仅做工单
- ❌ **代码托管**：不做 Git 平台
- ❌ **复杂 BI**：仅提供基础数据分析

---

## 6. 关键约束

### 6.1 技术约束
- 必须支持 **完全离线部署**（含 AI，通过 Ollama）
- 必须支持 **PostgreSQL** 作为主数据库（不依赖云厂商专有服务）
- 必须支持 **水平扩展**（无状态服务 + Redis/Kafka）
- 必须 **API-First**，所有 UI 操作都有对应 API

### 6.2 合规约束
- GDPR：数据导出/删除 API、Cookie 同意
- SOC 2：审计日志、权限分级
- 中国数据合规：可部署在阿里云/腾讯云，数据不出境

### 6.3 体验约束
- 首屏加载 < 1.5s
- 键盘优先，所有操作有快捷键
- 暗黑模式 Day 1 支持
- 移动端响应式

---

## 7. 成功指标（North Star Metrics）

### 7.1 产品指标
| 指标 | 定义 | 目标 |
|------|------|------|
| **AI Resolution Rate** | Keeni AI 自动解决/总对话 | ≥ 50% |
| **First Response Time** | 平均首响时间 | < 30s（含 AI） |
| **Mean Resolution Time** | 平均解决时长 | < 4h |
| **CSAT** | 客户满意度 | ≥ 4.5/5 |
| **Self-serve Rate** | Help Center 解决率 | ≥ 40% |

### 7.2 平台指标
| 指标 | 目标 |
|------|------|
| Uptime | ≥ 99.9% |
| API P95 | < 200ms |
| WebSocket Latency | < 150ms |
| 单实例并发连接 | 10k |

### 7.3 社区指标
| 指标 | 目标 |
|------|------|
| GitHub Stars | 5000+ |
| Active Contributors | 50+ |
| Discord 成员 | 1000+ |
| 自托管实例 | 1000+ |

---

## 8. 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| Featurebase 功能迭代快 | 持续追赶压力 | 聚焦核心 + 社区共建 |
| 自托管运维门槛高 | 用户流失 | 一键脚本 + 云托管 SaaS |
| AI 成本高昂 | 用户负担 | 支持 Ollama 本地模型 |
| 邮件送达率难保证 | 通知失效 | 多 Provider + 自建 Postal |
| 实时连接扩展难 | 高并发瓶颈 | Redis Pub/Sub + 多节点 |
| 国际化语料不足 | 海外不可用 | 社区翻译平台 Crowdin |

---

## 9. 验收标准（MVP）

KeenAI 1.0 MVP 上线必须满足：

- [x] 客户能通过 Messenger Widget 发起对话
- [x] 客服能在 Inbox 看到所有对话并回复
- [x] Keeni AI 能自动回复并能 fallback 人工
- [x] 支持 Email 接入与转 Conversation
- [x] 支持基础 Workflow（首响、分配、关闭）
- [x] 支持创建 Customer Ticket 并通知客户
- [x] Feedback Portal 可公开投票
- [x] Changelog 可发布并通知
- [x] Help Center 可写文章并被 AI 索引
- [x] Docker Compose 一键启动
- [x] 中英双语 Dashboard
- [x] 主流浏览器兼容

详细功能拆分见 [02-FEATURES.md](02-FEATURES.md)。
