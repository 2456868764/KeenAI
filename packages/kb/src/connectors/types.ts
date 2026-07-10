import type { KbSourceType } from "@keenai/storage/schema";
import type { z } from "zod";

export type KbResourceRef = {
  externalId: string;
  updatedAt: string;
  etag?: string;
};

export type KbFetchedDocument = {
  externalId: string;
  title: string;
  url?: string;
  rawContent: string;
  contentType?: string;
  canonicalLocale?: string;
  updatedAt: string;
};

export interface KbConnector {
  readonly name: string;
  readonly type: KbSourceType;
  configSchema(): z.ZodTypeAny;
  list(opts: { since?: Date }): Promise<KbResourceRef[]>;
  fetch(ref: KbResourceRef): Promise<KbFetchedDocument>;
  subscribe?(handler: (events: KbResourceRef[]) => Promise<void>): Promise<() => void>;
  healthCheck(): Promise<boolean>;
}

export type SyncKbSourceInput = {
  orgId: string;
  brandId: string;
  sourceId: string;
  connector: KbConnector;
  since?: Date;
};

export type SyncKbSourceResult = {
  listed: number;
  synced: number;
  skipped: number;
};
