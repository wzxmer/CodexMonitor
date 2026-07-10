// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThirdPartyKeyUsage } from "./useThirdPartyKeyUsage";

const getWorkspaceThirdPartyKeyUsageMock = vi.fn();

vi.mock("@/services/tauri", () => ({
  getWorkspaceThirdPartyKeyUsage: (...args: unknown[]) =>
    getWorkspaceThirdPartyKeyUsageMock(...args),
}));

describe("useThirdPartyKeyUsage", () => {
  const flushPromises = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    getWorkspaceThirdPartyKeyUsageMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads usage for a configured third-party workspace", async () => {
    getWorkspaceThirdPartyKeyUsageMock.mockResolvedValue({
      balanceUsd: 12.5,
      todayCostUsd: 1.25,
    });

    const { result } = renderHook(() =>
      useThirdPartyKeyUsage({ enabled: true, workspaceId: "ws-usage" }),
    );

    await flushPromises();

    expect(result.current).toEqual({ balanceUsd: 12.5, todayCostUsd: 1.25 });
    expect(getWorkspaceThirdPartyKeyUsageMock).toHaveBeenCalledWith("ws-usage");
  });

  it("does not require an app key profile", async () => {
    getWorkspaceThirdPartyKeyUsageMock.mockResolvedValue(null);

    renderHook(() =>
      useThirdPartyKeyUsage({ enabled: true, workspaceId: "ws-default-provider" }),
    );

    await flushPromises();

    expect(getWorkspaceThirdPartyKeyUsageMock).toHaveBeenCalledWith(
      "ws-default-provider",
    );
  });

  it("refreshes usage every minute", async () => {
    getWorkspaceThirdPartyKeyUsageMock.mockResolvedValue(null);

    renderHook(() =>
      useThirdPartyKeyUsage({ enabled: true, workspaceId: "ws-usage" }),
    );

    await flushPromises();

    expect(getWorkspaceThirdPartyKeyUsageMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(getWorkspaceThirdPartyKeyUsageMock).toHaveBeenCalledTimes(2);
  });
});
