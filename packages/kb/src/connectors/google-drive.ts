import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type GoogleDriveConnectorConfig = ConfigDocumentsConnectorConfig;

export function createGoogleDriveConnector(config: GoogleDriveConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "google_drive",
    name: "google-drive",
    titlePrefix: "Google Drive file",
    config,
  });
}
