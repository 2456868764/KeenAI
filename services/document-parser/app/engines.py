from __future__ import annotations

import base64
import os
import shlex
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse


ParserEngine = Literal["docling", "mineru"]


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


def _find_markdown(output_dir: Path) -> str:
    candidates = sorted(
        output_dir.rglob("*.md"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        raise EngineFailed("markdown_output_not_found")
    return candidates[0].read_text(encoding="utf-8")


def _run_template(command_template: str, *, input_path: Path | None, output_dir: Path, job: ParseJob) -> str:
    values = {
        "input": str(input_path) if input_path else "",
        "output": str(output_dir),
        "url": job.url or "",
        "title": job.title,
    }
    command = shlex.split(command_template.format(**values))
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=int(os.getenv("KEENAI_DOCUMENT_PARSER_TIMEOUT_SECONDS", "300")),
    )
    if completed.returncode != 0:
        raise EngineFailed((completed.stderr or completed.stdout or "parser_command_failed").strip())
    try:
        return _find_markdown(output_dir)
    except EngineFailed:
        stdout = completed.stdout.strip()
        if stdout:
            return stdout
        raise


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


def parse_with_mineru(job: ParseJob) -> ParseResult:
    path = _url_path(job.url or "")
    is_document_url = bool(path.endswith((".pdf", ".docx")))
    uses_html_adapter = _looks_like_html(job) or bool(job.url and not is_document_url)
    command_name = "MINERU_HTML_COMMAND" if uses_html_adapter else "MINERU_COMMAND"
    command = os.getenv(command_name)
    if not command:
        raise EngineUnavailable(f"{command_name.lower()}_required")

    with tempfile.TemporaryDirectory(prefix="keenai-mineru-") as tmp:
        workspace = Path(tmp)
        output_dir = workspace / "output"
        output_dir.mkdir(parents=True, exist_ok=True)
        input_path = None if job.url else _write_job_input(job, workspace)
        markdown = _run_template(command, input_path=input_path, output_dir=output_dir, job=job)
        return ParseResult(
            markdown=markdown,
            provider="mineru-html" if uses_html_adapter else "mineru",
            metadata={
                "engine": "mineru",
                "adapter": "mineru-html" if uses_html_adapter else "mineru",
                "source": "url" if job.url else "raw_content",
            },
        )


def _url_path(url: str) -> str:
    try:
        return urlparse(url).path.lower()
    except Exception:
        return ""


def parse_document(engine: ParserEngine, job: ParseJob) -> ParseResult:
    if engine == "docling":
        return parse_with_docling(job)
    if engine == "mineru":
        return parse_with_mineru(job)
    raise EngineUnavailable(f"unsupported_engine:{engine}")
