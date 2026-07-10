import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type DiscordConnectorConfig = ConfigDocumentsConnectorConfig;

export function createDiscordConnector(config: DiscordConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "discord",
    name: "discord",
    titlePrefix: "Discord thread",
    config,
  });
}
