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
  // Folders and spots are free-form organizational tools *within* a location, not a
  // second way to buy more locations — without a cap here, a FREE account stuck at one
  // location could recreate unlimited "locations" as sibling folders/spots underneath
  // it. Counted per-location (folders: including nested subfolders, since those still
  // carry the same locationId) rather than account-wide, so the cap tracks how much
  // structure one property reasonably needs, not how many properties exist.
  maxFoldersPerLocation: number | null; // null = unlimited
  maxSpotsPerLocation: number | null; // null = unlimited
  maxStorageBytes: number | null; // null = unlimited
  maxTeamMembers: number | null; // null = unlimited — counts the owner, so 1 means solo-only
  soldViaStore: boolean; // true = Apple/Google subscription, false = direct sales / default
}

const GB = 1024 * 1024 * 1024;

// One subscription per Account, not per seat — a teammate shares the account's tier at
// no extra charge. The limit here caps headcount, not price, so a FREE account doesn't
// become a way to get unlimited collaborators for free.
export const TIER_LIMITS: Record<AccountTier, TierLimit> = {
  [AccountTier.FREE]: {
    maxLocations: 1,
    maxFoldersPerLocation: 5,
    maxSpotsPerLocation: 5,
    maxStorageBytes: 1 * GB,
    maxTeamMembers: 1,
    soldViaStore: false,
  },
  [AccountTier.BASIC]: {
    maxLocations: 3,
    maxFoldersPerLocation: 20,
    maxSpotsPerLocation: 20,
    maxStorageBytes: 5 * GB,
    maxTeamMembers: 5,
    soldViaStore: true,
  },
  [AccountTier.PREMIUM]: {
    maxLocations: 10,
    maxFoldersPerLocation: 75,
    maxSpotsPerLocation: 75,
    maxStorageBytes: 25 * GB,
    maxTeamMembers: 15,
    soldViaStore: true,
  },
  [AccountTier.CORPORATE]: {
    maxLocations: null,
    maxFoldersPerLocation: null,
    maxSpotsPerLocation: null,
    maxStorageBytes: null,
    maxTeamMembers: null,
    soldViaStore: false,
  },
};

export function isWithinLocationLimit(tier: AccountTier, currentLocationCount: number): boolean {
  const limit = TIER_LIMITS[tier].maxLocations;
  return limit === null || currentLocationCount < limit;
}

export function isWithinFolderLimit(tier: AccountTier, currentFolderCountAtLocation: number): boolean {
  const limit = TIER_LIMITS[tier].maxFoldersPerLocation;
  return limit === null || currentFolderCountAtLocation < limit;
}

export function isWithinSpotLimit(tier: AccountTier, currentSpotCountAtLocation: number): boolean {
  const limit = TIER_LIMITS[tier].maxSpotsPerLocation;
  return limit === null || currentSpotCountAtLocation < limit;
}

export function isWithinTeamMemberLimit(tier: AccountTier, currentMemberAndPendingInviteCount: number): boolean {
  const limit = TIER_LIMITS[tier].maxTeamMembers;
  return limit === null || currentMemberAndPendingInviteCount < limit;
}

export function isWithinStorageLimit(tier: AccountTier, currentBytesUsed: number, incomingBytes: number): boolean {
  const limit = TIER_LIMITS[tier].maxStorageBytes;
  return limit === null || currentBytesUsed + incomingBytes <= limit;
}
