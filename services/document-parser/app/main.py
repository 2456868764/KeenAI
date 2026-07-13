from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .engines import EngineFailed, EngineUnavailable, ParseJob, parse_document


class ParseRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(default="Untitled")
    raw_content: str | None = None
    content_type: str | None = None
    url: str | None = None
    file_name: str | None = None
    engine: Literal["docling"] = "docling"


class ParseResponse(BaseModel):
    title: str
    markdown: str
    provider: str
    metadata: dict[str, object] = Field(default_factory=dict)


app = FastAPI(title="KeenAI Document Parser", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true"}


@app.post("/parse", response_model=ParseResponse)
def parse(request: ParseRequest) -> ParseResponse:
    if not request.raw_content and not request.url:
        raise HTTPException(status_code=400, detail="raw_content_or_url_required")
    if request.raw_content and request.url:
        raise HTTPException(status_code=400, detail="raw_content_or_url_exclusive")

    try:
        result = parse_document(
            request.engine,
            ParseJob(
                title=request.title,
                raw_content=request.raw_content,
                content_type=request.content_type,
                url=request.url,
                file_name=request.file_name,
            ),
        )
    except EngineUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except EngineFailed as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ParseResponse(
        title=request.title,
        markdown=result.markdown,
        provider=result.provider,
        metadata=result.metadata,
    )
