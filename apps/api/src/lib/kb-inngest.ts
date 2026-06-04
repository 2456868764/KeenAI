import {
  type KbCrystallizePayload,
  type KbIngestPayload,
  createKbInngestFunctions as createPackageKbInngestFunctions,
} from "@keenai/kb/inngest";
import type { Inngest } from "inngest";
import type { AppContext } from "../types.js";
import { runKbCrystallizeJob } from "./kb-crystallize-pipeline.js";
import { runKbIngestForSource } from "./kb-pipeline.js";

export function createKbInngestFunctions(client: Inngest, ctx: AppContext) {
  return createPackageKbInngestFunctions(client as never, {
    runIngest: (payload: KbIngestPayload) => runKbIngestForSource(ctx.store.db, payload),
    runCrystallize: (payload: KbCrystallizePayload) => runKbCrystallizeJob(ctx.store.db, payload),
  });
}
