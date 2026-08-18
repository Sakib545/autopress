# AutoPress — one image, two roles.
#
# The web server and the BullMQ worker run the same code and the same
# node_modules, so they share this image and differ only in their command.
# Keeping them in one image means the worker can never drift from the app that
# enqueued its jobs.

FROM node:20-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma's engines need OpenSSL; the slim image does not ship it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- dependencies -----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# Lifecycle scripts are needed here: Prisma's postinstall fetches its engines.
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` already runs `prisma generate` first.
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/public ./public
COPY package.json package-lock.json next.config.mjs ./
COPY prisma ./prisma
COPY worker ./worker
COPY src ./src
COPY tsconfig.json ./

EXPOSE 3000
# Overridden per service in docker-compose.yml.
CMD ["npm", "run", "start"]
