# syntax=docker/dockerfile:1
# Production image, built by CI: the Next.js server plus two one-off scripts
# from the same image - database migrations and test data (seed).

ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@12.11.2 --no-fund --no-audit
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
ARG NODE_VERSION
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No database settings here: the app connects on the first query, at run time
RUN pnpm build
# Migrations and seed as single files that need no node_modules
RUN pnpm exec esbuild scripts/migrate.ts scripts/seed.ts \
      --bundle --platform=node --target=node${NODE_VERSION} --format=cjs \
      --outdir=scripts-dist --out-extension:.js=.cjs

FROM node:${NODE_VERSION}-slim AS runner
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=$APP_VERSION
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts-dist ./scripts
USER node
EXPOSE 3000
CMD ["node", "server.js"]
