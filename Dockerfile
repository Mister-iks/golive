# PcyBox GoLive Community: self-hosted web application.
# docker compose up --build

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/
COPY packages/spec/package.json packages/spec/
COPY packages/packs-sdk/package.json packages/packs-sdk/
COPY packages/engine/package.json packages/engine/
COPY packages/probe/package.json packages/probe/
COPY packs/package.json packs/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @golive/web build

FROM node:22-alpine AS run
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
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
