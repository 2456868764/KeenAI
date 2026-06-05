# KeenAI 前端 UI 设计

> **对标参考**：`www.featurebase.app/` 产品截图（Inbox / Workflow / Feedback Portal / Help Center / Directory / Widget）。KeenAI 在信息架构与交互模式上 **1:1 对齐 Featurebase**，视觉 token 可品牌定制（KeenAI Blue 替代 Featurebase Purple），并保留开源差异化能力。

## 一、前端产品矩阵

```
KeenAI 前端 = 4 个独立 App + 1 个 Widget + 1 个 Directory（内嵌 Dashboard）

┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Dashboard   │  │   Portal     │  │ Help Center  │  │  Changelog   │
│   (内部)     │  │  (公开反馈)  │  │   (公开)     │  │   (公开)     │
│ Next.js 15   │  │ Next.js SSR  │  │ Next.js ISR  │  │ Next.js ISR  │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

         ┌────────────────────────────────────────┐
         │      Messenger Widget (Keeni)           │
         │     Preact + Vite · Shadow DOM < 50KB   │
         └────────────────────────────────────────┘
```

| App | 用户 | 渲染策略 | 对标截图 |
|-----|------|---------|----------|
| **Dashboard** | 客服 / Admin | App Router + RSC | `inbox5.png`, `users.jpg`, `workflow3.png` |
| **Portal** | 终端用户 | SSR + ISR | `board12.png` |
| **Help Center** | 访客 / SEO | ISR | `help2.png` |
| **Changelog** | 访客 | ISR | `board12.png`（Updates Tab） |
| **Widget** | 终端用户 | 嵌入式 | `fibi-cover.jpg` |
| **Directory** | 客服 / Admin | Dashboard 子路由 | `users.jpg` |

---

## 二、Featurebase UI 对标分析（截图结论）

### 2.1 全局视觉语言（跨截图一致）

| 维度 | Featurebase 实测 | KeenAI 落地 |
|------|------------------|-------------|
| **默认主题** | **Dark First**（深炭黑底 `#0B0C10` 量级） | Day 1 默认暗色；浅色为可选 |
| **主色 Accent** | 薰衣草紫 / 紫罗兰（按钮、连线、激活态、Send） | `--primary` 可配置；默认 **KeenAI Violet** `271 65% 58%` |
| **表面层级** | 画布最深 → 卡片略亮 → 输入框再亮一级 | `--surface-0/1/2/3` 四级 HSL 变量 |
| **圆角** | 大圆角（卡片 ~12px，按钮/输入 ~8–10px） | `--radius-lg: 12px`, `--radius-md: 8px` |
| **字体** | 无衬线（Inter 系），标题白、正文灰 | Inter + 思源黑体 / HarmonyOS Sans |
| **头像** | 几何抽象图形（非照片） | `@keenai/ui/GeometricAvatar` 按 userId 哈希配色 |
| **徽章** | 数字角标（紫底白字） | Sidebar 未读/计数统一 `CountBadge` |
| **图标** | 细线图标 + 彩色分类图标（团队收件箱） | Lucide + 模块色点 |

### 2.2 Inbox（`inbox5.png`）— 四栏布局

Featurebase Inbox **不是三栏**，而是 **四栏**：

```
┌──────────┬──────────────┬─────────────────────────┬──────────────────┐
│ Global   │ Conversation │   Conversation          │  Context         │
│ Nav      │ List         │   Thread + Composer     │  Sidebar         │
│ ~200px   │ ~280px       │   flex-1                │  ~320px          │
└──────────┴──────────────┴─────────────────────────┴──────────────────┘
```

**栏 1 — Global Nav（最左）**

