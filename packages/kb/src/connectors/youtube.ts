import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type YouTubeConnectorConfig = ConfigDocumentsConnectorConfig;

export function createYouTubeConnector(config: YouTubeConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "youtube",
    name: "youtube",
    titlePrefix: "YouTube transcript",
    config,
    defaultContentType: "text/plain",
  });
}
