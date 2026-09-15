# KeenAI Document Parser Sidecar

FastAPI service for optional high-fidelity KB document parsing. The TypeScript KB package uses the Node `@firecrawl/anydoc` provider by default; this Python sidecar is only used when `KEENAI_KB_DOCUMENT_PARSER=http`.

## API

```bash
POST /parse
{
  "engine": "docling",
  "title": "Manual",
  "raw_content": "<base64 or text>",
  "content_type": "application/pdf"
}
```

For URL parsing, send `url` instead of `raw_content`:

```bash
POST /parse
{
  "engine": "docling",
  "title": "Manual",
  "url": "https://example.com/manual.html"
}
```

`raw_content` and `url` are alternative inputs; send exactly one of them. The Python sidecar supports only:

- `docling`: uses `docling-project/docling`. It can parse PDF, DOCX, HTML, and URL inputs supported by Docling.

Anydoc is intentionally not routed through this service. KeenAI calls `@firecrawl/anydoc` directly from the Node KB package for PDF, Word, PowerPoint, and other document files. MinerU is intentionally not included in this Python sidecar for now.

## Local Run

```bash
cd services/document-parser
python -m pip install -e .
uvicorn app.main:app --host 127.0.0.1 --port 8095
```

Then point the API at it:

```bash
KEENAI_KB_DOCUMENT_PARSER=http
KEENAI_KB_DOCUMENT_PARSER_URL=http://127.0.0.1:8095/parse
KEENAI_KB_DOCUMENT_PARSER_ENGINE=docling
```