| 区块 | 内容 | KeenAI 组件 |
|------|------|-------------|
| Inbox | My inbox (3) · **All messages** (13) · Created by me · Unassigned (10) | `InboxNavGroup` |
| Team Inboxes | Customer success · Sales · Developers（彩色图标） | `TeamInboxList` |
| **AI Agent** | Resolved · Routed to human | `AIAgentInboxGroup`（Keeni 专属分组） |
| Teammates | 在线成员 + `+` 邀请 | `TeammatePresenceList` |
| Resources | Analytics · Help Center | `ResourceLinks` |

**栏 2 — Conversation List**

- 顶栏：`Search` · `+` · 筛选 **Open** · **Recent**
- 列表项：几何头像 · 姓名 · 公司 · 消息摘要 · 相对时间（`6mo`）
- **选中态**：背景微亮 + **左侧紫色竖条**（4px）

**栏 3 — Conversation Thread**

- **Header 右侧工具**：`⋯` More · `★` Favorite · `🌙` Snooze · **`Close` 主按钮**（白底/高对比）
- 消息：用户气泡左对齐深色；客服/AI 右对齐略浅；支持 **内嵌图片/视频**
- **Composer 底栏**：
  - 左上：`Reply ▼` 下拉（Reply / Note 切换）
  - 工具栏：`⚡` AI · 图片 · **B I H2** · 列表 · 链接 · 视频 · 表情
  - 右下：**紫色 Send**（非 Reply 分离，Send 独立主按钮）

**栏 4 — Context Sidebar（最右）**

- 顶部：**Assignee** 下拉 · **Team** 下拉（带头像）
- **可折叠 Accordion**（默认多项折叠）：
  - User details（Name / Company / Type / Email，字段旁 **外链图标** → CRM）
  - Company information
  - User requests
  - Recent conversations
  - Conversation attributes（CvDA）
  - Qualification attributes
- **交互**：点击字段旁外链 → 新 Tab 打开用户/公司详情；Accordion 状态 localStorage 记忆

> **KeenAI 调整**：原设计三栏 + 右侧 Tabs（Profile/Tickets/Copilot）改为 **Featurebase 式 Accordion 右栏**；Copilot 改为 Composer 工具栏 `⚡` 入口 + 可选右侧 Drawer（`⌘J`）。

### 2.3 Workflow Builder（`workflow3.png`）— 画布优先

| Featurebase 实测 | 原 KeenAI 设计 | **调整后** |
|------------------|---------------|-----------|
| **全画布** + 点阵网格背景 | 左侧 Block 面板 + 画布 | **去掉左侧 Block 库**；`+ Add step` 在节点内/连线上 |
| 紫色曲线连线 + 箭头 | 直线/折线 | `@xyflow/react` 自定义 `PurpleEdge` |
| 节点类型卡片化 | 通用矩形 | `TriggerNode` / `MessageFlowNode` / `WorkflowActionNode` / `BranchNode` |
| 节点内嵌 **富文本工具栏** | 侧栏配置 | 节点内 **inline Tiptap**（B/I/H2/列表/链接/图/视频/表情） |
| Reply Buttons 列表 + 每按钮独立出线 | 分支节点分离 | `MessageFlowNode` 内 buttons，每 button 一个 `sourceHandle` |
| **Let customer type** Toggle | 未提及 | 节点 Footer Switch，绑定 `allowFreeText` |
| **Let Fibi answer** 独立 AI 子块 | 独立 Block 类型 | `WorkflowActionNode` 内嵌 `KeeniAnswerStep` 卡片 |
| If escalated to human 出线 | outcome routing | 专用 handle `escalated` |
| Branches：条件 + Add branch + else | 侧栏编辑 | `BranchNode` 内联条件行 |
| Collect data 字段行 | 表单侧栏 | `CollectDataRow`（Attribute · Type） |
| 左下角：Undo · +/- · Fit | 未提及 | `CanvasToolbar` fixed bottom-left |
| 节点 **不可自由拖拽位置**（自动布局） | 自由拖拽 | **自动布局**（dagre/elk）；禁止手拖节点 |

**顶栏**：`← Back` · Workflow 名称（内联编辑）· 右侧 `Test` · `Save draft` · **`Set live`**（紫色主按钮）

