import { API_VERSION } from "@keenai/shared";

/** Minimal OpenAPI 3.1 — expanded as routes ship (P0-07). */
export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "KeenAI API",
    version: API_VERSION,
    description: "KeenAI support platform REST API",
  },
  servers: [{ url: "http://localhost:8090", description: "Local dev" }],
  paths: {
    "/health": {
      get: { summary: "Liveness", responses: { "200": { description: "OK" } } },
    },
    [`/api/${API_VERSION}/health`]: {
      get: { summary: "Health with DB ping", responses: { "200": { description: "OK" } } },
    },
    [`/api/${API_VERSION}/auth/login`]: {
      post: {
        summary: "Password login",
        requestBody: { required: true },
        responses: {
          "200": { description: "Tokens" },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    [`/api/${API_VERSION}/me`]: {
      get: {
        summary: "Current user",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Profile" } },
      },
    },
    [`/api/${API_VERSION}/conversations`]: {
      get: {
        summary: "List conversations",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Inbox list" } },
      },
      post: {
        summary: "Create conversation",
        security: [{ bearerAuth: [] }],
        responses: { "201": { description: "Created" } },
      },
    },
    [`/api/${API_VERSION}/conversations/{id}`]: {
      get: {
        summary: "Get conversation",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { "200": { description: "Conversation" } },
      },
      patch: {
        summary: "Update conversation (status, assignee, subject)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { "200": { description: "Updated" } },
      },
    },
    [`/api/${API_VERSION}/widget/session`]: {
      post: {
        summary: "Widget session (HMAC Identity Verification)",
        responses: {
          "200": { description: "Widget JWT" },
          "401": { description: "Invalid userHash" },
        },
      },
    },
    [`/api/${API_VERSION}/widget/conversations`]: {
      post: {
        summary: "Get or create visitor conversation",
        security: [{ widgetBearer: [] }],
        responses: { "200": { description: "Existing" }, "201": { description: "Created" } },
      },
    },
    [`/api/${API_VERSION}/widget/conversations/{id}/messages`]: {
      get: {
        summary: "List visitor-visible messages",
        security: [{ widgetBearer: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { "200": { description: "Messages" } },
      },
      post: {
        summary: "Send visitor message",
        security: [{ widgetBearer: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { "201": { description: "Message" } },
      },
    },
    [`/api/${API_VERSION}/conversations/{id}/messages`]: {
      get: {
        summary: "List messages",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { "200": { description: "Messages" } },
      },
      post: {
        summary: "Send message",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { "201": { description: "Message" } },
      },
    },
    [`/api/${API_VERSION}/kb/search`]: {
      get: {
        summary: "Hybrid KB chunk search (FTS + vector RRF)",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "brandId", in: "query", required: true },
          { name: "q", in: "query", required: true },
          { name: "limit", in: "query", required: false },
        ],
        responses: {
          "200": { description: "Search hits" },
          "403": { description: "Forbidden" },
          "503": { description: "KB FTS unavailable" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      widgetBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Widget visitor token from POST /widget/session",
      },
    },
  },
} as const;
