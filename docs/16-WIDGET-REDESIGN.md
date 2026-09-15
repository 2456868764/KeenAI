# Widget 重构方案（交互 / UI / 功能）

本文定义 KeenAI Messenger Widget 的下一阶段重构方案。目标是从当前“单一聊天面板”升级为对齐参考图的多模块用户入口：Home、Messages、Help、Changelog、AI Chat、Ticket。

## 1. 目标体验

参考图展示的 Widget 由一个固定右下角 launcher 和一个多页面面板组成：

- Home：欢迎区、团队/品牌视觉、Ask a question、Submit ticket、Help 搜索与推荐文章。
- Messages：历史会话列表；无会话时显示空状态和 `Ask a question` CTA。
- Chat：AI Agent 对话页，支持 KB 搜索状态、富文本回答、引用、emoji、附件、快捷问题类型。
- Help：帮助中心集合和文章列表，顶部紫色搜索区。
- Changelog：最新更新卡片列表，支持图文更新展示。
- Bottom nav：`Home / Messages / Help / Changelog` 固定底部导航。

## 2. 当前状态

当前 `apps/widget` 已有基础通信能力：

- `POST /api/v1/widget/session`：HMAC visitor session。
- `GET /api/v1/widget/config`：返回 brand/widget 配置，并在缺省时初始化独立 widget 配置表。
- `GET /api/v1/widget/conversations`：返回当前 visitor 在当前 brand 下的 messenger 会话列表。
- `POST /api/v1/widget/conversations`：创建或复用当前 open conversation。
- `GET /api/v1/widget/conversations/:id/messages`：读取消息历史。
- `POST /api/v1/widget/conversations/:id/messages`：发送访客消息。
- `POST /api/v1/widget/uploads/presign` + `PUT /api/v1/widget/uploads/:uploadId`：附件上传。
- `WS /api/v1/widget/conversations/:id/ws`：会话实时更新。

主要缺口：

- UI 仍是手写 DOM 单页聊天面板，缺少多模块导航和首页。
- Help / Changelog 目前可复用 public API，但缺少 widget auth 下的一站式聚合。
- AI answer SSE 已存在 public KB answer 路由，但 Widget 需要自己的状态流与 conversation 绑定。
- Ticket 提交入口尚未作为 Widget 一等功能暴露。

已完成：

- Widget 配置使用独立表：`widget_settings`、`widget_menu_items`、`widget_quick_actions`、`widget_featured_content`。
- LibSQL migration 已添加：`0041_widget_settings.sql`。
- SQLite / Postgres schema 已导出对应 widget 表。
- `GET /api/v1/widget/config` 已接入默认配置初始化。
- `GET /api/v1/widget/home` 已接入 quick actions、推荐文章、最新 changelog 聚合。
- `GET /api/v1/widget/conversations` 已接入 visitor 会话列表。
- `GET /api/v1/widget/help/*` 和 `GET /api/v1/widget/changelog/*` 已接入 widget auth 下的列表/详情读取。
- `POST /api/v1/widget/tickets` 已接入 widget ticket 创建，并关联新建 conversation。
- `POST /api/v1/widget/answer` 已接入 widget auth 下的 KB answer SSE，并将用户问题和 AI 回复写回 conversation。

## 3. 前端重构

保留 `Preact + Vite + Shadow DOM + IIFE` 的嵌入模型，内部改为组件化 App。

建议目录：

```text
apps/widget/src/
  app/
    WidgetApp.tsx
    state.ts
    routes.ts
  views/
    HomeView.tsx
    MessagesView.tsx
    ChatView.tsx
    HelpView.tsx
    ChangelogView.tsx
  components/
    WidgetShell.tsx
    Launcher.tsx
    BottomNav.tsx
    Header.tsx
    Composer.tsx
    EmojiPicker.tsx
    AttachmentButton.tsx
    MessageBubble.tsx
    RichAnswer.tsx
    EmptyState.tsx
  api/
    widget-client.ts
    realtime.ts
  styles/
    widget-styles.ts
```

核心状态：