详见 [13-WORKFLOW.md § 八 Builder UI](13-WORKFLOW.md)。

### 2.4 Feedback Portal（`board12.png`）— 公开顶导 + 卡片流

**顶栏导航（水平 Pill）**

```
[Your App Logo]  Feedback ▼  Roadmap ▼  Updates  Help Center  Our website ↗     🔔7  👤
                      ↑ active (深色 pill 背景)
```

**主内容**

- Hero：「Share your product feedback!」+ 副标题
- 工具条：**Top | New | Trending** · Search · Filter · **`+ Create A New Post`**（紫色）
- **Post 卡片**：
  - 左上 **状态 Badge**（In Progress 蓝 / Planned 紫 / Completed 绿）
  - 标题 + 描述 + 用户头像/名/时间
  - **右侧大号 Upvote**（数字 + 上箭头，如 `204`）
  - 评论数气泡
  - 标签（Feature Requests + 图标）
- **Upvote 二级交互**：点击 Upvote 可弹出 **「How important is this to you?」**
  - 🥳 Nice to have · 😍 Important · 🥵 Essential
  - 用于 MRR 加权排序（对齐 [02-FEATURES § Feedback](02-FEATURES.md)）

**右侧边栏（三 Widget）**

| Widget | 内容 |
|--------|------|
| Your posts | 当前用户 3 条帖子 + 状态色点 + View all |
| Boards | View all · Feature Requests · Bug Reports · Integrations |
| Most Helpful | 排行榜：头像 · 名 · 奖牌 · 分数 |

### 2.5 Help Center（`help2.png`）— AI 搜索优先

**布局**：左栏固定分类 + 右栏主内容（非全宽居中）

**左栏**

- App Logo + **主题切换**（日/月）
- Search `⌘K`
- 分类列表（Getting Started / Changelogs / Developers / …）每项 `>`
- 底部：**Feedback · Roadmap · Changelog** 快捷入口（与 Portal 互链）

**右栏主内容**

- 居中 Hero：「How can we help you?」
- **大号圆角搜索框**（占视觉中心）
- **AI Answer Card**（搜索后展开，非跳转列表）：
  - 标题 + ✨ + 关闭 `×`
  - 生成式摘要段落
  - 要点列表
  - 来源文章链接
- 下方 **Collection 卡片网格**（图标 + 标题 + 描述 + `N articles` + 作者头像叠放）

> KeenAI：AI Search 走 [11-RAG-KNOWLEDGE](11-RAG-KNOWLEDGE.md) Hybrid Retriever + `streamText` 流式写入 Answer Card。

### 2.6 Directory / Users（`users.jpg`）— 高密度表格

**布局**：左窄栏目录 + 右宽表格（无顶栏全局搜索条）

**左栏 Directory**

- **People**：All users (70) · All leads · Active · New — 每项 **右对齐计数**
- **Companies**：All · Active · New

**主区**

- 标题：`All users (70)`
- 右上：**Search 图标按钮** · **`+ Add users`** 紫色按钮
- **Tag 筛选**：`Person tag` pill + `+5` 更多筛选
- **无边框表格**（行间距分隔）：

| 列 | 展示 |
|----|------|
| Person | 几何头像 + 姓名 |
| Email | 灰色小字 |
| Company | **品牌 Logo** + 公司名 |
| Subscription | paid / trial / … |
| Plan | premium / growth / enterprise |

- 行点击 → 右侧 **Drawer** 或跳转用户详情（Featurebase 为内联展开，KeenAI 用 Sheet）

### 2.7 Widget / Messenger（`fibi-cover.jpg`）— 暗色对话

