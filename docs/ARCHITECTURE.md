# Architecture

## Data model

`Account` is the billing/storage unit (one per signup). `User` belongs to exactly one `Account`
today — `AccountRole` exists on the model so a future "invite a teammate" feature is a permissions
change, not a schema migration.

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
no per-message cost. SMS/email OTP is the fallback the product spec asked for, implemented as a
generic "challenge" (`mfa-challenge.service.ts`) backed by short-TTL Redis keys rather than a
database table, since a pending OTP is inherently ephemeral. `notifications/notification.service.ts`
is currently a stub that logs the code — swap in Twilio (SMS) and SES/Postmark (email) behind that
same interface before going anywhere near production.

## What's scaffolded but not yet wired up

These are provisioned in `infra/docker-compose.yml` because the product plan calls for them, but
no application code uses them yet:

- **Meilisearch** — container runs; no indexing pipeline or search endpoint exists yet.
- **Redis + BullMQ** — Redis is wired up and used for MFA challenges; no background job queue
  (thumbnailing, video transcode, OCR) has been built yet. `@nestjs/bullmq` and `bullmq` are
  already dependencies of the API.
- **RevenueCat / store billing** — the `Subscription` table exists to record tier entitlement
  history, but nothing calls out to Apple/Google or consumes a RevenueCat webhook yet. Until that
  exists, tiers only change via a direct database/admin update.
- **Native home-screen widget** — per the product brief, this needs real Swift WidgetKit and
  Android AppWidget code alongside the Capacitor shell; it isn't a Capacitor plugin you install.

## What's implemented end-to-end

Register/login with TOTP MFA enrollment and verification, JWT access + rotating refresh tokens,
locations/folders/spots with tier-limit enforcement, and the full item capture flow (create →
presigned upload → confirm → file from Inbox → favorite → attach to a note).
