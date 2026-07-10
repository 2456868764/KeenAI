import {
  type ConfigDocumentsConnectorConfig,
  createConfigDocumentsConnector,
} from "./config-documents.js";

export type RoadmapConnectorConfig = ConfigDocumentsConnectorConfig;

export function createRoadmapConnector(config: RoadmapConnectorConfig = {}) {
  return createConfigDocumentsConnector({
    type: "roadmap",
    name: "roadmap",
    titlePrefix: "Roadmap item",
    config,
  });
}
