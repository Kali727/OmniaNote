# OmniaNote

A capture-first notes app for maintenance and facilities crews. Monorepo: a NestJS/Postgres API,
a Capacitor + React mobile shell (iOS/Android via one codebase), and a shared types package so
validation rules live in exactly one place.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together and what's
stubbed vs. real. Product research and rationale live in the OmniaNote Blueprint (shared
separately, not checked into this repo).

## Layout

```
apps/
  api/      NestJS + Prisma + Postgres backend
  mobile/   Capacitor + React + Vite — same codebase for iOS, Android, and browser dev
packages/
  shared/   zod schemas, tier limits, enums — imported by both api and mobile
infra/
  docker-compose.yml       full stack, for the server
  docker-compose.dev.yml   just Postgres/Redis/MinIO/Meilisearch, for local dev
  Caddyfile                reverse proxy + automatic HTTPS
```

## First-time setup

Requires Node 20+ and Docker (for the backing services — Postgres, Redis, MinIO, Meilisearch).

```bash
npm install                                    # installs all workspaces, builds packages/shared
docker compose -f infra/docker-compose.dev.yml up -d
cp apps/api/.env.example apps/api/.env         # then fill in the secrets — see comments in the file
npm run prisma:migrate                         # creates the database schema
cp apps/mobile/.env.example apps/mobile/.env
```

## Running it

```bash
npm run dev:api      # http://localhost:3000/api/v1 — hot reload
npm run dev:mobile   # http://localhost:5173 — browser preview, no native shell needed yet
```

The mobile app runs fine in a regular browser tab for UI work; you only need a device/simulator
once you're testing camera capture or native storage.

### Adding the native shells

```bash
cd apps/mobile
npm run build
npx cap add ios       # requires Xcode, macOS
npx cap add android    # requires Android Studio
npx cap sync
```

## Deploying

`infra/docker-compose.yml` is the whole server-side stack, including the API image built from
[`apps/api/Dockerfile`](apps/api/Dockerfile). Copy `infra/.env.example` to `infra/.env`, fill in
real secrets, point `DOMAIN` at your actual hostname, then:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Caddy issues its own TLS certificate once `DOMAIN` resolves to the server. Database migrations run
automatically on container start (see `apps/api/docker-entrypoint.sh`).

### Deploying to Proxmox as a dedicated LXC

`infra/proxmox/` adapts the [community-scripts.org](https://community-scripts.org) Proxmox VE
Helper-Scripts pattern to this app: `ct/omnianote.sh` runs on the Proxmox host and creates a new
unprivileged Debian LXC (using the same `build.func` container-creation framework
community-scripts uses); `install/omnianote-install.sh` runs inside that container, installs
Docker, clones this repo, generates every secret in `infra/.env` automatically, and brings up the
full stack.

Run as root on the Proxmox host:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Kali727/OmniaNote/main/infra/proxmox/ct/omnianote.sh)"
```

Re-running the same command against an existing container updates it (`git pull` +
`docker compose up -d --build`) instead of creating a second one.

## Conventions worth knowing before extending this

- **Validation lives in `packages/shared`, once.** Every request DTO is a zod schema there,
  wrapped as a Nest DTO via `nestjs-zod` on the API side. The mobile app imports the exact same
  schema. If you add a field, add it to the shared schema first — both sides update together.
- **Enums are `as const` objects, not TS `enum`.** Prisma generates its own enum types from
  `schema.prisma`; TS `enum` is nominal and will never structurally match them even with identical
  values. Keep this pattern (see `packages/shared/src/enums.ts`) for any new enum.
- **Tier limits are enforced server-side only**, at write time (`packages/shared/src/tiers.ts`),
  never trusted from the client.
- **Media never transits the API process.** The API only ever hands out presigned MinIO/S3 URLs;
  the mobile app uploads/downloads directly against object storage.
