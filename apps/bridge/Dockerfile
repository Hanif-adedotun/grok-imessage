# Build context: repo root (bun.lock lives there).
FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json bun.lock ./
COPY apps/bridge/package.json apps/bridge/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --production --filter @grok-imessage/bridge
COPY apps/bridge apps/bridge
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
# Env comes from the container, not the `start` script's --env-file.
CMD ["bun", "run", "apps/bridge/src/index.ts"]
