FROM python:3.11-slim

WORKDIR /app

COPY services/document-parser/pyproject.toml ./
COPY services/document-parser/app ./app

ARG PARSER_EXTRAS=
RUN python -m pip install --no-cache-dir --upgrade pip \
  && if [ -n "$PARSER_EXTRAS" ]; then \
    python -m pip install --no-cache-dir ".[${PARSER_EXTRAS}]"; \
  else \
    python -m pip install --no-cache-dir .; \
  fi

EXPOSE 8095
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8095"]
