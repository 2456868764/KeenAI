import { createChangelogConnector } from "./changelog.js";
import { createConfluenceConnector } from "./confluence.js";
import { createDiscordConnector } from "./discord.js";
import { createFeedbackConnector } from "./feedback.js";
import { createFileUploadConnector } from "./file-upload.js";
import { createGitHubConnector } from "./github.js";
import { createGoogleDriveConnector } from "./google-drive.js";
import { createHelpCenterStubConnector } from "./help-center-stub.js";
import { createJiraConnector } from "./jira.js";
import { createLinearConnector } from "./linear.js";
import { createNotionConnector } from "./notion.js";
import { createPastConversationsConnector } from "./past-conversations.js";
import { createRoadmapConnector } from "./roadmap.js";
import { createSlackConnector } from "./slack.js";
import { createSqlTableConnector } from "./sql-table.js";
import type { KbConnector } from "./types.js";
import { createWebCrawlConnector } from "./web-crawl.js";
import { createWebCrawlStubConnector } from "./web-stub.js";
import { createYouTubeConnector } from "./youtube.js";

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
  if (type === "file_upload") return createFileUploadConnector(config ?? {}, { type });
  if (
    (type === "web" || type === "web_crawl") &&
    Array.isArray(config?.urls) &&
    config.urls.length > 0
  ) {
    return createWebCrawlConnector(config, { type });
  }
  if (type === "github") return createGitHubConnector(config ?? {});
  if (type === "notion") return createNotionConnector(config ?? {});
  if (type === "past_conversations") return createPastConversationsConnector(config ?? {});
  if (type === "feedback") return createFeedbackConnector(config ?? {});
  if (type === "changelog") return createChangelogConnector(config ?? {});
  if (type === "roadmap") return createRoadmapConnector(config ?? {});
  if (type === "confluence") return createConfluenceConnector(config ?? {});
  if (type === "google_drive") return createGoogleDriveConnector(config ?? {});
  if (type === "slack") return createSlackConnector(config ?? {});
  if (type === "discord") return createDiscordConnector(config ?? {});
  if (type === "linear") return createLinearConnector(config ?? {});
  if (type === "jira") return createJiraConnector(config ?? {});
  if (type === "youtube") return createYouTubeConnector(config ?? {});
  if (type === "sql") return createSqlTableConnector(config ?? {});
  return getKbStubConnector(type);
}

export {
  createChangelogConnector,
  createConfluenceConnector,
  createDiscordConnector,
  createFeedbackConnector,
  createFileUploadConnector,
  createGitHubConnector,
  createGoogleDriveConnector,
  createHelpCenterStubConnector,
  createJiraConnector,
  createLinearConnector,
  createNotionConnector,
  createPastConversationsConnector,
  createRoadmapConnector,
  createSlackConnector,
  createSqlTableConnector,
  createWebCrawlConnector,
  createWebCrawlStubConnector,
  createYouTubeConnector,
};
