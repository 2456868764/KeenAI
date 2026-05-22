# KeenAI 数据模型设计（Drizzle ORM）

> **关于双数据库后端**：本文档以 **Drizzle ORM TypeScript schema** 为单一来源（single source of truth），由 [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview) 生成 PostgreSQL 16+ / LibSQL / SQLite 三套迁移 SQL。
> - 完整接口、类型映射、向量与 FTS 抽象详见 [12-STORAGE-ABSTRACTION.md](12-STORAGE-ABSTRACTION.md)
> - 标注 `[PG only]` 的为仅 PG 高级特性（如声明式分区），LibSQL/SQLite 走应用层等价实现
> - 标注 `[SQLite/LibSQL]` 的为该后端特有写法（如 `vec0` 虚拟表 / `libsql_vector`）
> - `mastra_*` 前缀的表由 [Mastra Memory](https://mastra.ai/) 自动管理（KeenAI 仅声明 schema 文件）

## 一、设计原则

1. **多租户隔离**：所有业务表带 `org_id` + `brand_id`（适用时），索引必带前缀
2. **软删除**：核心表 `deleted_at` 字段
3. **审计字段**：`created_at`、`updated_at`、`created_by`、`updated_by`
4. **主键**：使用 **ULID**（时序可排序）·  PG / SQLite 都用 `text` 列
5. **JSON 弹性**：自定义字段用 `jsonb`（PG）/ `text` JSON1（SQLite）— Drizzle `json()` 自动适配
6. **分区表**：高写入表（messages、events、audit_logs）按时间分区
   - PG：原生 `PARTITION BY RANGE`
   - SQLite：应用层按月切表（推荐单表 + 定期归档，百万级单表足够）
7. **向量字段**：复用主库（无独立向量集群）
   - PG：`pgvector` 的 `vector(N)` 列 + HNSW 索引
   - LibSQL：原生 `libsql_vector` 列 + `libsql_vector_idx`
   - 备 SQLite：`sqlite-vec` 的 `vec0` 虚拟表 + partition key
8. **全文索引**：
   - PG：`tsvector + GIN`（中文需 zhparser）
   - LibSQL/SQLite：`FTS5` 虚拟表（中文用 jieba.js 预分词）
   - 生产可外置 Meilisearch 替代两者
9. **接口优先**：业务代码经过 `Store / VectorStore / FTSStore` 接口（详见 12），**不直接拼 SQL 方言**
10. **类型安全**：Drizzle schema 与业务 Zod schema 通过 `drizzle-zod` 自动生成、双向校验

---

## 二、核心实体 ER 图

```
┌──────────┐ 1     N ┌──────────┐ 1     N ┌──────────┐
│   Org    │────────▶│  Brand   │────────▶│ Channel  │
└──────────┘         └──────────┘         └──────────┘
     │                     │
     │ 1:N                 │ 1:N
     ▼                     ▼
┌──────────┐         ┌──────────┐         ┌──────────┐
│  Team    │         │  Inbox   │         │   User   │
└─────┬────┘         │   View   │         │ (Customer)│
      │              └──────────┘         └─────┬────┘
      │ N:N                                     │
      ▼                                          │ 1:N
┌──────────┐                                    ▼
│  Member  │            ┌──────────────────────────┐
│ (Agent)  │───────────▶│   Conversation           │
└──────────┘  N:1       └──────────┬───────────────┘
                                    │ 1:N
                                    ▼
                              ┌──────────┐
                              │ Message  │
                              └──────────┘

┌──────────┐    1   N    ┌──────────┐
│  Ticket  │◀────linked──│Conversation│
│   Type   │             └──────────┘
└────┬─────┘
     │ 1:N
     ▼
┌──────────┐    N:N    ┌────────────┐
│  Ticket  │──────────▶│   Linked   │
└──────────┘           │   Tickets  │
                       └────────────┘

┌──────────┐ 1   N ┌──────────┐ 1   N ┌──────────┐
│  Board   │──────▶│   Post   │──────▶│   Vote   │
└──────────┘       └────┬─────┘       └──────────┘
                        │ 1:N
                        ▼
                  ┌──────────┐
                  │ Comment  │
                  └──────────┘

┌──────────┐ 1   N ┌──────────┐ 1   N ┌──────────┐
│ Collec-  │──────▶│ Article  │──────▶│  Chunk   │
│  tion    │       └──────────┘       │ (Vector) │
└──────────┘                          └──────────┘

┌──────────┐
│Workflow  │ 1:N → workflow_versions, workflow_runs (Inngest run-id 关联)
└──────────┘

┌──────────────── @keenai/memory 表（受 Mastra 管理）──────────┐
│  mastra_threads ─┐                                            │
│  mastra_messages ┴─ memory_observations / episodes / facts   │
│                     / patterns / slots / entities / relations│
│                     / audit                                   │
└──────────────────────────────────────────────────────────────┘

┌──────────────── @keenai/kb 表 ──────────────────────────────┐
│ kb_sources → kb_documents → kb_chunks (vector + FTS)        │
│                          ├─ kb_entities → kb_relations      │
│                          └─ kb_query_logs / kb_golden_queries│
└─────────────────────────────────────────────────────────────┘
```

---

## 三、Schema 单一来源：Drizzle 模式

KeenAI 的所有表都在 `packages/storage/src/schema/` 下声明，按方言分两套但共享业务字段：

```
packages/storage/src/schema/
├── _shared/                # 跨方言的常量、helpers、enum 字面量
│   ├── enums.ts            # CONVERSATION_STATUS = ['open','snoozed','pending','closed']
│   ├── ulid.ts             # ulid() 默认值
│   └── timestamps.ts       # createdAt / updatedAt 列复用
├── pg/
│   ├── core.ts             # organizations / brands / teams / accounts / members
│   ├── conversation.ts     # conversations / messages / attachments / events
│   ├── ticket.ts
│   ├── workflow.ts
│   ├── ai.ts               # ai_agents / ai_actions / ai_usage
│   ├── kb.ts               # kb_sources / kb_documents / kb_chunks (vector + hnsw)
│   ├── memory.ts           # 自定义 memory_* 表（Mastra 自带表不在这里声明）
│   ├── feedback.ts
│   ├── changelog.ts
│   ├── helpcenter.ts
│   ├── notify.ts
│   ├── integration.ts
│   └── audit.ts
├── sqlite/                 # 同样的文件结构（共享列名 + 类型映射）
│   └── ...
└── index.ts                # 按 process.env.DB_DIALECT 动态 re-export
```

`drizzle.config.ts` 同时声明两套 schema 路径，CI 矩阵分别生成迁移：

```ts
// drizzle.config.pg.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema:        './packages/storage/src/schema/pg/*.ts',
  out:           './packages/storage/migrations/pg',
  dialect:       'postgresql',
  casing:        'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL_PG! },
  verbose:       true,
});

// drizzle.config.libsql.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema:        './packages/storage/src/schema/sqlite/*.ts',
  out:           './packages/storage/migrations/libsql',
  dialect:       'sqlite',
  driver:        'turso',
  casing:        'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL_LIBSQL!, authToken: process.env.LIBSQL_TOKEN },
});
```

迁移命令（`apps/api/package.json`）：

```jsonc
{
  "scripts": {
    "db:generate:pg":     "drizzle-kit generate --config drizzle.config.pg.ts",
    "db:generate:libsql": "drizzle-kit generate --config drizzle.config.libsql.ts",
    "db:generate":        "pnpm db:generate:pg && pnpm db:generate:libsql",
    "db:migrate":         "tsx scripts/migrate.ts",        // 选择方言 → Drizzle migrate()
    "db:studio":          "drizzle-kit studio"
  }
}
```

> 详细工程结构与 mastra-adapter 见 [12-STORAGE-ABSTRACTION.md § 6 - § 7](12-STORAGE-ABSTRACTION.md)。

---

## 四、Schema 详解

### 4.1 平台基础（`packages/storage/src/schema/<dialect>/core.ts`）

**PostgreSQL：**

```ts
// packages/storage/src/schema/pg/core.ts
import { pgTable, text, timestamp, jsonb, boolean, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { ulid }            from '../_shared/ulid.js';
import { timestamps }      from '../_shared/timestamps.js';

export const organizations = pgTable('organizations', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  slug:      text('slug').notNull().unique(),
  name:      text('name').notNull(),
  plan:      text('plan').notNull().default('free'),          // free / growth / pro / enterprise
  settings:  jsonb('settings').$type<Record<string, unknown>>().default({}),
  ...timestamps(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const brands = pgTable('brands', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  orgId:     text('org_id').notNull().references(() => organizations.id),
  slug:      text('slug').notNull(),
  name:      text('name').notNull(),
  domain:    text('domain'),
  logoUrl:   text('logo_url'),
  theme:     jsonb('theme').$type<{ colors?: Record<string, string>; fonts?: string[] }>().default({}),
  locale:    text('locale').default('en'),
  emailFrom: text('email_from'),
  settings:  jsonb('settings').default({}),
  ...timestamps(),
}, (t) => ({
  uqSlug:   uniqueIndex('uq_brands_org_slug').on(t.orgId, t.slug),
  idxOrg:   index('idx_brands_org').on(t.orgId),
  idxDomain: index('idx_brands_domain').on(t.domain).where(sql`${t.domain} IS NOT NULL`),
}));

export const teams = pgTable('teams', {
  id:          text('id').primaryKey().$defaultFn(ulid),
  orgId:       text('org_id').notNull().references(() => organizations.id),
  name:        text('name').notNull(),
  icon:        text('icon'),
  description: text('description'),
  ...timestamps(),
});

export const accounts = pgTable('accounts', {
  id:            text('id').primaryKey().$defaultFn(ulid),
  email:         text('email').notNull().unique(),
  passwordHash:  text('password_hash'),                       // nullable for SSO
  name:          text('name').notNull(),
  avatarUrl:     text('avatar_url'),
  locale:        text('locale').default('en'),
  timezone:      text('timezone').default('UTC'),
  lastLoginAt:   timestamp('last_login_at', { withTimezone: true }),
  mfaEnabled:    boolean('mfa_enabled').default(false),
  mfaSecret:     text('mfa_secret'),
  ...timestamps(),
});

export const members = pgTable('members', {
  id:          text('id').primaryKey().$defaultFn(ulid),
  orgId:       text('org_id').notNull().references(() => organizations.id),
  accountId:   text('account_id').notNull().references(() => accounts.id),
  role:        text('role').notNull(),                        // owner / admin / agent / lite
  seatType:    text('seat_type').notNull().default('full'),   // full / lite
  permissions: jsonb('permissions').$type<string[] | null>(),
  status:      text('status').notNull().default('active'),    // active / invited / suspended
  invitedBy:   text('invited_by').references(() => accounts.id),
  invitedAt:   timestamp('invited_at', { withTimezone: true }),
  joinedAt:    timestamp('joined_at', { withTimezone: true }),
}, (t) => ({
  uq:    uniqueIndex('uq_members_org_account').on(t.orgId, t.accountId),
  idxOrg: index('idx_members_org').on(t.orgId),
}));

export const teamMembers = pgTable('team_members', {
  teamId:   text('team_id').notNull().references(() => teams.id),
  memberId: text('member_id').notNull().references(() => members.id),
  role:     text('role'),
}, (t) => ({ pk: primaryKey({ columns: [t.teamId, t.memberId] }) }));
```

**SQLite / LibSQL（同结构 · 类型映射）：**

```ts
// packages/storage/src/schema/sqlite/core.ts
import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { ulid }       from '../_shared/ulid.js';

export const organizations = sqliteTable('organizations', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  slug:      text('slug').notNull().unique(),
  name:      text('name').notNull(),
  plan:      text('plan').notNull().default('free'),
  settings:  text('settings', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

// brands / teams / accounts / members / team_members 同构 —— 仅类型不同：
//   - jsonb → text({ mode: 'json' })
//   - timestamptz → integer({ mode: 'timestamp_ms' })
//   - boolean → integer({ mode: 'boolean' })
//   - partial index → 原生支持
```

> 后续章节为节省篇幅，只展示 **PG 版本**，SQLite 版本按上述映射规则自动派生（CI 通过契约测试保证 100% 行为等价）。

### 4.2 客户与公司

```ts
// packages/storage/src/schema/pg/customer.ts
import { pgTable, text, jsonb, timestamp, integer, decimal, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const companies = pgTable('companies', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  orgId:      text('org_id').notNull(),
  externalId: text('external_id'),
  name:       text('name').notNull(),
  domain:     text('domain'),
  industry:   text('industry'),
  size:       text('size'),
  plan:       text('plan'),
  mrr:        decimal('mrr', { precision: 12, scale: 2 }),    // 月度经常收入（优先级排序）
  attributes: jsonb('attributes').default({}),
  tags:       text('tags').array(),
  ...timestamps(),
});

export const users = pgTable('users', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  brandId:      text('brand_id'),
  externalId:   text('external_id'),                            // 客户系统 ID
  email:        text('email'),
  name:         text('name'),
  phone:        text('phone'),
  avatarUrl:    text('avatar_url'),
  companyId:    text('company_id').references(() => companies.id),
  locale:       text('locale'),
  timezone:     text('timezone'),
  country:      text('country'),
  userHash:     text('user_hash'),                              // HMAC widget 验证
  attributes:   jsonb('attributes').$type<Record<string, unknown>>().default({}),
  tags:         text('tags').array(),
  lastSeenAt:   timestamp('last_seen_at', { withTimezone: true }),
  firstSeenAt:  timestamp('first_seen_at', { withTimezone: true }).defaultNow(),
  ...timestamps(),
}, (t) => ({
  uqExternal: uniqueIndex('uq_users_org_external').on(t.orgId, t.externalId),
  idxEmail:   index('idx_users_org_email').on(t.orgId, t.email),
  idxCompany: index('idx_users_company').on(t.companyId),
  idxAttrGin: index('idx_users_attributes_gin').using('gin', t.attributes),
  idxTagsGin: index('idx_users_tags_gin').using('gin', t.tags),
}));

export const userIdentities = pgTable('user_identities', {
  id:       text('id').primaryKey().$defaultFn(ulid),
  userId:   text('user_id').notNull().references(() => users.id),
  type:     text('type').notNull(),                             // email / phone / external_id / oauth
  value:    text('value').notNull(),
  verified: boolean('verified').default(false),
}, (t) => ({
  uq: uniqueIndex('uq_user_identities_type_value').on(t.type, t.value),
}));
```

> **[SQLite/LibSQL] `text().array()` 等价**：使用 `text({ mode: 'json' })` 存 JSON 数组，配合 `json_each()` 查询；GIN 索引 → 应用层倒排表或全文索引。

### 4.3 对话与消息

```ts
// packages/storage/src/schema/pg/conversation.ts
import { pgTable, text, jsonb, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';

export const conversations = pgTable('conversations', {
  id:             text('id').primaryKey().$defaultFn(ulid),
  orgId:          text('org_id').notNull(),
  brandId:        text('brand_id').notNull(),
  userId:         text('user_id'),
  channelType:    text('channel_type').notNull(),             // messenger / email / slack / ...
  channelId:      text('channel_id').notNull(),

  status:         text('status').notNull().default('open'),   // open / snoozed / pending / closed
  priority:       text('priority').default('normal'),
  assigneeId:     text('assignee_id'),
  teamId:         text('team_id'),

  subject:        text('subject'),                             // email subject
  tags:           text('tags').array(),
  attributes:     jsonb('attributes').$type<Record<string, unknown>>().default({}),  // CvDA

  firstResponseAt: timestamp('first_response_at',  { withTimezone: true }),
  lastMessageAt:   timestamp('last_message_at',    { withTimezone: true }),
  snoozedUntil:    timestamp('snoozed_until',      { withTimezone: true }),
  closedAt:        timestamp('closed_at',          { withTimezone: true }),

  slaPolicyId:        text('sla_policy_id'),
  slaFirstReplyDue:   timestamp('sla_first_reply_due', { withTimezone: true }),
  slaResolutionDue:   timestamp('sla_resolution_due',  { withTimezone: true }),
  slaBreached:        boolean('sla_breached').default(false),

  unreadCount:    integer('unread_count').default(0),
  messageCount:   integer('message_count').default(0),
  rating:         integer('rating'),                            // CSAT 1-5
  ratingComment:  text('rating_comment'),

  ...timestamps(),
}, (t) => ({
  idxOrgStatus:  index('idx_conv_org_status').on(t.orgId, t.status, t.lastMessageAt.desc()),
  idxAssignee:   index('idx_conv_assignee').on(t.assigneeId, t.status, t.lastMessageAt.desc()),
  idxTeam:       index('idx_conv_team').on(t.teamId, t.status),
  idxUser:       index('idx_conv_user').on(t.userId),
  idxSla:        index('idx_conv_sla').on(t.slaFirstReplyDue)
                   .where(sql`${t.slaBreached} = false`),
  idxTagsGin:    index('idx_conv_tags_gin').using('gin', t.tags),
}));

// 消息（[PG only] 按月声明式分区；[SQLite] 单表 + idx_msg_created）
export const messages = pgTable('messages', {
  id:             text('id').primaryKey().$defaultFn(ulid),
  orgId:          text('org_id').notNull(),
  conversationId: text('conversation_id').notNull(),

  senderType:     text('sender_type').notNull(),               // user / agent / ai / bot / system
  senderId:       text('sender_id'),                           // user_id / member_id / 'keeni'

  content:        jsonb('content').notNull(),                  // Tiptap JSON
  plainText:      text('plain_text'),                          // 全文搜索 + 邮件回退
  contentFormat:  text('content_format').default('tiptap'),    // tiptap / html / markdown / plain

  isInternal:     boolean('is_internal').default(false),       // 内部 Note
  inReplyTo:      text('in_reply_to'),
  sentVia:        text('sent_via'),                            // web / messenger / email / api
  deliveryStatus: text('delivery_status'),                     // pending/sent/delivered/failed/read

  metadata:       jsonb('metadata').default({}),               // email headers · messageKind · enrichmentStatus
  editedAt:       timestamp('edited_at',   { withTimezone: true }),
  deletedAt:      timestamp('deleted_at',  { withTimezone: true }),
  createdAt:      timestamp('created_at',  { withTimezone: true }).defaultNow(),
}, (t) => ({
  idxConv: index('idx_msg_conv').on(t.conversationId, t.createdAt),
}));
```

**[PG only] 月度分区**（不在 Drizzle schema 中声明，由迁移后置 SQL 创建）：

```sql
-- packages/storage/migrations/pg/post/000010_partition_messages.sql
ALTER TABLE messages RENAME TO _messages_legacy;
CREATE TABLE messages (LIKE _messages_legacy INCLUDING ALL) PARTITION BY RANGE (created_at);

-- 一次性回灌 + 自动月分区（pg_partman / 自定义 cron）
SELECT partman.create_parent('public.messages', 'created_at', 'native', 'monthly');
```

**[SQLite/LibSQL] 等价**：默认单表 + 强索引（百万级足够）；超阈值由 Inngest cron 自动归档到 `messages_archive`。

```ts
// packages/storage/src/schema/pg/conversation.ts (续)
export const attachments = pgTable('attachments', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  messageId:    text('message_id').references(() => messages.id),
  fileName:     text('file_name'),
  contentType:  text('content_type'),
  sizeBytes:    bigint('size_bytes', { mode: 'number' }),
  storageKey:   text('storage_key').notNull(),                 // S3 key 或本地 uploads 路径
  thumbnailKey: text('thumbnail_key'),
  metadata:     jsonb('metadata').default({}),               // transcript · visionSummary · extractedText · durationMs
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

> **多模态字段语义**（`MessagePart` · `messageKind` · enrichment）：见 [14-MULTIMODAL.md § 八](14-MULTIMODAL.md)。

```ts
// packages/storage/src/schema/pg/conversation.ts (续 · reactions)
export const reactions = pgTable('reactions', {
  messageId: text('message_id').notNull().references(() => messages.id),
  actorType: text('actor_type').notNull(),
  actorId:   text('actor_id').notNull(),
  emoji:     text('emoji').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.messageId, t.actorType, t.actorId, t.emoji] }),
}));

