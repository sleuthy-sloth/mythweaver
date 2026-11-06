# API image. Multi-stage: build the bundle with dev dependencies, ship only dist.
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/rules-core/package.json packages/rules-core/package.json
COPY packages/rules-ironsworn/package.json packages/rules-ironsworn/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @mythweaver/api...

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/rules-core packages/rules-core
COPY packages/rules-ironsworn packages/rules-ironsworn
COPY apps/api apps/api
RUN pnpm --filter @mythweaver/api build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S mythweaver && adduser -S mythweaver -G mythweaver

COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
COPY --from=build /repo/apps/api/package.json ./package.json

USER mythweaver
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
