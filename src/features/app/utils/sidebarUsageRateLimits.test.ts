import { describe, expect, it } from "vitest";
import type { RateLimitSnapshot } from "@/types";
import { resolveSidebarRateLimits } from "./sidebarUsageRateLimits";

const officialRateLimits: RateLimitSnapshot = {
  primary: {
    usedPercent: 62,
    windowDurationMins: 300,
    resetsAt: 1_800_000_000,
  },
  secondary: null,
  credits: null,
  planType: "pro",
};

describe("resolveSidebarRateLimits", () => {
  it("falls back to the home snapshot for an official account when the active workspace lacks one", () => {
    expect(resolveSidebarRateLimits(null, officialRateLimits, true)).toBe(officialRateLimits);
  });

  it("keeps third-party usage isolated from a home account snapshot", () => {
    expect(resolveSidebarRateLimits(null, officialRateLimits, false)).toBeNull();
  });

  it("keeps the active workspace snapshot when present", () => {
    const activeRateLimits: RateLimitSnapshot = {
      ...officialRateLimits,
      primary: { ...officialRateLimits.primary!, usedPercent: 18 },
    };

    expect(resolveSidebarRateLimits(activeRateLimits, officialRateLimits, true)).toBe(
      activeRateLimits,
    );
  });
});
