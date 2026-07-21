// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/features/i18n/I18nProvider";
import {
  applyWindowsInstallerRepair,
  previewWindowsInstallerRepair,
  recoverWindowsInstallerRepair,
  rollbackWindowsInstallerRepair,
} from "@services/tauri";
import { WindowsInstallerRepairDialog } from "./WindowsInstallerRepairDialog";

vi.mock("@services/tauri", () => ({
  previewWindowsInstallerRepair: vi.fn(),
  applyWindowsInstallerRepair: vi.fn(),
  recoverWindowsInstallerRepair: vi.fn(),
  rollbackWindowsInstallerRepair: vi.fn(),
}));

const previewMock = vi.mocked(previewWindowsInstallerRepair);
const applyMock = vi.mocked(applyWindowsInstallerRepair);
const recoverMock = vi.mocked(recoverWindowsInstallerRepair);
const rollbackMock = vi.mocked(rollbackWindowsInstallerRepair);

describe("WindowsInstallerRepairDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewMock.mockResolvedValue({
      status: "repairable",
      fingerprint: "opaque-preview",
      currentVersion: "0.7.91",
      records: [
        {
          family: "msi",
          hive: "localMachine",
          view: "registry64",
          displayVersion: "0.7.91",
          installLocation: "C:\\Users\\Secret\\ThreadFleet",
        },
        {
          family: "nsis",
          hive: "currentUser",
          view: "registry64",
          displayVersion: "0.7.79",
          installLocation: "C:\\Users\\Secret\\ThreadFleet",
        },
      ],
      blockers: [],
      plannedActions: ["quarantine", "remove registration"],
    });
    applyMock.mockResolvedValue({
      status: "completed",
      transactionId: "opaque-transaction",
      fingerprint: "opaque-post",
    });
    rollbackMock.mockResolvedValue({
      status: "rolledBack",
      fingerprint: "opaque-preview",
    });
    recoverMock.mockResolvedValue({ status: "rolledBack" });
  });

  afterEach(() => cleanup());

  it("shows only safe summaries and requires rechecking after repair", async () => {
    const onClose = vi.fn();
    const onRecheck = vi.fn();
    render(
      <I18nProvider preference="en">
        <WindowsInstallerRepairDialog
          open
          onClose={onClose}
          onRecheck={onRecheck}
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("MSI · Version 0.7.91")).toBeTruthy();
    expect(screen.getByText("EXE (NSIS) · Version 0.7.79")).toBeTruthy();
    expect(screen.queryByText(/Users\\Secret/)).toBeNull();
    const applyButton = screen.getByRole("button", {
      name: "Start safe repair",
    });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(applyButton);

    expect(await screen.findByText(/passed the local post-check/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Check for updates again" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRecheck).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(applyMock).toHaveBeenCalledTimes(1));
  });

  it("blocks apply while recovery is required and offers re-preview after recovery", async () => {
    previewMock.mockResolvedValueOnce({
      status: "blocked",
      recoveryRequired: true,
      currentVersion: "0.7.91",
      records: [
        {
          family: "msi",
          hive: "localMachine",
          view: "registry64",
          displayVersion: "0.7.91",
        },
      ],
      blockers: ["An incomplete repair journal exists."],
      plannedActions: [],
    });
    const onClose = vi.fn();
    const onRecheck = vi.fn();
    render(
      <I18nProvider preference="en">
        <WindowsInstallerRepairDialog
          open
          onClose={onClose}
          onRecheck={onRecheck}
        />
      </I18nProvider>,
    );

    expect(
      await screen.findByText(/incomplete installer repair transaction/),
    ).toBeTruthy();
    expect(screen.queryByText("MSI · Version 0.7.91")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Start safe repair" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Recover incomplete repair" }),
    );
    expect(await screen.findByText(/incomplete repair was recovered/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview again" })).toBeTruthy();
    expect(recoverMock).toHaveBeenCalledTimes(1);
    expect(applyMock).not.toHaveBeenCalled();
  });
});
