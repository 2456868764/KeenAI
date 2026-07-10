import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type ConfluenceConnectorConfig = ConfigDocumentsConnectorConfig;

export function createConfluenceConnector(config: ConfluenceConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "confluence",
    name: "confluence",
    titlePrefix: "Confluence page",
    config,
  });
}
