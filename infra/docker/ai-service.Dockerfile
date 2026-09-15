# ---- build ----
FROM python:3.11.16-slim AS build
WORKDIR /app
COPY apps/ai-service/requirements.txt requirements.txt
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---- runtime ----
FROM python:3.11.16-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY --from=build /install /usr/local
COPY apps/ai-service .
RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/.cache/transformers \
    && chown -R appuser:appuser /app/.cache/transformers
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/health', timeout=3)" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
