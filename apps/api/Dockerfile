# Build context is the repo root (npm workspaces need the root lockfile + packages/shared):
#   docker build -f apps/api/Dockerfile -t omnianote-api .

FROM node:20-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=packages/shared
RUN npm run --workspace=apps/api prisma:generate
RUN npm run build --workspace=apps/api

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev

COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/apps/api/dist apps/api/dist
COPY --from=builder /repo/apps/api/prisma apps/api/prisma
# npm workspaces hoist @prisma/client to the repo root, so the generated engine/client
# lands in root node_modules/.prisma — copy it there rather than under apps/api.
COPY --from=builder /repo/node_modules/.prisma node_modules/.prisma
COPY apps/api/docker-entrypoint.sh docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
