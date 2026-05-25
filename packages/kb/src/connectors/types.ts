import type { KbSourceType } from "@keenai/storage/schema";

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
  list(opts: { since?: Date }): Promise<KbResourceRef[]>;
  fetch(ref: KbResourceRef): Promise<KbFetchedDocument>;
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
