import {
  type KbIngestPayload,
  createKbInngestFunctions as createPackageKbInngestFunctions,
} from "@keenai/kb/inngest";
import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { runKbIngestForSource } from "./kb-pipeline.js";

export function createKbInngestFunctions(client: Inngest, ctx: AppContext) {
  return createPackageKbInngestFunctions(client as never, {
    runIngest: (payload: KbIngestPayload) => runKbIngestForSource(ctx.store.db, payload),
  });
}