| 元素 | Featurebase | KeenAI |
|------|-------------|--------|
| 主题 | **默认暗色** | Widget `theme: 'dark' \| 'light' \| 'auto'` |
| Header | `←` · 紫色方块 Agent 头像 · **Fibi AI Agent** · 副标题「The team can also help」 | `←` · Keeni 头像 · 可配置名称 · 副标题可配置 |
| Agent 气泡 | 左对齐；首条带 **头像+名字** 在气泡区；支持 **粗体、列表、引用角标 [1]、内嵌截图** | 同构；引用链到 Help 文章 |
| User 气泡 | 右对齐 **紫色实心** | `--widget-user-bubble` 品牌色 |
| 工具执行反馈 | 「using my tools」类系统文案 | `ToolResultBubble` 灰色小字 |
| 输入栏 | `Send us a message...` · 表情 · **附件** | 同构；Workflow 禁用时隐藏输入（`disable_customer_reply`） |
| 满意度 | 未在截图中 | CSAT 表情条（Workflow 触发后） |

---

## 三、设计系统（Design System）

### 3.1 设计原则（更新）

1. **Dark First** — 与 Featurebase 一致，客服工作台默认暗色（减轻眼疲劳）
2. **四栏 Inbox** — 列表 + 会话 + 上下文同屏，减少 Tab 切换
3. **键盘优先** — `⌘K` 全局；Inbox `J/K` 切换对话；`⌘Enter` 发送
4. **信息密度高** — Directory 无边框表、Inbox 紧凑列表
5. **AI 入口克制** — Composer `⚡` 与 Workflow 节点内嵌，不抢占主视觉
6. **国际化 + A11y** — WCAG 2.1 AA；RTL 后期

### 3.2 颜色系统（对齐 Featurebase Dark）

```css
:root[data-theme="dark"] {
  /* Surfaces（由深到浅） */
  --surface-0: 222 20% 6%;          /* 画布背景 */
  --surface-1: 222 18% 9%;          /* 侧栏 */
  --surface-2: 222 16% 12%;         /* 卡片/气泡 */
  --surface-3: 222 14% 16%;       /* 输入框/hover */

  --background: var(--surface-0);
  --foreground: 210 20% 96%;

  /* Brand — 默认 Keeni Violet（对标 Featurebase 紫） */
  --primary: 271 65% 58%;
  --primary-foreground: 0 0% 100%;

  /* Semantic */
  --success: 142 60% 45%;
  --warning: 38 90% 50%;
  --danger:  0 75% 58%;
  --info:    199 85% 48%;

  /* Feedback 状态色（board12） */
  --status-in-progress: 217 90% 60%;
  --status-planned:     271 65% 58%;
  --status-completed:   142 60% 45%;

  /* AI */
  --ai: 271 65% 58%;
  --ai-foreground: 0 0% 100%;

  /* Widget */
  --widget-user-bubble: 271 45% 42%;
  --widget-agent-bubble: 222 16% 14%;

  --border: 222 12% 18%;
  --ring:   271 65% 58%;
}

:root[data-theme="light"] {
  /* 浅色主题：供 Portal / Help 公开页可选 */
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --primary: 220 90% 56%;           /* KeenAI Blue 浅色模式 */
  /* ... */
}
```

### 3.3 字体与间距

- **UI**：Inter + 思源黑体 SC
- **等宽**：JetBrains Mono（API Key、Workflow ID）
- **字号**：12 / 13 / 14 / 16 / 20 / 24（px）
- **间距**：4px 网格；Inbox 列表行高 **56–64px**；表格行 **48px**

### 3.4 组件库（Shadcn/ui 扩展）

