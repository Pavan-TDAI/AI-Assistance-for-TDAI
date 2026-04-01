FROM node:20-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/agent-core/package.json packages/agent-core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/google-connectors/package.json packages/google-connectors/package.json
COPY packages/local-tools/package.json packages/local-tools/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/tool-registry/package.json packages/tool-registry/package.json

RUN pnpm fetch --frozen-lockfile

COPY . .

RUN pnpm install --frozen-lockfile --offline

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN pnpm --filter @personal-ai/web build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000)).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["pnpm", "--filter", "@personal-ai/web", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
