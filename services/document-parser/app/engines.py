from __future__ import annotations

import base64
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


ParserEngine = Literal["docling"]


class EngineUnavailable(RuntimeError):
    pass


class EngineFailed(RuntimeError):
    pass


@dataclass(frozen=True)
class ParseJob:
    title: str
    raw_content: str | None
    content_type: str | None
    url: str | None
    file_name: str | None


@dataclass(frozen=True)
class ParseResult:
    markdown: str
    provider: str
    metadata: dict[str, object]


def _content_type(job: ParseJob) -> str:
    return (job.content_type or "").lower()


def _looks_like_html(job: ParseJob) -> bool:
    content_type = _content_type(job)
    if "html" in content_type:
        return True
    raw = (job.raw_content or "").lstrip().lower()
    return raw.startswith("<!doctype html") or raw.startswith("<html") or "<body" in raw[:512]


def _suffix_for_job(job: ParseJob) -> str:
    name = (job.file_name or "").lower()
    content_type = _content_type(job)
    if name.endswith(".pdf") or "pdf" in content_type:
        return ".pdf"
    if name.endswith(".docx") or "docx" in content_type or "wordprocessingml" in content_type:
        return ".docx"
    if name.endswith(".html") or name.endswith(".htm") or _looks_like_html(job):
        return ".html"
    return ".txt"


def _decode_raw_content(raw: str) -> bytes:
    compact = raw.strip()
    if compact.startswith("data:") and ";base64," in compact:
        compact = compact.split(";base64,", 1)[1]
    try:
        return base64.b64decode(compact, validate=True)
    except Exception:
        return raw.encode("utf-8")


def _write_job_input(job: ParseJob, directory: Path) -> Path:
    if job.raw_content is None:
        raise EngineFailed("raw_content_required")
    path = directory / f"input{_suffix_for_job(job)}"
    path.write_bytes(_decode_raw_content(job.raw_content))
    return path


def parse_with_docling(job: ParseJob) -> ParseResult:
    try:
        from docling.document_converter import DocumentConverter
    except Exception as exc:
        raise EngineUnavailable("docling_not_installed") from exc

    with tempfile.TemporaryDirectory(prefix="keenai-docling-") as tmp:
        source = job.url or str(_write_job_input(job, Path(tmp)))
        converted = DocumentConverter().convert(source)
        markdown = converted.document.export_to_markdown()
        return ParseResult(
            markdown=markdown,
            provider="docling",
            metadata={"engine": "docling", "source": "url" if job.url else "raw_content"},
        )


def parse_document(engine: ParserEngine, job: ParseJob) -> ParseResult:
    if engine == "docling":
        return parse_with_docling(job)
    raise EngineUnavailable(f"unsupported_engine:{engine}")
