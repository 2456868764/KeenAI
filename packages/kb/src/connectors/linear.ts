import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type LinearConnectorConfig = ConfigDocumentsConnectorConfig;

export function createLinearConnector(config: LinearConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "linear",
    name: "linear",
    titlePrefix: "Linear issue",
    config,
  });
}
