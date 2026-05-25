import { createHelpCenterStubConnector } from "./help-center-stub.js";
import type { KbConnector } from "./types.js";
import { createWebCrawlStubConnector } from "./web-stub.js";

const HELP_CENTER = createHelpCenterStubConnector();
const WEB = createWebCrawlStubConnector();

const CONNECTORS: Record<string, KbConnector> = {
  help_center: HELP_CENTER,
  web: WEB,
};

/** Resolve a built-in stub connector by KB source type. */
export function getKbStubConnector(type: string): KbConnector | null {
  return CONNECTORS[type] ?? null;
}

export { createHelpCenterStubConnector, createWebCrawlStubConnector };
