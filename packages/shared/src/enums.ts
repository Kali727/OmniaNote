// Plain "as const" objects rather than TS `enum`: Prisma generates its own enum types
// from schema.prisma as string-literal unions, and TS enums are nominal — they'd never
// structurally match Prisma's types even with identical values. This pattern gives the
// same DX (ItemType.PHOTO, autocomplete, exhaustiveness) while staying structurally
// compatible with whatever Prisma generates.

export const ItemType = {
  PHOTO: "PHOTO",
  VIDEO: "VIDEO",
  PDF: "PDF",
  NOTE: "NOTE",
} as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

// Client-side sync lifecycle for a captured item. The API never sees QUEUED/UPLOADING/FAILED
// for its own records, but returns this shape so the mobile client's local queue and the
// server's view of the same item share one vocabulary end to end.
export const SyncStatus = {
  QUEUED: "QUEUED",
  UPLOADING: "UPLOADING",
  SYNCED: "SYNCED",
  FAILED: "FAILED",
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const MfaMethod = {
  TOTP: "TOTP",
  SMS: "SMS",
  EMAIL: "EMAIL",
} as const;
export type MfaMethod = (typeof MfaMethod)[keyof typeof MfaMethod];

export const StampType = {
  LEAK: "LEAK",
  ELECTRICAL: "ELECTRICAL",
  SAFETY_HAZARD: "SAFETY_HAZARD",
  PARTS_NEEDED: "PARTS_NEEDED",
  FIXED: "FIXED",
} as const;
export type StampType = (typeof StampType)[keyof typeof StampType];

export const AccountRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;
export type AccountRole = (typeof AccountRole)[keyof typeof AccountRole];