```ts
type WidgetView = "home" | "messages" | "chat" | "help" | "changelog";

type WidgetState = {
  open: boolean;
  view: WidgetView;
  session: WidgetSession | null;
  config: WidgetConfig | null;
  activeConversationId: string | null;
  conversations: WidgetConversationSummary[];
  messagesByConversation: Record<string, WidgetMessage[]>;
  answerStatus: "idle" | "searching" | "streaming" | "done" | "error";
};
```

UI 约束：

- 面板宽度对齐参考图：桌面约 `390-420px`，移动端全屏底部 sheet。
- 大圆角白色容器，默认紫色 brand accent。
- Bottom nav 始终固定在面板底部。
- Chat detail 有独立 header：返回箭头、Agent logo、标题、副标题。
- Composer 固定底部，包含 emoji 与 attachment 图标。
- 消息内容支持 markdown-like rich text、列表、inline code、source badge。

## 4. 后端接口方案

新增 Widget 聚合 API，避免前端直接拼 public portal API。

### 4.1 配置

```http
GET /api/v1/widget/config
Authorization: Bearer <widget-token>
```

返回：

```ts
type WidgetConfig = {
  org: { id: string; slug: string; name: string };
  brand: {
    id: string;
    slug: string;
    name: string;
    logoUrl?: string | null;
    primaryColor: string;
  };
  agent: {
    name: string;
    subtitle: string;
    greetingTitle: string;
    greetingBody: string;
    avatarUrl?: string | null;
  };
  modules: {
    home: boolean;
    messages: boolean;
    help: boolean;
    changelog: boolean;
    tickets: boolean;
  };
  menuItems: Array<{
    id: string;
    label: string;
    description?: string | null;
    icon?: string | null;
    type: "module" | "external";
    href?: string | null;
    module?: "home" | "messages" | "help" | "changelog" | "tickets" | null;
    location: "bottom_nav" | "home_card" | "portal_menu";
    sortOrder: number;
  }>;
  quickActions: Array<{
    id: string;
    label: string;
    type: "start_chat" | "submit_ticket" | "open_help" | "open_url";
    payload: Record<string, unknown>;
    sortOrder: number;
  }>;
  poweredBy: boolean;
};
```

落库建议：第一版直接使用独立表，不写入 `brands.settings` 或 `brands.attributes`。Widget 配置会被 Dashboard、公开 Portal、Widget 运行时同时读取，独立表能避免 brand 通用配置继续膨胀，也便于做启停、排序、审计和局部更新。

### 4.2 Home 聚合

```http
GET /api/v1/widget/home
Authorization: Bearer <widget-token>
```

返回：

- 推荐 help articles。
- latest changelog entries。
- 可用 ticket forms。
- quick actions。

### 4.3 会话列表

```http
GET /api/v1/widget/conversations
Authorization: Bearer <widget-token>
```

返回当前 visitor 在当前 brand 下的 messenger conversations。

需要扩展 `apps/api/src/lib/widget.ts`：

- `listWidgetConversations(db, orgId, brandId, userId, limit)`
- 序列化 `lastMessagePreview`、`lastMessageAt`、`status`、`unreadCount`

### 4.4 AI Answer

```http
POST /api/v1/widget/answer
Authorization: Bearer <widget-token>
Content-Type: application/json

{
  "conversationId": "conv_...",
  "query": "如何和 discord 集成"
}
```

返回 SSE：

```text
event: searching
data: {"query":"...", "keywords":["Discord integration","Discord setup guide"]}

event: meta
data: {"logId":"...", "citations":[...]}

event: text-delta
data: {"text":"..."}

event: done
data: {}
```

内部复用：

- `preparePublicKbAnswerStream`
- `searchKbChunks`
- `createKbQueryLog`
- `insertMessage`

同时将用户问题和 AI 回复写入 conversation，保证 Dashboard Inbox 可见。

### 4.5 Help

```http
GET /api/v1/widget/help/collections
GET /api/v1/widget/help/articles?collection=<id>&q=<query>
GET /api/v1/widget/help/articles/:id
```

复用：