| 类别 | 组件 | 对标来源 |
|------|------|----------|
| 布局 | `AppShell`, `FourColumnInbox`, `DirectoryLayout` | inbox5, users |
| 导航 | `SidebarNav`, `CountBadge`, `TeamIcon`, `PublicTopNav` | inbox5, board12 |
| 对话 | `ConversationListItem`, `MessageBubble`, `Composer`, `GeometricAvatar` | inbox5, fibi |
| 上下文 | `ContextAccordion`, `AssigneePicker`, `ExternalFieldLink` | inbox5 |
| 反馈 | `FeedbackPostCard`, `UpvoteButton`, `ImportancePopover`, `Leaderboard` | board12 |
| 帮助 | `AiAnswerCard`, `CollectionCard`, `HelpSidebar` | help2 |
| 数据 | `BorderlessTable`, `TagFilterPill`, `CompanyCell` | users |
| 工作流 | `WorkflowCanvas`, `TriggerNode`, `MessageFlowNode`, `KeeniAnswerCard` | workflow3 |
| AI | `AiSparkButton`, `CitationBadge`, `ToolResultLine` | fibi, inbox5 |

---

## 四、Dashboard 详细设计

### 4.1 整体壳层（App Shell）

```
┌────────────────────────────────────────────────────────────────────────────┐
│  TopBar: [Org ▼] KeenAI    [⌘K Search........................]  🔔  👤   │  48px
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   <Route Content — Inbox 四栏 / Directory / Settings / ...>               │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

- **TopBar** 仅保留：Org 切换 · 全局 `⌘K` · 通知 · 头像
- **模块导航** 下沉到各模块左栏（Inbox 自带 Global Nav；Settings 自带 Settings Nav）

### 4.2 Inbox 四栏布局（对标 `inbox5.png`）

```
┌─────────┬────────────┬──────────────────────────────┬─────────────────┐
│ Global  │ Conv List  │ Conversation + Composer      │ Context Sidebar │
│ Nav     │            │                              │                 │
│ 200px   │ 280px      │ flex-1 min-w-0               │ 320px           │
│         │            │                              │ (可折叠 → 0)    │
└─────────┴────────────┴──────────────────────────────┴─────────────────┘
```

**快捷键**

| 按键 | 动作 |
|------|------|
| `J` / `K` | 上/下切换对话 |
| `Enter` | 打开选中对话 |
| `⌘Enter` | 发送消息 |
| `⌘J` | AI Draft（Copilot） |
| `⌘W` | Close conversation |
| `⌘S` | Snooze |
| `⌘\` | 折叠/展开 Context Sidebar |
| `Esc` | 关闭弹层 / 取消 Snooze 面板 |

**Composer 结构（对齐截图）**

```
┌──────────────────────────────────────────────────────────────┐
│  Reply ▼                                                      │
├──────────────────────────────────────────────────────────────┤
│  [消息编辑区 — Tiptap]                                        │
├──────────────────────────────────────────────────────────────┤
│  ⚡  📷  B  I  H2  •  🔗  🎬  😀                    [ Send ]  │
└──────────────────────────────────────────────────────────────┘
```

- `Reply ▼`：`Reply` | `Note`（Note 时背景变黄，整条 Composer 边框变色）
- `⚡`：打开 Copilot 草稿（3 候选 + 插入）
- **Send**：`primary` 填充按钮，独立于工具栏

### 4.3 命令面板（`⌘K`）

保留原设计，增加 **Inbox 上下文动作** 置顶：

```
Actions on this conversation
  ⚡ Draft AI reply          ⌘J
  Assign to teammate        ⌘A
  Add tag                   ⌘⇧T
  Snooze                    ⌘S
  Close                     ⌘W
  Convert to ticket         ⌘⇧C
