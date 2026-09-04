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
`Item` can be pinned to independently of which folder it's filed in — that's what powers the
asset/location history timeline (see "Maintenance stamps and location/asset history" below). Every
`Item` also has nullable `locationId`/`folderId` — a freshly captured item lands with both null
(the account's Inbox) until someone files it, which is the whole point of the capture-first flow.

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

## Filing an item: folder/spot are three-way, not just optional

`fileItemSchema` (`packages/shared/src/schemas/item.ts`) makes `folderId`/`spotId` both
`.nullable().optional()`, not just `.optional()`. That's deliberate: a plain optional string can
only distinguish "provided" from "not provided," but re-filing an item needs a third state —
*omit* the key to leave that field exactly as it is (e.g. changing only the spot without disturbing
which folder the item's in), or send an explicit `null` to clear it back to "none." Prisma's own
`update()` already treats an `undefined` value in the data object as "field not provided" and a
`null` value as "set it to null," so `ItemsService.file()` passes the parsed input straight through
with no extra branching — the schema is where this distinction has to be made, since a naive
`.optional()` there would silently make "clear it" impossible to express. `ItemDetailPage.tsx`'s
folder/spot `<select>`s send `null` for their "— None —" option specifically because of this.

## Search

Meilisearch (`apps/api/src/search/search.service.ts`) is scoped per-account and re-indexed on every
item mutation (create, file, favorite, stamp). A search result's IDs are always resolved back
against Postgres before returning — Meilisearch is never trusted as a source of truth for item
data, so a stale or missing index entry can only ever mean an item doesn't show up yet, never that
stale data gets served.

The one landmine worth knowing before touching this file: every mutating call on the Meilisearch
client returns an `EnqueuedTaskPromise`. A plain `await` on it only confirms the task was *queued*
— a task that later *fails* still resolves that promise normally rather than rejecting it. Every
write in `search.service.ts` goes through a `runTask()` helper that calls `.waitTask()` and checks
`task.status` explicitly; skipping that check is exactly how this went silently wrong the first
time it was written — search returned empty results for everything, with nothing in the logs to
suggest why, since every write appeared to succeed.

## Media: thumbnails and annotation

Thumbnails are generated client-side (`apps/mobile/src/lib/thumbnail.ts`, canvas + `toBlob`) rather
than server-side — the API already never touches media bytes (see below), and a client-side
downscale means no image-processing dependency or worker queue is needed just to put something in
a grid tile. `POST /items` returns a second presigned URL for the thumbnail alongside the one for
the original, generated eagerly regardless of whether the client actually has one to upload; an
unused presigned URL costs nothing.

Annotation (`apps/mobile/src/components/AnnotationCanvas.tsx`) draws directly onto a canvas sized
to the photo's *natural* resolution (not the on-screen display size) and flattens the markup onto
the original image before upload — there's no separate overlay layer stored or reconstructed later,
what gets uploaded is the final, already-annotated image.

## Maintenance stamps and location/asset history

`Item.stamps` (`StampType[]`) is a plain array column, set wholesale via `PATCH /items/:id/stamps`
— there's no per-stamp toggle endpoint, the client always sends the item's complete desired stamp
list. `Spot` is what actually powers asset/location history: `GET /items/by-spot/:spotId`
(`apps/mobile/src/pages/SpotPage.tsx`) returns every item ever pinned to that spot, newest first,
independent of which folder any of them are filed in. Both `folderId` and `spotId` are validated
against the target `locationId` when filing an item — a folder or spot from a different location in
the same account is rejected, not silently accepted.

## Voice-note dictation

`apps/mobile/src/lib/dictation.ts` calls the browser's native Web Speech API directly rather than a
Capacitor plugin. The obvious candidate, `@capacitor-community/speech-recognition`, ships a web
implementation where every method just throws "unimplemented on web" — unusable under the
browser-only testing this project runs before native shells exist. This will need swapping for that
plugin's native start/stop/partialResults API once `cap add ios`/`android` lands: neither WebView
exposes the Web Speech API this hook depends on, so the feature stops working the moment the app
runs natively instead of in a browser tab.

## Offline outbox and background sync

Captures write to a local IndexedDB queue (`apps/mobile/src/lib/outboxDb.ts`) before anything
touches the network — `syncQueue.enqueue()` resolves once the write lands locally, and
`CapturePage`/`NotePage` navigate away immediately rather than awaiting the upload. A background
drain loop (`apps/mobile/src/lib/syncQueue.ts`) runs on enqueue, on the browser's `online` event, on
a 25-second fallback timer (the `online` event only reflects the network interface, not real
reachability), and once at startup to flush anything left over from a session that ended offline.
Status per item — Queued/Uploading/Synced/Failed — is visible on Home and in the Inbox
(`components/OutboxRow.tsx`), with tap-to-retry on a failure.

The drain loop and manual retry are both wrapped in a `navigator.locks` exclusive lock
(`SYNC_LOCK_NAME`), not just an in-memory `processing` flag — that flag only guards re-entrancy
*within one tab's JS realm*, and the outbox itself is shared browser-wide storage. Two tabs open to
the same account (or a tab plus an installed PWA instance) would otherwise each run their own
independent drain loop against it. This was a real, reproduced bug during development: a manual
retry racing an automatic retry of the same failed entry both read status `FAILED`, both flipped it
to `QUEUED`, and both synced it — the item was created on the server twice. The fix holds the lock
for the *entire* read-check-sync attempt (`syncOne`), not just the initial status flip followed by a
separate call to trigger the drain — releasing early and re-acquiring left exactly the gap the race
needed. If you're extending this file, any new code path that reads an entry's status and then acts
on it needs to happen inside one lock acquisition, not two.

## Team accounts

Registration always creates exactly one new `Account`; joining an *existing* one only happens
through the invite flow (`apps/api/src/team/`). `TeamService.inviteTeammate` enforces
`isWithinTeamMemberLimit` (`packages/shared/src/tiers.ts`) against members *and* live pending
invites combined, so the limit can't be gamed by leaving invites outstanding. Accepting an invite
(`POST /team/invites/:token/accept` — public, the invitee has no account yet) creates the `User` and
logs them straight in via `AuthService.issueTokens`, the same token-issuing path login uses.
Permission rules worth knowing if you touch this: only OWNER/ADMIN can invite or remove a member,
only OWNER can change a role or remove an ADMIN, and an account can never be left with zero OWNERs
(`assertNotLastOwner`) — enforced both on removal and on demoting the last owner's own role.

## MFA

TOTP is the primary factor (`apps/api/src/auth/totp.service.ts`, via `otplib`) — free, offline,
no per-message cost. Email OTP is the fallback, sent via Resend (`notifications/notification.service.ts`)
with a log-to-stdout fallback when `RESEND_API_KEY` isn't set. SMS is deliberately unimplemented —
it costs money per message and was dropped in favor of email-only. The login-time OTP challenge
(`mfa-challenge.service.ts`) and the enrollment flow (`mfa-enrollment.service.ts`, one pair of
endpoints per method) both use short-TTL Redis keys rather than a database table, since a pending
code is inherently ephemeral. Enrollment is reachable from the mobile app's Settings screen
(`apps/mobile/src/pages/SettingsPage.tsx`), not just the API.

## The mobile app is also served as a plain web app

`apps/mobile`'s own production build is served from the same origin as the API (`main.ts`, a
second `useStaticAssets` root pointing at `apps/mobile/dist`) — visiting the bare domain in any
browser, phone or desktop, opens the real app with no native install and no separate web host.
`apps/api/Dockerfile` builds it as part of the image (`VITE_API_URL=/api/v1` for that one build
step only — a relative URL, since the app is now same-origin with the API it's calling, unlike a
Capacitor build, which has no "origin" of its own and needs the real absolute URL in
`apps/mobile/.env`). This also means no CORS configuration is needed for browser access at all;
`CORS_ORIGIN` in `infra/.env` exists for something else entirely reaching the API cross-origin.

React Router's `BrowserRouter` needs a server-side fallback: a deep link like `/items/abc123` isn't
a real file on disk, so it has to resolve to `index.html` and let the client-side router take over
from there. That fallback lives in `ErrorLoggingFilter` (`common/filters/error-logging.filter.ts`),
not as its own dedicated mechanism — worth knowing before you go looking for a `SpaController` or
an Express catch-all `app.use()`, because two more obvious-looking approaches were tried first and
both failed in ways that only showed up under testing:

- A real Nest controller with a `@Get("*")` route, excluded from the global `/api/v1` prefix so it
  wouldn't collide with it. Its registration order relative to the other feature modules' controllers
  turned out to be unpredictable — it was observed shadowing `GET /api/v1/health` outright, serving
  the SPA's HTML for a route that has nothing to do with it.
- A plain Express `app.use()` catch-all added after `await app.init()` (to ensure Nest's own routes
  were mounted first). That fixed the above, but broke the opposite way: Nest's own unmatched-route
  handling runs before anything queued via a later `app.use()` ever gets a chance, so it caught
  genuine SPA routes like `/inbox` and returned Nest's default 404 instead of the app.

Nest's unmatched-route 404 *is* a real `NotFoundException`, and it's guaranteed to flow through
every registered global exception filter — which is exactly the hook `ErrorLoggingFilter` was
already using to log every 5xx. It just also checks, for a 404 on a GET request outside `/api` and
`/admin`, whether to serve `index.html` instead of the normal JSON error body.

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
