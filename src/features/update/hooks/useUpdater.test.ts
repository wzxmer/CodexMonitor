// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DebugEntry } from "../../../types";
import {
  cleanupDownloadedReleaseAssets,
  downloadAndOpenReleaseAsset,
} from "../../../services/tauri";
import { useUpdater } from "./useUpdater";
import { STORAGE_KEY_PENDING_POST_UPDATE_VERSION } from "../utils/postUpdateRelease";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => true),
}));

vi.mock("../../../services/tauri", () => ({
  cleanupDownloadedReleaseAssets: vi.fn(() => Promise.resolve()),
  downloadAndOpenReleaseAsset: vi.fn(() => Promise.resolve({ path: "installer.msi" })),
}));

const cleanupDownloadedReleaseAssetsMock = vi.mocked(cleanupDownloadedReleaseAssets);
const downloadAndOpenReleaseAssetMock = vi.mocked(downloadAndOpenReleaseAsset);
const fetchMock = vi.fn();

function latestReleaseResponse(version: string, assets = releaseAssets()) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      tag_name: `v${version}`,
      html_url: `https://github.com/wzxmer/CodexMonitor/releases/tag/v${version}`,
      body: "## Latest",
      assets,
    }),
  } as Response;
}

function releaseAssets() {
  return [
    {
      name: "CodexMonitor_9.9.9_x64_en-US.msi",
      browser_download_url:
        "https://github.com/wzxmer/CodexMonitor/releases/download/v9.9.9/CodexMonitor_9.9.9_x64_en-US.msi",
      size: 100,
    },
    {
      name: "CodexMonitor_9.9.9_aarch64.dmg",
      browser_download_url:
        "https://github.com/wzxmer/CodexMonitor/releases/download/v9.9.9/CodexMonitor_9.9.9_aarch64.dmg",
      size: 100,
    },
    {
      name: "codex-monitor_9.9.9_amd64.AppImage",
      browser_download_url:
        "https://github.com/wzxmer/CodexMonitor/releases/download/v9.9.9/codex-monitor_9.9.9_amd64.AppImage",
      size: 100,
    },
  ];
}

