# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS web-build
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    APP_WEB_DIST_DIR=/app/web \
    API_HOST=0.0.0.0 \
    API_PORT=8000

LABEL org.opencontainers.image.title="AE NetScope" \
    org.opencontainers.image.description="Open source LAN inventory and sysadmin network documentation web app." \
    org.opencontainers.image.source="https://github.com/WhiteAssassins/AE-NetScope" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.version="0.1.4-alpha"

WORKDIR /app

ARG AE_NETSCOPE_UID=568
ARG AE_NETSCOPE_GID=568

RUN addgroup --system --gid "${AE_NETSCOPE_GID}" ae-netscope \
    && adduser --system --uid "${AE_NETSCOPE_UID}" --ingroup ae-netscope --home /app ae-netscope

COPY api/ /app/api/
COPY VERSION /app/VERSION
COPY --from=web-build /src/web/dist /app/web
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
    && python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir /app/api \
    && chown -R ae-netscope:ae-netscope /app

USER ae-netscope
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/live', timeout=3).read()"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["python", "-m", "uvicorn", "app.main:app", "--app-dir", "/app/api", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