- `listPublicKbCollections`
- `listPublicKbArticles`
- `getPublicKbArticle`

区别：widget auth 下不依赖 `PORTAL_PUBLIC_READ`，但必须校验 `orgId / brandId`。

### 4.6 Changelog

```http
GET /api/v1/widget/changelog/entries
GET /api/v1/widget/changelog/entries/:slug
```

复用：

- `listPublicChangelogEntries`
- `getChangelogEntryBySlug`

### 4.7 Ticket

```http
POST /api/v1/widget/tickets
Authorization: Bearer <widget-token>

{
  "type": "bug",
  "title": "Bug report",
  "description": "...",
  "attachmentIds": []
}
```

实现策略：

- 简化版：直接创建 ticket，并关联/创建 messenger conversation。
- 工作流版：复用 `workflow-ticket-form`，让 dashboard 配置动态 ticket form。

第一阶段建议先做简化版，确保参考图里的 `Submit ticket / Bug Report` 可用。

## 5. 数据模型

Widget 配置使用独立表，按 brand 维度隔离。`brands` 继续只承载通用品牌信息；Widget 的运行时配置、菜单、快捷操作、首页推荐都进入 widget 专属表。

### 5.1 `widget_settings`

一条 brand 一条配置。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | ULID |
| `org_id` | text | FK -> `organizations.id` |
| `brand_id` | text | FK -> `brands.id`，唯一 |
| `primary_color` | text | Widget 主色，例如 `#7c5cff` |
| `launcher_icon_url` | text null | 右下角 launcher 图标 |
| `agent_name` | text | 例如 `Fibi AI Agent` / `Keeni AI Agent` |
| `agent_subtitle` | text | 例如 `The team can also help` |
| `agent_avatar_url` | text null | Agent 头像 |
| `greeting_title` | text | 首页欢迎标题 |
| `greeting_body` | text | 首页欢迎正文 |
| `home_enabled` | boolean | 是否显示 Home |
| `messages_enabled` | boolean | 是否显示 Messages |
| `help_enabled` | boolean | 是否显示 Help |
| `changelog_enabled` | boolean | 是否显示 Changelog |
| `tickets_enabled` | boolean | 是否显示 Ticket |
| `powered_by_enabled` | boolean | 是否显示 Powered by |
| `created_at` / `updated_at` | timestamp | 标准时间戳 |

索引：

- `uq_widget_settings_brand`：`brand_id` 唯一。
- `idx_widget_settings_org`：按 `org_id` 查询。

### 5.2 `widget_menu_items`

用于底部导航、Portal menu 和 Home 卡片入口。模块项和外链项统一建模。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | ULID |
| `org_id` | text | FK -> `organizations.id` |
| `brand_id` | text | FK -> `brands.id` |
| `settings_id` | text | FK -> `widget_settings.id` |
| `label` | text | 展示名称 |
| `description` | text null | 副标题或说明 |
| `icon` | text null | icon key，例如 `home` / `message` / `link` |
| `item_type` | text | `module` / `external` |
| `module_key` | text null | `home` / `messages` / `help` / `changelog` / `tickets` |
| `href` | text null | 外链 URL |
| `location` | text | `bottom_nav` / `home_card` / `portal_menu` |
| `enabled` | boolean | 是否启用 |
| `sort_order` | integer | 排序 |
| `created_at` / `updated_at` | timestamp | 标准时间戳 |

索引：

- `idx_widget_menu_items_brand_location`：`brand_id, location, sort_order`。
- `idx_widget_menu_items_settings`：`settings_id`。

约束：

- `item_type = module` 时必须有 `module_key`。
- `item_type = external` 时必须有 `href`。

### 5.3 `widget_quick_actions`

用于首页 `Ask a question`、`Submit ticket`、`Bug Report`，也可用于 Chat 页快捷 chip。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | ULID |
| `org_id` | text | FK -> `organizations.id` |
| `brand_id` | text | FK -> `brands.id` |
| `settings_id` | text | FK -> `widget_settings.id` |
| `label` | text | 展示文案 |
| `action_type` | text | `start_chat` / `submit_ticket` / `open_help` / `open_url` |
| `payload` | json | ticket type、prefill prompt、URL 等 |
| `enabled` | boolean | 是否启用 |
| `sort_order` | integer | 排序 |
| `created_at` / `updated_at` | timestamp | 标准时间戳 |

