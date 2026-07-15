// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyWindowsInstallerRepair,
  previewWindowsInstallerRepair,
  rollbackWindowsInstallerRepair,
} from "@services/tauri";
import { useWindowsInstallerRepair } from "./useWindowsInstallerRepair";

vi.mock("@services/tauri", () => ({
  previewWindowsInstallerRepair: vi.fn(),
  applyWindowsInstallerRepair: vi.fn(),
  rollbackWindowsInstallerRepair: vi.fn(),
}));

const previewMock = vi.mocked(previewWindowsInstallerRepair);
const applyMock = vi.mocked(applyWindowsInstallerRepair);
const rollbackMock = vi.mocked(rollbackWindowsInstallerRepair);

const repairablePreview = {
  status: "repairable" as const,
  fingerprint: "opaque-preview",
  currentVersion: "0.7.91",
  records: [],
  blockers: [],
  plannedActions: ["remove stale registration"],
};

describe("useWindowsInstallerRepair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("previews and applies once with an opaque random operation ID", async () => {
    previewMock.mockResolvedValue(repairablePreview);
    applyMock.mockResolvedValue({
      status: "completed",
      transactionId: "opaque-transaction",
      fingerprint: "opaque-post",
    });
    const { result } = renderHook(() => useWindowsInstallerRepair());

    await act(async () => {
      await result.current.preview();
    });
    expect(result.current.canApply).toBe(true);

    await act(async () => {
      await Promise.all([result.current.apply(), result.current.apply()]);
    });

    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock).toHaveBeenCalledWith(
      "opaque-preview",
      expect.stringMatching(/^[a-zA-Z0-9-]+$/),
    );
    expect(result.current.state.phase).toBe("completed");
    expect(result.current.canRollback).toBe(true);
  });

  it("invalidates an expired preview fingerprint after apply fails", async () => {
    previewMock.mockResolvedValue(repairablePreview);
    applyMock.mockRejectedValue(
      new Error("Installer state changed after preview"),
    );
    const { result } = renderHook(() => useWindowsInstallerRepair());

    await act(async () => {
      await result.current.preview();
    });
    await act(async () => {
      await result.current.apply();
    });

    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.preview).toBeNull();
    expect(result.current.canApply).toBe(false);

    await act(async () => {
      await result.current.apply();
    });
    expect(applyMock).toHaveBeenCalledTimes(1);
  });

  it("rolls back only the completed transaction and post-repair fingerprint", async () => {
    previewMock.mockResolvedValue(repairablePreview);
    applyMock.mockResolvedValue({
      status: "completed",
      transactionId: "opaque-transaction",
      fingerprint: "opaque-post",
    });
    rollbackMock.mockResolvedValue({
      status: "rolledBack",
      fingerprint: "opaque-preview",
    });
    const { result } = renderHook(() => useWindowsInstallerRepair());

    await act(async () => {
      await result.current.preview();
    });
    await act(async () => {
      await result.current.apply();
    });
    await act(async () => {
      await Promise.all([result.current.rollback(), result.current.rollback()]);
    });

    expect(rollbackMock).toHaveBeenCalledTimes(1);
    expect(rollbackMock).toHaveBeenCalledWith(
      "opaque-transaction",
      "opaque-post",
    );
    expect(result.current.state.phase).toBe("rolledBack");
  });
});
