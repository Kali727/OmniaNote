# Build context is the repo root (npm workspaces need the root lockfile + packages/shared):
#   docker build -f apps/api/Dockerfile -t omnianote-api .

FROM node:20-alpine AS builder
WORKDIR /repo
# Prisma's query engine needs libssl and can't reliably auto-detect it on Alpine —
# without this it silently falls back to the wrong OpenSSL target and every prisma
# command fails at runtime.
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/mobile apps/mobile
RUN npm run build --workspace=packages/shared
RUN npm run --workspace=apps/api prisma:generate
RUN npm run build --workspace=apps/api
# Relative, not an absolute URL: this build is served from the same origin as the API
# (see main.ts), so API calls resolve against wherever the page itself was loaded from —
# no CORS to configure, and no domain baked into the image. A Capacitor build has no
# "origin" of its own and still needs an absolute VITE_API_URL in apps/mobile/.env; this
# override applies only to this one build step, not the checked-in .env.example default.
RUN VITE_API_URL=/api/v1 npm run build --workspace=apps/mobile

# Drop devDependencies now that everything's compiled — this only removes packages,
# it doesn't re-run install scripts, so it's safe unlike a fresh `npm ci --omit=dev`
# here (which would re-trigger the root postinstall and fail: tsc wouldn't be
# installed yet to build packages/shared).
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY --from=builder /repo/node_modules node_modules
COPY --from=builder /repo/package.json package.json
COPY --from=builder /repo/packages/shared/package.json packages/shared/package.json
COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/apps/api/package.json apps/api/package.json
COPY --from=builder /repo/apps/api/dist apps/api/dist
COPY --from=builder /repo/apps/api/prisma apps/api/prisma
COPY --from=builder /repo/apps/api/public apps/api/public
COPY --from=builder /repo/apps/mobile/dist apps/mobile/dist
COPY apps/api/docker-entrypoint.sh docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
