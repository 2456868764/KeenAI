import { API_VERSION } from "@keenai/shared";
import { Hono } from "hono";
import { openApiDocument } from "../openapi.js";

export function openApiRoutes() {
  const r = new Hono();

  r.get(`/api/${API_VERSION}/openapi.json`, (c) => c.json(openApiDocument));

  return r;
}
