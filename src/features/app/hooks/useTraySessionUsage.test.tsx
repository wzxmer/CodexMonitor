// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitSnapshot } from "../../../types";
import {
  buildTraySessionUsage,
  useTraySessionUsage,
} from "./useTraySessionUsage";

const isTauriMock = vi.hoisted(() => vi.fn(() => true));
const setTraySessionUsageMock = vi.fn();
const primaryResetAt = Date.parse("2026-01-01T12:00:00Z");
const secondaryResetAt = Date.parse("2026-01-03T10:00:00Z");

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: isTauriMock,
}));

vi.mock("@services/tauri", () => ({
  setTraySessionUsage: (...args: unknown[]) => setTraySessionUsageMock(...args),
}));

vi.mock("../../../utils/time", () => ({
  formatRelativeTime: (value: number) =>
    value === secondaryResetAt ? "in 2 days" : "in 2 hours",
}));

function makeRateLimits(
  overrides: Partial<RateLimitSnapshot> = {},
): RateLimitSnapshot {
  return {
    primary: {
      usedPercent: 12,
      windowDurationMins: 300,
      resetsAt: primaryResetAt,
    },
    secondary: null,
    credits: null,
    planType: null,
    ...overrides,
  };
}

describe("useTraySessionUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    isTauriMock.mockReturnValue(true);
    setTraySessionUsageMock.mockReset();
    setTraySessionUsageMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds the current session usage summary from workspace rate limits", () => {
    expect(buildTraySessionUsage(makeRateLimits(), false)).toEqual({
      sessionLabel: "12% used · 2 hours 后重置",
      weeklyLabel: null,
    });
  });

  it("supports remaining mode to match the sidebar setting", () => {
    expect(
      buildTraySessionUsage(
        makeRateLimits({
          primary: {
            usedPercent: 42,
            windowDurationMins: 300,
            resetsAt: primaryResetAt,
          },
        }),
        true,
      ),
    ).toEqual({
      sessionLabel: "58% remaining · 2 hours 后重置",
      weeklyLabel: null,
    });
  });

  it("includes weekly usage when the workspace has a secondary window", () => {
    expect(
      buildTraySessionUsage(
        makeRateLimits({
          secondary: {
            usedPercent: 67,
            windowDurationMins: 10_080,
            resetsAt: secondaryResetAt,
          },
        }),
        false,
      ),
    ).toEqual({
      sessionLabel: "12% used · 2 hours 后重置",
      weeklyLabel: "67% used · 2 days 后重置",
    });
  });

  it("uses localized tray labels when provided", () => {
    expect(
      buildTraySessionUsage(makeRateLimits(), false, {
        resetLabel: "resets in {relative}",
        used: "{value}% used",
      }),
    ).toEqual({
      sessionLabel: "12% used · resets in 2 hours",
      weeklyLabel: null,
    });
  });

  it("syncs only when the derived usage changes", async () => {
    type HookProps = {
      accountRateLimits: RateLimitSnapshot | null;
      showRemaining: boolean;
    };
    const initialUsage = makeRateLimits();
    const initialProps: HookProps = {
      accountRateLimits: initialUsage,
      showRemaining: false,
    };
    const { rerender } = renderHook(
      ({ accountRateLimits, showRemaining }: HookProps) =>
        useTraySessionUsage({ accountRateLimits, showRemaining }),
      {
        initialProps,
      },
    );

    await vi.runAllTimersAsync();
    expect(setTraySessionUsageMock).toHaveBeenCalledTimes(1);
    expect(setTraySessionUsageMock).toHaveBeenLastCalledWith({
      sessionLabel: "12% used · 2 hours 后重置",
      weeklyLabel: null,
    });

    rerender({ accountRateLimits: initialUsage, showRemaining: false });
    await vi.runAllTimersAsync();
    expect(setTraySessionUsageMock).toHaveBeenCalledTimes(1);

    rerender({ accountRateLimits: null, showRemaining: false });
    await vi.runAllTimersAsync();
    expect(setTraySessionUsageMock).toHaveBeenCalledTimes(2);
    expect(setTraySessionUsageMock).toHaveBeenLastCalledWith(null);
  });

  it("retries the same usage payload after a transient sync failure", async () => {
    setTraySessionUsageMock
      .mockRejectedValueOnce(new Error("bridge not ready"))
      .mockResolvedValue(undefined);

    renderHook(() =>
      useTraySessionUsage({
        accountRateLimits: makeRateLimits(),
        showRemaining: false,
      }),
    );

    await vi.advanceTimersByTimeAsync(150);
    expect(setTraySessionUsageMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(150);
    expect(setTraySessionUsageMock).toHaveBeenCalledTimes(2);
    expect(setTraySessionUsageMock).toHaveBeenLastCalledWith({
      sessionLabel: "12% used · 2 hours 后重置",
      weeklyLabel: null,
    });
  });
});
