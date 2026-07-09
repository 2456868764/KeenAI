import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";

function outputPath(envName, fallback) {
  return process.env[envName] ?? join(process.cwd(), "artifacts/release", fallback);
}

function writeOutput(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function createMockOllamaServer(state) {
  return createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const body = await readJson(req);
    state.requests.push({
      url: req.url,
      authorization: req.headers.authorization ?? null,
      model: body.model,
      stream: body.stream,
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
    });

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    const base = {
      id: "chatcmpl-offline-demo",
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: body.model,
    };
    const chunks = [
      { choices: [{ index: 0, delta: { role: "assistant", content: "Offline " } }] },
      { choices: [{ index: 0, delta: { content: "Ollama " } }] },
      { choices: [{ index: 0, delta: { content: "ready." } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ];

    for (const chunk of chunks) {
      res.write(`data: ${JSON.stringify({ ...base, ...chunk })}\n\n`);
    }
    res.end("data: [DONE]\n\n");
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function renderMarkdown(report) {
  return [
    "# Ollama Offline Demo Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| status | ${report.evidenceStatus} |`,
    `| provider | ${report.providerId} |`,
    `| base_url | ${report.baseUrl} |`,
    `| model | ${report.model} |`,
    `| configured_providers | ${report.configuredProviders.join(", ")} |`,
    `| request_count | ${report.requestCount} |`,
    `| response_text | ${report.responseText} |`,
    `| remote_keys_present | ${report.remoteKeysPresent ? "yes" : "no"} |`,
    `| failures | ${report.failures.length > 0 ? report.failures.join("; ") : "none"} |`,
    "",
  ].join("\n");
}

const state = { requests: [] };
const server = createMockOllamaServer(state);
const address = await listen(server);
const baseUrl = `http://127.0.0.1:${address.port}/v1`;
const model = process.env.OLLAMA_OFFLINE_MODEL ?? "llama3.2";

const { createLlmRegistry } = await import("../packages/llm/src/registry.ts");
const registry = createLlmRegistry({
  provider: "ollama",
  ollamaBaseUrl: baseUrl,
  ollamaModel: model,
});
const provider = registry.resolveDraftProvider();

let responseText = "";
try {
  for await (const chunk of provider.streamDraft({
    instruction: "Answer from the local Ollama-compatible endpoint only.",
    messages: [{ role: "user", plainText: "Confirm offline mode." }],
  })) {
    if (chunk.type === "text-delta") responseText += chunk.text;
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const remoteKeysPresent = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
  "KIMI_API_KEY",
  "QWEN_API_KEY",
  "ZHIPU_API_KEY",
].some((key) => Boolean(process.env[key]));

const failures = [];
if (provider.id !== "ollama") failures.push(`provider ${provider.id} != ollama`);
if (state.requests.length !== 1) failures.push(`request_count ${state.requests.length} != 1`);
if (state.requests[0]?.model !== model)
  failures.push(`model ${state.requests[0]?.model} != ${model}`);
if (state.requests[0]?.stream !== true) failures.push("stream flag missing");
if (!responseText.includes("Offline Ollama ready.")) failures.push("unexpected response text");
if (remoteKeysPresent) failures.push("remote API keys present in environment");

const report = {
  generatedAt: new Date().toISOString(),
  evidenceStatus: failures.length === 0 ? "pass" : "fail",
  providerId: provider.id,
  baseUrl,
  model,
  configuredProviders: registry.listConfiguredProviderIds(),
  requestCount: state.requests.length,
  responseText,
  remoteKeysPresent,
  requests: state.requests,
  failures,
};

const jsonPath = outputPath("OLLAMA_OFFLINE_REPORT_JSON_OUT", "ollama-offline-demo.json");
const markdownPath = outputPath("OLLAMA_OFFLINE_REPORT_MD", "ollama-offline-demo.md");
writeOutput(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeOutput(markdownPath, renderMarkdown(report));

console.log(`wrote ${jsonPath}`);
console.log(`wrote ${markdownPath}`);

if (failures.length > 0) {
  process.exitCode = 1;
}