索引：

- `idx_widget_quick_actions_brand`：`brand_id, sort_order`。
- `idx_widget_quick_actions_settings`：`settings_id`。

### 5.4 `widget_featured_content`

用于 Home 页推荐文章、推荐更新和默认 Help 搜索建议。它只存引用，不复制文章正文。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | ULID |
| `org_id` | text | FK -> `organizations.id` |
| `brand_id` | text | FK -> `brands.id` |
| `settings_id` | text | FK -> `widget_settings.id` |
| `content_type` | text | `kb_article` / `changelog_entry` / `external` |
| `content_id` | text null | KB article id 或 changelog id |
| `title_override` | text null | 可选覆盖标题 |
| `image_url` | text null | Home card 图片 |
| `href` | text null | 外链 |
| `enabled` | boolean | 是否启用 |
| `sort_order` | integer | 排序 |
| `created_at` / `updated_at` | timestamp | 标准时间戳 |

索引：

- `idx_widget_featured_content_brand`：`brand_id, content_type, sort_order`。

### 5.5 TypeScript 运行时类型

```ts
type WidgetModuleKey = "home" | "messages" | "help" | "changelog" | "tickets";

type WidgetSettingsRecord = {
  id: string;
  orgId: string;
  brandId: string;
  primaryColor: string;
  launcherIconUrl: string | null;
  agentName: string;
  agentSubtitle: string;
  agentAvatarUrl: string | null;
  greetingTitle: string;
  greetingBody: string;
  homeEnabled: boolean;
  messagesEnabled: boolean;
  helpEnabled: boolean;
  changelogEnabled: boolean;
  ticketsEnabled: boolean;
  poweredByEnabled: boolean;
};

type WidgetMenuItemRecord = {
  id: string;
  orgId: string;
  brandId: string;
  settingsId: string;
  label: string;
  description: string | null;
  icon: string | null;
  itemType: "module" | "external";
  moduleKey: WidgetModuleKey | null;
  href: string | null;
  location: "bottom_nav" | "home_card" | "portal_menu";
  enabled: boolean;
  sortOrder: number;
};
```

### 5.6 初始 seed

创建 brand 时同步初始化：

- `widget_settings`
  - `primary_color` 取 `brands.theme.colors.primary`，没有则 `#7c5cff`。
  - `agent_name = "Keeni AI Agent"`。
  - `agent_subtitle = "The team can also help"`。
  - 四个主模块默认启用：Home、Messages、Help、Changelog。
- `widget_menu_items`
  - `Home`
  - `Messages`
  - `Help`
  - `Changelog`
- `widget_quick_actions`
  - `Ask a question`
  - `Submit ticket`
  - `Bug report`

## 6. 实施阶段

### Phase 1：前端壳层

状态：已完成。

- 改造 `apps/widget/src/boot.tsx` 为 Preact mount。（已完成）
- 新增 `WidgetApp`、`WidgetShell`、`BottomNav`、`Launcher`。（已完成）
- 静态实现 Home / Messages / Help / Changelog / Chat 视图。（已完成）
- 保留现有 session 与 send message 能力。（已完成）

验收：

- `pnpm --filter @keenai/widget typecheck`
- `pnpm --filter @keenai/widget build`
- launcher 可开关，底部导航可切换。

### Phase 2：消息与实时

状态：已完成。后端 `GET /widget/conversations` 已完成；现有消息、附件和 WebSocket 能力已嵌入 Preact Chat 视图；Messages 空状态、历史会话列表和 Dashboard 可见性的集成验证已完成。

- 将现有 `MessagesPanel` 能力迁移到 Preact。（已完成）
- 支持历史消息、发送、附件、WebSocket realtime。（已完成）
- 添加 empty messages state 和 `Ask a question` CTA。（已完成）

