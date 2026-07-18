import type { RateLimitSnapshot } from "@/types";

export function resolveSidebarRateLimits(
  activeRateLimits: RateLimitSnapshot | null,
  homeRateLimits: RateLimitSnapshot | null,
  canReuseOfficialAccountRateLimits: boolean,
): RateLimitSnapshot | null {
  if (activeRateLimits || !canReuseOfficialAccountRateLimits) {
    return activeRateLimits;
  }

  return homeRateLimits;
}
