import { useEffect, useState } from "react";
import { TIER_LIMITS, type AccountTier, type TierLimit } from "@omnianote/shared";
import { teamApi } from "./team";

export interface AccountTierInfo {
  tier: AccountTier;
  limits: TierLimit;
}

// Module-scoped cache: every page that needs the account's tier (Home, Location,
// Folder) would otherwise each fire their own /team/members request on mount. There's
// no dedicated "account info" endpoint — /team/members already returns `tier` for the
// team screen, so this just reuses that instead of adding a second endpoint for the
// same one fact.
let cached: AccountTierInfo | null = null;
let inflight: Promise<AccountTierInfo> | null = null;

async function fetchTier(): Promise<AccountTierInfo> {
  if (cached) return cached;
  if (!inflight) {
    inflight = teamApi.list().then((overview) => {
      cached = { tier: overview.tier, limits: TIER_LIMITS[overview.tier] };
      return cached;
    });
  }
  return inflight;
}

/** null while loading or on failure — treat that as "don't know yet," not "unlimited". */
export function useAccountTier(): AccountTierInfo | null {
  const [info, setInfo] = useState<AccountTierInfo | null>(cached);
  useEffect(() => {
    if (cached) return;
    fetchTier()
      .then(setInfo)
      .catch(() => {});
  }, []);
  return info;
}
