import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type PastConversationsConnectorConfig = ConfigDocumentsConnectorConfig;

export function createPastConversationsConnector(config: PastConversationsConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "past_conversations",
    name: "past-conversations",
    titlePrefix: "Past conversation",
    config,
  });
}
