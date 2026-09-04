# OmniaNote

A capture-first notes app for maintenance and facilities crews. Monorepo: a NestJS/Postgres API,
a Capacitor + React mobile shell (iOS/Android via one codebase), and a shared types package so
validation rules live in exactly one place.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together and what's
stubbed vs. real. Product research and rationale live in the OmniaNote Blueprint (shared
separately, not checked into this repo).

## Status & TODO

Live at `note.omniahotelsystems.com`, deployed on Proxmox LXC `114`, updated in place with `update`
run inside the container.

**Done**
- [x] Monorepo foundation — NestJS/Prisma API, Capacitor mobile shell, shared zod schemas
- [x] Docker Compose stack + one-command Proxmox deploy (`infra/proxmox/deploy.sh`)
- [x] Auth — register/login, JWT access + rotating refresh, TOTP MFA, email MFA (Resend)
- [x] Locations/folders/spots with server-enforced tier limits
- [x] Item capture flow — photo/video/pdf/note, presigned upload, inbox, filing, favorites, note attachments
- [x] Settings/Security screen (MFA enrollment) in the mobile app
- [x] Automated backups — nightly Postgres dump + optional off-site mirror
- [x] Photo thumbnails in the item grid (client-generated, presigned URLs end to end)
- [x] Photo annotation (finger-drawn markup, flattened at full resolution before upload)
- [x] Search — Meilisearch wired end to end, scoped per account with an optional location filter
- [x] Maintenance stamp library (Leak / Electrical / Safety Hazard / Parts Needed / Fixed) — also the
      first item detail screen, since nothing let you open a single item before this
- [x] Location/asset history UI — spots (recurring assets, e.g. "AC Unit, Room 312") get their own
      history timeline; also added the location-creation UI that was missing entirely before this
- [x] Voice-note dictation — live speech-to-text on the note body via the browser's Web Speech API;
      needs swapping for a native plugin once iOS/Android shells exist (see `lib/dictation.ts`)
- [x] Offline capture with a visible sync-status UI — captures write to a local IndexedDB outbox
      first and sync in the background, so nothing is lost to a dropped connection or a closed tab;
      status (Queued/Uploading/Synced/Failed) shows on Home and in the Inbox, with tap-to-retry on
      a failure (see `lib/syncQueue.ts`)

This closes out every item that was on the "majors first" list — everything below is either
deferred by explicit decision or genuinely open-ended (the admin panel). Next up is picking through
smaller polish and gaps noticed along the way (e.g. no folder-creation UI yet, no way to clear a
previously-set spot back to "none").

**Deferred — explicit decisions, revisit later**
- [ ] Live MFA email delivery — the Resend integration is done; `RESEND_API_KEY` just isn't set on
      the production deployment yet, so codes still log to `docker compose logs api` there
- [ ] Team/invite-a-teammate flow — staying solo-account for now. Decided when we do build it: one
      subscription per Account (already how the schema works), no per-seat charge, teammates just
      share the account's tier
- [ ] Billing — RevenueCat or an alternative (Qonversion/Adapty/AppHud/Glassfy) vs. rolling it
      yourself against Apple/Google directly; Apple + Google dev accounts already exist, deferred
      until the product's further along
- [ ] Native iOS/Android builds (`cap add ios`/`android`) — have Mac+Xcode and Android Studio ready,
      staying on web-based testing until the backend/frontend feature list above is further along
- [ ] Admin panel — uptime/error monitoring, logs, usage analytics (active users, geography, paying
      subscriptions) all land here once it exists; no timeline yet

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
npm install
npm run build:shared                           # apps/api and apps/mobile both import its compiled output
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

### Backups

The `backup` service (`infra/backup/`) dumps Postgres and, if `BACKUP_S3_*` is set in `infra/.env`,
mirrors both that dump and the media bucket to any S3-compatible off-site target — Cloudflare R2 is
a natural fit if you're already on Cloudflare. It runs local-only with zero extra setup otherwise,
but a local-only backup is only as safe as this server's own disk — off-site is what actually makes
it disaster recovery. See the comments in `infra/.env.example` for the exact vars.

### Deploying to Proxmox as a dedicated LXC

`infra/proxmox/deploy.sh` runs on the Proxmox host: it creates an unprivileged Debian 13 LXC with
`pct create`, then runs `infra/proxmox/install/omnianote-install.sh` inside it, which installs
Docker, clones this repo, generates every secret in `infra/.env` automatically, and brings up the
full stack. The install script is written in the same style as
[community-scripts.org](https://community-scripts.org)'s "addon" scripts — it sources their
`misc/core.func` / `misc/tools.func` for the colored output and `ensure_docker` helper — but it is
**not** one of their catalog scripts and doesn't use their `build.func` container-creation
framework, because that framework hardcodes its install-script fetch to their own repo and can't
be pointed at a third-party one.

The repo is public, so no token is needed. Run as root on the Proxmox host:

```bash
bash -c "$(curl -fsSL -H "Accept: application/vnd.github.raw" \
  "https://api.github.com/repos/Kali727/OmniaNote/contents/infra/proxmox/deploy.sh?ref=main")"
```

This fetches through the GitHub API rather than `raw.githubusercontent.com` on purpose: that CDN
ignores query strings for its cache key on this content, so a cache-buster does nothing there, and
a stale cached response (e.g. a 404 from before this repo went public) can outlive its own
advertised cache lifetime. The API endpoint doesn't have that problem.

Re-running the command against the same container ID updates it (`git pull` + rebuild) instead of
creating a second one. The installer also drops an `update` command inside the container itself, so
day to day you don't need the Proxmox host at all:

```bash
pct exec 114 -- update    # from the Proxmox host, or just `update` from a shell inside the container
```

**Caveat:** the Docker stack this installs (`ensure_docker`, the `docker compose` build and boot)
is validated — I built and ran the exact same image and Compose file locally end-to-end before
writing this script. The `pct create`/`pveam` container-creation step in `deploy.sh` is not — there
is no Proxmox host available to test it against, so treat the prompts and flags as a best-effort
implementation of the standard `pct` workflow rather than something proven to work on your exact
Proxmox version/storage layout.

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
