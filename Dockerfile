# One image, one process: the Next.js platform on $PORT (default 3100). Resume Studio's
# engine runs inside it, so there is nothing else to start.
#
#   docker build -t offerloop .
#   docker run -p 3100:3100 -v offerloop-data:/data --env-file apps/platform/.env.local offerloop

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable

# The lockfile pins every package to the versions that were tested; --frozen-lockfile below
# fails the build instead of quietly installing newer ones.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/platform/package.json apps/platform/
COPY modules/resume-studio/package.json modules/resume-studio/
COPY shared/storage/package.json shared/storage/
COPY services/job-agent/package.json services/job-agent/
RUN pnpm install --frozen-lockfile

COPY apps/platform ./apps/platform
COPY modules ./modules
COPY shared ./shared
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @offerloop/platform build

FROM node:22-slim
COPY --from=build /app /app
WORKDIR /app/apps/platform

# Saved workflows (automations.json) and Resume Studio workspaces (redline/) live in /data —
# or in a Postgres database (e.g. Supabase) when DATABASE_URL is set.
ENV NODE_ENV=production \
    PORT=3100 \
    OFFERLOOP_DATA_DIR=/data \
    NEXT_TELEMETRY_DISABLED=1

# Without DATABASE_URL, mount a persistent disk or volume at /data.
EXPOSE 3100

CMD ["sh", "-c", "exec node node_modules/next/dist/bin/next start --port \"$PORT\" --hostname 0.0.0.0"]
