// Plain "as const" object rather than TS `enum` — see enums.ts for why: it keeps this
// type structurally compatible with the equivalent enum Prisma generates from schema.prisma.
export const AccountTier = {
  FREE: "FREE",
  BASIC: "BASIC",
  PREMIUM: "PREMIUM",
  CORPORATE: "CORPORATE",
} as const;
export type AccountTier = (typeof AccountTier)[keyof typeof AccountTier];

export interface TierLimit {
  maxLocations: number | null; // null = unlimited
  maxStorageBytes: number | null; // null = unlimited
  soldViaStore: boolean; // true = Apple/Google subscription, false = direct sales / default
}

const GB = 1024 * 1024 * 1024;

export const TIER_LIMITS: Record<AccountTier, TierLimit> = {
  [AccountTier.FREE]: { maxLocations: 1, maxStorageBytes: 1 * GB, soldViaStore: false },
  [AccountTier.BASIC]: { maxLocations: 3, maxStorageBytes: 5 * GB, soldViaStore: true },
  [AccountTier.PREMIUM]: { maxLocations: 10, maxStorageBytes: 25 * GB, soldViaStore: true },
  [AccountTier.CORPORATE]: { maxLocations: null, maxStorageBytes: null, soldViaStore: false },
};

export function isWithinLocationLimit(tier: AccountTier, currentLocationCount: number): boolean {
  const limit = TIER_LIMITS[tier].maxLocations;
  return limit === null || currentLocationCount < limit;
}

export function isWithinStorageLimit(tier: AccountTier, currentBytesUsed: number, incomingBytes: number): boolean {
  const limit = TIER_LIMITS[tier].maxStorageBytes;
  return limit === null || currentBytesUsed + incomingBytes <= limit;
}
