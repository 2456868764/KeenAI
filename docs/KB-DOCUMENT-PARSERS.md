# KB Document Parser Providers

KeenAI keeps the built-in TypeScript parser as the default `lite` provider and adds optional high-fidelity parser providers for heavier documents.

## Provider Modes

| Mode | Runtime | Use case |
|------|---------|----------|
| `lite` | Node.js in `@keenai/kb` | Default, no extra service. Handles Markdown/HTML plus lightweight PDF/DOCX extraction. |
| `http` | `services/document-parser` FastAPI sidecar | Local high-fidelity parsing with `engine=docling` or `engine=mineru`. |
| `cloud` | HTTP adapter to managed parser API | Production OCR/layout extraction when cloud processing is acceptable. |

Environment:

```bash
KEENAI_KB_DOCUMENT_PARSER=lite

# Local sidecar
KEENAI_KB_DOCUMENT_PARSER=http
KEENAI_KB_DOCUMENT_PARSER_URL=http://127.0.0.1:8095/parse
KEENAI_KB_DOCUMENT_PARSER_ENGINE=docling # or mineru

# Cloud adapter
KEENAI_KB_DOCUMENT_PARSER=cloud
KEENAI_KB_CLOUD_DOCUMENT_PARSER_PROVIDER=azure-document-intelligence
KEENAI_KB_CLOUD_DOCUMENT_PARSER_URL=https://parser.example.com/parse
KEENAI_KB_CLOUD_DOCUMENT_PARSER_API_KEY=...
```

## Python Sidecar Engines

The sidecar intentionally exposes only two engine names:

| Engine | PDF | DOCX | HTML | URL |
|--------|-----|------|------|-----|
| `docling` | Docling | Docling | Docling | Docling |
| `mineru` | MinerU via `MINERU_COMMAND` | MinerU via `MINERU_COMMAND` | MinerU-HTML via `MINERU_HTML_COMMAND` | MinerU-HTML for normal web URLs; MinerU command templates can handle direct `.pdf` / `.docx` URLs |

MinerU command templates receive `{input}`, `{output}`, `{url}`, and `{title}`. The sidecar reads Markdown from the newest `*.md` under `{output}` or falls back to non-empty stdout.

## Cloud Parser Candidates

| Service | Strength | Notes |
|---------|----------|-------|
| Azure AI Document Intelligence Layout | Strong managed layout OCR for PDF/images/Office/HTML, tables, figures, roles, Markdown output | Good enterprise default when Microsoft stack is acceptable. |
| Google Cloud Document AI | Broad document AI processors and OCR/extraction ecosystem | Good for GCP deployments and processor-specific workflows. |
| AWS Textract | OCR plus forms/tables/handwriting in AWS | Good for AWS-native compliance and storage flows. |
| LlamaParse | RAG-oriented parsing to Markdown/structured outputs | Good for LlamaIndex-heavy RAG stacks. |
| Unstructured API | Partitioning into document elements across many formats | Good when downstream wants normalized semantic elements. |
| Mistral OCR | Model-native OCR/document understanding | Good when already using Mistral models and APIs. |
| LandingAI ADE | Structured Markdown plus hierarchical JSON and page coordinates | Good for visually grounded extraction and section-aware RAG. |

Cloud parsing should stay behind the same `KbDocumentParserProvider` interface so the ingestion pipeline remains `fetch -> parse -> chunk -> embed -> index` regardless of provider.