```

### 4.4 Workflow Builder（对标 `workflow3.png`）

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back   Workflow name ✎          [Test]  [Save draft]  [Set live]      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│     ┌──────────────┐      ┌─────────────────────┐                        │
│     │ ⚡ Trigger    │─────▶│ Customer Support    │──┬─ Product question  │
│     │ New chat     │      │ Flow                │  ├─ Technical ...    │
│     └──────────────┘      │ [inline editor]     │  └─ ...              │
│                           │ □ Let customer type │                        │
│                           └──────────┬──────────┘                        │
│                                      ▼                                   │
│                           ┌─────────────────────┐                        │
│                           │ 🤖 Let Keeni answer  │── escalated ──▶ ...   │
│                           └─────────────────────┘                        │
│                                                                         │
│  [↩] [+] [-] [⊞]  ← 左下角画布工具栏                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

**节点配置**：点击节点 → **右侧 Sheet**（非左侧 Block 库）展示 Trigger settings / Message / Buttons / Branches。

**Test 模式**：顶栏 `Test` → audience 注入当前用户 email；Inngest dev + 高亮当前 run 路径。

### 4.5 Directory / Users（对标 `users.jpg`）

路由：`/directory/users` · `/directory/companies`

- 左栏：`DirectoryNav`（People / Companies 分组 + 计数）
- 主区：`BorderlessTable` + `TagFilterBar` + `+ Add users`
- 行操作：右键菜单 · 批量选择 · 导出 CSV

### 4.6 Keeni AI 设置（Settings > Automations）

布局保持 Section 卡片式；视觉对齐 Dark 主题 Settings 子页（`surface-1` 卡片 on `surface-0` 背景）。

### 4.7 Settings 信息架构（更新）

```
Settings
├── General（Workspace · Brands · Domains · Localization）
├── Members & Teams
├── Support
│   ├── Office Hours
│   ├── Macros
│   ├── SLAs
│   ├── Ticketing
│   └── Tags
├── Channels（Messenger · Email · Slack · …）
├── Automations
│   ├── Keeni AI（Personality · Training · Actions · LLM）
│   ├── Workflows
│   └── Other（Auto-close abandoned · …）
├── Help Center · Changelog · Feedback
├── Integrations
├── Developers
├── Security
├── Notifications
└── Billing
```

---

## 五、Messenger Widget 设计（对标 `fibi-cover.jpg`）

### 5.1 视觉

- **默认 `theme: 'auto'`**，跟随系统；Brand 可强制 dark/light
- Header 副标题默认：「The team can also help」（i18n key: `widget.header.subtitle`）
- Agent 首条消息展示 **头像 + 名称** 在气泡内（非仅 Header）

### 5.2 消息类型

| 类型 | 样式 |
|------|------|
| `agent` | 左对齐 `surface-2` 气泡；支持 Markdown 子集 |
| `user` | 右对齐 `widget-user-bubble` |
| `tool_result` | 左对齐小字灰色「Keeni used tool: extend_trial」 |
| `citation` | 气泡内 `[1]` 角标 → 点击展开来源卡片 |
| `csat` | 横向表情按钮条 |
| `reply_buttons` | 全宽 stacked buttons（Workflow 驱动） |
| `system` | 居中灰色小字 |

### 5.3 底部 Tab（展开态）

```
🏠 Home · 💬 Messages · 📚 Help · 🎫 Tickets · 📝 Changelog
```

与 `board12` / `help2` 公开模块品牌一致。

### 5.4 技术（不变）

- Preact + Vite + Shadow DOM
- `useChat` from `@ai-sdk/react` 流式
- 体积极限 < 50KB gzip

---

## 六、Portal / Help Center / Changelog

### 6.1 Portal（对标 `board12.png`）

**顶导组件 `PublicTopNav`**

```tsx
<PublicTopNav
  logo={brand.logoUrl}
  items={[
    { label: 'Feedback', href: '/feedback', active: true },
    { label: 'Roadmap', href: '/roadmap', hasDropdown: true },
    { label: 'Updates', href: '/changelog' },
    { label: 'Help Center', href: '/help' },
    { label: 'Our website', href: brand.websiteUrl, external: true },
  ]}
  notifications={7}
  user={session?.user}
/>
```

**主布局**：`max-w-5xl` 主栏 + `w-80` 右侧边栏（`xl` 断点以上）；移动端边栏折叠到底部 Accordion。

**Upvote + Importance 流程**

```
点击 Upvote
  → 若首次：弹出 ImportancePopover（Nice / Important / Essential）
  → 写入 vote.weight
  → 数字 +1 动画
