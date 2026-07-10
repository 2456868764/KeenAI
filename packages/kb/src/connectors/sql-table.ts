import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type SqlTableConnectorConfig = ConfigDocumentsConnectorConfig;

export function createSqlTableConnector(config: SqlTableConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "sql",
    name: "sql-table",
    titlePrefix: "SQL row",
    config,
  });
}
