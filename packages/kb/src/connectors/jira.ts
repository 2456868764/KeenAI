import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type JiraConnectorConfig = ConfigDocumentsConnectorConfig;

export function createJiraConnector(config: JiraConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "jira",
    name: "jira",
    titlePrefix: "Jira issue",
    config,
  });
}
