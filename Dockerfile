# PcyBox GoLive Community: web application and audit worker.
# docker compose up --build

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/
COPY apps/worker/package.json apps/worker/
COPY packages/spec/package.json packages/spec/
COPY packages/packs-sdk/package.json packages/packs-sdk/
COPY packages/engine/package.json packages/engine/
COPY packages/probe/package.json packages/probe/
COPY packages/scanner/package.json packages/scanner/
COPY packages/db/package.json packages/db/
COPY packages/robot/package.json packages/robot/
COPY packs/package.json packs/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Placeholder only: route modules are imported during the build, no connection is opened.
ENV NEXT_TELEMETRY_DISABLED=1     DATABASE_URL=postgres://build@localhost:5432/build
RUN pnpm --filter @golive/web build && pnpm --filter @golive/worker build \
 && pnpm --filter @golive/worker deploy --prod --legacy /out/worker

# --------------------------------------------------------------- web
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S golive && adduser -S golive -G golive
COPY --from=build --chown=golive:golive /repo/apps/web/.next/standalone ./
COPY --from=build --chown=golive:golive /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=golive:golive /repo/apps/web/public ./apps/web/public
USER golive
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/config >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]

# --------------------------------------------------------------- worker
# Official Playwright image: Chromium and its system libraries, same version as playwright-core.
FROM mcr.microsoft.com/playwright:v1.65.1-noble AS worker
WORKDIR /app
ENV NODE_ENV=production \
    GOLIVE_MIGRATIONS_DIR=/app/migrations
COPY --from=build --chown=pwuser:pwuser /out/worker/node_modules ./node_modules
COPY --from=build --chown=pwuser:pwuser /repo/apps/worker/dist ./dist
COPY --from=build --chown=pwuser:pwuser /repo/packages/db/migrations ./migrations
USER pwuser
CMD ["node", "dist/worker.js"]
