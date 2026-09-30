# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS dependencies
ARG PNPM_VERSION=11.25.0
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app
# 本仓库各包保留独立锁文件；仅安装后端，并沿用原生依赖构建许可。
COPY packages/backend/package.json packages/backend/pnpm-lock.yaml pnpm-workspace.yaml ./

FROM dependencies AS build
RUN --mount=type=cache,id=kuvibe-admin-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY packages/backend/nest-cli.json packages/backend/tsconfig*.json ./
COPY packages/backend/src ./src
COPY packages/backend/types ./types
RUN pnpm build

FROM dependencies AS production-dependencies
RUN --mount=type=cache,id=kuvibe-admin-pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --store-dir=/pnpm/store

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production APP_PORT=7001
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node packages/backend/package.json ./package.json
COPY --chown=node:node docker/healthcheck.mjs ./docker/healthcheck.mjs
RUN mkdir -p var/attachments public \
    && chown node:node /app /app/var /app/var/attachments /app/public
USER node
EXPOSE 7001
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD ["node", "docker/healthcheck.mjs"]
CMD ["node", "dist/src/main.js"]
