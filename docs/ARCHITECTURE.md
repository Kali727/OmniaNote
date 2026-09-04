# Architecture

## Data model

`Account` is the billing/storage unit (one per signup, optionally named — e.g. "Grand Plaza Hotel").
`User` belongs to exactly one `Account`; more than one `User` can share an `Account` via the team
invite flow (`apps/api/src/team/`), with `AccountRole` (OWNER/ADMIN/MEMBER) scoping what each can
do — one subscription per Account, no per-seat charge, so a teammate just shares the account's
tier. `Invite` is the pending-invitation row (single-use token, 7-day expiry) between "someone typed
an email into the invite form" and "that person is a real `User`."

`Location → Folder (self-referencing, nestable) → Item` is the filing hierarchy. `Spot` is
separate from `Folder`: it's a recurring place or piece of equipment ("AC Unit, Room 312") that an
`Item` can be pinned to independently of which folder it's filed in — that's what will power the
asset/location history timeline described in the product brief. Every `Item` also has nullable
`locationId`/`folderId` — a freshly captured item lands with both null (the account's Inbox) until
someone files it, which is the whole point of the capture-first flow.

`NoteAttachment` links a `NOTE`-type `Item` to `PHOTO`/`VIDEO`/`PDF` items as discrete attachments
(Outlook-style), so the same media object can be attached to more than one note without duplicating
storage.

See `apps/api/prisma/schema.prisma` for the full model — it's the source of truth, this doc just
orients you.

## Why zod schemas live in `packages/shared`

Both the NestJS API and the Capacitor mobile app need the same validation rules (password
strength, field lengths, enum values). Rather than keep two copies in sync by hand, the schema is
defined once in `packages/shared` and:

- On the API, wrapped as a Nest DTO with `nestjs-zod`'s `createZodDto`, validated by a global
  `ZodValidationPipe`.
- On mobile, imported directly for client-side form validation before a request is even sent.

## Why enums are `as const` objects, not TS `enum`

Prisma generates its own TypeScript types for every enum in `schema.prisma`. TS `enum` types are
*nominal* — even an enum with identical member names and values is a different, incompatible type
to TypeScript. Every enum in `packages/shared` is instead a plain object with `as const`, which
produces a structural string-literal union that matches whatever Prisma generates. Follow this
pattern for any new enum that appears in both places.

## Storage: presigned URLs, not proxied uploads

`POST /items` creates the metadata row and, for photo/video/pdf, returns a presigned MinIO/S3 PUT
URL. The client uploads the file bytes directly to object storage — the API process never buffers
or proxies media. `POST /items/:id/uploaded` is called once the upload finishes; that's when the
real byte size is known, so it's also where the account's tier storage limit is enforced (an
over-limit upload is deleted from storage and the item row is rolled back, rather than silently
letting an account exceed its plan).

## MFA

TOTP is the primary factor (`apps/api/src/auth/totp.service.ts`, via `otplib`) — free, offline,
no per-message cost. Email OTP is the fallback, sent via Resend (`notifications/notification.service.ts`)
with a log-to-stdout fallback when `RESEND_API_KEY` isn't set. SMS is deliberately unimplemented —
it costs money per message and was dropped in favor of email-only. The login-time OTP challenge
(`mfa-challenge.service.ts`) and the enrollment flow (`mfa-enrollment.service.ts`, one pair of
endpoints per method) both use short-TTL Redis keys rather than a database table, since a pending
code is inherently ephemeral. Enrollment is reachable from the mobile app's Settings screen
(`apps/mobile/src/pages/SettingsPage.tsx`), not just the API.

## Admin panel

A static page at `/admin` (`apps/api/public/admin/`), served by the API itself outside its
`/api/v1` prefix via Express's static-assets handling in `main.ts` — deliberately not part of the
Capacitor mobile bundle, since this is for whoever operates the service, not any logged-in end
user. It's plain HTML/CSS/vanilla JS (no build step, no framework) calling the same JSON endpoints
(`/api/v1/admin/*`) a real client would, gated by `JwtAuthGuard` + `PlatformAdminGuard`.

`PlatformAdminGuard` checks `User.isPlatformAdmin` — unrelated to `AccountRole`, which only ever
scopes permissions *within* one Account. There's no self-service way to become a platform admin;
grant it directly:

```sql
UPDATE "User" SET "isPlatformAdmin" = true WHERE username = 'you';
```

The panel covers uptime/health (DB, Redis, Meilisearch, storage reachability —
`AdminService.getHealth`), a recent-errors feed (every 5xx response is recorded to `ErrorLog` by a
global exception filter, `common/filters/error-logging.filter.ts`; 4xx responses aren't logged,
they're expected traffic), and usage: accounts by tier, online-now / active-24h / active-7d /
new-in-30d user counts (from `User.lastSeenAt`, stamped on every authenticated request by
`common/interceptors/activity.interceptor.ts`), storage used, and a country breakdown. Geography
comes from Cloudflare's `CF-IPCountry` request header — free, and already accurate for the one real
deployment (which sits behind Cloudflare Tunnel) — rather than a GeoIP database or third-party
lookup service; it's simply absent for any request not routed through Cloudflare (local dev, for
instance).

## What's scaffolded but not yet wired up

These are provisioned in `infra/docker-compose.yml` because the product plan calls for them, but
no application code uses them yet:

- **Redis + BullMQ** — Redis is wired up and used for MFA challenges; no background job queue
  (thumbnailing, video transcode, OCR) has been built yet. `@nestjs/bullmq` and `bullmq` are
  already dependencies of the API.
- **RevenueCat / store billing** — the `Subscription` table exists to record tier entitlement
  history, but nothing calls out to Apple/Google or consumes a RevenueCat webhook yet. Until that
  exists, tiers only change via a direct database/admin update.
- **Native home-screen widget** — per the product brief, this needs real Swift WidgetKit and
  Android AppWidget code alongside the Capacitor shell; it isn't a Capacitor plugin you install.

## Backups

`infra/backup/` — a nightly `pg_dump` plus, when `BACKUP_S3_*` is configured, an `mc mirror` of
both the dump and the media bucket to any S3-compatible off-site target (Cloudflare R2 is the
natural fit given the deploy already sits behind Cloudflare Tunnel). Local-only by default. See
`infra/backup/backup.sh`.

## What's implemented end-to-end

Register/login with TOTP or email MFA enrollment and verification, JWT access + rotating refresh
tokens, team accounts (invite/accept/roles), locations/folders/spots with tier-limit enforcement
and per-spot history, the full item capture flow (create → presigned upload → confirm → file from
Inbox → favorite → attach to a note) with an offline outbox so a capture is never lost to a dropped
connection, photo thumbnails/annotation, the maintenance stamp library, voice-note dictation,
Meilisearch-backed search, automated backups, and the admin panel described above. See the
README's Status & TODO for what's still deferred.
