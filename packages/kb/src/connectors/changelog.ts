import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type ChangelogConnectorConfig = ConfigDocumentsConnectorConfig;

export function createChangelogConnector(config: ChangelogConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "changelog",
    name: "changelog",
    titlePrefix: "Changelog entry",
    config,
  });
}