验收：

- 现有 widget tests 迁移/通过。
- 发送消息后 Dashboard Inbox 可见。

### Phase 3：配置与聚合 API

状态：已完成。独立表、migration、schema export、`GET /widget/config`、`GET /widget/home` 已完成；Widget 已读取 config/home 并应用 brand primary color/module visibility；Settings 配置通过 `GET/PATCH /widget/settings/:brandId` 写入 widget 独立表。

- 新增 `GET /widget/config`。（已完成）
- 新增 `GET /widget/home`。（已完成）
- 侧栏 Settings > Branding 的 widget/portal menu 配置与返回结构对齐。

验收：

- 改 brand color 后 widget primary color 生效。
- module disabled 后底部导航隐藏对应项。

### Phase 4：Help / Changelog

状态：已完成。Widget auth 下的 Help/Changelog endpoints 已完成；前端 Help/Changelog tab 已读取真实列表；Help 搜索、无结果状态、文章详情和更新详情交互已完成。

- 新增 widget help/changelog endpoints。（已完成）
- 前端 Help 支持 collections、articles、search。（已完成）
- Changelog 支持 list/detail。（已完成）

验收：

- 无数据、有数据、搜索无结果状态完整。

### Phase 5：AI Chat

状态：已完成。后端 `POST /widget/answer` SSE 已完成，包含 searching/meta/text-delta/done 事件和 conversation 写回；前端已接入 streaming UI 与 citations 渲染；fallback 到人工团队通过 `POST /widget/conversations/:id/handoff` 完成。

- 新增 `POST /widget/answer` SSE。（已完成）
- 前端显示 searching / streaming / citations / done。（已完成）
- AI 回答写回 conversation。（已完成）
- 支持 fallback 到人工团队。（已完成）

验收：

- 提问后可看到 `Searching knowledge base...` 状态。
- SSE 文本逐步渲染。
- 刷新后历史中有用户问题与 AI 回答。

### Phase 6：Ticket

状态：部分完成。`POST /widget/tickets` 已完成；Home quick action 已支持 `Submit ticket / Bug Report` 打开 ticket 表单并提交；附件上传/关联已完成；动态 workflow ticket form 仍待增强。

- 新增 `POST /widget/tickets`。（已完成）
- Home quick action 支持 `Submit ticket / Bug Report`。（已完成）
- Ticket 表单支持附件上传并关联到初始 conversation message。（已完成）
- 可选：将 ticket 转为 conversation 事件。

验收：

- 用户可从 widget 提交 bug report。
- Dashboard tickets 列表可见。

## 7. 测试策略

前端：

- `WidgetApp` view state tests。
- `Composer` send/upload tests。
- `BottomNav` module visibility tests。
- `ChatView` SSE reducer tests。

后端：

- `widget.config.integration.test.ts`
- `widget.conversations.integration.test.ts`
- `widget.help.integration.test.ts`
- `widget.changelog.integration.test.ts`
- `widget.answer.integration.test.ts`
- `widget.ticket.integration.test.ts`

端到端：

- seed visitor -> boot widget -> send message -> receive WS event。
- search Help -> open article。
- ask AI -> stream answer -> citations render。
- submit ticket -> dashboard ticket exists。

## 8. 兼容与迁移

- `KeenAI.boot(options)` 对外签名保持兼容。
- 老的 `MessagesPanel` 可先保留一版，等 Preact Chat 完成后删除。
- `window.KeenAI.boot` 返回的 `open / close / destroy` 保持不变。
- Shadow DOM CSS 必须继续隔离宿主页样式。
- Widget bundle 应继续输出 `dist/keenai-widget.js` IIFE。

## 9. 优先级结论

推荐先做：

1. Preact Widget shell + 静态多模块 UI。
2. 迁移现有消息能力，确保不破坏当前可用聊天链路。
3. 补 `widget/config` 和 `widget/conversations`。
4. 接 Help / Changelog。
5. 最后接 AI Answer SSE 和 Ticket。

这个顺序能最大化保留现有可用能力，同时逐步逼近参考图里的完整交互。
