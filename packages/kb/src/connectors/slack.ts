import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type SlackConnectorConfig = ConfigDocumentsConnectorConfig;

export function createSlackConnector(config: SlackConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "slack",
    name: "slack",
    titlePrefix: "Slack thread",
    config,
  });
}
