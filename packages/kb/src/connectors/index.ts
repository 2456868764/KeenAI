import { createFileUploadConnector } from "./file-upload.js";
import { createGitHubConnector } from "./github.js";
import { createHelpCenterStubConnector } from "./help-center-stub.js";
import type { KbConnector } from "./types.js";
import { createWebCrawlConnector } from "./web-crawl.js";
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

/** Resolve a KB connector from source type + source config. */
export function resolveKbConnectorForSource(
  type: string,
  config: Record<string, unknown> | null | undefined,
): KbConnector | null {
  if (type === "file") return createFileUploadConnector(config ?? {});
  if (type === "web" && Array.isArray(config?.urls) && config.urls.length > 0) {
    return createWebCrawlConnector(config);
  }
  if (type === "github") return createGitHubConnector(config ?? {});
  return getKbStubConnector(type);
}

export {
  createFileUploadConnector,
  createGitHubConnector,
  createHelpCenterStubConnector,
  createWebCrawlConnector,
  createWebCrawlStubConnector,
};
