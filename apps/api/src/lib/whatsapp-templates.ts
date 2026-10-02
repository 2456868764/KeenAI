export type WhatsAppTemplateComponent = Record<string, unknown>;

export type WhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: WhatsAppTemplateComponent[];
  qualityScore?: Record<string, unknown>;
  rejectedReason?: string;
};

export type WhatsAppTemplateCredentials = {
  accessToken: string;
  wabaId: string;
  graphApiVersion: string;
};

export type WhatsAppTemplateInput = {
  name: string;
  language: string;
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY";
  components: WhatsAppTemplateComponent[];
  allowCategoryChange?: boolean;
};

export class WhatsAppTemplateProviderError extends Error {
  constructor(
    readonly status: number,
    readonly providerCode?: number,
  ) {
    super(
      providerCode
        ? `whatsapp_template_provider_${providerCode}`
        : "whatsapp_template_provider_error",
    );
  }
}

const TEMPLATE_FIELDS = [
  "id",
  "name",
  "language",
  "status",
  "category",
  "components",
  "quality_score",
  "rejected_reason",
].join(",");

export function whatsappTemplateCredentials(
  credentials: Record<string, unknown>,
  defaultGraphApiVersion: string,
): WhatsAppTemplateCredentials {
  const accessToken = requiredString(credentials, "accessToken");
  const wabaId = requiredString(credentials, "wabaId");
  const graphApiVersion = optionalString(credentials, "graphApiVersion") ?? defaultGraphApiVersion;
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    throw new Error("whatsapp_graph_api_version_invalid");
  }
  return { accessToken, wabaId, graphApiVersion };
}

export async function listWhatsAppTemplates(
  credentials: WhatsAppTemplateCredentials,
): Promise<WhatsAppTemplate[]> {
  const templates: WhatsAppTemplate[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = templatesUrl(credentials);
    url.searchParams.set("fields", TEMPLATE_FIELDS);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const payload = await metaRequest(credentials, url);
    const rows = Array.isArray(payload.data) ? payload.data : [];
    for (const row of rows) {
      const template = normalizeTemplate(row);
      if (template) templates.push(template);
    }
    after = pagingCursor(payload);
    if (!after) break;
  }
  return templates;
}

export async function createWhatsAppTemplate(
  credentials: WhatsAppTemplateCredentials,
  input: WhatsAppTemplateInput,
): Promise<{ id: string; status: string; category: string }> {
  const payload = await metaRequest(credentials, templatesUrl(credentials), {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      components: input.components,
      ...(input.allowCategoryChange === undefined
        ? {}
        : { allow_category_change: input.allowCategoryChange }),
    }),
  });
  return {
    id: requiredResponseString(payload, "id"),
    status: optionalString(payload, "status") ?? "PENDING",
    category: optionalString(payload, "category") ?? input.category,
  };
}

export async function updateWhatsAppTemplate(
  credentials: WhatsAppTemplateCredentials,
  templateId: string,
  input: Partial<WhatsAppTemplateInput>,
): Promise<{ success: true }> {
  const url = graphUrl(credentials, templateId);
  const payload = await metaRequest(credentials, url, {
    method: "POST",
    body: JSON.stringify({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.language === undefined ? {} : { language: input.language }),
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.components === undefined ? {} : { components: input.components }),
    }),
  });
  if (payload.success !== true && payload.success !== "true") {
    throw new Error("whatsapp_template_update_response_invalid");
  }
  return { success: true };
}

export async function deleteWhatsAppTemplate(
  credentials: WhatsAppTemplateCredentials,
  input: { name: string; templateId?: string },
): Promise<{ success: true }> {
  const url = templatesUrl(credentials);
  url.searchParams.set("name", input.name);
  if (input.templateId) url.searchParams.set("hsm_id", input.templateId);
  const payload = await metaRequest(credentials, url, { method: "DELETE" });
  if (payload.success !== true && payload.success !== "true") {
    throw new Error("whatsapp_template_delete_response_invalid");
  }
  return { success: true };
}

async function metaRequest(
  credentials: WhatsAppTemplateCredentials,
  url: URL,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("whatsapp_template_provider_unavailable");
  }
  const payload = record(await response.json().catch(() => null)) ?? {};
  if (!response.ok) {
    const error = record(payload.error);
    const code = typeof error?.code === "number" ? error.code : undefined;
    throw new WhatsAppTemplateProviderError(response.status, code);
  }
  return payload;
}

function graphUrl(credentials: WhatsAppTemplateCredentials, resource: string): URL {
  const resourcePath = resource
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(
    `https://graph.facebook.com/${encodeURIComponent(credentials.graphApiVersion)}/${resourcePath}`,
  );
}

function templatesUrl(credentials: WhatsAppTemplateCredentials): URL {
  return graphUrl(credentials, `${credentials.wabaId}/message_templates`);
}

function normalizeTemplate(value: unknown): WhatsAppTemplate | null {
  const item = record(value);
  const id = optionalString(item, "id");
  const name = optionalString(item, "name");
  const language = optionalString(item, "language");
  if (!id || !name || !language) return null;
  return {
    id,
    name,
    language,
    status: optionalString(item, "status") ?? "UNKNOWN",
    category: optionalString(item, "category") ?? "UNKNOWN",
    components: Array.isArray(item?.components)
      ? item.components.flatMap((component) => {
          const parsed = record(component);
          return parsed ? [parsed] : [];
        })
      : [],
    ...(record(item?.quality_score)
      ? { qualityScore: record(item?.quality_score) ?? undefined }
      : {}),
    ...(optionalString(item, "rejected_reason")
      ? { rejectedReason: optionalString(item, "rejected_reason") ?? undefined }
      : {}),
  };
}

function pagingCursor(payload: Record<string, unknown>): string | undefined {
  return optionalString(record(record(payload.paging)?.cursors), "after") ?? undefined;
}

function requiredResponseString(value: Record<string, unknown>, key: string): string {
  const result = optionalString(value, key);
  if (!result) throw new Error("whatsapp_template_response_invalid");
  return result;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const result = optionalString(value, key);
  if (!result) throw new Error(`whatsapp_${key}_missing`);
  return result;
}

function optionalString(value: Record<string, unknown> | null, key: string): string | null {
  const result = value?.[key];
  return typeof result === "string" && result.length > 0 ? result : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