export const conversationEvents = pgTable('conversation_events', {
  id:             text('id').primaryKey().$defaultFn(ulid),
  conversationId: text('conversation_id').notNull(),
  eventType:      text('event_type').notNull(),                // assigned/tagged/closed/snoozed/...
  actorType:      text('actor_type'),                          // agent/customer/ai/system/workflow
  actorId:        text('actor_id'),
  payload:        jsonb('payload'),
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  idx: index('idx_conv_events').on(t.conversationId, t.createdAt),
}));
```

### 4.4 渠道

```ts
// packages/storage/src/schema/pg/channel.ts
export const channels = pgTable('channels', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  orgId:     text('org_id').notNull(),
  brandId:   text('brand_id'),
  type:      text('type').notNull(),                           // messenger/email/slack/...
  name:      text('name'),
  config:    jsonb('config').notNull(),                        // channel-specific settings
  enabled:   boolean('enabled').default(true),
  ...timestamps(),
});

// 邮件渠道配置（config 示例 - Zod-typed via @keenai/shared）：
// {
//   smtp_host, smtp_port, smtp_user, smtp_pass_ref,
//   from_email, from_name,
//   imap_host, imap_pass_ref
// }
```

### 4.5 工单

```ts
// packages/storage/src/schema/pg/ticket.ts
export const ticketTypes = pgTable('ticket_types', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  orgId:     text('org_id').notNull(),
  name:      text('name').notNull(),
  kind:      text('kind').notNull(),                           // customer/back_office/tracker
  icon:      text('icon'),
  fields:    jsonb('fields'),                                  // FieldDef[]
  statusIds: text('status_ids').array(),
  ...timestamps(),
});

