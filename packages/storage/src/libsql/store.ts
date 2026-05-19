import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { KeenaiDb, Store, Unsubscribe } from "../core/store.js";
import * as schema from "../schema/sqlite/index.js";

export interface LibsqlStoreOptions {
  url: string;
  authToken?: string;
}

type Listener = (payload: unknown) => void | Promise<void>;

export interface LibsqlStore extends Store {
  readonly client: Client;
}

export function createLibsqlStore(options: LibsqlStoreOptions): LibsqlStore {
  const client: Client = createClient({
    url: options.url,
    authToken: options.authToken,
  });
  const db: KeenaiDb = drizzle(client, { schema });
  const channels = new Map<string, Set<Listener>>();

  return {
    dialect: "libsql",
    client,
    db,

    async ping() {
      await client.execute("SELECT 1");
    },

    async transaction(fn, _opts) {
      return db.transaction(async (tx) => fn(tx));
    },

    async listen(channel, handler) {
      let set = channels.get(channel);
      if (!set) {
        set = new Set();
        channels.set(channel, set);
      }
      set.add(handler as Listener);
      return () => {
        set?.delete(handler as Listener);
      };
    },

    async notify(channel, payload) {
      const set = channels.get(channel);
      if (!set) return;
      await Promise.all([...set].map((h) => h(payload)));
    },

    async close() {
      client.close();
    },
  };
}
