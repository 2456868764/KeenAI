import { createWidgetUserHash, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, conversations, members, organizations } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { buildMessageContent, insertMessage } from "./lib/conversations.js";
import { ensureBuiltinMacros } from "./lib/macros-store.js";

const DEMO = {
  orgSlug: "demo",
  orgName: "Demo Workspace",
  brandSlug: "default",
  brandName: "KeenAI Demo",
  email: "owner@keenai.local",
  password: "keenai-demo-12",
  name: "Demo Owner",
};

export async function seed() {
  const env = parseApiEnv(process.env, { fromModuleUrl: import.meta.url });
  const store = createLibsqlStore({ url: env.DATABASE_URL });
  const db = store.db;

  const [existingOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, DEMO.orgSlug))
    .limit(1);

  if (existingOrg) {
    await ensureBuiltinMacros(db, existingOrg.id);
    await seedDemoConversation(db, existingOrg.id);
    console.log("[seed] demo org already exists — conversation checked");
    logWidgetCredentials(env);
    await store.close();
    return;
  }

  const passwordHash = await hashPassword(DEMO.password);

  const [org] = await db
    .insert(organizations)
    .values({ slug: DEMO.orgSlug, name: DEMO.orgName, plan: "free" })
    .returning();

  if (!org) throw new Error("seed: org insert failed");

  const [brand] = await db
    .insert(brands)
    .values({
      orgId: org.id,
      slug: DEMO.brandSlug,
      name: DEMO.brandName,
      locale: "en",
    })
    .returning();

  const [account] = await db
    .insert(accounts)
    .values({
      email: DEMO.email,
      name: DEMO.name,
      passwordHash,
    })
    .returning();

  if (!account) throw new Error("seed: account insert failed");

  const [member] = await db
    .insert(members)
    .values({
      orgId: org.id,
      accountId: account.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    })
    .returning();

  if (brand) {
    await ensureBuiltinMacros(db, org.id);
    await seedDemoConversation(db, org.id, brand.id, member?.id);
  }

  console.log("[seed] created demo workspace");
  console.log(`  org:     ${DEMO.orgSlug}`);
  console.log(`  login:   ${DEMO.email} / ${DEMO.password}`);
  logWidgetCredentials(env);
  await store.close();
}

async function seedDemoConversation(
  db: ReturnType<typeof createLibsqlStore>["db"],
  orgId: string,
  brandId?: string,
  memberId?: string,
) {
  let resolvedBrandId = brandId;
  if (!resolvedBrandId) {
    const [brand] = await db.select().from(brands).where(eq(brands.orgId, orgId)).limit(1);
    resolvedBrandId = brand?.id;
  }
  if (!resolvedBrandId) return;

  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.orgId, orgId))
    .limit(1);

  if (existing) return;

  const [conversation] = await db
    .insert(conversations)
    .values({
      orgId,
      brandId: resolvedBrandId,
      channelType: "messenger",
      channelId: "demo-widget",
      subject: "Welcome to KeenAI",
      status: "open",
    })
    .returning();

  if (!conversation) return;

  await insertMessage(db, {
    orgId,
    conversationId: conversation.id,
    senderType: "user",
    senderId: "demo-user",
    plainText: "Hi! I'd like to learn more about KeenAI.",
    content: buildMessageContent("Hi! I'd like to learn more about KeenAI."),
    isInternal: false,
    sentVia: "messenger",
    isAgentReply: false,
  });

  await insertMessage(db, {
    orgId,
    conversationId: conversation.id,
    senderType: "agent",
    senderId: memberId,
    plainText: "Welcome! This is your demo inbox conversation.",
    content: buildMessageContent("Welcome! This is your demo inbox conversation."),
    isInternal: false,
    sentVia: "web",
    isAgentReply: true,
  });

  console.log("[seed] demo conversation created");
}

function logWidgetCredentials(env: ReturnType<typeof parseApiEnv>) {
  const secret = env.WIDGET_HMAC_SECRET ?? env.JWT_SECRET;
  const userId = "visitor-demo";
  const userHash = createWidgetUserHash(secret, userId);
  console.log(`  widget:  userId=${userId}`);
  console.log(`           userHash=${userHash}`);
}

if (import.meta.main) {
  seed().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