export const ticketStatuses = pgTable('ticket_statuses', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  name:         text('name').notNull(),
  category:     text('category').notNull(),                     // under_review/active/waiting/done
  color:        text('color'),
  isDefault:    boolean('is_default').default(false),
  ticketTypeIds: text('ticket_type_ids').array(),
  sortOrder:    integer('sort_order'),
}, (t) => ({
  uq: uniqueIndex('uq_ticket_statuses_org_name').on(t.orgId, t.name),
}));

export const tickets = pgTable('tickets', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  typeId:       text('type_id').notNull().references(() => ticketTypes.id),
  title:        text('title').notNull(),
  description:  jsonb('description'),                           // Tiptap JSON
  statusId:     text('status_id').references(() => ticketStatuses.id),
  priority:     text('priority').default('normal'),
  assigneeId:   text('assignee_id'),
  teamId:       text('team_id'),
  reporterId:   text('reporter_id'),
  customerId:   text('customer_id'),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().default({}),
  dueDate:      timestamp('due_date', { withTimezone: true }),
  closedAt:     timestamp('closed_at', { withTimezone: true }),
  ...timestamps(),
}, (t) => ({
  idxOrgStatus: index('idx_tickets_org_status').on(t.orgId, t.statusId),
  idxAssignee:  index('idx_tickets_assignee').on(t.assigneeId),
}));

export const ticketConversations = pgTable('ticket_conversations', {
  ticketId:       text('ticket_id').notNull().references(() => tickets.id),
  conversationId: text('conversation_id').notNull().references(() => conversations.id),
  relationship:   text('relationship').notNull().default('primary'),  // primary / linked
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.ticketId, t.conversationId] }) }));

export const ticketLinks = pgTable('ticket_links', {
  parentId: text('parent_id').notNull().references(() => tickets.id),
  childId:  text('child_id').notNull().references(() => tickets.id),
  linkType: text('link_type').notNull(),                        // tracker/blocks/duplicates
}, (t) => ({ pk: primaryKey({ columns: [t.parentId, t.childId, t.linkType] }) }));

