// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/types";
import { useUiScaleShortcuts } from "./useUiScaleShortcuts";

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ setZoom: vi.fn(async () => undefined) }),
}));

describe("useUiScaleShortcuts settings queue", () => {
  it("waits for the latest queued settings save", async () => {
    let resolveSave: (settings: AppSettings) => void = () => undefined;
    const saveSettings = vi.fn(
      (_settings: AppSettings) =>
        new Promise<AppSettings>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const settings = { uiScale: 1 } as AppSettings;
    const { result } = renderHook(() =>
      useUiScaleShortcuts({
        settings,
        setSettings: vi.fn(),
        saveSettings,
      }),
    );

    let savePromise: Promise<AppSettings> = Promise.resolve(settings);
    act(() => {
      savePromise = result.current.queueSaveSettings(settings);
    });
    let waitFinished = false;
    const waitPromise = result.current.waitForPendingSettingsSaves().then(() => {
      waitFinished = true;
    });

    await Promise.resolve();
    expect(waitFinished).toBe(false);

    resolveSave(settings);
    await savePromise;
    await waitPromise;
    expect(waitFinished).toBe(true);
  });
});