```

### 6.2 Help Center（对标 `help2.png`）

**布局**：`HelpLayout` = `HelpSidebar` (260px) + `HelpMain`

**AI Search 交互**

1. 用户输入问题 → debounce 300ms
2. 展示 `AiAnswerCard` skeleton → `streamText` 流式填充
3. 下方同时展示 **相关文章卡片**（Hybrid Retriever top 3）
4. `⌘K` 打开命令面板式搜索（跳转文章）

### 6.3 Changelog

- 顶导与 Portal 共用 `PublicTopNav`（Updates active）
- 列表按日期分组；卡片含分类标签 🆕/🛠/🐛
- Subscribe CTA 在顶导右侧

---

## 七、交互规范（新增）

### 7.1 加载与乐观更新

| 场景 | 模式 |
|------|------|
| 发送消息 | Optimistic bubble → 失败回滚 + Toast |
| Assign / Tag / Close | Optimistic + 后台确认 |
| Upvote | 数字立即 +1；失败抖动回滚 |
| Workflow Publish | 全页 loading；成功 Toast + 状态徽章变 Live |

### 7.2 空状态

| 页面 | 空状态文案 + CTA |
|------|------------------|
| Inbox Unassigned | 「All caught up」+ 插图 |
| Conv List 无结果 | 「No conversations match filters」+ Clear filters |
| Directory | 「No users yet」+ Add users |
| Workflow | 「Start from template」+ 模板网格 |

### 7.3 实时

- Inbox 列表：WS `conversation.updated` → TanStack Query invalidate
- 正在输入：WS `typing` indicator（Header 副标题位置）
- 新消息：列表项置顶动画 + 未读 badge

---

## 八、响应式断点

| 断点 | Inbox 行为 |
|------|-----------|
| `≥1536px` | 四栏全显示 |
| `1280–1535px` | Context Sidebar 默认折叠，图标按钮展开 |
| `1024–1279px` | 仅 Global Nav + List + Thread；Context 用 Sheet |
| `<1024px` | 单栏栈：List → Thread 全屏；Nav 抽屉 |

Portal / Help：`<768px` 右侧边栏移到底部。

---

## 九、国际化 · 无障碍 · 性能

（保持原 § 七–九 策略，补充：）

- **公开页** 默认跟随 Brand `locale`；**Dashboard 默认暗色** 不随系统强制（可设置跟随系统）
- **GeometricAvatar** 必须带 `aria-label={user.name}`
- **Upvote / Importance** 控件需 `aria-pressed` / keyboard 可操作
- Inbox 列表 **虚拟滚动**（`@tanstack/react-virtual`）≥ 500 行

---

## 十、前端工程结构（Monorepo）

```
apps/
├── dashboard/                 # 内部 Dashboard（Inbox/Directory/Settings/Workflow）
│   └── app/
│       ├── inbox/             # 四栏 Inbox
│       ├── workflows/
│       ├── custom-actions/    # CA 四步向导（stub）
│       ├── help-center/       # KB 搜索（无独立 Portal）
│       └── login/
├── portal/                    # 公开 Feedback Portal
├── docs/                      # 文档站（Fumadocs 规划）
└── widget/                    # Messenger embed

packages/
├── ui/                        # Shadcn 扩展 + 上表业务组件
├── shared/                    # Zod schemas
└── ...
```

---

## 十一、与 Featurebase 差异（KeenAI 独有 UI）

| 能力 | Featurebase | KeenAI UI |
|------|-------------|-----------|
| 主题品牌色 | 固定紫色 | CSS Variables 按 Brand 注入 |
| 浅色 Dashboard | 有 | 可选，默认 Dark |
| GraphQL Playground | 无 | Developers 页内置 |
| Workflow 版本对比 / Shadow Run | 无 | Builder 顶栏 `Compare` / `Shadow` |
| 自托管设置向导 | 无 | 首次启动 Onboarding Wizard |
| 国产渠道配置 | 少 | Settings 含钉钉/飞书/微信 Tab |

---

## 十二、UI 开发工作流

```
Figma（按本章 + 截图还原）
    ↓
