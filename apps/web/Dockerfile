# Build context: repo root (bun.lock lives there).
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/bridge/package.json apps/bridge/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --filter @grok-imessage/web
COPY apps/web apps/web
RUN bun run --filter @grok-imessage/web build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
