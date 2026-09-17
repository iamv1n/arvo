# syntax=docker/dockerfile:1.7
# Multi-target build for the Node apps in the monorepo.
#   docker build -f docker/node.Dockerfile --target api .
#   docker build -f docker/node.Dockerfile --target mcp .
#   docker build -f docker/node.Dockerfile --target web --build-arg NEXT_PUBLIC_API_URL=http://localhost:3301 .
#   docker build -f docker/node.Dockerfile --target site --build-arg NEXT_PUBLIC_APP_URL=http://localhost:3300 .

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# ---- dependencies (cached on lockfile + manifests) ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/site/package.json apps/site/
COPY apps/mcp/package.json apps/mcp/
COPY packages/finance-tools/package.json packages/finance-tools/
COPY packages/ai/package.json packages/ai/
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/finance-core/package.json packages/finance-core/
COPY packages/database/package.json packages/database/
COPY packages/imports/package.json packages/imports/
COPY packages/ui/package.json packages/ui/
COPY e2e/package.json e2e/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- api ----
FROM deps AS api-build
COPY . .
RUN pnpm turbo run build --filter=@arvo/api...

FROM node:${NODE_VERSION} AS api
ENV NODE_ENV=production PORT=3301 STORAGE_PATH=/data/storage
WORKDIR /repo
RUN addgroup -S arvo && adduser -S arvo -G arvo && mkdir -p /data/storage && chown -R arvo:arvo /data
COPY --from=api-build --chown=arvo:arvo /repo /repo
COPY --chmod=755 docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
USER arvo
EXPOSE 3301
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3301/health >/dev/null || exit 1
ENTRYPOINT ["api-entrypoint.sh"]

# ---- mcp ----
FROM deps AS mcp-build
COPY . .
RUN pnpm turbo run build --filter=@arvo/mcp...

FROM node:${NODE_VERSION} AS mcp
ENV NODE_ENV=production MCP_PORT=3302
WORKDIR /repo
RUN addgroup -S arvo && adduser -S arvo -G arvo
COPY --from=mcp-build --chown=arvo:arvo /repo /repo
USER arvo
EXPOSE 3302
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3302/health >/dev/null || exit 1
CMD ["node", "apps/mcp/dist/main.js"]

# ---- web (Next.js standalone) ----
FROM deps AS web-build
ARG NEXT_PUBLIC_API_URL=http://localhost:3301
ARG NEXT_PUBLIC_MCP_URL=http://localhost:3302/mcp
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_PUBLIC_MCP_URL=${NEXT_PUBLIC_MCP_URL}
COPY . .
RUN pnpm turbo run build --filter=@arvo/web...

FROM node:${NODE_VERSION} AS web
ENV NODE_ENV=production PORT=3300 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -S arvo && adduser -S arvo -G arvo
COPY --from=web-build --chown=arvo:arvo /repo/apps/web/.next/standalone ./
COPY --from=web-build --chown=arvo:arvo /repo/apps/web/.next/static ./apps/web/.next/static
USER arvo
EXPOSE 3300
CMD ["node", "apps/web/server.js"]

# ---- site (independent landing page) ----
FROM deps AS site-build
ARG NEXT_PUBLIC_APP_URL=http://localhost:3300
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
COPY . .
RUN pnpm turbo run build --filter=@arvo/site...

FROM node:${NODE_VERSION} AS site
ENV NODE_ENV=production PORT=3400 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -S arvo && adduser -S arvo -G arvo
COPY --from=site-build --chown=arvo:arvo /repo/apps/site/.next/standalone ./
COPY --from=site-build --chown=arvo:arvo /repo/apps/site/.next/static ./apps/site/.next/static
USER arvo
EXPOSE 3400
CMD ["node", "apps/site/server.js"]