packages/ui Storybook（`pnpm storybook`）
    ↓
Vitest + RTL
    ↓
Playwright（Inbox 四栏 / Workflow 画布 / Portal Upvote）
    ↓
Chromatic 视觉回归（对标截图 baseline）
    ↓
合并
```

**截图基准目录**：`www.featurebase.app/*.png` — PR 中 UI 改动需与对标截图 Diff 审查（Chromatic 或人工）。

---

## 十三、关键技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Dashboard 框架 | Next.js 15 | RSC + 生态 |
| UI 库 | Shadcn/ui + Tailwind v4 | 暗色主题 + 可定制 |
| Inbox 布局 | **四栏** | 对齐 Featurebase inbox5 |
| Workflow 画布 | @xyflow/react + dagre 自动布局 | 对齐 workflow3 |
| 状态 | Zustand + TanStack Query | 简洁 + 实时 invalidate |
| 编辑器 | Tiptap v3 | Composer + Workflow 节点内嵌 |
| 公开页导航 | `PublicTopNav` 水平 Pill | 对齐 board12 |
| Help AI | streamText + AiAnswerCard | 对齐 help2 |
| 表格 | TanStack Table 无边框样式 | 对齐 users |
| Widget | Preact + 暗色默认 | 对齐 fibi-cover |
| 命令面板 | cmdk | ⌘K |
| 图表 | ECharts | Analytics |
| i18n | next-intl | — |

---

## 十四、截图对照索引

| 文件 | 模块 | 本文档章节 |
|------|------|-----------|
| `www.featurebase.app/inbox5.png` | Support Inbox | § 2.2, § 4.2 |
| `www.featurebase.app/workflow3.png` | Workflow Builder | § 2.3, § 4.4 |
| `www.featurebase.app/board12.png` | Feedback Portal | § 2.4, § 6.1 |
| `www.featurebase.app/help2.png` | Help Center | § 2.5, § 6.2 |
| `www.featurebase.app/users.jpg` | Directory | § 2.6, § 4.5 |
| `www.featurebase.app/fibi-cover.jpg` | Widget / AI Chat | § 2.7, § 五 |

---

## 十五、多模态消息 UI

> 完整协议与 API：[14-MULTIMODAL.md](14-MULTIMODAL.md)

### 15.1 Inbox 消息气泡

按 `message.parts`（或 API 返回的 `attachments[]`）分区渲染：

| Part 类型 | 组件 | 行为 |
|-----------|------|------|
| `text` | 现有 Tiptap / plain bubble | 不变 |
| `image` | `<MessageImage />` | signed URL · 点击 lightbox · lazy load |
| `audio` | `<MessageAudio />` | 播放器 + 可选 transcript 折叠 |
| `video` | `<MessageVideo />` | poster + controls · 最大高度限制 |
| `file` | `<MessageFile />` | 图标 + 文件名 + 下载 |

`mixed` 消息：垂直堆叠 parts，caption 文本在最上或最下（与 Featurebase 一致）。

### 15.2 Composer 上传

| 交互 | 实现 |
|------|------|
| 拖拽 / 粘贴图片 | presign → PUT → pending `attachmentIds` |
| 发送 | `POST .../messages` 带 `attachmentIds` + 可选 `plainText` |
| 进度 | 上传中 chip；失败可重试 |
| 限制 | 单文件 20MB · MIME 白名单（与 API 一致） |

### 15.3 Widget（体积敏感）

- Phase 2：仅 **图片** upload + 缩略图 bubble（目标仍满足 `pnpm check:widget` 预算）
- 语音/视频：P3 或原生 App

### 15.4 Copilot 出站

- SSE 扩展 `attachment.ready` 事件（见 14 号文档 §7.4）
- 采纳草稿时：图片 part 插入 Tiptap composer

---
