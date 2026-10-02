import type { Store } from "@keenai/storage";
import { type ChannelType, channelProviderAppStates } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";
import { openChannelCredentials, sealChannelCredentials } from "./channel-secrets.js";

export async function putChannelProviderAppState(input: {
  store: Store;
  provider: ChannelType;
  appId: string;
  stateType: string;
  payload: Record<string, unknown>;
  secret: string;
  expiresAt?: Date | null;
}) {
  const now = new Date();
  const [state] = await input.store.db
    .insert(channelProviderAppStates)
    .values({
      provider: input.provider,
      appId: input.appId,
      stateType: input.stateType,
      encryptedPayload: sealChannelCredentials(input.payload, input.secret),
      expiresAt: input.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        channelProviderAppStates.provider,
        channelProviderAppStates.appId,
        channelProviderAppStates.stateType,
      ],
      set: {
        encryptedPayload: sealChannelCredentials(input.payload, input.secret),
        expiresAt: input.expiresAt ?? null,
        updatedAt: now,
      },
    })
    .returning();
  if (!state) throw new Error("channel_provider_app_state_save_failed");
  return state;
}

export async function getChannelProviderAppState(input: {
  store: Store;
  provider: ChannelType;
  appId: string;
  stateType: string;
  secret: string;
}): Promise<Record<string, unknown> | null> {
  const [state] = await input.store.db
    .select()
    .from(channelProviderAppStates)
    .where(
      and(
        eq(channelProviderAppStates.provider, input.provider),
        eq(channelProviderAppStates.appId, input.appId),
        eq(channelProviderAppStates.stateType, input.stateType),
      ),
    )
    .limit(1);
  if (!state || (state.expiresAt && state.expiresAt.getTime() <= Date.now())) return null;
  return openChannelCredentials(state.encryptedPayload, input.secret);
}
