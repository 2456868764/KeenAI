import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type FeedbackConnectorConfig = ConfigDocumentsConnectorConfig;

export function createFeedbackConnector(config: FeedbackConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "feedback",
    name: "feedback",
    titlePrefix: "Feedback post",
    config,
  });
}