describe("useUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanupDownloadedReleaseAssetsMock.mockResolvedValue(undefined);
    downloadAndOpenReleaseAssetMock.mockResolvedValue({ path: "installer.msi" });
    window.localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sets error state when update check fails", async () => {
    fetchMock.mockRejectedValue(new Error("nope"));
    const onDebug = vi.fn();
    const { result } = renderHook(() => useUpdater({ onDebug }));

    await act(async () => {
      await result.current.startUpdate();
    });

    expect(result.current.state.stage).toBe("error");
    expect(result.current.state.error).toBe("nope");
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        timestamp: expect.any(Number),
        label: "updater/error",
        source: "error",
        payload: "nope",
      } satisfies Partial<DebugEntry>),
    );
  });

  it("reports up-to-date when no update is available", async () => {
    fetchMock.mockResolvedValue(latestReleaseResponse(__APP_VERSION__));
    const { result } = renderHook(() => useUpdater({}));

    await act(async () => {
      await result.current.startUpdate();
    });

    expect(result.current.state.stage).toBe("upToDate");
  });

  it("reports up-to-date when no update is available for manual checks", async () => {
    fetchMock.mockResolvedValue(latestReleaseResponse(__APP_VERSION__));
    const { result } = renderHook(() => useUpdater({}));

    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(result.current.state.stage).toBe("upToDate");
  });

  it("surfaces an error when the latest release has no compatible installer", async () => {
    const onDebug = vi.fn();
    fetchMock.mockResolvedValue(latestReleaseResponse("9.9.9", []));
    const { result } = renderHook(() => useUpdater({ onDebug }));

    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(result.current.state.stage).toBe("error");
    expect(result.current.state.error).toBe(
      "No compatible installer asset found in the latest release.",
    );
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "updater/error",
        source: "error",
        payload: "No compatible installer asset found in the latest release.",
      }),
    );
  });

  it("downloads and opens the installer when update is available", async () => {
    fetchMock.mockResolvedValue(latestReleaseResponse("9.9.9"));

    const { result } = renderHook(() => useUpdater({}));

    await act(async () => {
      await result.current.startUpdate();
    });

    expect(result.current.state.stage).toBe("available");
    expect(result.current.state.version).toBe("9.9.9");

    await act(async () => {
      await result.current.startUpdate();
    });

    await waitFor(() => expect(result.current.state.stage).toBe("installing"));
    expect(result.current.state.progress?.totalBytes).toBe(100);
    expect(result.current.state.progress?.downloadedBytes).toBe(100);
    expect(downloadAndOpenReleaseAssetMock).toHaveBeenCalledWith(
      expect.stringContaining("/releases/download/v9.9.9/"),
      expect.stringMatching(/\.(msi|dmg|AppImage)$/),
    );
    expect(
      window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION),
    ).toBeNull();
  });

  it("resets to idle on dismiss", async () => {
    fetchMock.mockResolvedValue(latestReleaseResponse("9.9.9"));
    const { result } = renderHook(() => useUpdater({}));

    await act(async () => {
      await result.current.startUpdate();
    });

    await act(async () => {
      await result.current.dismiss();
    });

    expect(result.current.state.stage).toBe("idle");
  });

  it("surfaces download errors and keeps progress", async () => {
    fetchMock.mockResolvedValue(latestReleaseResponse("9.9.9"));
    downloadAndOpenReleaseAssetMock.mockRejectedValue(new Error("download failed"));
    const onDebug = vi.fn();
    const { result } = renderHook(() => useUpdater({ onDebug }));

    await act(async () => {
      await result.current.startUpdate();
    });

    await act(async () => {
      await result.current.startUpdate();
    });

    await waitFor(() => expect(result.current.state.stage).toBe("error"));
    expect(result.current.state.error).toBe("download failed");
    expect(result.current.state.progress?.downloadedBytes).toBe(0);
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        timestamp: expect.any(Number),
        label: "updater/error",
        source: "error",
        payload: "download failed",
      } satisfies Partial<DebugEntry>),
    );
  });

  it("does not run updater workflow when disabled", async () => {
    fetchMock.mockResolvedValue(latestReleaseResponse("9.9.9"));
    const { result } = renderHook(() => useUpdater({ enabled: false }));

    await act(async () => {
      await result.current.checkForUpdates();
      await result.current.startUpdate();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(downloadAndOpenReleaseAssetMock).not.toHaveBeenCalled();
    expect(result.current.state.stage).toBe("idle");
  });

  it("skips automatic startup checks when auto-check is disabled but still allows manual checks", async () => {
    fetchMock.mockResolvedValue(latestReleaseResponse(__APP_VERSION__));

    const { result } = renderHook(() =>
      useUpdater({ autoCheckOnMount: false }),
    );

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.state.stage).toBe("upToDate");
  });

  it("cleans stale downloaded installers on startup", async () => {
    renderHook(() => useUpdater({ autoCheckOnMount: false }));

    await waitFor(() =>
      expect(cleanupDownloadedReleaseAssetsMock).toHaveBeenCalledTimes(1),
    );
  });

  it("clears post-update marker without showing release notes", async () => {
    window.localStorage.setItem(
      STORAGE_KEY_PENDING_POST_UPDATE_VERSION,
      __APP_VERSION__,
    );

    const { result } = renderHook(() => useUpdater({}));

    await waitFor(() =>
      expect(
        window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION),
      ).toBeNull(),
    );

    expect(result.current.postUpdateNotice).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dismisses stale post-update marker without reopening a toast", async () => {
    window.localStorage.setItem(
      STORAGE_KEY_PENDING_POST_UPDATE_VERSION,
      __APP_VERSION__,
    );

    const { result } = renderHook(() => useUpdater({}));

    await waitFor(() =>
      expect(
        window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION),
      ).toBeNull(),
    );

    await act(async () => {
      result.current.dismissPostUpdateNotice();
    });

    expect(result.current.postUpdateNotice).toBeNull();
    expect(
      window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION),
    ).toBeNull();
    expect(result.current.postUpdateNotice).toBeNull();
  });

  it("clears stale post-update marker when version does not match current app", async () => {
    window.localStorage.setItem(
      STORAGE_KEY_PENDING_POST_UPDATE_VERSION,
      "0.0.1",
    );

    const { result } = renderHook(() => useUpdater({}));

    await waitFor(() =>
      expect(
        window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION),
      ).toBeNull(),
    );
    expect(result.current.postUpdateNotice).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
