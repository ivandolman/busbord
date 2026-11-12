# Bestemmingsbord: production image (Coolify, or plain Docker). See "Deploy" in README.md.
# Timetable, road network and saved routes live in /app/data: mount a volume there.

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build && pnpm build:scripts

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=:: \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist/scripts ./scripts
COPY --chown=node:node docker-entrypoint.sh ./
# Owned by "node", so a fresh named volume mounted here is writable for the app.
RUN mkdir -p data && chown node:node data && chmod +x docker-entrypoint.sh

USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
