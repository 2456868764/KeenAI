import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as keenaiSchema from "../schema/sqlite/index.js";

export type Dialect = "postgres" | "libsql" | "sqlite";

export type KeenaiDb = LibSQLDatabase<typeof keenaiSchema>;

export type KeenaiTx = Parameters<Parameters<KeenaiDb["transaction"]>[0]>[0];

export interface TxOptions {
  isolationLevel?: "read committed" | "serializable";
}

export type Unsubscribe = () => void | Promise<void>;

/** Relation data + transactions + pub/sub (dialect-specific notify). */
export interface Store {
  readonly dialect: Dialect;
  readonly db: KeenaiDb;

  ping(): Promise<void>;
  transaction<T>(fn: (tx: KeenaiTx) => Promise<T>, opts?: TxOptions): Promise<T>;
  listen<TPayload = unknown>(
    channel: string,
    handler: (msg: TPayload) => void | Promise<void>,
  ): Promise<Unsubscribe>;
  notify<TPayload>(channel: string, payload: TPayload): Promise<void>;
  close(): Promise<void>;
}
