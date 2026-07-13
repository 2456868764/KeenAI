FROM python:3.11-slim

WORKDIR /app

COPY services/document-parser/pyproject.toml ./
COPY services/document-parser/app ./app

RUN python -m pip install --no-cache-dir --upgrade pip \
  && python -m pip install --no-cache-dir .

EXPOSE 8095
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8095"]