export const ticketEvents = pgTable('ticket_events', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  ticketId:  text('ticket_id').notNull(),
  eventType: text('event_type').notNull(),
  actorId:   text('actor_id'),
  payload:   jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

### 4.6 工作流（Inngest 关联）

```ts
// packages/storage/src/schema/pg/workflow.ts
export const workflows = pgTable('workflows', {
  id:          text('id').primaryKey().$defaultFn(ulid),
  orgId:       text('org_id').notNull(),
  name:        text('name').notNull(),
  description: text('description'),
  status:      text('status').notNull().default('draft'),       // draft/active/paused/archived
  trigger:     jsonb('trigger').notNull(),                       // TriggerSpec
  steps:       jsonb('steps').notNull(),                         // StepSpec[]
  sortOrder:   integer('sort_order'),
  version:     integer('version').default(1),
  createdBy:   text('created_by'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  ...timestamps(),
});

export const workflowVersions = pgTable('workflow_versions', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  workflowId: text('workflow_id').notNull(),
  version:    integer('version').notNull(),
  snapshot:   jsonb('snapshot').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({ uq: uniqueIndex('uq_wfver_workflow_version').on(t.workflowId, t.version) }));

export const workflowRuns = pgTable('workflow_runs', {
  id:            text('id').primaryKey().$defaultFn(ulid),
  workflowId:    text('workflow_id').notNull(),
  version:       integer('version').notNull(),
  triggerEvent:  jsonb('trigger_event'),
  status:        text('status').notNull(),                       // running/completed/failed/cancelled
  startedAt:     timestamp('started_at',   { withTimezone: true }).defaultNow(),
  completedAt:   timestamp('completed_at', { withTimezone: true }),
  error:         text('error'),
  inngestRunId:  text('inngest_run_id'),                         // 关联 Inngest function run
  inngestEventId: text('inngest_event_id'),                      // 触发事件 ID
}, (t) => ({
  idx: index('idx_wfrun_workflow').on(t.workflowId, t.startedAt.desc()),
  idxInngest: index('idx_wfrun_inngest').on(t.inngestRunId),
}));
```

### 4.7 AI / Keeni Agent

```ts
// packages/storage/src/schema/pg/ai.ts
export const aiAgents = pgTable('ai_agents', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  brandId:      text('brand_id').notNull(),
  name:         text('name').notNull().default('Keeni'),
  avatarUrl:    text('avatar_url'),
  systemPrompt: text('system_prompt'),
  voice:        text('voice'),
  languages:    text('languages').array(),
  llmProvider:  text('llm_provider'),                            // openai/anthropic/ollama/...
  llmModel:     text('llm_model'),
  llmFallback:  jsonb('llm_fallback').$type<{ provider: string; model: string }[]>(),
  settings:     jsonb('settings').default({}),
  ...timestamps(),
}, (t) => ({ uq: uniqueIndex('uq_ai_agents_brand').on(t.brandId) }));

// Custom Actions（Function Calling Tool 定义）
export const aiActions = pgTable('ai_actions', {
  id:               text('id').primaryKey().$defaultFn(ulid),
  orgId:            text('org_id').notNull(),
  name:             text('name').notNull(),
  description:      text('description'),
  whenToUse:        text('when_to_use'),
  parametersSchema: jsonb('parameters_schema').notNull(),        // JSON Schema (Zod → toJSONSchema)
  endpoint:         text('endpoint').notNull(),
  method:           text('method').default('POST'),
  headers:          jsonb('headers'),
  authType:         text('auth_type'),                           // none/bearer/hmac/basic
  authSecretRef:    text('auth_secret_ref'),
  dataAccess:       jsonb('data_access'),                        // 响应字段白名单
  sandbox:          text('sandbox').default('http_direct'),      // http_direct/workers/isolated_vm
  enabled:          boolean('enabled').default(true),
  ...timestamps(),
});

// AI 调用日志（计费 + 调试）—— [PG only] PARTITION BY；[SQLite] 单表 + idx
export const aiUsage = pgTable('ai_usage', {
  id:               text('id').primaryKey().$defaultFn(ulid),
  orgId:            text('org_id').notNull(),
  conversationId:   text('conversation_id'),
  provider:         text('provider'),
  model:            text('model'),
  promptTokens:     integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens:      integer('total_tokens'),
  costUsd:          decimal('cost_usd', { precision: 10, scale: 6 }),
  latencyMs:        integer('latency_ms'),
  purpose:          text('purpose'),                             // chat/embed/rerank/classify
  traceId:          text('trace_id'),                            // OTel correlation
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  idxOrg:     index('idx_ai_usage_org_created').on(t.orgId, t.createdAt.desc()),
  idxTrace:   index('idx_ai_usage_trace').on(t.traceId),
}));

// Resolution 计费
export const aiResolutions = pgTable('ai_resolutions', {
  id:             text('id').primaryKey().$defaultFn(ulid),
  orgId:          text('org_id').notNull(),
  conversationId: text('conversation_id').notNull(),
  type:           text('type').notNull(),                        // confirmed / assumed
  resolvedAt:     timestamp('resolved_at', { withTimezone: true }).defaultNow(),
  billed:         boolean('billed').default(false),
  refunded:       boolean('refunded').default(false),
}, (t) => ({ uq: uniqueIndex('uq_ai_resolution_conv').on(t.conversationId) }));
```

> ⚠️ 注意：原 `ai_chunks` / `ai_sources` 表已**重命名**并独立为 KB 模块（`kb_*` 前缀，见 4.8）。

### 4.8 知识库 / RAG（`@keenai/kb`）

> 详见 [11-RAG-KNOWLEDGE.md § 8.1 数据库 Schema](11-RAG-KNOWLEDGE.md)。

**PostgreSQL 关键表（含向量列）：**

```ts
// packages/storage/src/schema/pg/kb.ts
import { pgTable, text, jsonb, timestamp, integer, boolean, decimal, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';                   // pgvector 扩展类型

export const kbSources = pgTable('kb_sources', {
  id:            text('id').primaryKey().$defaultFn(ulid),
  orgId:         text('org_id').notNull(),
  brandId:       text('brand_id').notNull(),
  type:          text('type').notNull(),                        // help_center/file/url/notion/github/...
  name:          text('name').notNull(),
  config:        jsonb('config').notNull(),                     // Zod-typed connector config
  status:        text('status').notNull().default('pending'),   // pending/indexing/ready/failed
  lastIndexedAt: timestamp('last_indexed_at', { withTimezone: true }),
  docCount:      integer('doc_count').default(0),
  chunkCount:    integer('chunk_count').default(0),
  error:         text('error'),
  ...timestamps(),
}, (t) => ({ idx: index('idx_kb_sources_brand').on(t.brandId, t.status) }));

export const kbDocuments = pgTable('kb_documents', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  orgId:     text('org_id').notNull(),
  brandId:   text('brand_id').notNull(),
  sourceId:  text('source_id').notNull().references(() => kbSources.id),
  url:       text('url'),
  title:     text('title'),
  mime:      text('mime'),
  hash:      text('hash').notNull(),                            // 去重
  version:   integer('version').default(1),
  metadata:  jsonb('metadata').default({}),
  ...timestamps(),
}, (t) => ({
  idxBrand: index('idx_kb_docs_brand').on(t.brandId, t.sourceId),
  uqHash:   uniqueIndex('uq_kb_docs_hash').on(t.brandId, t.hash),
}));

export const kbChunks = pgTable('kb_chunks', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  brandId:      text('brand_id').notNull(),
  documentId:   text('document_id').notNull().references(() => kbDocuments.id),
  ordinal:      integer('ordinal').notNull(),
  content:      text('content').notNull(),
  contextual:   text('contextual'),                             // Anthropic Contextual Retrieval 前置
  embedding:    vector('embedding', { dimensions: 1024 }),      // bge-m3 默认 1024 维
  metadata:     jsonb('metadata').default({}),
  tokens:       integer('tokens'),
  ...timestamps(),
}, (t) => ({
  idxVector:    index('idx_kb_chunks_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops'))
                  .with({ m: 16, ef_construction: 200 }),
  idxBrand:     index('idx_kb_chunks_brand').on(t.brandId, t.documentId, t.ordinal),
}));

export const kbEntities = pgTable('kb_entities', {
  id:       text('id').primaryKey().$defaultFn(ulid),
  orgId:    text('org_id').notNull(),
  brandId:  text('brand_id').notNull(),
  type:     text('type').notNull(),                             // Product/Feature/Concept/Policy/...
  name:     text('name').notNull(),
  aliases:  text('aliases').array(),
  embedding: vector('embedding', { dimensions: 1024 }),
  ...timestamps(),
}, (t) => ({
  uq:   uniqueIndex('uq_kb_entities').on(t.brandId, t.type, t.name),
  idx:  index('idx_kb_entities_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
}));

export const kbRelations = pgTable('kb_relations', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  orgId:      text('org_id').notNull(),
  brandId:    text('brand_id').notNull(),
  sourceId:   text('source_entity_id').notNull().references(() => kbEntities.id),
  targetId:   text('target_entity_id').notNull().references(() => kbEntities.id),
  relation:   text('relation').notNull(),                       // is_part_of / depends_on / ...
  confidence: decimal('confidence', { precision: 4, scale: 3 }),
  evidence:   jsonb('evidence'),                                // chunk_ids[]
  ...timestamps(),
}, (t) => ({ idx: index('idx_kb_relations').on(t.brandId, t.sourceId, t.relation) }));

export const kbQueryLogs = pgTable('kb_query_logs', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  brandId:      text('brand_id').notNull(),
  queryText:    text('query_text').notNull(),
  retrievedIds: text('retrieved_ids').array(),
  latencyMs:    integer('latency_ms'),
  userFeedback: text('user_feedback'),                          // helpful / not_helpful
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({ idx: index('idx_kb_logs_brand').on(t.brandId, t.createdAt.desc()) }));

export const kbGoldenQueries = pgTable('kb_golden_queries', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  brandId:      text('brand_id').notNull(),
  query:        text('query').notNull(),
  expectedDocs: text('expected_doc_ids').array(),
  ...timestamps(),
});
```

**[SQLite/LibSQL] 等价（vector 列）：**

```ts
// packages/storage/src/schema/sqlite/kb.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// LibSQL：原生 libsql_vector
export const kbChunks = sqliteTable('kb_chunks', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  orgId:      text('org_id').notNull(),
  brandId:    text('brand_id').notNull(),
  documentId: text('document_id').notNull(),
  ordinal:    integer('ordinal').notNull(),
  content:    text('content').notNull(),
  contextual: text('contextual'),
  // libsql_vector：用 raw SQL 表达 F32_BLOB(1024)
  embedding:  text('embedding').$type<Float32Array>().notNull(),  // 实际为 F32_BLOB
  metadata:   text('metadata', { mode: 'json' }).default({}),
  tokens:     integer('tokens'),
  createdAt:  integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
});

// 索引由迁移后置 SQL 创建：
// CREATE INDEX idx_kb_chunks_vec ON kb_chunks(libsql_vector_idx(embedding, 'metric=cosine'));
```

**[Fallback SQLite] `sqlite-vec` 的 `vec0` 虚拟表**（迁移后置原生 SQL）：

```sql
-- packages/storage/migrations/libsql/post/000001_vec0_chunks.sql
CREATE VIRTUAL TABLE vec_kb_chunks USING vec0(
  id text primary key,
  embedding float[1024],
  org_id text partition key,
  brand_id text partition key,
  document_type text,
  +content text,            -- auxiliary
  +metadata text            -- auxiliary, JSON
);
-- 业务通过 VectorStore 接口统一查询，详见 12 §3.2
```

### 4.9 Memory 系统（`@keenai/memory`）

> 详见 [10-AGENT-MEMORY.md § 12 数据 Schema](10-AGENT-MEMORY.md)。
>
> **重要**：`mastra_threads` / `mastra_messages` / `mastra_resources` 由 Mastra Memory 自动创建（通过 `@mastra/pg` / `@mastra/libsql` 适配器），无需在 KeenAI schema 中重复声明。下表为 KeenAI 自定义扩展：

```ts
// packages/storage/src/schema/pg/memory.ts
import { vector } from 'drizzle-orm/pg-core';

export const memoryObservations = pgTable('memory_observations', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  brandId:      text('brand_id'),
  scope:        text('scope').notNull(),                        // conv/user/brand/team
  scopeId:      text('scope_id').notNull(),
  threadId:     text('thread_id'),                              // 关联 mastra_threads.id
  source:       text('source'),                                 // message_id / event_id
  content:      text('content').notNull(),
  embedding:    vector('embedding', { dimensions: 1024 }),
  metadata:     jsonb('metadata').default({}),
  confidence:   decimal('confidence', { precision: 4, scale: 3 }).default('1'),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  idxScope:  index('idx_mem_obs_scope').on(t.scope, t.scopeId, t.createdAt.desc()),
  idxHnsw:   index('idx_mem_obs_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
}));

export const memoryEpisodes = pgTable('memory_episodes', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  orgId:     text('org_id').notNull(),
  brandId:   text('brand_id'),
  scope:     text('scope').notNull(),
  scopeId:   text('scope_id').notNull(),
  threadId:  text('thread_id'),
  summary:   text('summary').notNull(),
  topic:     text('topic'),
  outcome:   text('outcome'),                                   // resolved / escalated / unresolved
  sentiment: text('sentiment'),
  startsAt:  timestamp('starts_at', { withTimezone: true }),
  endsAt:    timestamp('ends_at',   { withTimezone: true }),
  embedding: vector('embedding', { dimensions: 1024 }),
  ...timestamps(),
}, (t) => ({
  idxScope: index('idx_mem_ep_scope').on(t.scope, t.scopeId, t.endsAt.desc()),
  idxHnsw:  index('idx_mem_ep_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
}));

export const memoryFacts = pgTable('memory_facts', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  brandId:      text('brand_id'),
  scope:        text('scope').notNull(),
  scopeId:      text('scope_id').notNull(),
  predicate:    text('predicate').notNull(),                    // e.g. "prefers_language"
  object:       jsonb('object'),                                // "en" / {plan: "pro"} / [...]
  confidence:   decimal('confidence', { precision: 4, scale: 3 }).default('1'),
  importance:   decimal('importance', { precision: 4, scale: 3 }).default('0.5'),
  source:       text('source'),
  lastAccessAt: timestamp('last_access_at', { withTimezone: true }),
  decayAt:      timestamp('decay_at',       { withTimezone: true }),
  embedding:    vector('embedding', { dimensions: 1024 }),
  ...timestamps(),
}, (t) => ({
  uq:       uniqueIndex('uq_mem_facts').on(t.scope, t.scopeId, t.predicate),
  idxImp:   index('idx_mem_facts_importance').on(t.scope, t.scopeId, t.importance.desc()),
}));

export const memoryPatterns = pgTable('memory_patterns', {
  id:          text('id').primaryKey().$defaultFn(ulid),
  orgId:       text('org_id').notNull(),
  brandId:     text('brand_id'),
  scope:       text('scope').notNull().default('brand'),
  patternType: text('pattern_type').notNull(),                  // skill_candidate / playbook / heuristic
  pattern:     jsonb('pattern').notNull(),                      // structured pattern
  hitCount:    integer('hit_count').default(0),
  successRate: decimal('success_rate', { precision: 4, scale: 3 }),
  ...timestamps(),
}, (t) => ({ idx: index('idx_mem_patterns').on(t.brandId, t.patternType) }));

export const memorySlots = pgTable('memory_slots', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  orgId:     text('org_id').notNull(),
  brandId:   text('brand_id'),
  scope:     text('scope').notNull(),
  scopeId:   text('scope_id').notNull(),
  key:       text('key').notNull(),                             // e.g. "preferred_language" / "company.size"
  value:     jsonb('value'),
  source:    text('source'),
  ...timestamps(),
}, (t) => ({ uq: uniqueIndex('uq_mem_slots').on(t.scope, t.scopeId, t.key) }));

export const memoryAudit = pgTable('memory_audit', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  orgId:      text('org_id').notNull(),
  brandId:    text('brand_id'),
  scope:      text('scope').notNull(),
  scopeId:    text('scope_id').notNull(),
  action:     text('action').notNull(),                         // write / read / forget / consolidate
  payload:    jsonb('payload'),
  actorType:  text('actor_type'),                               // agent / system / human
  actorId:    text('actor_id'),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({ idx: index('idx_mem_audit_scope').on(t.scope, t.scopeId, t.createdAt.desc()) }));
```

> **Memory Tree 扩展表**（OpenHuman 式 seal pipeline）：见 [15-MEMORY-TREE.md § 十](15-MEMORY-TREE.md)。与上表 **并存**，L2 `memory_episodes` 可由 `memory_summaries` seal 物化。

```ts
// packages/storage/src/schema/pg/memory-tree.ts（规划）
export const memoryChunks = pgTable('memory_chunks', {
  id:            text('id').primaryKey(),                     // content-addressed sha256
  orgId:         text('org_id').notNull(),
  brandId:       text('brand_id').notNull(),
  sourceRef:     text('source_ref').notNull(),                  // message_id / ticket_comment_id
  bodyMd:        text('body_md').notNull(),
  lifecycle:     text('lifecycle').notNull(),                   // pending|admitted|buffered|sealed|dropped
  fastScore:     decimal('fast_score', { precision: 4, scale: 3 }),
  deepScore:     decimal('deep_score', { precision: 4, scale: 3 }),
  embedding:     vector('embedding', { dimensions: 1024 }),
  metadata:      jsonb('metadata').default({}),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  idxScope: index('idx_mem_chunk_org_brand').on(t.orgId, t.brandId, t.createdAt.desc()),
}));

export const memoryTreeBuffers = pgTable('memory_tree_buffers', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  orgId:      text('org_id').notNull(),
  brandId:    text('brand_id').notNull(),
  scopeKey:   text('scope_key').notNull(),                      // conv:xxx | customer:yyy | brand:zzz:day:...
  level:      integer('level').notNull().default(0),              // L0 buffer
  leafIds:    text('leaf_ids').array().notNull().default([]),
  tokenCount: integer('token_count').default(0),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  uq: uniqueIndex('uq_mem_tree_buffer').on(t.orgId, t.brandId, t.scopeKey, t.level),
}));

export const memorySummaries = pgTable('memory_summaries', {
  id:          text('id').primaryKey().$defaultFn(ulid),
  orgId:       text('org_id').notNull(),
  brandId:     text('brand_id').notNull(),
  scopeKey:    text('scope_key').notNull(),
  level:       integer('level').notNull(),                      // L1, L2, ...
  parentId:    text('parent_id'),
  title:       text('title'),
  summary:     text('summary').notNull(),
  provenance:  jsonb('provenance').notNull(),                   // { chunkIds[], messageIds[] }
  sealedAt:    timestamp('sealed_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  idx: index('idx_mem_summary_scope').on(t.orgId, t.brandId, t.scopeKey, t.level),
}));

export const memoryHotness = pgTable('memory_hotness', {
  orgId:      text('org_id').notNull(),
  brandId:    text('brand_id').notNull(),
  entityType: text('entity_type').notNull(),                    // customer | kg_entity
  entityId:   text('entity_id').notNull(),
  score:      decimal('score', { precision: 8, scale: 3 }).notNull(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.orgId, t.brandId, t.entityType, t.entityId] }),
}));
```

### 4.10 Feedback Portal

```ts
// packages/storage/src/schema/pg/feedback.ts
export const feedbackBoards = pgTable('feedback_boards', {
  id:          text('id').primaryKey().$defaultFn(ulid),
  orgId:       text('org_id').notNull(),
  brandId:     text('brand_id').notNull(),
  slug:        text('slug').notNull(),
  name:        text('name').notNull(),
  description: text('description'),
  public:      boolean('public').default(true),
  icon:        text('icon'),
  settings:    jsonb('settings').default({}),
  ...timestamps(),
}, (t) => ({ uq: uniqueIndex('uq_fb_boards_org_slug').on(t.orgId, t.slug) }));

export const feedbackCategories = pgTable('feedback_categories', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  boardId:   text('board_id').notNull(),
  name:      text('name').notNull(),
  color:     text('color'),
  sortOrder: integer('sort_order'),
});

export const feedbackStatuses = pgTable('feedback_statuses', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  boardId:   text('board_id').notNull(),
  name:      text('name').notNull(),                            // Open / Planned / In Progress / Done
  color:     text('color'),
  public:    boolean('public').default(true),
  sortOrder: integer('sort_order'),
});

export const feedbackPosts = pgTable('feedback_posts', {
  id:             text('id').primaryKey().$defaultFn(ulid),
  orgId:          text('org_id').notNull(),
  boardId:        text('board_id').notNull(),
  title:          text('title').notNull(),
  content:        jsonb('content'),
  plainText:      text('plain_text'),
  authorId:       text('author_id'),                            // user_id（外部）
  authorMemberId: text('author_member_id'),                     // member_id（客服代提）
  statusId:       text('status_id'),
  categoryId:     text('category_id'),
  tags:           text('tags').array(),
  upvoteCount:    integer('upvote_count').default(0),
  commentCount:   integer('comment_count').default(0),
  mrrScore:       decimal('mrr_score', { precision: 12, scale: 2 }).default('0'),  // 投票者 MRR 总和
  embedding:      vector('embedding', { dimensions: 1536 }),    // 自动去重
  eta:            timestamp('eta', { withTimezone: true }),
  ...timestamps(),
}, (t) => ({
  idxBoard:  index('idx_fb_posts_board').on(t.boardId, t.statusId, t.upvoteCount.desc()),
  idxHnsw:   index('idx_fb_posts_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
}));

export const feedbackVotes = pgTable('feedback_votes', {
  postId:    text('post_id').notNull(),
  userId:    text('user_id').notNull(),
  weight:    decimal('weight', { precision: 10, scale: 2 }).default('1'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.postId, t.userId] }) }));

export const feedbackSubscriptions = pgTable('feedback_subscriptions', {
  postId:    text('post_id').notNull(),
  userId:    text('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.postId, t.userId] }) }));

export const feedbackComments = pgTable('feedback_comments', {
  id:             text('id').primaryKey().$defaultFn(ulid),
  postId:         text('post_id').notNull(),
  authorId:       text('author_id'),
  authorMemberId: text('author_member_id'),
  content:        jsonb('content'),
  parentId:       text('parent_id'),                            // 嵌套评论
  ...timestamps(),
});
```

### 4.11 Roadmap / Changelog / Help Center

字段与原设计一致，类型映射照搬 4.1 规则。这里仅列出关键 schema：

```ts
// packages/storage/src/schema/pg/roadmap.ts
export const roadmaps = pgTable('roadmaps', {
  id:       text('id').primaryKey().$defaultFn(ulid),
  orgId:    text('org_id').notNull(),
  brandId:  text('brand_id').notNull(),
  slug:     text('slug').notNull(),
  name:     text('name').notNull(),
  public:   boolean('public').default(true),
  columns:  jsonb('columns').$type<string[]>(),                 // ['Planned','In Progress','Done']
  settings: jsonb('settings'),
}, (t) => ({ uq: uniqueIndex('uq_roadmaps_org_slug').on(t.orgId, t.slug) }));

export const roadmapItems = pgTable('roadmap_items', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  roadmapId:    text('roadmap_id').notNull(),
  title:        text('title').notNull(),
  description:  jsonb('description'),
  columnId:     text('column_id').notNull(),
  sortOrder:    integer('sort_order'),
  linkedPostId: text('linked_post_id').references(() => feedbackPosts.id),
  eta:          date('eta'),
  ...timestamps(),
});

// packages/storage/src/schema/pg/changelog.ts
export const changelogEntries = pgTable('changelog_entries', {
  id:              text('id').primaryKey().$defaultFn(ulid),
  orgId:           text('org_id').notNull(),
  brandId:         text('brand_id').notNull(),
  slug:            text('slug').notNull(),
  title:           text('title').notNull(),
  summary:         text('summary'),
  content:         jsonb('content'),
  plainText:       text('plain_text'),
  coverImageUrl:   text('cover_image_url'),
  categoryTags:    text('category_tags').array(),               // New/Improved/Fixed
  status:          text('status').default('draft'),             // draft/scheduled/published
  publishedAt:     timestamp('published_at', { withTimezone: true }),
  scheduledAt:     timestamp('scheduled_at', { withTimezone: true }),
  audienceFilter:  jsonb('audience_filter'),
  linkedPostIds:   text('linked_post_ids').array(),
  authorMemberId:  text('author_member_id'),
  viewCount:       integer('view_count').default(0),
  reactionCounts:  jsonb('reaction_counts').default({}),
  locale:          text('locale').default('en'),
  translations:    jsonb('translations'),                        // {zh: {title, content}}
  ...timestamps(),
}, (t) => ({ uq: uniqueIndex('uq_changelog_brand_slug').on(t.brandId, t.slug) }));

// packages/storage/src/schema/pg/helpcenter.ts
export const helpCollections = pgTable('help_collections', {
  id:          text('id').primaryKey().$defaultFn(ulid),
  orgId:       text('org_id').notNull(),
  brandId:     text('brand_id').notNull(),
  slug:        text('slug').notNull(),
  name:        text('name').notNull(),
  description: text('description'),
  icon:        text('icon'),
  parentId:    text('parent_id'),                               // 树形
  sortOrder:   integer('sort_order'),
  locale:      text('locale').default('en'),
}, (t) => ({ uq: uniqueIndex('uq_help_coll_brand_slug_locale').on(t.brandId, t.slug, t.locale) }));

export const helpArticles = pgTable('help_articles', {
  id:               text('id').primaryKey().$defaultFn(ulid),
  orgId:            text('org_id').notNull(),
  brandId:          text('brand_id').notNull(),
  collectionId:     text('collection_id').references(() => helpCollections.id),
  slug:             text('slug').notNull(),
  title:            text('title').notNull(),
  content:          jsonb('content'),
  plainText:        text('plain_text'),
  excerpt:          text('excerpt'),
  coverImageUrl:    text('cover_image_url'),
  status:           text('status').default('draft'),            // draft / published / archived
  locale:           text('locale').default('en'),
  translations:     jsonb('translations'),
  tags:             text('tags').array(),
  seoTitle:         text('seo_title'),
  seoDescription:   text('seo_description'),
  viewCount:        integer('view_count').default(0),
  helpfulCount:     integer('helpful_count').default(0),
  notHelpfulCount:  integer('not_helpful_count').default(0),
  embedding:        vector('embedding', { dimensions: 1024 }),  // 内置 KB Source
  authorMemberId:   text('author_member_id'),
  publishedAt:      timestamp('published_at', { withTimezone: true }),
  ...timestamps(),
}, (t) => ({
  uq:       uniqueIndex('uq_help_articles').on(t.brandId, t.slug, t.locale),
  idxBrand: index('idx_articles_brand').on(t.brandId, t.status, t.publishedAt.desc()),
  idxHnsw:  index('idx_articles_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
}));
```

### 4.12 通知

```ts
// packages/storage/src/schema/pg/notify.ts
export const notificationPreferences = pgTable('notification_preferences', {
  accountId: text('account_id').notNull(),
  orgId:     text('org_id').notNull(),
  channel:   text('channel').notNull(),                         // email / push / in_app / slack
  eventType: text('event_type').notNull(),
  enabled:   boolean('enabled').default(true),
}, (t) => ({ pk: primaryKey({ columns: [t.accountId, t.orgId, t.channel, t.eventType] }) }));

export const notifications = pgTable('notifications', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  accountId: text('account_id').notNull(),
  orgId:     text('org_id').notNull(),
  eventType: text('event_type'),
  title:     text('title'),
  body:      text('body'),
  link:      text('link'),
  payload:   jsonb('payload'),
  readAt:    timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  idxUnread: index('idx_notif_unread').on(t.accountId, t.readAt).where(sql`${t.readAt} IS NULL`),
}));

// 邮件发送日志
export const emailLogs = pgTable('email_logs', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  orgId:      text('org_id').notNull(),
  template:   text('template'),
  toEmail:    text('to_email'),
  subject:    text('subject'),
  status:     text('status'),                                   // sent/delivered/bounced/opened/clicked
  messageId:  text('message_id'),                               // SMTP Message-ID
  bullJobId:  text('bull_job_id'),                              // 关联 BullMQ job
  sentAt:     timestamp('sent_at',    { withTimezone: true }).defaultNow(),
  openedAt:   timestamp('opened_at',  { withTimezone: true }),
  clickedAt:  timestamp('clicked_at', { withTimezone: true }),
  bouncedAt:  timestamp('bounced_at', { withTimezone: true }),
  error:      text('error'),
});
```

### 4.13 集成 / Webhook

```ts
// packages/storage/src/schema/pg/integration.ts
export const integrations = pgTable('integrations', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  orgId:      text('org_id').notNull(),
  type:       text('type').notNull(),                           // slack/linear/jira/notion/github/...
  name:       text('name'),
  config:     jsonb('config'),
  secretsRef: text('secrets_ref'),                              // Vault key
  status:     text('status').default('active'),
  createdBy:  text('created_by'),
  ...timestamps(),
});

export const webhooks = pgTable('webhooks', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  orgId:     text('org_id').notNull(),
  name:      text('name'),
  url:       text('url').notNull(),
  secret:    text('secret').notNull(),                          // HMAC signing
  events:    text('events').array(),                            // subscribed events
  enabled:   boolean('enabled').default(true),
  ...timestamps(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  webhookId:    text('webhook_id').notNull(),
  eventType:    text('event_type'),
  payload:      jsonb('payload'),
  statusCode:   integer('status_code'),
  responseBody: text('response_body'),
  attempts:     integer('attempts').default(0),
  nextRetryAt:  timestamp('next_retry_at', { withTimezone: true }),
  deliveredAt:  timestamp('delivered_at',  { withTimezone: true }),
  createdAt:    timestamp('created_at',    { withTimezone: true }).defaultNow(),
});
```

### 4.14 审计日志

```ts
// packages/storage/src/schema/pg/audit.ts
export const auditLogs = pgTable('audit_logs', {
  id:           text('id').primaryKey().$defaultFn(ulid),
  orgId:        text('org_id').notNull(),
  actorType:    text('actor_type'),                             // account / api_key / system
  actorId:      text('actor_id'),
  action:       text('action').notNull(),                      // create / update / delete / login / ...
  resourceType: text('resource_type'),
  resourceId:   text('resource_id'),
  changes:      jsonb('changes'),                               // before / after diff
  ipAddress:    text('ip_address'),                             // PG 可以用 inet()，SQLite 用 text
  userAgent:    text('user_agent'),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  idxOrgAction: index('idx_audit_org_action').on(t.orgId, t.action, t.createdAt.desc()),
}));

// [PG only] 后置 SQL：按月分区（同 messages）
// [SQLite/LibSQL] 等价：Inngest cron 每月归档到 audit_logs_archive
```

### 4.15 平台杂项

```ts
// packages/storage/src/schema/pg/misc.ts
export const apiKeys = pgTable('api_keys', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  orgId:      text('org_id').notNull(),
  name:       text('name'),
  prefix:     text('prefix').notNull().unique(),                // 显示前缀
  keyHash:    text('key_hash').notNull(),                       // argon2
  scopes:     text('scopes').array(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt:  timestamp('expires_at',  { withTimezone: true }),
  createdBy:  text('created_by'),
  ...timestamps(),
});

export const userTags = pgTable('user_tags', {
  orgId: text('org_id').notNull(),
  tag:   text('tag').notNull(),
  color: text('color'),
}, (t) => ({ pk: primaryKey({ columns: [t.orgId, t.tag] }) }));

export const userSegments = pgTable('user_segments', {
  id:         text('id').primaryKey().$defaultFn(ulid),
  orgId:      text('org_id').notNull(),
  name:       text('name'),
  conditions: jsonb('conditions'),                              // query DSL
  userCount:  integer('user_count'),                            // 缓存
  updatedAt:  timestamp('updated_at', { withTimezone: true }),
});

export const macros = pgTable('macros', {
  id:        text('id').primaryKey().$defaultFn(ulid),
  orgId:     text('org_id').notNull(),
  name:      text('name').notNull(),
  shortcut:  text('shortcut'),                                  // /refund
  content:   jsonb('content'),
  actions:   jsonb('actions'),                                  // 附带动作（关闭、打 Tag）
  ...timestamps(),
});

export const slaPolicies = pgTable('sla_policies', {
  id:                   text('id').primaryKey().$defaultFn(ulid),
  orgId:                text('org_id').notNull(),
  name:                 text('name'),
  firstResponseSec:     integer('first_response_sec'),
  resolutionSec:        integer('resolution_sec'),
  operationalHoursOnly: boolean('operational_hours_only').default(false),
  conditions:           jsonb('conditions'),
  enabled:              boolean('enabled').default(true),
});

export const officeHours = pgTable('office_hours', {
  id:       text('id').primaryKey().$defaultFn(ulid),
  orgId:    text('org_id').notNull(),
  timezone: text('timezone').notNull(),
  schedule: jsonb('schedule'),                                  // 每周时段
  holidays: jsonb('holidays'),                                  // 节假日列表
});

// Secret Vault（KMS 加密后存储）
export const secrets = pgTable('secrets', {
  id:             text('id').primaryKey().$defaultFn(ulid),
  orgId:          text('org_id').notNull(),
  name:           text('name').notNull(),
  valueEncrypted: text('value_encrypted'),                      // KMS / age 加密
  createdBy:      text('created_by'),
  ...timestamps(),
});
```

---

## 五、关键索引策略

### 5.1 高写入表分区

| 表 | PG 策略 | LibSQL/SQLite 策略 |
|----|--------|--------------------|
| `messages` | `PARTITION BY RANGE (created_at)` 月分区 | 单表 + `idx_msg_conv_created`；Inngest cron 月归档 |
| `conversation_events` | 月分区 | 单表 + 索引 + 归档 |
| `ai_usage` | 月分区 | 单表 + 索引 + 归档 |
| `audit_logs` | 月分区 | 单表 + 索引 + 归档 |
| `email_logs` | 月分区 | 单表 + 索引 + 归档 |
| `webhook_deliveries` | 月分区（可选） | 单表 + 索引 + 30 天归档 |

### 5.2 复合索引

所有列表查询都带 `org_id` 前缀，避免全表扫描。Drizzle 索引声明示例：

```ts
idxOrgStatus: index('idx_conv_org_status').on(t.orgId, t.status, t.lastMessageAt.desc()),
```

### 5.3 GIN 索引（JSONB / 数组 · PG）

- `users.attributes`
- `users.tags`
- `conversations.tags`
- `feedback_posts.tags`

> **[SQLite/LibSQL] 等价**：生成列 + 表达式索引（`JSON_EXTRACT`）；或外置 Meilisearch facet。

### 5.4 向量索引

| 表 | PG（pgvector） | LibSQL | SQLite + sqlite-vec |
|----|--------------|--------|---------------------|
| `kb_chunks` | HNSW `vector_cosine_ops` | `libsql_vector_idx(... metric=cosine)` | `vec0` 虚拟表 |
| `kb_entities` | HNSW | 同上 | 同上 |
| `help_articles` | HNSW | 同上 | 同上 |
| `feedback_posts` | HNSW（1536） | 同上 | 同上 |
| `memory_observations` | HNSW | 同上 | 同上 |
| `memory_episodes` | HNSW | 同上 | 同上 |
| `memory_facts` | HNSW | 同上 | 同上 |

### 5.5 FTS 索引

| 表 | PG | LibSQL/SQLite |
|----|----|---------------|
| `messages.plain_text` | `to_tsvector('simple', plain_text)` + GIN | FTS5 虚拟表 `fts_messages` |
| `tickets.title + description` | 同上 | FTS5 `fts_tickets` |
| `help_articles.title + content` | 同上 | FTS5 `fts_articles` |
| `feedback_posts.title + plain_text` | 同上 | FTS5 `fts_feedback` |

> 中文：PG 用 `zhparser`；FTS5 用 jieba.js 预分词。详见 [12-STORAGE-ABSTRACTION.md § 3.3](12-STORAGE-ABSTRACTION.md)。

---

## 六、数据规模预估

| 表 | 单租户年增 | 10000 租户年增 |
|----|-----------|---------------|
| `organizations` | - | 10000 行 |
| `users` | 100k | 1B 行 |
| `conversations` | 50k | 500M 行 |
| `messages` | 500k | 5B 行（需分区 / 归档） |
| `kb_chunks` | 100k | 1B 行 |
| `mastra_messages` | 250k | 2.5B 行（Mastra 自动 vacuum） |
| `memory_observations` | 50k | 500M 行 |
| `audit_logs` | 200k | 2B 行（需分区） |

**结论**：MVP 单库可支撑，规模化后：
- 大表分区 / 归档 → 单表压力降低
- 读副本 → 分析查询走副本（PG）/ LibSQL embedded replica
- Sharding by `org_id` → 超大客户独立部署
- 向量数据 > 10M 行考虑外置 Qdrant / Pinecone（实现 `VectorStore` 即可）

---

## 七、迁移与种子数据

### 7.1 迁移工具：Drizzle Kit

```bash
# 修改 schema 后生成迁移
pnpm db:generate           # 同时输出 migrations/pg + migrations/libsql

# 检查 PG 上即将应用的 SQL
pnpm db:generate:pg --custom

# 应用迁移（按 DATABASE_URL_DIALECT 自动选择）
pnpm db:migrate

# Studio（可视化调试 schema）
pnpm db:studio
```

**生成文件示例**：

```
packages/storage/migrations/
├── pg/
│   ├── meta/_journal.json
│   ├── 0000_initial.sql                # CREATE EXTENSION vector; CREATE TABLE ...
│   ├── 0001_kb_hnsw_index.sql
│   ├── post/                            # 由 KeenAI 手写，drizzle migrate 之后执行
│   │   ├── 000010_partition_messages.sql
│   │   ├── 000011_partman_setup.sql
│   │   └── 000020_pgvector_hnsw_tune.sql
│   └── ...
└── libsql/
    ├── meta/_journal.json
    ├── 0000_initial.sql
    ├── 0001_kb_libsql_vector.sql
    ├── post/
    │   ├── 000010_fts5_messages.sql     # CREATE VIRTUAL TABLE fts_messages USING fts5(...)
    │   ├── 000011_libsql_vector_idx.sql # CREATE INDEX ... libsql_vector_idx(...)
    │   └── 000020_vec0_fallback.sql     # 仅 SQLite + sqlite-vec
    └── ...
```

执行脚本：

```ts
// apps/api/scripts/migrate.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migrateLibsql } from 'drizzle-orm/libsql/migrator';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';
import { createClient } from '@libsql/client';

const dialect = process.env.DB_DIALECT ?? 'libsql';

async function runPostMigrations(client: Client | ReturnType<typeof createClient>, dir: string) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = await readFile(join(dir, f), 'utf8');
    if ('query' in client) await client.query(sql);
    else                   await client.execute(sql);
    console.log('post-migration applied:', f);
  }
}

if (dialect === 'postgres') {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder: './packages/storage/migrations/pg' });
  await runPostMigrations(client, './packages/storage/migrations/pg/post');
  await client.end();
} else {
  const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.LIBSQL_TOKEN });
  await migrateLibsql(drizzleLibsql(client), { migrationsFolder: './packages/storage/migrations/libsql' });
  await runPostMigrations(client, './packages/storage/migrations/libsql/post');
  client.close();
}
```

### 7.2 种子数据

```bash
bunx keenai seed          # 走 @keenai/storage/seed
```

种子内容：
- Demo Organization + 1 Brand
- 5 个 Help Center 示例文章（含 embedding，复用 `@xenova/transformers`）
- 3 个 Workflow 模板（welcome / sla / escalate）
- 默认 Ticket Types & Statuses
- 默认 SLA Policy
- 1 个 Demo Customer + Conversation

**双后端验证**：CI 矩阵同时跑 PG / LibSQL 种子 → 契约测试断言两端行为完全一致。

### 7.3 备份策略

| 后端 | 备份 | 恢复 |
|------|------|------|
| **PostgreSQL** | `pg_dump` 每日全量 + WAL 归档（WAL-G / pgBackRest）+ S3 跨区复制；支持 PITR | `pg_restore` / `wal-g restore` |
| **LibSQL（Turso）** | 托管自动备份；自建：`libsql-shell .dump` + S3；或 embedded replicas 实时同步 | `libsql-shell .restore` |
| **SQLite（fallback）** | [Litestream](https://litestream.io) 实时增量复制到 S3；或 `VACUUM INTO` 每日 | `litestream restore -o keenai.db s3://...` |

### 7.4 后端切换 / 迁移

```bash
# LibSQL → PostgreSQL（业务上量后）
bunx keenai migrate-backend \
  --from  libsql://./data/keenai.db \
  --to    postgres://user:pass@host/keenai \
  --batch 1000 \
  --rebuild-vector-index \
  --verify

# PostgreSQL → LibSQL（一般用于备份 / 离线 / 边缘部署）
bunx keenai migrate-backend \
  --from  postgres://... \
  --to    libsql://./data/keenai.db \
  --tables conversations,messages,users
```

实现位于 `packages/storage/src/migrate-backend/`，按表流式 export → 重新 ingest → 比对 row hash → 重建向量索引。

---

## 八、Schema → 双方言映射速查

| 字段 / 特性 | Drizzle 写法 | PostgreSQL | SQLite / LibSQL |
|------------|--------------|-----------|-----------------|
| 主键 ULID | `text('id').primaryKey().$defaultFn(ulid)` | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY` |
| JSON 列 | `jsonb('settings')` / `text('settings', { mode: 'json' })` | `jsonb` 原生 + GIN | `TEXT` + `json_extract` |
| 时间戳 | `timestamp('at', { withTimezone: true })` / `integer({ mode: 'timestamp_ms' })` | `TIMESTAMPTZ` | `INTEGER`（Unix ms） |
| IP 地址 | `text('ip_address')`（应用层用 `inet()` 校验） | `INET` 可选 | `TEXT` |
| 数组 | `text('tags').array()` / `text({ mode: 'json' })` | `text[]` + GIN | JSON 数组 + `json_each` |
| 月分区 | post-migration SQL | `PARTITION BY RANGE` | 单表 + 归档 cron |
| 向量列 | `vector('emb', { dimensions: 1024 })` / 自定义 | `vector(1024)` + HNSW | `libsql_vector` / `vec0` |
| 全文索引 | post-migration SQL | `tsvector + GIN` | `FTS5` 虚拟表 |
| Pub/Sub | `Store.listen()` / `Store.notify()` | `LISTEN/NOTIFY` | Redis Pub/Sub fallback |
| 行级安全 | 应用层 `WHERE org_id = ?` | 原生 RLS（可选） | 应用层强制 |
| 部分索引 | `.where(sql\`... IS NOT NULL\`)` | 原生 | 原生 |
| 生成列 | `.generatedAlwaysAs(...)` | 原生 | 原生 |

---

## 九、与 Mastra 自动表的关系

Mastra Memory 通过 `@mastra/pg` / `@mastra/libsql` 自动管理以下表（schema 由 Mastra 框架维护）：

| 表 | 用途 |
|----|------|
| `mastra_threads` | 对话线程（threadId） |
| `mastra_messages` | 消息原文 + token usage |
| `mastra_resources` | resourceId（KeenAI 映射到 `user_id` 或 `brand_id`） |
| `mastra_working_memory` | Working Memory 快照（Markdown / JSON） |
| `mastra_evals` | Mastra Eval 评测结果 |
| `mastra_traces` | OpenTelemetry trace 持久化（可选） |

KeenAI 的 `memory_*` 表（4.9）在 Mastra 之上扩展提供 **L3 Semantic / L4 Procedural / 知识图谱 / 槽位 / 审计** 等高级能力，两者通过 `threadId` / `resourceId` 关联。

详见 [10-AGENT-MEMORY.md § 6 Memory 与 Mastra 的关系](10-AGENT-MEMORY.md)。
