# KeenAI Document Parser Sidecar

FastAPI service for high-fidelity KB document parsing. The TypeScript KB package keeps the built-in `lite` parser as the default provider; this sidecar is only used when `KEENAI_KB_DOCUMENT_PARSER=http`.

## API

```bash
POST /parse
{
  "engine": "docling",
  "title": "Manual",
  "raw_content": "<base64 or text>",
  "content_type": "application/pdf",
  "url": "https://example.com/manual.html"
}
```

Supported engine values are only:

- `docling`: uses `docling-project/docling`. It can parse PDF, DOCX, HTML, and URL inputs supported by Docling.
- `mineru`: uses MinerU for PDF/DOCX and MinerU-HTML for HTML/URL. The service invokes command templates so deployments can install the exact upstream CLI version they standardize on.

## Local Run

```bash
cd services/document-parser
python -m pip install -e ".[docling]"
uvicorn app.main:app --host 127.0.0.1 --port 8095
```

Then point the API at it:

```bash
KEENAI_KB_DOCUMENT_PARSER=http
KEENAI_KB_DOCUMENT_PARSER_URL=http://127.0.0.1:8095/parse
KEENAI_KB_DOCUMENT_PARSER_ENGINE=docling
```

## MinerU

Install MinerU and MinerU-HTML through the bundled optional extra, then provide command templates:

```bash
cd services/document-parser
python -m pip install -e ".[mineru]"
```

For MinerU-HTML deployments that need the vLLM backend:

```bash
python -m pip install -e ".[mineru-vllm]"
```

```bash
export MINERU_COMMAND='mineru -p {input} -o {output}'
export MINERU_HTML_COMMAND='mineru-html --input {input} --output {output}'
```

`mineru` engine routing:

- PDF/DOCX raw uploads -> `MINERU_COMMAND`
- HTML raw uploads / HTML URLs -> `MINERU_HTML_COMMAND`

The template receives `{input}`, `{output}`, `{url}`, and `{title}`. The service reads the newest Markdown file under `{output}`; if no Markdown file exists, non-empty stdout is used as Markdown.
