# One image, one public port: the Next.js platform on $PORT (default 3100) and
# internal microservices (Redline, Code Runner) inside the container.
#
#   docker build -t offerloop .
#   docker run -p 3100:3100 -v offerloop-data:/data --env-file apps/platform/.env.local offerloop

# ── 1. Build the frontend and Node services ─────────────
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable

# The lockfile pins every package to the versions that were tested; --frozen-lockfile below
# fails the build instead of quietly installing newer ones.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/platform/package.json apps/platform/
COPY apps/code-editor/package.json apps/code-editor/
COPY modules/resume-studio/package.json modules/resume-studio/
COPY services/code-runner/package.json services/code-runner/
COPY services/job-agent/package.json services/job-agent/

RUN pnpm install --frozen-lockfile

COPY apps ./apps
COPY modules ./modules
COPY services/code-runner ./services/code-runner
COPY services/job-agent ./services/job-agent

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @offerloop/code-runner build && \
    pnpm --filter @offerloop/platform build

# ── 2. Runtime: Python 3.12 for Redline + Node for Web/APIs ──
FROM python:3.12-slim
WORKDIR /app
COPY --from=build /usr/local/bin/node /usr/local/bin/node

# Python dependencies
COPY services/redline-api/backend/requirements.txt services/redline-api/backend/
RUN pip install --no-cache-dir -r services/redline-api/backend/requirements.txt

COPY services/redline-api ./services/redline-api
COPY --from=build /app /app
COPY scripts ./scripts

# Persistent data volume for single server deploy
ENV NODE_ENV=production \
    PORT=3100 \
    REDLINE_SYSTEM_PYTHON=1 \
    REDLINE_DATA_DIR=/data \
    OFFERLOOP_DATA_DIR=/data/platform \
    NEXT_TELEMETRY_DISABLED=1

VOLUME /data
EXPOSE 3100

CMD ["node", "scripts/start.mjs"]
